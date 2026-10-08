const { app, BrowserWindow, ipcMain, dialog, Notification, clipboard, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const pty = require('node-pty');
const changes = require('./changes');

const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
// Set by a parent Claude Code session when the app is launched from one; inheriting them disables transcript saving.
const PARENT_SESSION_VARS = [
  'CLAUDECODE',
  'CLAUDE_CODE_CHILD_SESSION',
  'CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_SESSION_ATTENDED',
  'CLAUDE_CODE_ENTRYPOINT',
  'CLAUDE_CODE_EXECPATH',
  'CLAUDE_CODE_MESSAGING_SOCKET',
  'CLAUDE_CODE_MESSAGING_TOKEN',
  'CLAUDE_PID',
  'CLAUDE_EFFORT'
];
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
// Store location of the pre-rename builds ("Claude Desk").
const LEGACY_STORE = path.join(app.getPath('appData'), 'claudedesk', 'desk.json');

let win = null;
let storePath = null;
let hooksPath = null;
let hookPort = 0;
let store = { sessions: [] };
const ptys = new Map();
const statuses = new Map();
// Held until clicked or dismissed so the click handler is not garbage-collected.
const notifications = new Set();
let activeId = null;

function loadStore() {
  storePath = path.join(app.getPath('userData'), 'desk.json');
  if (app.isPackaged && !fs.existsSync(storePath) && fs.existsSync(LEGACY_STORE)) {
    fs.mkdirSync(path.dirname(storePath), { recursive: true });
    fs.copyFileSync(LEGACY_STORE, storePath);
  }
  if (fs.existsSync(storePath)) {
    store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  }
}

function saveStore() {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function findSession(id) {
  return store.sessions.find((s) => s.id === id);
}

// Apps started from Finder or a desktop launcher get a minimal PATH; take the one from the user's login shell.
function loadShellPath() {
  if (IS_WIN) {
    return;
  }
  try {
    const shell = process.env.SHELL || (IS_MAC ? '/bin/zsh' : '/bin/bash');
    const shellPath = execFileSync(shell, ['-ilc', 'printf %s "$PATH"'], { encoding: 'utf8', timeout: 5000 });
    if (shellPath) {
      process.env.PATH = shellPath;
    }
  } catch (e) {
    console.error('could not read login shell PATH', e.message);
  }
}

function resolveClaude() {
  const home = os.homedir();
  const fallbacks = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
    path.join(process.env.APPDATA || '', 'npm')
  ];
  const dirs = (process.env.PATH || '').split(path.delimiter).concat(fallbacks);
  const names = IS_WIN ? ['claude.exe', 'claude.cmd'] : ['claude'];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return 'claude';
}

function findJsonl(id) {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return null;
  }
  for (const dir of fs.readdirSync(PROJECTS_DIR)) {
    const file = path.join(PROJECTS_DIR, dir, id + '.jsonl');
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return null;
}

// Hooks pipe their JSON payload straight to the local status server; curl ships with Windows 10+, macOS and most Linux distros.
function writeHooksSettings() {
  hooksPath = path.join(app.getPath('userData'), 'hooks.json');
  const curl = IS_WIN ? 'curl.exe' : 'curl';
  const command = `${curl} -s -m 2 -X POST --data-binary "@-" http://127.0.0.1:${hookPort}/hook`;
  const entry = [{ hooks: [{ type: 'command', command, timeout: 5 }] }];
  const settings = {
    hooks: {
      UserPromptSubmit: entry,
      PreToolUse: [{ matcher: '*', hooks: entry[0].hooks }],
      PostToolUse: [{ matcher: '*', hooks: entry[0].hooks }],
      Notification: entry,
      Stop: entry
    }
  };
  fs.writeFileSync(hooksPath, JSON.stringify(settings, null, 2));
}

function toRenderer(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function setStatus(id, status) {
  const previous = statuses.get(id);
  statuses.set(id, status);
  toRenderer('status', { id, status });
  notifyStatus(id, previous, status);
}

function windowAlive() {
  return win && !win.isDestroyed();
}

// Tells the user when a session they are not looking at needs input or has finished its turn.
function notifyStatus(id, previous, status) {
  const needsInput = status === 'waiting' && previous !== 'waiting';
  const finished = status === 'idle' && previous === 'busy';
  if (!needsInput && !finished) {
    return;
  }
  if (windowAlive() && win.isFocused() && id === activeId) {
    return;
  }
  const session = findSession(id);
  if (!session || !Notification.isSupported()) {
    return;
  }
  const notification = new Notification({ title: session.title, body: needsInput ? 'Needs your input' : 'Finished' });
  notifications.add(notification);
  notification.on('click', () => {
    notifications.delete(notification);
    if (windowAlive()) {
      if (win.isMinimized()) {
        win.restore();
      }
      win.show();
      win.focus();
      toRenderer('session:focus', { id });
    }
  });
  notification.on('close', () => notifications.delete(notification));
  notification.show();
  if (windowAlive() && !win.isFocused()) {
    win.flashFrame(true);
  }
}

// Terminal output is untrusted, so only web and mail links are handed to the OS.
function openExternalLink(url) {
  try {
    const protocol = new URL(url).protocol;
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'mailto:') {
      shell.openExternal(url);
    }
  } catch (e) {
    console.error('not a valid link', url);
  }
}

// Images are saved to a temp file and pasted as a path; Claude Code attaches pasted image paths.
async function readClipboardForPaste() {
  for (const item of await clipboard.read()) {
    if (item.types.includes('image/png')) {
      const blob = await item.getType('image/png');
      const file = path.join(os.tmpdir(), `bettercli-paste-${Date.now()}.png`);
      fs.writeFileSync(file, Buffer.from(await blob.arrayBuffer()));
      return { imagePath: file };
    }
  }
  return { text: await clipboard.readText() };
}

function statusFromHook(payload) {
  const event = payload.hook_event_name;
  if (event === 'Stop') {
    return 'idle';
  }
  if (event === 'Notification') {
    const message = (payload.message || '').toLowerCase();
    if (payload.notification_type === 'idle_prompt' || message.includes('waiting for your input')) {
      return 'idle';
    }
    return 'waiting';
  }
  return 'busy';
}

function startHookServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const payload = JSON.parse(body);
          const id = payload.session_id;
          if (id && ptys.has(id)) {
            // Answered only after the baseline is saved: Claude waits for the hook, so the file is still untouched.
            if (payload.hook_event_name === 'PreToolUse' && changes.isEditTool(payload)) {
              changes.trackBeforeEdit(id, payload);
            }
            setStatus(id, statusFromHook(payload));
            if (payload.hook_event_name === 'PostToolUse' && changes.isEditTool(payload)) {
              toRenderer('changes:updated', { id });
            }
          }
        } catch (e) {
          console.error('bad hook payload', e);
        }
        res.end('ok');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      hookPort = server.address().port;
      resolve();
    });
  });
}

