// Orchestrations: an orchestrator session that runs worker sessions through the tools in orchestrator-mcp.js.
// Workers are ordinary sessions (own pty, own tile in the orchestration view) with kind 'worker'.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const TOKEN = crypto.randomBytes(24).toString('hex');
const WAIT_DEFAULT = 300;
const WAIT_MAX = 1800;
const REPLY_MAX = 6000;
const PERMISSION_MODES = ['manual', 'acceptEdits', 'auto', 'bypassPermissions'];

let app = null;
let configDir = null;
// Worker id -> false from when it is given work until that turn starts, so an agent that has not
// picked up its task yet does not count as finished. Unknown ids (e.g. after a restart) count as started.
const turnStarted = new Map();
const waiters = new Set();
// Agent id -> key of the reply it had when it was last given work; a reply with this key is not new yet.
const staleReply = new Map();

// ctx: { store, findSession, addSession, saveStore, openPty, killPty, isRunning, statusOf, toRenderer, findJsonl, hookPort, userData, log }
function init(ctx) {
  app = ctx;
  configDir = path.join(ctx.userData, 'orchestrations');
  fs.mkdirSync(configDir, { recursive: true });
}

function mcpScriptPath() {
  // Claude starts the script with the app's executable in Node mode, which reads it from disk outside the asar archive.
  return path.join(__dirname, 'orchestrator-mcp.js').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function writeMcpConfig(session) {
  const file = path.join(configDir, session.id + '.mcp.json');
  const config = {
    mcpServers: {
      bettercli: {
        type: 'stdio',
        command: process.execPath,
        args: [mcpScriptPath()],
        env: {
          ELECTRON_RUN_AS_NODE: '1',
          BETTERCLI_PORT: String(app.hookPort()),
          BETTERCLI_TOKEN: TOKEN,
          BETTERCLI_ORCH_ID: session.id
        }
      }
    }
  };
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

function orchestratorPrompt(session) {
  const o = session.orch;
  const isolation = o.isolation === 'worktree'
    ? 'Each agent works in its own git worktree on its own branch; spawn_agent returns the path and branch. ' +
      'Tell agents to commit their work on their branch before they finish. When they are done, review their ' +
      'branches and merge them into the current branch yourself, resolving conflicts.'
    : `All agents work in the same folder as you (${session.cwd}). Give each agent its own files or areas ` +
      'so they never edit the same file at the same time.';
  return [
    'You are the orchestrator of a BetterCLI agent orchestration.',
    `You coordinate worker agents with the bettercli MCP tools (spawn_agent, list_agents, wait_for_agents, ` +
      `read_agent_output, send_to_agent, stop_agent). At most ${o.maxAgents} agents can run at the same time.`,
    'The user watches every agent live in a grid next to you and can type into any of them.',
    'How to work:',
    '1. Make sure you understand the goal; ask the user if it is unclear. Split it into tasks that can run in ' +
      'parallel. Use as many agents as the work needs, up to the limit. For a small job, one agent or none is fine.',
    '2. Workers start with no knowledge of this conversation. Give each a complete, self-contained task: the ' +
      'context, exactly what it owns, constraints, and what to report when done.',
    '3. ' + isolation,
    '4. After spawning, call wait_for_agents, then read their replies. An agent with status "waiting" needs the ' +
      'user (usually a permission prompt): tell the user which agent needs them. Use send_to_agent to follow up.',
    '5. Check the combined result (build or tests where possible), then give the user a short summary of what ' +
      'each agent did. Stop agents you no longer need.'
  ].join('\n');
}

function workerPrompt(session) {
  const lines = [
    `You are the worker agent "${session.title}" in a BetterCLI orchestration.`,
    'An orchestrator agent gave you your task in your first message and will read your final reply.',
    'Work only on that task and stay within the scope it gives you.'
  ];
  if (session.worktree) {
    lines.push(`You work in your own git worktree on branch ${session.worktree.branch}. ` +
      'Commit your changes on that branch before you finish.');
  }
  lines.push('When you are done, end with a short summary: what you changed (files), how you checked it, ' +
    'and anything left open.');
  return lines.join('\n');
}

// Extra command-line flags for orchestrators and workers, and the first prompt for a new one.
function extraArgs(session) {
  if (session.kind === 'orchestrator') {
    const flags = ['--mcp-config', writeMcpConfig(session), '--append-system-prompt', orchestratorPrompt(session)];
    // Off unless the user ticked it for this orchestration; otherwise Claude asks before each agent tool call.
    if (session.orch.autoApproveTools) {
      flags.push('--allowedTools', 'mcp__bettercli');
    }
    return { flags, prompt: session.orch.goal || null };
  }
  if (session.kind === 'worker') {
    return {
      flags: ['--permission-mode', session.permissionMode || 'manual', '--append-system-prompt', workerPrompt(session)],
      prompt: session.task || null
    };
  }
  return { flags: [], prompt: null };
}

function workersOf(orchId) {
  return app.store().sessions.filter((s) => s.kind === 'worker' && s.orchestratorId === orchId);
}

function agentInfo(s) {
  const info = { agentId: s.id, label: s.title, status: app.statusOf(s.id), cwd: s.cwd };
  if (s.worktree) {
    info.branch = s.worktree.branch;
  }
  return info;
}

function slugify(text) {
  return (text || 'agent').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'agent';
}

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd].concat(args), { encoding: 'utf8', windowsHide: true, timeout: 30000 }).trim();
}

