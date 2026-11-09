import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, d1Store } from './api.mjs';
import { collections, maxEntries } from './public/collections.mjs';

const password = process.env.ADMIN_PASSWORD;
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const loopback = ['127.0.0.1', '::1'].includes(host);
const publicUrl = new URL(process.env.PUBLIC_ORIGIN || ('http://127.0.0.1:' + port));
const origin = publicUrl.origin;
const trustProxy = process.env.TRUST_PROXY === '1';

if (!password) throw new Error('Set the ADMIN_PASSWORD environment variable before starting.');
if (publicUrl.href !== origin + '/' || publicUrl.username || publicUrl.password) {
  throw new Error('PUBLIC_ORIGIN must be the website origin, without a path, query, or credentials.');
}
if (publicUrl.protocol !== 'https:' && !(loopback && publicUrl.hostname === '127.0.0.1' && publicUrl.protocol === 'http:')) {
  throw new Error('Use an HTTPS PUBLIC_ORIGIN for public hosting.');
}

const routes = [
  ['/', 'index.html', 'text/html'],
  ['/style.css', 'style.css', 'text/css'],
  ['/app.js', 'app.js', 'text/javascript'],
  ['/collections.js', 'collections.mjs', 'text/javascript']
];
const assets = Object.fromEntries(await Promise.all(routes.map(async ([route, file, type]) => [
  route,
  { type: type + '; charset=utf-8', body: await readFile(new URL('./public/' + file, import.meta.url), 'utf8') }
])));
const allowed = {};
for (const match of assets['/'].body.matchAll(/data-(field|link)="([^"]+)"/g)) {
  allowed[match[2]] = match[1] === 'field' ? 'text' : match[2] === 'Email address' ? 'email' : 'url';
}
const handle = createApp(assets, allowed, collections, maxEntries);

const dataDir = process.env.DATA_DIR
  ? resolve(process.env.DATA_DIR)
  : fileURLToPath(new URL('./data/', import.meta.url));
await mkdir(dataDir, { recursive: true, mode: 0o700 });
const db = new DatabaseSync(join(dataDir, 'portfolio.sqlite'));
db.exec('PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
const seed = JSON.parse(await readFile(new URL('./seed.json', import.meta.url), 'utf8'));
db.exec(schema);
db.prepare('INSERT OR IGNORE INTO portfolio VALUES (1, 0, ?)').run(JSON.stringify(seed));

function statement(sql) {
  const query = db.prepare(sql);
  return {
    bind(...values) {
      return {
        first: () => query.get(...values),
        run: () => ({ meta: { changes: Number(query.run(...values).changes) } })
      };
    },
    first: () => query.get()
  };
}

const store = d1Store({
  prepare: statement,
  batch(queries) {
    db.exec('BEGIN IMMEDIATE');
    try {
      for (const query of queries) query.run();
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }
});

const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, origin);
    if (url.origin !== origin) {
      outgoing.writeHead(403).end();
      return;
    }
    const headers = new Headers(incoming.headers);
    const peer = incoming.socket.remoteAddress;
    const forwarded = headers.get('x-forwarded-for')?.split(',').at(-1).trim();
    headers.set('CF-Connecting-IP', trustProxy && forwarded && isIP(forwarded) ? forwarded : peer);
    const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : Readable.toWeb(incoming);
    const request = new Request(url, { method: incoming.method, headers, body, duplex: 'half' });
    const response = await handle(request, store, password);
    const bytes = Buffer.from(await response.arrayBuffer());
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(bytes);
  } catch (error) {
    console.error(error.message);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end('Server error');
  }
});

server.listen(port, host, () => console.log('Portfolio: ' + origin));
