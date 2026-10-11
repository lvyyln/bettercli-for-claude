const state = {
  sessions: [],
  statuses: {},
  history: [],
  historyLoaded: false,
  collapsed: new Set(['__history']),
  open: [],
  active: null,
  theme: 'midnight',
  fontSize: 13,
  changesOpen: false,
  changes: [],
  selectedChange: null,
  dragId: null,
  treeStale: false
};
const IS_MAC = desk.platform === 'darwin';
const FONT_MIN = 9;
const FONT_MAX = 24;
const FONT_DEFAULT = 13;
const terms = new Map();
let modal = { mode: 'new', id: null };

const $ = (id) => document.getElementById(id);

const HISTORY_KEY = '__history';
const STATUS_TEXT = { busy: 'Working', waiting: 'Needs input', idle: 'Idle', stopped: 'Stopped' };

const ICONS = {
  branch: '<svg class="branch" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 3v10a4 4 0 0 0 4 4h10"></path></svg>',
  chev: '<svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg>',
  fork: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="6" cy="5" r="2"></circle><circle cx="18" cy="5" r="2"></circle><circle cx="12" cy="19" r="2"></circle><path d="M6 7v2a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7M12 12v5"></path></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19 9l-4-4L4 16z"></path></svg>',
  close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
  plus: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>',
  refresh: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"></path></svg>',
  orch: '<svg class="kind" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="2.5"></circle><circle cx="5" cy="19" r="2.5"></circle><circle cx="19" cy="19" r="2.5"></circle><path d="M12 7.5V12M12 12l-6 5M12 12l6 5"></path></svg>',
  expand: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>'
};

function esc(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function find(id) {
  return state.sessions.find((s) => s.id === id);
}

function statusOf(id) {
  return state.statuses[id] || 'stopped';
}

function dot(id) {
  const status = statusOf(id);
  return `<i class="dot ${status}" title="${STATUS_TEXT[status]}"></i>`;
}

function readSetting(key, fallback) {
  try {
    return localStorage.getItem(key) || fallback;
  } catch (e) {
    return fallback;
  }
}

function writeSetting(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (e) {
    // settings are a convenience; ignore storage failures
  }
}

function applyTheme(name) {
  const theme = THEMES[name] || THEMES.midnight;
  state.theme = THEMES[name] ? name : 'midnight';
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(theme.ui)) {
    root.setProperty('--' + key, value);
  }
  for (const entry of terms.values()) {
    entry.term.options.theme = theme.term;
  }
  desk.setTitleBar({ color: theme.ui.panel, symbolColor: theme.ui.text });
  writeSetting('theme', state.theme);
  $('theme').value = state.theme;
}

function groupNames() {
  const names = [];
  for (const s of state.sessions) {
    if (!names.includes(s.group)) {
      names.push(s.group);
    }
  }
  return names;
}

function flattenGroup(group) {
  const members = state.sessions.filter((s) => s.group === group);
  const ids = new Set(members.map((s) => s.id));
  const rows = [];
  const walk = (parentId, depth) => {
    for (const s of members.filter((m) => m.parentId === parentId)) {
      rows.push({ session: s, depth });
      walk(s.id, depth + 1);
    }
  };
  for (const root of members.filter((s) => !s.parentId || !ids.has(s.parentId))) {
    rows.push({ session: root, depth: 0 });
    walk(root.id, 1);
  }
  return rows;
}

function sectionHead(key, label, count, extraHtml) {
  const head = document.createElement('button');
  head.className = 'section-head' + (state.collapsed.has(key) ? ' collapsed' : '');
  head.innerHTML = `${ICONS.chev}<span class="label">${esc(label)}</span><span class="count">${count}</span>${extraHtml || ''}`;
  head.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="refresh"]')) {
      loadHistory();
      return;
    }
    if (e.target.closest('[data-act="add"]')) {
      openModal('new', null, key);
      return;
    }
    toggleSection(key);
  });
  return head;
}

function toggleSection(key) {
  if (state.collapsed.has(key)) {
    state.collapsed.delete(key);
  } else {
    state.collapsed.add(key);
  }
  if (key === HISTORY_KEY && !state.collapsed.has(key) && !state.historyLoaded) {
    loadHistory();
  }
  renderTree();
}

