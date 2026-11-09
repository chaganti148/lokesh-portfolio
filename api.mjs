const lifetime = 60 * 60 * 4;
const cookieName = 'portfolio_session';
const encoder = new TextEncoder();

function reply(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return new Uint8Array(bytes);
}

async function passwordMatches(supplied, secret) {
  const [a, b] = await Promise.all([digest(supplied), digest(secret)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

function hex(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function cookie(value, seconds, secure) {
  return cookieName + '=' + value + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + seconds + (secure ? '; Secure' : '');
}

async function readPayload(request) {
  if (request.headers.get('Content-Type')?.split(';')[0] !== 'application/json') throw new Error('Invalid content type');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing request body');
  let size = 0;
  let json = '';
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 1572864) {
      await reader.cancel();
      throw new Error('Payload too large');
    }
    json += decoder.decode(value, { stream: true });
  }
  const payload = JSON.parse(json + decoder.decode());
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Expected an object');
  return payload;
}

function validField(name, value, allowed) {
  if (!Object.hasOwn(allowed, name) || typeof value !== 'string' || !value.trim() || value.length > 800) return false;
  if (allowed[name] === 'email') return /^mailto:[A-Z0-9.!#$%&'*+/=?^_{}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value);
  if (allowed[name] === 'url') {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password;
    } catch {
      return false;
    }
  }
  return true;
}

function validCollection(entries, columns, limit) {
  return Array.isArray(entries) && entries.length <= limit && entries.every(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
    return Object.keys(entry).length === Object.keys(columns).length &&
      Object.entries(columns).every(([key, { required, max }]) => {
        const value = entry[key];
        return typeof value === 'string' && value.length <= max && (!required || value.trim());
      });
  });
}

export function createApp(assets, allowed, collections, maxEntries) {
  return async function handle(request, store, secret) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    if (!path.startsWith('/api/')) {
      const asset = assets[path];
      if (!Object.hasOwn(assets, path) || !['GET', 'HEAD'].includes(method)) return new Response('Not found', { status: 404 });
      return new Response(method === 'HEAD' ? null : asset.body, { headers: {
        'Content-Type': asset.type,
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      } });
    }
    try {
      if (method !== 'GET' && request.headers.get('Origin') !== url.origin) return reply({ error: 'Origin rejected.' }, 403);
      const now = Math.floor(Date.now() / 1000);
      if (method === 'GET' && path === '/api/content') return reply(await store.read());
      if (method === 'POST' && path === '/api/login') {
        if (!secret) return reply({ error: 'Admin login has not been configured.' }, 503);
        const address = request.headers.get('CF-Connecting-IP') ?? 'local';
        const attempts = await store.attempt(address, Math.floor(now / 900));
        if (attempts > 8) return reply({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
        const credentials = await readPayload(request).catch(() => null);
        const password = credentials?.password;
        if (credentials?.username !== 'admin' || typeof password !== 'string' || password.length > 1024 || !await passwordMatches(password, secret)) {
          return reply({ error: 'Username or password is incorrect.' }, 401);
        }
        const token = hex(crypto.getRandomValues(new Uint8Array(32)));
        await store.start(hex(await digest(token)), now + lifetime, now);
        return reply({ signedIn: true }, 200, { 'Set-Cookie': cookie(token, lifetime, url.protocol === 'https:') });
      }
      const token = request.headers.get('Cookie')?.match(/(?:^|;\s*)portfolio_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      const key = token && hex(await digest(token));
      const signedIn = Boolean(secret && key && await store.active(key, now));
      if (method === 'GET' && path === '/api/session') return reply({ signedIn });
      if (method === 'POST' && path === '/api/logout') {
        if (key) await store.end(key);
        return reply({ signedIn: false }, 200, { 'Set-Cookie': cookie('', 0, url.protocol === 'https:') });
      }
      if (method === 'PUT' && path === '/api/content') {
        if (!signedIn) return reply({ error: 'Sign in as admin to publish changes.' }, 401);
        const payload = await readPayload(request).catch(() => null);
        const updates = payload?.fields;
        if (!Number.isSafeInteger(payload?.revision) || payload.revision < 0 || !updates || typeof updates !== 'object' || Array.isArray(updates)) {
          return reply({ error: 'The portfolio update is invalid.' }, 400);
        }
        for (const [name, value] of Object.entries(updates)) {
          const valid = Object.hasOwn(collections, name)
            ? validCollection(value, collections[name].columns, maxEntries)
            : validField(name, value, allowed);
          if (!valid) return reply({ error: 'Check the value for ' + name + '.' }, 400);
        }
        const current = await store.read();
        const next = { revision: current.revision + 1, fields: { ...current.fields, ...updates } };
        if (current.revision !== payload.revision || !await store.write(next, current.revision)) {
          return reply({ error: 'The portfolio changed in another session. Close and reopen the editor to load the latest version.' }, 409);
        }
        return reply(next);
      }
      return reply({ error: 'Not found.' }, 404);
    } catch (error) {
      console.error(error);
      return reply({ error: 'The server could not complete this request. Try again shortly.' }, 500);
    }
  };
}

export function d1Store(db) {
  return {
    async read() {
      const row = await db.prepare('SELECT revision, fields FROM portfolio WHERE id = 1').first();
      return row ? { revision: row.revision, fields: JSON.parse(row.fields) } : { revision: 0, fields: {} };
    },
    async write(next, expected) {
      const result = await db.prepare('UPDATE portfolio SET revision = ?, fields = ? WHERE id = 1 AND revision = ?')
        .bind(next.revision, JSON.stringify(next.fields), expected).run();
      return result.meta.changes === 1;
    },
    async attempt(address, window) {
      const row = await db.prepare('INSERT INTO attempts VALUES (?, ?, 1) ON CONFLICT(address, window) DO UPDATE SET count = count + 1 RETURNING count')
        .bind(address, window).first();
      if (row.count === 1) await db.prepare('DELETE FROM attempts WHERE window < ?').bind(window - 1).run();
      return row.count;
    },
    async start(key, expires, now) {
      await db.batch([
        db.prepare('DELETE FROM sessions WHERE expires <= ?').bind(now),
        db.prepare('INSERT INTO sessions VALUES (?, ?)').bind(key, expires)
      ]);
    },
    async active(key, now) {
      return Boolean(await db.prepare('SELECT 1 FROM sessions WHERE token = ? AND expires > ?').bind(key, now).first());
    },
    async end(key) {
      await db.prepare('DELETE FROM sessions WHERE token = ?').bind(key).run();
    }
  };
}