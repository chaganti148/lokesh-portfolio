import { collections, maxEntries } from '/collections.js';

const menu = document.querySelector('#menu');
const links = document.querySelector('#links');
function toggleMenu(open) {
  links.classList.toggle('open', open);
  menu.setAttribute('aria-expanded', String(open));
}
menu.addEventListener('click', () => toggleMenu(!links.classList.contains('open')));
links.addEventListener('click', event => {
  if (event.target.closest('a')) toggleMenu(false);
});
document.querySelector('.nav').addEventListener('keydown', event => {
  if (event.key === 'Escape' && links.classList.contains('open')) {
    toggleMenu(false);
    menu.focus();
  }
});

const editable = [...document.querySelectorAll('[data-field], [data-link]')];
const panel = document.querySelector('#panel');
const title = document.querySelector('#panel-title');
const login = document.querySelector('#login');
const editor = document.querySelector('#editor');
const fields = document.querySelector('#fields');
const status = document.querySelector('#status');
let revision = 0;
let initialLoad;
let busy = false;

function fieldName(element) {
  return element.dataset.field ?? element.dataset.link;
}

const legacyFields = Object.fromEntries(editable.map(node => [fieldName(node), node.textContent]));
const collectionFields = new Set(Object.values(collections).flatMap(({ legacy }) => legacy.flatMap(row => Object.values(row).flat())));
const details = editable.filter(node => !collectionFields.has(fieldName(node)));
const collectionValues = {};

function applyContent(content) {
  revision = content.revision;
  for (const node of details) {
    const value = content.fields[fieldName(node)];
    if (typeof value !== 'string') continue;
    if (node.dataset.link) node.setAttribute('href', value);
    else node.textContent = value;
  }
  for (const [name, { legacy }] of Object.entries(collections)) {
    collectionValues[name] = content.fields[name] ?? legacy.map(row => Object.fromEntries(
      Object.entries(row).map(([key, names]) => [key, names.map(field => content.fields[field] ?? legacyFields[field]).join('\n')])
    ));
    renderCollection(name, collectionValues[name]);
  }
}