// The parent a session is drawn under: its parentId, unless that parent sits in another group.
function treeParent(s) {
  return s.parentId && state.sessions.some((p) => p.id === s.parentId && p.group === s.group) ? s.parentId : null;
}

// Only siblings can swap places; forks always follow their parent.
function canDrop(id, target) {
  const dragged = find(id);
  return Boolean(dragged) && dragged.id !== target.id &&
    dragged.group === target.group && treeParent(dragged) === treeParent(target);
}

function clearDropMarks() {
  for (const el of $('tree').querySelectorAll('.drop-before, .drop-after')) {
    el.classList.remove('drop-before', 'drop-after');
  }
}

function moveSession(id, targetId, after) {
  const moving = find(id);
  const list = state.sessions.filter((s) => s.id !== id);
  const index = list.findIndex((s) => s.id === targetId) + (after ? 1 : 0);
  list.splice(index, 0, moving);
  state.sessions = list;
  renderTree();
  desk.reorderSessions(list.map((s) => s.id)).catch((e) => desk.logError('reorder failed: ' + e.message));
}

function makeDraggable(item, s) {
  item.draggable = true;
  item.addEventListener('dragstart', (e) => {
    state.dragId = s.id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', s.id);
    item.classList.add('dragging');
  });
  item.addEventListener('dragover', (e) => {
    if (!canDrop(state.dragId, s)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = item.getBoundingClientRect();
    const after = e.clientY > box.top + box.height / 2;
    clearDropMarks();
    item.classList.add(after ? 'drop-after' : 'drop-before');
  });
  item.addEventListener('dragleave', () => item.classList.remove('drop-before', 'drop-after'));
  item.addEventListener('drop', (e) => {
    e.preventDefault();
    const id = state.dragId;
    const after = item.classList.contains('drop-after');
    state.dragId = null;
    if (canDrop(id, s)) {
      moveSession(id, s.id, after);
    }
  });
  item.addEventListener('dragend', () => {
    state.dragId = null;
    item.classList.remove('dragging');
    clearDropMarks();
    if (state.treeStale) {
      renderTree();
    }
  });
}

function sessionRow(s, depth) {
  const item = document.createElement('div');
  item.className = 'item' + (s.id === state.active ? ' selected' : '');
  item.style.paddingLeft = (8 + depth * 16) + 'px';
  item.title = s.cwd;
  makeDraggable(item, s);
  item.innerHTML =
    (depth > 0 ? ICONS.branch : '') +
    dot(s.id) +
    (isOrchestrator(s) ? ICONS.orch : '') +
    `<span class="name">${esc(s.title)}</span>` +
    '<span class="actions">' +
    (isOrchestrator(s) ? '' : `<button class="icon-btn" data-act="fork" title="Fork" aria-label="Fork">${ICONS.fork}</button>`) +
    `<button class="icon-btn" data-act="edit" title="Edit" aria-label="Edit">${ICONS.edit}</button>` +
    '</span>';
  item.addEventListener('click', (e) => {
    const button = e.target.closest('[data-act]');
    const act = button ? button.dataset.act : null;
    if (act === 'fork') {
      forkSession(s.id);
    } else if (act === 'edit') {
      openModal('edit', s.id);
    } else {
      openSession(s.id);
    }
  });
  return item;
}

function timeAgo(ms) {
  const minutes = Math.round((Date.now() - ms) / 60000);
  if (minutes < 60) {
    return minutes + 'm';
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return hours + 'h';
  }
  return Math.round(hours / 24) + 'd';
}

function historyRow(h) {
  const item = document.createElement('div');
  item.className = 'item';
  item.title = h.cwd;
  const folder = h.cwd.split(/[\\/]/).filter(Boolean).pop();
  item.innerHTML =
    '<i class="dot stopped" title="Not in desk"></i>' +
    `<span class="name">${esc(h.title)}</span>` +
    `<span class="meta">${esc(folder)} · ${timeAgo(h.mtime)}</span>`;
  item.addEventListener('click', async () => {
    const session = await desk.importSession({ id: h.id, title: h.title, cwd: h.cwd });
    state.sessions.push(session);
    state.history = state.history.filter((x) => x.id !== h.id);
    openSession(session.id);
  });
  return item;
}

function renderTree() {
  // Rebuilding the rows mid-drag would cancel the drag; status updates wait until dragend.
  if (state.dragId) {
    state.treeStale = true;
    return;
  }
  state.treeStale = false;
  const tree = $('tree');
  tree.innerHTML = '';
  const add = `<span class="icon-btn add" data-act="add" title="New session in this group" aria-label="New session in this group">${ICONS.plus}</span>`;
  for (const group of groupNames()) {
    const rows = flattenGroup(group);
    tree.appendChild(sectionHead(group, group, rows.length, add));
    if (!state.collapsed.has(group)) {
      for (const row of rows) {
        tree.appendChild(sessionRow(row.session, row.depth));
      }
    }
  }
  const refresh = `<span class="icon-btn" data-act="refresh" title="Refresh" aria-label="Refresh">${ICONS.refresh}</span>`;
  tree.appendChild(sectionHead(HISTORY_KEY, 'Claude CLI sessions', state.historyLoaded ? state.history.length : '', refresh));
  if (!state.collapsed.has(HISTORY_KEY)) {
    for (const h of state.history) {
      tree.appendChild(historyRow(h));
    }
  }
  $('groups-list').innerHTML = groupNames().map((g) => `<option value="${esc(g)}">`).join('');
}

function renderTabs() {
  const tabs = $('tabs');
  tabs.innerHTML = '';
  for (const id of state.open) {
    const s = find(id);
    const tab = document.createElement('div');
    tab.className = 'tab' + (id === state.active ? ' active' : '');
    tab.title = s.title;
    tab.innerHTML =
      `${dot(id)}<span class="name">${esc(s.title)}</span>` +
      `<button class="icon-btn" data-act="close" title="Close and stop" aria-label="Close">${ICONS.close}</button>`;
    tab.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close"]')) {
        closeTab(id);
      } else {
        openSession(id);
      }
    });
    tabs.appendChild(tab);
  }
}