function buildArgs(session) {
  const args = ['--settings', hooksPath];
  if (session.pending === 'fork') {
    args.push('--resume', session.parentId, '--fork-session', '--session-id', session.id, '-n', session.title);
  } else if (session.pending === 'new' || !findJsonl(session.id)) {
    args.push('--session-id', session.id, '-n', session.title);
  } else {
    args.push('--resume', session.id);
  }
  return args;
}

function openPty(id, cols, rows) {
  if (ptys.has(id)) {
    return;
  }
  const session = findSession(id);
  const env = Object.assign({}, process.env, { FORCE_COLOR: '1' });
  for (const name of PARENT_SESSION_VARS) {
    delete env[name];
  }
  const proc = pty.spawn(resolveClaude(), buildArgs(session), {
    name: 'xterm-256color',
    cols: cols || 120,
    rows: rows || 30,
    cwd: session.cwd,
    env
  });
  ptys.set(id, proc);
  if (session.pending) {
    delete session.pending;
    saveStore();
  }
  setStatus(id, 'idle');
  proc.onData((data) => toRenderer('pty:data', { id, data }));
  proc.onExit(() => {
    ptys.delete(id);
    setStatus(id, 'stopped');
    toRenderer('pty:exit', { id });
  });
}

function killPty(id) {
  const proc = ptys.get(id);
  if (proc) {
    proc.kill();
  }
}

async function readEdges(file) {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const chunk = 256 * 1024;
    const head = Buffer.alloc(Math.min(chunk, size));
    await handle.read(head, 0, head.length, 0);
    let tail = Buffer.alloc(0);
    if (size > chunk) {
      tail = Buffer.alloc(Math.min(chunk, size - chunk));
      await handle.read(tail, 0, tail.length, size - tail.length);
    }
    return head.toString('utf8') + '\n' + tail.toString('utf8');
  } finally {
    await handle.close();
  }
}

function lastMatch(text, regex) {
  let found = null;
  let match = regex.exec(text);
  while (match) {
    found = match[1];
    match = regex.exec(text);
  }
  return found;
}

async function listHistory() {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }
  const known = new Set(store.sessions.map((s) => s.id));
  const files = [];
  for (const dir of fs.readdirSync(PROJECTS_DIR)) {
    const full = path.join(PROJECTS_DIR, dir);
    if (!fs.statSync(full).isDirectory()) {
      continue;
    }
    for (const name of fs.readdirSync(full)) {
      const id = name.replace(/\.jsonl$/, '');
      if (name.endsWith('.jsonl') && !known.has(id)) {
        const file = path.join(full, name);
        files.push({ id, file, mtime: fs.statSync(file).mtimeMs });
      }
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  const recent = files.slice(0, 40);
  const result = [];
  for (const f of recent) {
    const text = await readEdges(f.file);
    const cwdRaw = lastMatch(text, /"cwd":"((?:[^"\\]|\\.)*)"/g);
    const title = lastMatch(text, /"(?:customTitle|aiTitle)":"((?:[^"\\]|\\.)*)"/g);
    if (!cwdRaw) {
      continue;
    }
    result.push({
      id: f.id,
      cwd: JSON.parse('"' + cwdRaw + '"'),
      title: title ? JSON.parse('"' + title + '"') : f.id.substring(0, 8),
      mtime: f.mtime
    });
  }
  return result;
}

