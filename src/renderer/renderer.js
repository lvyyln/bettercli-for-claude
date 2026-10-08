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
  selectedChange: null
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
  refresh: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"></path></svg>'
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

function sessionRow(s, depth) {
  const item = document.createElement('div');
  item.className = 'item' + (s.id === state.active ? ' selected' : '');
  item.style.paddingLeft = (8 + depth * 16) + 'px';
  item.title = s.cwd;
  item.innerHTML =
    (depth > 0 ? ICONS.branch : '') +
    dot(s.id) +
    `<span class="name">${esc(s.title)}</span>` +
    '<span class="actions">' +
    `<button class="icon-btn" data-act="fork" title="Fork" aria-label="Fork">${ICONS.fork}</button>` +
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
  $('crumb').textContent = s.group + (parent ? '  ›  forked from ' + parent.title : '');
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

function createTerminal(id) {
  const el = document.createElement('div');
  el.className = 'term';
  $('terminals').appendChild(el);
  const term = new Terminal({
    fontFamily: "'Cascadia Mono', Consolas, monospace",
    fontSize: state.fontSize,
    lineHeight: 1.15,
    scrollback: 10000,
    cursorBlink: true,
    theme: THEMES[state.theme].term
  });
  const fit = new FitAddon.FitAddon();
  term.loadAddon(fit);
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

function fitActive() {
  const entry = terms.get(state.active);
  if (!entry) {
    return;
  }
  entry.fit.fit();
  desk.resize(state.active, entry.term.cols, entry.term.rows);
}

async function openSession(id) {
  const entry = terms.get(id) || createTerminal(id);
  if (!state.open.includes(id)) {
    state.open.push(id);
  }
  state.active = id;
  desk.setActive(id);
  for (const [otherId, other] of terms) {
    other.el.classList.toggle('active', otherId === id);
  }
  render();
  fitActive();
  entry.term.focus();
  refreshChanges();
  await desk.openPty(id, entry.term.cols, entry.term.rows);
}

function closeTab(id) {
  desk.killPty(id);
  const entry = terms.get(id);
  if (entry) {
    entry.term.dispose();
    entry.el.remove();
    terms.delete(id);
  }
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
  const key = e.key.toLowerCase();
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
  if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
    return 'tab' + e.key;
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
  const session = await desk.forkSession(parentId);
  state.sessions.push(session);
  openSession(session.id);
}

// For a new session in a given group, defaults come from that group's most recent session.
function openModal(mode, id, group) {
  modal = { mode, id };
  const inGroup = group ? state.sessions.filter((x) => x.group === group) : [];
  const s = id ? find(id) : inGroup[inGroup.length - 1] || find(state.active);
  $('modal-title').textContent = mode === 'new' ? 'New session' : 'Edit session';
  $('f-title').value = mode === 'new' ? '' : s.title;
  $('f-group').value = group || (s ? s.group : 'Scratch');
  $('f-cwd').value = s ? s.cwd : '';
  $('f-cwd').required = mode === 'new';
  $('cwd-row').classList.toggle('hidden', mode !== 'new');
  $('btn-remove').classList.toggle('hidden', mode === 'new');
  $('modal').showModal();
  $('f-title').focus();
}

async function submitModal() {
  const title = $('f-title').value.trim();
  const group = $('f-group').value.trim() || 'Scratch';
  if (modal.mode === 'new') {
    let session;
    try {
      session = await desk.createSession({ title, group, cwd: $('f-cwd').value.trim() });
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
  if (state.open.includes(id)) {
    closeTab(id);
  } else {
    render();
  }
}

function wireUi() {
  $('btn-new').addEventListener('click', () => openModal('new'));
  $('btn-new-empty').addEventListener('click', () => openModal('new'));
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
  desk.onExit(({ id }) => {
    const entry = terms.get(id);
    if (entry) {
      entry.term.write('\r\n\x1b[90m[session ended: click the tab or session to resume]\x1b[0m\r\n');
    }
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

init();