function renderHeader() {
  const s = find(state.active);
  $('header').classList.toggle('hidden', !s);
  $('empty').classList.toggle('hidden', !!s);
  if (!s) {
    $('statusbar').innerHTML = '';
    return;
  }
  const parent = s.parentId ? find(s.parentId) : null;
  if (isOrchestrator(s)) {
    const count = workersOf(s.id).length;
    $('crumb').textContent = s.group + '  ›  orchestration · ' + count + (count === 1 ? ' agent' : ' agents');
  } else {
    $('crumb').textContent = s.group + (parent ? '  ›  forked from ' + parent.title : '');
  }
  $('btn-fork').classList.toggle('hidden', isOrchestrator(s));
  $('title').textContent = s.title;
  $('statusbar').innerHTML =
    `<span class="stat">${dot(s.id)}${STATUS_TEXT[statusOf(s.id)]}</span>` +
    `<span class="mono">${esc(s.cwd)}</span>` +
    `<span class="mono">${esc(s.id)}</span>`;
}

function render() {
  renderTree();
  renderTabs();
  renderHeader();
  renderChanges();
  for (const [id, entry] of terms) {
    if (entry.grid) {
      renderOrch(id);
    }
  }
}

const CHANGE_LETTER = { added: 'A', modified: 'M', deleted: 'D' };

function renderChanges() {
  const count = state.changes.length;
  $('changes-badge').textContent = count;
  $('changes-badge').classList.toggle('hidden', count === 0);
  $('btn-changes').classList.toggle('on', state.changesOpen);
  $('changes').classList.toggle('hidden', !state.changesOpen || !state.active);
  $('changes-count').textContent = count || '';
  const files = $('changes-files');
  files.innerHTML = '';
  if (count === 0) {
    files.innerHTML = '<div class="changes-empty">No edits yet. Files Claude changes with its Edit and Write tools show up here.</div>';
  }
  for (const c of state.changes) {
    const parts = c.rel.split(/[\\/]/);
    const name = parts.pop();
    const row = document.createElement('div');
    row.className = 'cf-row' + (c.path === state.selectedChange ? ' selected' : '');
    row.title = c.path;
    row.innerHTML =
      `<span class="cf-status ${c.status}">${CHANGE_LETTER[c.status]}</span>` +
      `<span class="cf-path">${esc(name)}<span class="dir">${esc(parts.join('/'))}</span></span>` +
      `<span class="cf-stat"><span class="plus">+${c.added}</span> <span class="minus">−${c.removed}</span></span>`;
    row.addEventListener('click', () => selectChange(c.path));
    files.appendChild(row);
  }
  $('diff-head').classList.toggle('hidden', !state.selectedChange);
}