function addSession(fields) {
  const session = Object.assign({ id: crypto.randomUUID(), createdAt: new Date().toISOString() }, fields);
  store.sessions.push(session);
  saveStore();
  return session;
}

function registerIpc() {
  ipcMain.handle('state:get', () => ({
    sessions: store.sessions,
    statuses: Object.fromEntries(store.sessions.map((s) => [s.id, statuses.get(s.id) || 'stopped']))
  }));
  ipcMain.handle('history:get', () => listHistory());
  ipcMain.handle('session:create', (e, { title, group, cwd }) => {
    if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
      throw new Error('Folder not found: ' + cwd);
    }
    return addSession({ title, group, cwd, parentId: null, pending: 'new' });
  });
  ipcMain.handle('session:fork', (e, parentId) => {
    const parent = findSession(parentId);
    return addSession({
      title: 'Fork of ' + parent.title,
      group: parent.group,
      cwd: parent.cwd,
      parentId,
      pending: 'fork'
    });
  });
  ipcMain.handle('session:import', (e, { id, title, cwd }) =>
    addSession({ id, title, cwd, group: 'Imported', parentId: null }));
  ipcMain.handle('session:update', (e, { id, title, group }) => {
    const session = findSession(id);
    session.title = title;
    session.group = group;
    saveStore();
    return session;
  });
  ipcMain.handle('session:remove', (e, id) => {
    killPty(id);
    for (const s of store.sessions) {
      if (s.parentId === id) {
        s.parentId = findSession(id).parentId;
      }
    }
    store.sessions = store.sessions.filter((s) => s.id !== id);
    saveStore();
    changes.remove(id);
  });
  ipcMain.handle('changes:list', (e, id) => changes.list(id, findSession(id).cwd));
  ipcMain.handle('changes:diff', (e, { id, file }) => changes.diffFile(id, findSession(id).cwd, file));
  ipcMain.handle('changes:open', (e, file) => shell.openPath(file));
  ipcMain.handle('pty:open', (e, { id, cols, rows }) => openPty(id, cols, rows));
  ipcMain.handle('pty:kill', (e, id) => killPty(id));
  ipcMain.on('pty:write', (e, { id, data }) => {
    const proc = ptys.get(id);
    if (proc) {
      proc.write(data);
    }
  });
  ipcMain.on('pty:resize', (e, { id, cols, rows }) => {
    const proc = ptys.get(id);
    if (proc) {
      proc.resize(cols, rows);
    }
  });
  ipcMain.on('theme:titlebar', (e, { color, symbolColor }) => {
    if (!IS_MAC) {
      win.setTitleBarOverlay({ color, symbolColor, height: 40 });
    }
    win.setBackgroundColor(color);
  });
  ipcMain.on('session:active', (e, id) => { activeId = id; });
  ipcMain.on('link:open', (e, url) => openExternalLink(url));
  ipcMain.handle('clipboard:paste', () => readClipboardForPaste());
  ipcMain.handle('dialog:pickDir', async () => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });
}

// Windows shows this id as the notification source; it must match build.appId.
app.setAppUserModelId('io.github.lvyyln.bettercli');

// `npm start` gets its own data folder so development never touches the installed app's sessions or hooks.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('appData'), 'BetterCLI for Claude (dev)'));
}

// A second copy would rewrite the shared hooks.json with its own port and cut every running session off from status updates.
const isFirstInstance = app.requestSingleInstanceLock();
if (!isFirstInstance) {
  app.quit();
}
app.on('second-instance', () => {
  if (windowAlive()) {
    if (win.isMinimized()) {
      win.restore();
    }
    win.show();
    win.focus();
  }
});

app.whenReady().then(async () => {
  if (!isFirstInstance) {
    return;
  }
  loadShellPath();
  loadStore();
  changes.init(app.getPath('userData'));
  await startHookServer();
  writeHooksSettings();
  registerIpc();
  // macOS draws its traffic lights inside the bar; Windows and Linux draw caption buttons via the overlay.
  const frame = IS_MAC
    ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 13 } }
    : { titleBarStyle: 'hidden', titleBarOverlay: { color: '#161A20', symbolColor: '#E6E8EB', height: 40 } };
  win = new BrowserWindow(Object.assign({
    width: 1440,
    height: 900,
    backgroundColor: '#0F1115',
    title: 'BetterCLI for Claude',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  }, frame));
  win.on('focus', () => win.flashFrame(false));
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
});

app.on('window-all-closed', () => {
  for (const proc of ptys.values()) {
    proc.kill();
  }
  app.quit();
});