// Creates <repo>/.bettercli/worktrees/<name> on a new branch, and keeps that folder out of git status.
function createWorktree(cwd, label) {
  const root = path.resolve(git(cwd, ['rev-parse', '--show-toplevel']));
  const name = slugify(label) + '-' + crypto.randomBytes(3).toString('hex');
  const dir = path.join(root, '.bettercli', 'worktrees', name);
  const branch = 'bettercli/' + name;
  git(root, ['worktree', 'add', '-b', branch, dir]);
  const exclude = path.join(path.resolve(root, git(root, ['rev-parse', '--git-common-dir'])), 'info', 'exclude');
  const current = fs.existsSync(exclude) ? fs.readFileSync(exclude, 'utf8') : '';
  if (!current.split(/\r?\n/).includes('.bettercli/')) {
    fs.mkdirSync(path.dirname(exclude), { recursive: true });
    fs.appendFileSync(exclude, (current && !current.endsWith('\n') ? '\n' : '') + '.bettercli/\n');
  }
  return { path: path.join(dir, path.relative(root, path.resolve(cwd))), branch };
}

function spawnAgent(orch, args) {
  const label = String(args.label || '').trim() || 'Agent';
  const task = String(args.task || '').trim();
  if (!task) {
    throw new Error('task is required');
  }
  const running = workersOf(orch.id).filter((s) => app.isRunning(s.id)).length;
  if (running >= orch.orch.maxAgents) {
    throw new Error(`Limit reached: ${running} of ${orch.orch.maxAgents} agents are running. ` +
      'Wait for one to finish and stop it, or reuse one with send_to_agent.');
  }
  let cwd = orch.cwd;
  let worktree = null;
  let note = null;
  if (orch.orch.isolation === 'worktree') {
    try {
      worktree = createWorktree(orch.cwd, label);
      cwd = worktree.path;
    } catch (e) {
      app.log.warn('worktree failed, using the shared folder', e.message);
      note = 'Could not create a git worktree (' + e.message.split('\n')[0] + '); this agent works in the shared folder.';
    }
  }
  const session = app.addSession({
    title: label,
    group: orch.group,
    cwd,
    parentId: orch.id,
    orchestratorId: orch.id,
    kind: 'worker',
    task,
    permissionMode: orch.orch.permissionMode,
    worktree,
    pending: 'new'
  });
  // Sent before the pty starts so the page has a terminal ready for the first output.
  app.toRenderer('session:added', session);
  turnStarted.set(session.id, false);
  const result = app.openPty(session.id, 100, 30);
  if (result && result.error) {
    throw new Error(result.error);
  }
  const info = agentInfo(session);
  if (note) {
    info.note = note;
  }
  return info;
}

// The last assistant message with text in the agent's transcript, as { key, text }.
function lastReplyEntry(id) {
  const file = app.findJsonl(id);
  if (!file) {
    return null;
  }
  const size = fs.statSync(file).size;
  const chunk = Math.min(size, 1024 * 1024);
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.alloc(chunk);
  try {
    fs.readSync(fd, buffer, 0, chunk, size - chunk);
  } finally {
    fs.closeSync(fd);
  }
  const lines = buffer.toString('utf8').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].includes('"assistant"')) {
      continue;
    }
    try {
      const entry = JSON.parse(lines[i]);
      const content = entry.type === 'assistant' && entry.message && entry.message.content;
      const text = Array.isArray(content)
        ? content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim()
        : '';
      if (text) {
        return { key: entry.uuid || lines[i], text: text.length > REPLY_MAX ? '…' + text.slice(-REPLY_MAX) : text };
      }
    } catch (e) {
      // the first line of the chunk may be cut off
    }
  }
  return null;
}

function lastReply(id) {
  const entry = lastReplyEntry(id);
  return entry ? entry.text : null;
}

function finished(id) {
  const status = app.statusOf(id);
  return status === 'stopped' || status === 'waiting' || (status === 'idle' && turnStarted.get(id) !== false);
}