async function refreshChanges() {
  const id = state.active;
  const list = id ? await desk.listChanges(id) : [];
  if (id !== state.active) {
    return;
  }
  state.changes = list;
  if (!list.some((c) => c.path === state.selectedChange)) {
    state.selectedChange = list.length ? list[0].path : null;
  }
  renderChanges();
  await showDiff();
}

function selectChange(file) {
  state.selectedChange = file;
  renderChanges();
  const row = $('changes-files').querySelector('.cf-row.selected');
  if (row) {
    row.scrollIntoView({ block: 'nearest' });
  }
  showDiff();
}

function stepChange(step) {
  const count = state.changes.length;
  if (!count) {
    return;
  }
  const index = state.changes.findIndex((c) => c.path === state.selectedChange);
  selectChange(state.changes[(index + step + count) % count].path);
}

function diffHtml(d) {
  if (d.note) {
    return `<div class="diff-note">${esc(d.note)}</div>`;
  }
  const row = (cls, oldNo, newNo, text) =>
    `<div class="dl ${cls}"><span class="ln">${oldNo}</span><span class="ln">${newNo}</span><span class="tx">${text}</span></div>`;
  let html = '';
  for (const hunk of d.hunks) {
    html += `<div class="hunk">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</div>`;
    let oldNo = hunk.oldStart;
    let newNo = hunk.newStart;
    for (const line of hunk.lines) {
      const sign = line[0];
      const text = esc(line);
      if (sign === '+') {
        html += row('add', '', newNo++, text);
      } else if (sign === '-') {
        html += row('del', oldNo++, '', text);
      } else if (sign === ' ') {
        html += row('ctx', oldNo++, newNo++, text);
      }
    }
  }
  return html;
}

async function showDiff() {
  const id = state.active;
  const file = state.selectedChange;
  if (!id || !file || !state.changesOpen) {
    $('diff').innerHTML = '';
    return;
  }
  const d = await desk.diffChange(id, file);
  if (id !== state.active || file !== state.selectedChange) {
    return;
  }
  $('diff-path').textContent = d.rel;
  $('diff-path').title = d.path;
  $('diff').innerHTML = diffHtml(d);
}

function toggleChanges() {
  state.changesOpen = !state.changesOpen;
  writeSetting('changesOpen', state.changesOpen ? '1' : '0');
  renderChanges();
  refreshChanges();
}

async function loadHistory() {
  state.history = await desk.getHistory();
  state.historyLoaded = true;
  renderTree();
}

// Opens an xterm for a session in `host`, or in a new full-size .term element when no host is given.
function createTerminal(id, host) {
  const el = host || document.createElement('div');
  if (!host) {
    el.className = 'term';
    $('terminals').appendChild(el);
  }
  const term = new Terminal({
    fontFamily: "'Cascadia Mono', Consolas, monospace",
    fontSize: state.fontSize,
    lineHeight: 1.15,
    scrollback: 10000,
    cursorBlink: true,
    theme: THEMES[state.theme].term,
    linkHandler: { activate: (e, uri) => openLink(e, uri) }
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon.WebLinksAddon((e, uri) => openLink(e, uri)));
  term.open(el);
  term.onData((data) => desk.write(id, data));
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') {
      return true;
    }
    if (e.shiftKey && e.key === 'Enter') {
      desk.write(id, '\x1b\r');
      return false;
    }
    return true;
  });
  const entry = { term, fit, el };
  terms.set(id, entry);
  return entry;
}

// Ctrl+click (Cmd+click on macOS), like Windows Terminal and VS Code, so a plain click still selects text.
function openLink(e, uri) {
  if (IS_MAC ? e.metaKey : e.ctrlKey) {
    desk.openLink(uri);
  }
}

function fitEntry(id) {
  const entry = terms.get(id);
  if (!entry) {
    return;
  }
  entry.fit.fit();
  desk.resize(id, entry.term.cols, entry.term.rows);
}

// The active tab, plus every agent tile when it is an orchestration.
function fitActive() {
  if (!state.active) {
    return;
  }
  fitEntry(state.active);
  for (const w of workersOf(state.active)) {
    fitEntry(w.id);
  }
}