function element(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function renderCollection(name, entries) {
  const { selector, item } = collections[name];
  const container = document.querySelector(selector);
  container.replaceChildren();
  container.closest('#work')?.toggleAttribute('hidden', entries.length === 0);
  if (item === 'project') {
    for (const link of document.querySelectorAll('a[href="#work"]')) link.hidden = entries.length === 0;
  }
  for (const [index, entry] of entries.entries()) {
    const project = item === 'project';
    const article = element('article', project ? 'project' : 'timeline');
    if (project) {
      const code = element('div', 'project-code');
      code.append(element('span', '', String(index + 1).padStart(2, '0')), element('span', '', ['◇', '▱', '≋'][index % 3]));
      code.lastElementChild.setAttribute('aria-hidden', 'true');
      article.append(code);
      if (entry.category) article.append(element('p', 'project-type', entry.category));
      article.append(element('h3', '', entry.name));
      if (entry.overview) article.append(element('p', '', entry.overview));
    } else {
      if (entry.dates) article.append(element('span', 'meta', entry.dates));
      article.append(element('h3', '', entry.role), element('p', 'accent', entry.company));
    }
    const bullets = entry.highlights.split('\n').map(line => line.trim()).filter(Boolean);
    if (bullets.length) {
      const list = element('ul');
      list.append(...bullets.map(line => element('li', '', line)));
      article.append(list);
    }
    if (project && entry.technologies) article.append(element('div', 'stack', entry.technologies));
    container.append(article);
  }
}

function fieldInput(name, labelText, value, options) {
  const label = element('label', '', labelText);
  const input = element(options.multiline ? 'textarea' : 'input');
  input.name = name;
  input.maxLength = options.max;
  input.required = Boolean(options.required);
  input.value = value;
  if (options.multiline) input.rows = value.length > 90 || value.includes('\n') ? 3 : 1;
  else input.type = options.type ?? 'text';
  label.append(input);
  return label;
}

function editorButton(text) {
  const button = element('button', 'button outline', text);
  button.type = 'button';
  return button;
}

function collectionEditor(name, entries) {
  const { columns, item, newestFirst } = collections[name];
  const group = element('details', 'editor-group');
  const list = element('div', 'entry-list');
  const add = editorButton(item === 'project' ? 'Add project' : 'Add company');
  group.dataset.collection = name;
  group.open = item === 'project';
  group.append(element('summary', '', name), element('p', '', newestFirst
    ? 'New companies start at the top. Use Move up or Move down to change the order.'
    : 'Use Move up or Move down to change the order visitors see.'), add, list);

  function updateControls() {
    const cards = [...list.children];
    for (const [index, card] of cards.entries()) {
      const inputs = [...card.querySelectorAll('input, textarea')];
      const entryTitle = item === 'project' ? inputs[0].value : inputs[1].value;
      card.querySelector('summary').textContent = (index + 1) + '. ' + (entryTitle.trim() || (item === 'project' ? 'New project' : 'New company'));
      card.querySelector('[data-up]').disabled = index === 0;
      card.querySelector('[data-down]').disabled = index === cards.length - 1;
    }
    add.disabled = cards.length >= maxEntries;
  }

  function addEntry(values, draft = false) {
    const card = element('details', 'entry');
    const summary = element('summary');
    card.open = draft;
    card.append(summary);
    for (const [key, config] of Object.entries(columns)) {
      const label = fieldInput('', config.label, values[key] ?? '', config);
      label.lastElementChild.dataset.column = key;
      card.append(label);
    }
    card.addEventListener('input', updateControls);
    const actions = element('div', 'entry-controls');
    const up = editorButton('Move up');
    const down = editorButton('Move down');
    const remove = editorButton('Remove');
    up.dataset.up = '';
    down.dataset.down = '';
    up.addEventListener('click', () => {
      list.insertBefore(card, card.previousElementSibling);
      updateControls();
      (up.disabled ? down : up).focus();
    });
    down.addEventListener('click', () => {
      list.insertBefore(card.nextElementSibling, card);
      updateControls();
      (down.disabled ? up : down).focus();
    });
    remove.addEventListener('click', () => {
      const neighbor = card.nextElementSibling ?? card.previousElementSibling;
      card.remove();
      updateControls();
      (neighbor?.querySelector('summary') ?? add).focus();
    });
    actions.append(up, down, remove);
    card.append(actions);
    if (draft && newestFirst) list.prepend(card);
    else list.append(card);
    if (draft) {
      updateControls();
      card.querySelector('input').focus();
    }
  }

  for (const entry of entries) addEntry(entry);
  updateControls();
  add.addEventListener('click', () => addEntry({}, true));
  return group;
}


async function api(path, method = 'GET', payload) {
  const response = await fetch('/api/' + path, {
    method,
    ...(payload && { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error ?? 'The request failed.');
    error.status = response.status;
    throw error;
  }
  return result;
}

async function loadContent() {
  applyContent(await api('content'));
}
initialLoad = loadContent().catch(() => {});

function showEditor(signedIn) {
  title.textContent = signedIn ? 'Edit portfolio' : 'Admin login';
  editor.hidden = !signedIn;
  login.hidden = signedIn;
  fields.replaceChildren();
  if (!signedIn) return;
  for (const [name, entries] of Object.entries(collectionValues)) fields.append(collectionEditor(name, entries));
  const general = element('details', 'editor-group');
  general.append(element('summary', '', 'Portfolio details'));
  for (const node of details) {
    const name = fieldName(node);
    const value = node.dataset.link ? node.getAttribute('href') : node.textContent;
    general.append(fieldInput(name, name, value, { max: 800, required: true, multiline: !node.dataset.link, type: 'url' }));
  }
  fields.append(general);
}

async function run(action) {
  if (busy) return;
  busy = true;
  status.textContent = 'Working…';
  try {
    await action();
  } catch (error) {
    if (error.status === 401 && !editor.hidden) showEditor(false);
    status.textContent = error.message;
  } finally {
    busy = false;
  }
}

document.querySelector('#admin').addEventListener('click', () => {
  panel.showModal();
  run(async () => {
    await initialLoad;
    const session = await api('session');
    if (session.signedIn) await loadContent();
    showEditor(session.signedIn);
    status.textContent = '';
  });
});
document.querySelector('#close').addEventListener('click', () => {
  if (!busy) panel.close();
});
panel.addEventListener('cancel', event => {
  if (busy) event.preventDefault();
});
panel.addEventListener('close', () => {
  login.reset();
  showEditor(false);
});
login.addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const credentials = Object.fromEntries(new FormData(login));
    try {
      await api('login', 'POST', credentials);
    } finally {
      login.reset();
    }
    await loadContent();
    showEditor(true);
    status.textContent = '';
  });
});
editor.addEventListener('invalid', event => {
  for (let node = event.target.parentElement; node && node !== fields; node = node.parentElement) {
    if (node.tagName === 'DETAILS') node.open = true;
  }
}, true);
editor.addEventListener('submit', event => {
  event.preventDefault();
  run(async () => {
    const updates = Object.fromEntries(new FormData(editor));
    for (const group of fields.querySelectorAll('[data-collection]')) {
      updates[group.dataset.collection] = [...group.querySelectorAll('.entry')].map(card =>
        Object.fromEntries([...card.querySelectorAll('[data-column]')].map(input => [input.dataset.column, input.value.trim()]))
      );
    }
    applyContent(await api('content', 'PUT', { revision, fields: updates }));
    status.textContent = 'Changes published.';
  });
});
document.querySelector('#logout').addEventListener('click', () => run(async () => {
  await api('logout', 'POST', {});
  showEditor(false);
  status.textContent = 'Signed out.';
}));