// Claude can signal the end of a turn just before it writes the reply to the transcript,
// so an idle agent whose reply is missing or still the old one is given a moment for the new one.
async function report(ids) {
  const deadline = Date.now() + 5000;
  for (;;) {
    let waiting = false;
    const agents = ids.map((id) => {
      const entry = lastReplyEntry(id);
      const fresh = Boolean(entry) && entry.key !== staleReply.get(id);
      const info = agentInfo(app.findSession(id));
      if (info.status === 'idle' && !fresh) {
        waiting = true;
      }
      return Object.assign(info, { lastReply: entry ? entry.text : null });
    });
    if (!waiting || Date.now() > deadline) {
      for (const id of ids) {
        staleReply.delete(id);
      }
      return agents;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function waitForAgents(orch, args) {
  const mine = workersOf(orch.id);
  let ids = Array.isArray(args.agentIds) && args.agentIds.length
    ? args.agentIds.filter((id) => mine.some((s) => s.id === id))
    : mine.filter((s) => app.isRunning(s.id)).map((s) => s.id);
  if (!ids.length) {
    return Promise.resolve({ agents: [], note: 'No running agents to wait for.' });
  }
  const seconds = Math.min(WAIT_MAX, Math.max(1, Number(args.timeoutSeconds) || WAIT_DEFAULT));
  return new Promise((resolve) => {
    const waiter = { ids, done: null, timer: null };
    waiter.done = async (timedOut) => {
      waiters.delete(waiter);
      clearTimeout(waiter.timer);
      const result = { agents: await report(ids) };
      if (timedOut) {
        result.note = `Timed out after ${seconds}s; agents that are still busy keep working. Call wait_for_agents again.`;
      }
      resolve(result);
    };
    waiter.timer = setTimeout(() => waiter.done(true), seconds * 1000);
    waiters.add(waiter);
    checkWaiters();
  });
}

function checkWaiters() {
  for (const waiter of Array.from(waiters)) {
    if (waiter.ids.every(finished)) {
      waiter.done(false);
    }
  }
}

function sendToAgent(orch, args) {
  const agent = workersOf(orch.id).find((s) => s.id === args.agentId);
  if (!agent) {
    throw new Error('No agent with id ' + args.agentId + ' in this orchestration.');
  }
  if (!app.isRunning(agent.id)) {
    throw new Error('Agent "' + agent.title + '" is stopped. Ask the user to resume it from its tile.');
  }
  turnStarted.set(agent.id, false);
  const before = lastReplyEntry(agent.id);
  if (before) {
    staleReply.set(agent.id, before.key);
  }
  // Bracketed paste keeps a multi-line message together; Enter then submits it.
  app.writePty(agent.id, '\x1b[200~' + String(args.message || '') + '\x1b[201~');
  setTimeout(() => app.writePty(agent.id, '\r'), 150);
  return { sent: true, agent: agentInfo(agent) };
}

function stopAgent(orch, args) {
  const agent = workersOf(orch.id).find((s) => s.id === args.agentId);
  if (!agent) {
    throw new Error('No agent with id ' + args.agentId + ' in this orchestration.');
  }
  app.killPty(agent.id);
  return { stopped: true, agentId: agent.id };
}

// Handles a tool call forwarded by orchestrator-mcp.js. Returns { result } or { error }.
async function handleRequest(payload) {
  if (!payload || payload.token !== TOKEN) {
    return { error: 'Not authorized' };
  }
  const orch = app.findSession(payload.orchestratorId);
  if (!orch || orch.kind !== 'orchestrator') {
    return { error: 'This orchestration no longer exists in BetterCLI.' };
  }
  const args = payload.args || {};
  try {
    switch (payload.tool) {
      case 'spawn_agent': return { result: spawnAgent(orch, args) };
      case 'list_agents': return { result: { maxAgents: orch.orch.maxAgents, agents: workersOf(orch.id).map(agentInfo) } };
      case 'wait_for_agents': return { result: await waitForAgents(orch, args) };
      case 'read_agent_output': {
        const agent = workersOf(orch.id).find((s) => s.id === args.agentId);
        if (!agent) {
          throw new Error('No agent with id ' + args.agentId + ' in this orchestration.');
        }
        return { result: Object.assign(agentInfo(agent), { lastReply: lastReply(agent.id) }) };
      }
      case 'send_to_agent': return { result: sendToAgent(orch, args) };
      case 'stop_agent': return { result: stopAgent(orch, args) };
      default: return { error: 'Unknown tool ' + payload.tool };
    }
  } catch (e) {
    return { error: e.message };
  }
}

function onStatus(id, status) {
  if (status === 'busy') {
    turnStarted.set(id, true);
  }
  if (waiters.size) {
    checkWaiters();
  }
}

function normalizeOptions(fields) {
  const maxAgents = Math.min(10, Math.max(1, Math.round(Number(fields.maxAgents) || 5)));
  return {
    goal: String(fields.goal || '').trim(),
    maxAgents,
    isolation: fields.isolation === 'worktree' ? 'worktree' : 'shared',
    permissionMode: PERMISSION_MODES.includes(fields.permissionMode) ? fields.permissionMode : 'manual',
    autoApproveTools: fields.autoApproveTools === true
  };
}

module.exports = { init, extraArgs, handleRequest, onStatus, workersOf, normalizeOptions };