function isOrchestrator(s) {
  return Boolean(s) && s.kind === 'orchestrator';
}

function workersOf(orchId) {
  return state.sessions.filter((s) => s.kind === 'worker' && s.orchestratorId === orchId);
}

function createOrchView(id) {
  const view = document.createElement('div');
  view.className = 'term orch-view';
  view.innerHTML =
    '<div class="orch-main"><div class="xterm-host"></div></div>' +
    '<div class="orch-side"><div class="orch-side-head"><span>Agents</span><span class="count"></span></div>' +
    '<div class="orch-grid"></div></div>';
  $('terminals').appendChild(view);
  const entry = createTerminal(id, view.querySelector('.orch-main .xterm-host'));
  entry.el = view;
  entry.grid = view.querySelector('.orch-grid');
  renderOrch(id);
  return entry;
}

function addTile(worker) {
  const owner = terms.get(worker.orchestratorId);
  if (!owner || !owner.grid || terms.has(worker.id)) {
    return;
  }
  const tile = document.createElement('div');
  tile.className = 'tile';
  tile.innerHTML =
    '<div class="tile-head"><i class="dot"></i><span class="name"></span><span class="state"></span>' +
    `<button class="icon-btn" data-act="expand" title="Enlarge" aria-label="Enlarge">${ICONS.expand}</button>` +
    '<button class="btn small" data-act="power"></button></div>' +
    '<div class="tile-body"><div class="xterm-host"></div></div>';
  owner.grid.appendChild(tile);
  const entry = createTerminal(worker.id, tile.querySelector('.xterm-host'));
  entry.el = tile;
  entry.embedded = true;
  tile.querySelector('[data-act="expand"]').addEventListener('click', () => {
    tile.classList.toggle('expanded');
    fitActive();
  });
  tile.querySelector('[data-act="power"]').addEventListener('click', () => toggleWorker(worker.id));
  tile.addEventListener('focusin', () => markFocusedTile(worker.id));
  updateTile(worker.id);
}

function updateTile(id) {
  const entry = terms.get(id);
  const s = find(id);
  if (!entry || !entry.embedded || !s) {
    return;
  }
  const status = statusOf(id);
  const head = entry.el.querySelector('.tile-head');
  head.querySelector('.dot').className = 'dot ' + status;
  head.querySelector('.name').textContent = s.title;
  head.title = s.task || s.title;
  head.querySelector('.state').textContent = STATUS_TEXT[status];
  head.querySelector('[data-act="power"]').textContent = status === 'stopped' ? 'Resume' : 'Stop';
}

// Keeps an orchestration's tiles in step with its workers and their statuses.
function renderOrch(orchId) {
  const entry = terms.get(orchId);
  const orch = find(orchId);
  if (!entry || !entry.grid || !orch) {
    return;
  }
  const workers = workersOf(orchId);
  for (const w of workers) {
    addTile(w);
    updateTile(w.id);
  }
  const running = workers.filter((w) => statusOf(w.id) !== 'stopped').length;
  entry.el.querySelector('.orch-side-head .count').textContent = `${running} of ${orch.orch.maxAgents} running`;
  const empty = entry.grid.querySelector('.orch-empty');
  if (!workers.length && !empty) {
    entry.grid.insertAdjacentHTML('beforeend', '<div class="orch-empty">No agents yet. They appear here as the orchestrator starts them.</div>');
  } else if (workers.length && empty) {
    empty.remove();
  }
}

function markFocusedTile(id) {
  const entry = terms.get(id);
  if (!entry || !entry.embedded) {
    return;
  }
  for (const tile of entry.el.parentElement.querySelectorAll('.tile')) {
    tile.classList.toggle('focused', tile === entry.el);
  }
}

function focusTile(id) {
  const entry = terms.get(id);
  if (!entry || !entry.embedded) {
    return;
  }
  entry.el.scrollIntoView({ block: 'nearest' });
  entry.term.focus();
  markFocusedTile(id);
}

async function toggleWorker(id) {
  const entry = terms.get(id);
  if (statusOf(id) !== 'stopped') {
    desk.killPty(id);
    return;
  }
  fitEntry(id);
  const result = await desk.openPty(id, entry.term.cols, entry.term.rows);
  if (result && result.error) {
    entry.term.write('\x1b[31m' + result.error.replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
  }
}

function disposeTerminal(id) {
  const entry = terms.get(id);
  if (entry) {
    entry.term.dispose();
    entry.el.remove();
    terms.delete(id);
  }
}

async function openSession(id) {
  const s = find(id);
  // An agent lives in its orchestration's view; open that and bring the agent's tile into focus.
  const owner = s && s.kind === 'worker' ? find(s.orchestratorId) : null;
  if (owner) {
    await openSession(owner.id);
    focusTile(id);
    return;
  }
  const entry = terms.get(id) || (isOrchestrator(s) ? createOrchView(id) : createTerminal(id));
  if (!state.open.includes(id)) {
    state.open.push(id);
  }
  state.active = id;
  desk.setActive(id);
  for (const [otherId, other] of terms) {
    if (!other.embedded) {
      other.el.classList.toggle('active', otherId === id);
    }
  }
  render();
  fitActive();
  entry.term.focus();
  refreshChanges();
  const result = await desk.openPty(id, entry.term.cols, entry.term.rows);
  if (result && result.error) {
    entry.term.write('\x1b[31m' + result.error.replace(/\n/g, '\r\n') + '\x1b[0m\r\n');
  }
}

function closeTab(id) {
  desk.killPty(id);
  // Closing an orchestration stops its agents too, so none keep running out of sight.
  for (const w of workersOf(id)) {
    desk.killPty(w.id);
    disposeTerminal(w.id);
  }
  disposeTerminal(id);
  state.open = state.open.filter((x) => x !== id);
  if (state.active === id) {
    state.active = state.open[state.open.length - 1] || null;
  }
  if (state.active) {
    openSession(state.active);
  } else {
    desk.setActive(null);
    refreshChanges();
    render();
  }
}

// Uses the physical key, so shortcuts work with any keyboard layout (e.g. Cyrillic Ctrl+C types "с", not "c").
function physicalKey(e) {
  const code = e.code || '';
  if (/^Key[A-Z]$/.test(code)) {
    return code.substring(3).toLowerCase();
  }
  if (/^(Digit|Numpad)[0-9]$/.test(code)) {
    return code.substring(code.length - 1);
  }
  if (code === 'Equal' || code === 'NumpadAdd') {
    return '=';
  }
  if (code === 'Minus' || code === 'NumpadSubtract') {
    return '-';
  }
  return e.key.toLowerCase();
}

// Windows/Linux put tab actions on Ctrl+Shift (as Windows Terminal does) so plain Ctrl keys still reach Claude.
function shortcutFor(e) {
  if (e.ctrlKey && !e.altKey && !e.metaKey && e.key === 'Tab') {
    return e.shiftKey ? 'prev' : 'next';
  }
  if (e.key === 'F8' && state.changesOpen && !e.ctrlKey && !e.altKey && !e.metaKey) {
    return e.shiftKey ? 'prevChange' : 'nextChange';
  }
  const mod = IS_MAC ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod || e.altKey) {
    return null;
  }
  const tabMod = IS_MAC ? !e.shiftKey : e.shiftKey;
  const key = physicalKey(e);
  if (tabMod && key === 't') {
    return 'new';
  }
  if (tabMod && key === 'w') {
    return 'close';
  }
  if (tabMod && key === 'd') {
    return 'fork';
  }
  if (e.shiftKey && key === 'g') {
    return 'changes';
  }
  if (!e.shiftKey && /^[1-9]$/.test(key)) {
    return 'tab' + key;
  }
  if (key === '=' || key === '+') {
    return 'zoomIn';
  }
  if (key === '-' || key === '_') {
    return 'zoomOut';
  }
  if (!e.shiftKey && key === '0') {
    return 'zoomReset';
  }
  if (key === 'v') {
    return 'paste';
  }
  const entry = terms.get(state.active);
  if (key === 'c' && entry && entry.term.hasSelection()) {
    return 'copy';
  }
  return null;
}

function runShortcut(action) {
  const index = state.open.indexOf(state.active);
  if (action === 'new') {
    openModal('new');
  } else if (action === 'close' && state.active) {
    closeTab(state.active);
  } else if (action === 'fork' && state.active) {
    forkSession(state.active);
  } else if ((action === 'next' || action === 'prev') && state.open.length > 1) {
    const step = action === 'next' ? 1 : -1;
    openSession(state.open[(index + step + state.open.length) % state.open.length]);
  } else if (action.startsWith('tab') && state.open.length) {
    const n = Number(action.substring(3));
    openSession(n === 9 ? state.open[state.open.length - 1] : state.open[n - 1] || state.active);
  } else if (action === 'changes') {
    toggleChanges();
  } else if (action === 'nextChange') {
    stepChange(1);
  } else if (action === 'prevChange') {
    stepChange(-1);
  } else if (action === 'zoomIn') {
    setFontSize(state.fontSize + 1);
  } else if (action === 'zoomOut') {
    setFontSize(state.fontSize - 1);
  } else if (action === 'zoomReset') {
    setFontSize(FONT_DEFAULT);
  } else if (action === 'paste') {
    pasteClipboard();
  } else if (action === 'copy') {
    const term = terms.get(state.active).term;
    navigator.clipboard.writeText(term.getSelection());
    term.clearSelection();
  }
}

function setFontSize(size) {
  state.fontSize = Math.min(FONT_MAX, Math.max(FONT_MIN, size));
  for (const entry of terms.values()) {
    entry.term.options.fontSize = state.fontSize;
  }
  writeSetting('fontSize', String(state.fontSize));
  fitActive();
}

async function pasteClipboard() {
  const entry = terms.get(state.active);
  if (!entry) {
    return;
  }
  const content = await desk.readPaste();
  if (content.imagePath) {
    entry.term.paste(content.imagePath + ' ');
  } else if (content.text) {
    entry.term.paste(content.text);
  }
  entry.term.focus();
}

async function forkSession(parentId) {
  // A fork would lose the orchestration tools, so orchestrators are not forked.
  if (!parentId || isOrchestrator(find(parentId))) {
    return;
  }
  const session = await desk.forkSession(parentId);
  state.sessions.push(session);
  openSession(session.id);
}

// For a new session in a given group, defaults come from that group's most recent session.
function openModal(mode, id, group) {
  modal = { mode, id };
  const inGroup = group ? state.sessions.filter((x) => x.group === group) : [];
  const s = id ? find(id) : inGroup[inGroup.length - 1] || find(state.active);
  const creating = mode !== 'edit';
  $('modal-title').textContent = mode === 'orch' ? 'New orchestration' : creating ? 'New session' : 'Edit session';
  $('f-title').value = creating ? '' : s.title;
  $('f-group').value = group || (s ? s.group : 'Scratch');
  $('f-cwd').value = s ? s.cwd : '';
  $('f-cwd').required = creating;
  $('cwd-row').classList.toggle('hidden', !creating);
  $('btn-remove').classList.toggle('hidden', creating);
  $('orch-fields').classList.toggle('hidden', mode !== 'orch');
  if (mode === 'orch') {
    $('f-goal').value = '';
    $('f-max').value = '5';
    $('f-isolation').value = 'shared';
    $('f-perm').value = 'manual';
    $('f-autoapprove').checked = false;
    $('perm-warning').classList.add('hidden');
  }
  $('modal').showModal();
  $('f-title').focus();
}

async function submitModal() {
  const title = $('f-title').value.trim();
  const group = $('f-group').value.trim() || 'Scratch';
  if (modal.mode !== 'edit') {
    const fields = { title, group, cwd: $('f-cwd').value.trim() };
    let session;
    try {
      if (modal.mode === 'orch') {
        session = await desk.createOrchestration(Object.assign(fields, {
          goal: $('f-goal').value,
          maxAgents: Number($('f-max').value),
          isolation: $('f-isolation').value,
          permissionMode: $('f-perm').value,
          autoApproveTools: $('f-autoapprove').checked
        }));
      } else {
        session = await desk.createSession(fields);
      }
    } catch (e) {
      alert(e.message.replace(/^.*Error: /, ''));
      return;
    }
    state.sessions.push(session);
    openSession(session.id);
    return;
  }
  const updated = await desk.updateSession({ id: modal.id, title, group });
  Object.assign(find(modal.id), updated);
  render();
}

async function removeSession(id) {
  const removed = find(id);
  await desk.removeSession(id);
  for (const s of state.sessions) {
    if (s.parentId === id) {
      s.parentId = removed.parentId;
    }
  }
  state.sessions = state.sessions.filter((s) => s.id !== id);
  if (terms.has(id) && terms.get(id).embedded) {
    disposeTerminal(id);
  }
  if (state.open.includes(id)) {
    closeTab(id);
  } else {
    render();
  }
}

function wireUi() {
  $('btn-new').addEventListener('click', () => openModal('new'));
  $('btn-new-empty').addEventListener('click', () => openModal('new'));
  $('btn-orch').addEventListener('click', () => openModal('orch'));
  $('btn-orch-empty').addEventListener('click', () => openModal('orch'));
  $('f-perm').addEventListener('change', (e) => $('perm-warning').classList.toggle('hidden', e.target.value !== 'bypassPermissions'));
  $('btn-fork').addEventListener('click', () => forkSession(state.active));
  $('btn-edit').addEventListener('click', () => openModal('edit', state.active));
  $('btn-changes').addEventListener('click', () => toggleChanges());
  $('btn-changes').title = IS_MAC ? 'Changed files (⌘⇧G)' : 'Changed files (Ctrl+Shift+G)';
  $('btn-changes-close').addEventListener('click', () => toggleChanges());
  $('btn-changes-refresh').addEventListener('click', () => refreshChanges());
  $('btn-diff-prev').addEventListener('click', () => stepChange(-1));
  $('btn-diff-next').addEventListener('click', () => stepChange(1));
  $('btn-diff-open').addEventListener('click', () => {
    if (state.selectedChange) {
      desk.openFile(state.selectedChange);
    }
  });
  $('btn-cancel').addEventListener('click', () => $('modal').close());
  $('btn-browse').addEventListener('click', async () => {
    const dir = await desk.pickDir();
    if (dir) {
      $('f-cwd').value = dir;
    }
  });
  $('btn-remove').addEventListener('click', () => {
    $('modal').close();
    removeSession(modal.id);
  });
  $('modal-form').addEventListener('submit', () => submitModal());
  $('theme').innerHTML = Object.entries(THEMES).map(([key, t]) => `<option value="${key}">${esc(t.label)}</option>`).join('');
  $('theme').addEventListener('change', (e) => applyTheme(e.target.value));
  // Capture phase, so shortcuts are handled before xterm sends the keys to Claude.
  window.addEventListener('keydown', (e) => {
    if ($('modal').open) {
      return;
    }
    const action = shortcutFor(e);
    if (!action) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    runShortcut(action);
  }, true);
  $('btn-new').title = IS_MAC ? 'New session (⌘T)' : 'New session (Ctrl+Shift+T)';
  new ResizeObserver(() => fitActive()).observe($('terminals'));
}

function wireDesk() {
  desk.onData(({ id, data }) => {
    const entry = terms.get(id);
    if (entry) {
      entry.term.write(data);
    }
  });
  desk.onExit(({ id, exitCode }) => {
    const entry = terms.get(id);
    if (entry) {
      const how = entry.embedded ? 'use Resume on this tile' : 'click the tab or session to resume';
      entry.term.write('\r\n\x1b[90m[session ended with exit code ' + exitCode + ': ' + how + ']\x1b[0m\r\n');
    }
  });
  // An orchestrator started an agent: give it a tile before its first output arrives.
  desk.onSessionAdded((session) => {
    if (!find(session.id)) {
      state.sessions.push(session);
    }
    addTile(session);
    render();
    requestAnimationFrame(() => fitActive());
  });
  desk.onFocusSession(({ id }) => openSession(id));
  desk.onChanges(({ id }) => {
    if (id === state.active) {
      refreshChanges();
    }
  });
  desk.onStatus(({ id, status }) => {
    state.statuses[id] = status;
    render();
  });
}

async function init() {
  document.body.classList.add('platform-' + desk.platform);
  wireUi();
  wireDesk();
  applyTheme(readSetting('theme', 'midnight'));
  state.fontSize = Number(readSetting('fontSize', String(FONT_DEFAULT))) || FONT_DEFAULT;
  state.changesOpen = readSetting('changesOpen', '0') === '1';
  const loaded = await desk.getState();
  state.sessions = loaded.sessions;
  state.statuses = loaded.statuses;
  render();
}

window.addEventListener('error', (e) => desk.logError((e.error && e.error.stack) || e.message));
window.addEventListener('unhandledrejection', (e) => desk.logError((e.reason && e.reason.stack) || String(e.reason)));

init();
