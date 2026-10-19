// Orchestrations: an orchestrator session that runs worker sessions through the tools in orchestrator-mcp.js.
// Workers are ordinary sessions (own pty, own tile in the orchestration view) with kind 'worker'.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

const TOKEN = crypto.randomBytes(24).toString('hex');
// Claude Code moves an MCP call that runs past 120 s to the background, where its result may never reach the
// orchestrator, so a wait always returns before that. Finish notices cover longer work.
const WAIT_DEFAULT = 100;
const WAIT_MAX = 100;
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
  recoverPlans();
  ctx.saveStore();
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
    'Usually the user starts work from the Plan box beside you: a planner splits their goal into tasks, the user ' +
      'reviews them, BetterCLI starts one agent per task, and when all agents are done you receive every ' +
      'result in one message. Then review and integrate the results and give the user a combined summary.',
    'You can also start agents yourself with the tools, for follow-ups or when the user asks you directly. In that case:',
    '1. Make sure you understand the goal; ask the user if it is unclear. Split it into tasks that can run in ' +
      'parallel. Use as many agents as the work needs, up to the limit. For a small job, one agent or none is fine.',
    '2. Workers start with no knowledge of this conversation. Give each a complete, self-contained task: the ' +
      'context, exactly what it owns, constraints, and what to report when done.',
    '3. ' + isolation,
    '4. After spawning, end your turn with a short note on what is running. Whenever an agent finishes a turn, ' +
      'BetterCLI sends you a message starting with "[BetterCLI]" with its reply, also when the user talked to ' +
      'the agent directly. wait_for_agents returns within 100 seconds; use it only for short tasks. An agent ' +
      'with status "waiting" needs the user (usually a permission prompt): tell the user which agent needs them. ' +
      'Use send_to_agent to follow up.',
    '5. As soon as an agent has no more work from you, call stop_agent for it: that closes it and removes it ' +
      'from the sidebar, so finished agents do not pile up. Its conversation is kept.',
    '6. When all the work is in, check the combined result (build or tests where possible), then give the user ' +
      'a short summary of what each agent did.'
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
    // The goal from the form goes to the planner, not to the orchestrator.
    return { flags, prompt: null };
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

// `reuse` ({ cwd, worktree, fields }) continues in an existing folder or worktree instead of making a new one.
function spawnAgent(orch, args, reuse) {
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
  let cwd = reuse ? reuse.cwd : orch.cwd;
  let worktree = reuse ? reuse.worktree || null : null;
  let note = null;
  if (!reuse && orch.orch.isolation === 'worktree') {
    try {
      worktree = createWorktree(orch.cwd, label);
      cwd = worktree.path;
    } catch (e) {
      app.log.warn('worktree failed, using the shared folder', e.message);
      note = 'Could not create a git worktree (' + e.message.split('\n')[0] + '); this agent works in the shared folder.';
    }
  }
  const session = app.addSession(Object.assign({
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
  }, reuse && reuse.fields));
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
      // An agent closed with stop_agent while this wait was open is no longer on the desk.
      const session = app.findSession(id);
      const info = session ? agentInfo(session) : { agentId: id, status: 'removed' };
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
      // This result already carries their replies, so a separate finish notice would repeat them.
      dropNotices(orch.id, ids.filter(finished));
      const result = { agents: await report(ids) };
      if (timedOut) {
        result.note = `Returned after ${seconds}s; agents that are still busy keep working. Do not keep calling ` +
          'wait_for_agents for long work: end your turn, and BetterCLI will message you as each agent finishes.';
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

// Finished agents are closed and taken off the sidebar so they do not pile up; keep: true only stops the process.
function stopAgent(orch, args) {
  const agent = workersOf(orch.id).find((s) => s.id === args.agentId);
  if (!agent) {
    throw new Error('No agent with id ' + args.agentId + ' in this orchestration.');
  }
  dropNotices(orch.id, [agent.id]);
  if (args.keep === true) {
    app.killPty(agent.id);
    return { stopped: true, removed: false, agentId: agent.id };
  }
  app.removeSessions([agent.id]);
  return { stopped: true, removed: true, agentId: agent.id };
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
  const previous = lastStatus.get(id);
  lastStatus.set(id, status);
  if (status === 'busy') {
    turnStarted.set(id, true);
  }
  const session = app.findSession(id);
  if (session && session.kind === 'worker') {
    if (status === 'busy' && previous !== 'busy') {
      const entry = lastReplyEntry(id);
      replyKeyAtStart.set(id, entry ? entry.key : null);
    } else if (status === 'idle' && previous === 'busy') {
      queueNotice(session);
    }
  } else if (session && session.kind === 'orchestrator') {
    // A fresh pty starts as idle before Claude is at its prompt (it may show the folder-trust or resume
    // dialog, where a typed Enter picks an option), so only an idle reported by a hook counts.
    if (status === 'idle' && (previous === 'busy' || previous === 'waiting')) {
      atPrompt.add(id);
      flushNotices(id);
    } else if (status === 'stopped') {
      atPrompt.delete(id);
    }
  }
  if (waiters.size) {
    checkWaiters();
  }
  checkRuns();
}

// ---- Finish notices: tell the orchestrator when an agent finishes a turn it is not already waiting for ----

const lastStatus = new Map();
// Agent id -> key of its last reply when its current turn started, to tell the new reply from the old one.
const replyKeyAtStart = new Map();
const notices = new Map();
const noticeTimers = new Map();
const lastUserInput = new Map();
// Orchestrators that have finished a turn since their pty started, so they are known to be at the prompt.
const atPrompt = new Set();
// Orchestrator id -> other notices (e.g. a changed agent limit), delivered with the next flush.
const notes = new Map();
const NOTICE_BATCH_MS = 3000;
const TYPING_QUIET_MS = 20000;
const NOTICE_REPLY_MAX = 1500;

function onUserInput(id) {
  lastUserInput.set(id, Date.now());
}

function queueNotice(agent) {
  const orch = app.findSession(agent.orchestratorId);
  if (!orch || orch.kind !== 'orchestrator' || agent.retired) {
    return;
  }
  // A running plan reports all its agents together in the wrap-up.
  const plan = orch.orch.plan;
  if (plan && plan.phase === 'running' && (plan.agentIds || []).includes(agent.id)) {
    return;
  }
  // Queued even while a wait_for_agents covers this agent: notices go out only once the orchestrator is idle,
  // and a wait that returns first drops them (dropNotices).
  const list = notices.get(orch.id) || [];
  if (!list.includes(agent.id)) {
    list.push(agent.id);
  }
  notices.set(orch.id, list);
  scheduleFlush(orch.id, NOTICE_BATCH_MS);
}

function dropNotices(orchId, ids) {
  const list = (notices.get(orchId) || []).filter((id) => !ids.includes(id));
  if (list.length) {
    notices.set(orchId, list);
  } else {
    notices.delete(orchId);
  }
}

function scheduleFlush(orchId, delay) {
  clearTimeout(noticeTimers.get(orchId));
  noticeTimers.set(orchId, setTimeout(() => flushNotices(orchId), delay));
}

async function freshReply(id) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const entry = lastReplyEntry(id);
    if ((entry && entry.key !== replyKeyAtStart.get(id)) || Date.now() > deadline) {
      return entry ? entry.text : null;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

// Delivered only while the orchestrator is idle: typing during a permission prompt could answer it,
// and typing while the user is writing would mix into their message.
async function flushNotices(orchId) {
  const ids = notices.get(orchId) || [];
  const pendingNotes = notes.get(orchId) || [];
  if ((!ids.length && !pendingNotes.length) || !app.isRunning(orchId) || app.statusOf(orchId) !== 'idle' ||
    !atPrompt.has(orchId)) {
    return;
  }
  const sinceTyping = Date.now() - (lastUserInput.get(orchId) || 0);
  if (sinceTyping < TYPING_QUIET_MS) {
    scheduleFlush(orchId, TYPING_QUIET_MS - sinceTyping + 500);
    return;
  }
  notices.delete(orchId);
  notes.delete(orchId);
  const sections = [];
  for (const id of ids) {
    const agent = app.findSession(id);
    if (!agent) {
      continue;
    }
    let reply = await freshReply(id);
    if (reply && reply.length > NOTICE_REPLY_MAX) {
      reply = reply.slice(0, NOTICE_REPLY_MAX) + ' […]';
    }
    sections.push(`## ${agent.title} (agentId ${agent.id})\n${reply || '(no reply)'}`);
  }
  if ((!sections.length && !pendingNotes.length) || app.statusOf(orchId) !== 'idle') {
    return;
  }
  const lines = pendingNotes.map((note) => `[BetterCLI] ${note}`);
  if (!sections.length) {
    sendNotice(orchId, lines.concat('Answer with one short line.').join('\n'));
    return;
  }
  if (lines.length) {
    lines.push('');
  }
  const message = lines.concat([
    sections.length === 1 ? '[BetterCLI] An agent finished its turn:' : `[BetterCLI] ${sections.length} agents finished their turns:`,
    '',
    sections.join('\n\n'),
    '',
    'Use read_agent_output for a full reply. Act on it if needed. Then, for each agent above that has no more ' +
      'work from you, call stop_agent: it closes the agent and removes it from the sidebar (its conversation is ' +
      'kept). Keep an agent only if you are about to send it follow-up work. Answer the user in one short line.'
  ]).join('\n');
  sendNotice(orchId, message);
}

function sendNotice(orchId, message) {
  app.writePty(orchId, '\x1b[200~' + message + '\x1b[201~');
  setTimeout(() => app.writePty(orchId, '\r'), 300);
}

function queueNote(orchId, note) {
  notes.set(orchId, (notes.get(orchId) || []).concat(note));
  scheduleFlush(orchId, NOTICE_BATCH_MS);
}

// The limit only gates new agents; agents already running above a lowered limit keep running.
function setMaxAgents(orchId, value) {
  const orch = app.findSession(orchId);
  if (!orch || orch.kind !== 'orchestrator') {
    throw new Error('Not an orchestration');
  }
  const maxAgents = clampMax(value);
  if (maxAgents === orch.orch.maxAgents) {
    return orch;
  }
  orch.orch.maxAgents = maxAgents;
  app.saveStore();
  // A restarted orchestrator reads the new limit from its system prompt; a running one has to be told.
  if (app.isRunning(orchId)) {
    queueNote(orchId, `The user changed the agent limit: at most ${maxAgents} agents can now run at the same time.`);
  }
  return orch;
}

// ---- Plan pipeline: goal -> planner (read-only, headless) -> user reviews tasks -> agents -> wrap-up ----

const planners = new Map();
const LOG_MAX = 40;
const WRAP_REPLY_MAX = 3000;

function planSchema(max) {
  return {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        minItems: 1,
        maxItems: max,
        items: {
          type: 'object',
          properties: {
            label: { type: 'string', description: 'Two to four words naming the task.' },
            prompt: { type: 'string', description: 'Complete, self-contained instructions for the agent.' }
          },
          required: ['label', 'prompt']
        }
      }
    },
    required: ['tasks']
  };
}

function plannerPrompt(orch, goal) {
  const o = orch.orch;
  const where = o.isolation === 'worktree'
    ? 'Each agent works in its own git worktree on its own branch; the branches are merged afterwards.'
    : 'All agents work in the same folder at the same time, so no two tasks may edit the same file.';
  return [
    `Plan work for a team of at most ${o.maxAgents} Claude Code agents that run in parallel in ${orch.cwd}.`,
    where,
    'Look at the project as much as you need (you can only read). Then split the goal below into independent ' +
      `tasks, between 1 and ${o.maxAgents}. Use fewer tasks when the goal is small; do not split work that has ` +
      'to happen in order.',
    'Each agent starts with no other context, so every task prompt must be self-contained: the relevant ' +
      'background, exactly which files or areas it owns, constraints, how to check its work, and what to report.',
    '',
    'Goal:',
    goal
  ].join('\n');
}

function setPlan(orch, plan) {
  orch.orch.plan = plan;
  app.saveStore();
  app.toRenderer('orch:plan', { id: orch.id, plan });
}

function getOrch(id) {
  const orch = app.findSession(id);
  if (!orch || orch.kind !== 'orchestrator') {
    throw new Error('Orchestration not found');
  }
  return orch;
}

function describeToolUse(item) {
  const input = item.input || {};
  const target = input.file_path || input.pattern || input.path || '';
  if (item.name === 'StructuredOutput') {
    return 'Writing the plan';
  }
  return item.name + (target ? ' ' + String(target).replace(/\\/g, '/').split('/').slice(-3).join('/') : '');
}

function startPlan(id, goal) {
  const orch = getOrch(id);
  goal = String(goal || '').trim();
  if (!goal) {
    throw new Error('Type a goal first');
  }
  const phase = (orch.orch.plan || {}).phase;
  if (phase === 'planning' || phase === 'running') {
    throw new Error('This orchestration is already ' + phase);
  }
  const plan = { phase: 'planning', goal, log: [], tasks: [] };
  setPlan(orch, plan);

  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
    '--tools', 'Read,Grep,Glob', '--json-schema', JSON.stringify(planSchema(orch.orch.maxAgents)),
    '--', plannerPrompt(orch, goal)];
  const file = app.resolveClaude();
  // npm installs a claude.cmd shim, which Windows can only start through the shell.
  const viaShell = /\.cmd$/i.test(file);
  const child = spawn(viaShell ? `"${file}"` : file, viaShell ? args.map((a) => '"' + a.replace(/"/g, '\\"') + '"') : args, {
    cwd: orch.cwd,
    env: app.claudeEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: viaShell
  });
  planners.set(id, child);
  let buffer = '';
  let stderr = '';
  let result = null;
  const log = (line) => {
    plan.log.push(line);
    if (plan.log.length > LOG_MAX) {
      plan.log.shift();
    }
    app.toRenderer('orch:plan', { id, plan });
  };
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) {
        continue;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch (e) {
        continue;
      }
      if (event.type === 'assistant' && event.message && Array.isArray(event.message.content)) {
        for (const item of event.message.content) {
          if (item.type === 'tool_use') {
            log(describeToolUse(item));
          } else if (item.type === 'text' && item.text.trim()) {
            log(item.text.trim().split('\n')[0].slice(0, 200));
          }
        }
      } else if (event.type === 'result') {
        result = event;
      }
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
  child.on('error', (e) => { stderr += e.message; });
  child.on('close', (code) => {
    if (planners.get(id) !== child) {
      return;
    }
    planners.delete(id);
    if (plan.phase !== 'planning') {
      return;
    }
    const tasks = result && result.structured_output && result.structured_output.tasks;
    if (Array.isArray(tasks) && tasks.length) {
      setPlan(orch, { phase: 'review', goal, log: plan.log, tasks });
      return;
    }
    const reason = (result && result.result) || stderr.trim().split('\n').pop() || 'planner exited with code ' + code;
    app.log.warn('planner failed', code, reason);
    setPlan(orch, { phase: 'error', goal, log: plan.log, tasks: [], error: 'Planning failed: ' + reason });
  });
  return plan;
}

function cancelPlan(id) {
  const orch = getOrch(id);
  const child = planners.get(id);
  planners.delete(id);
  if (child) {
    child.kill();
  }
  setPlan(orch, { phase: 'idle', goal: (orch.orch.plan || {}).goal || '', log: [], tasks: [] });
}

function discardPlan(id) {
  const orch = getOrch(id);
  setPlan(orch, { phase: 'idle', goal: (orch.orch.plan || {}).goal || '', log: [], tasks: [] });
}

function runPlan(id, tasks) {
  const orch = getOrch(id);
  const plan = orch.orch.plan || {};
  if (plan.phase !== 'review') {
    throw new Error('There is no plan waiting to run');
  }
  const clean = (Array.isArray(tasks) ? tasks : [])
    .map((t) => ({ label: String(t.label || '').trim(), prompt: String(t.prompt || '').trim() }))
    .filter((t) => t.prompt);
  if (!clean.length) {
    throw new Error('The plan has no tasks');
  }
  const running = workersOf(id).filter((s) => app.isRunning(s.id)).length;
  const free = orch.orch.maxAgents - running;
  if (clean.length > free) {
    throw new Error(`Only ${free} of ${orch.orch.maxAgents} agent slots are free. Remove tasks or stop running agents first.`);
  }
  const agentIds = [];
  try {
    for (const task of clean) {
      agentIds.push(spawnAgent(orch, { label: task.label || 'Agent', task: task.prompt }).agentId);
    }
  } finally {
    setPlan(orch, { phase: 'running', goal: plan.goal, log: [], tasks: clean, agentIds });
  }
  return orch.orch.plan;
}

// A run is complete when every agent has finished a turn or stopped; one waiting for the user is not.
function checkRuns() {
  for (const s of app.store().sessions) {
    const plan = s.kind === 'orchestrator' && s.orch.plan;
    if (!plan || plan.phase !== 'running' || plan.wrapping) {
      continue;
    }
    const done = plan.agentIds.every((id) => {
      const status = app.statusOf(id);
      return status === 'stopped' || (status === 'idle' && turnStarted.get(id) !== false);
    });
    if (done) {
      plan.wrapping = true;
      wrapUp(s, plan).catch((e) => app.log.error('wrap-up failed', e));
    }
  }
}

async function wrapUp(orch, plan) {
  const agents = await report(plan.agentIds.filter((id) => app.findSession(id)));
  const worktrees = agents.filter((a) => a.branch);
  const sections = agents.map((a) => {
    const reply = a.lastReply ? (a.lastReply.length > WRAP_REPLY_MAX ? '…' + a.lastReply.slice(-WRAP_REPLY_MAX) : a.lastReply) : '(no reply)';
    return `## ${a.label} (${a.status}${a.branch ? ', branch ' + a.branch : ''})\n${reply}`;
  });
  const message = [
    `All ${agents.length} agents have finished the plan for this goal:`,
    plan.goal,
    '',
    'Their results:',
    '',
    sections.join('\n\n'),
    '',
    worktrees.length
      ? 'Review the results, merge the agents\' branches into the current branch (resolve conflicts and run checks), ' +
        'then give me a combined summary: what was done, and anything that failed or is still open.'
      : 'Review the results and check that the pieces fit together, then give me a combined summary: what was ' +
        'done, and anything that failed or is still open.'
  ].join('\n');
  const sent = app.isRunning(orch.id);
  if (sent) {
    const closing = '\n\nThese agents have now been closed and removed from the sidebar; their conversations are ' +
      'kept. For follow-up work, start new agents with spawn_agent.';
    app.writePty(orch.id, '\x1b[200~' + message + closing + '\x1b[201~');
    setTimeout(() => app.writePty(orch.id, '\r'), 300);
    // Their results are with the orchestrator now, so the agents themselves are no longer needed.
    dropNotices(orch.id, plan.agentIds);
    app.removeSessions(plan.agentIds);
  } else {
    // Nobody received the results, so the agents stay in the sidebar where the user can read them.
    for (const id of plan.agentIds) {
      app.killPty(id);
    }
  }
  setPlan(orch, { phase: 'done', goal: plan.goal, log: [], tasks: plan.tasks, agentIds: plan.agentIds, summarySent: sent });
}

// ---- Summarize & restart: after the prompt cache has expired, resuming a long conversation re-reads all of it
// at full price. Instead, condense each transcript locally, have Haiku write a handoff, and start a fresh agent
// from that handoff. ----

const SUMMARY_MODEL = 'haiku';
const CONDENSED_MAX = 120000;
const CONDENSED_HEAD = 20000;
const TEXT_MAX = 2000;
const SUMMARY_PARALLEL = 3;

function stripReminders(text) {
  return String(text || '').replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
}

function clip(text, max) {
  return text.length > max ? text.slice(0, max) + ' […]' : text;
}

function toolLine(item) {
  const input = item.input || {};
  const target = input.file_path || input.notebook_path || input.command || input.pattern || input.path ||
    input.url || input.description || '';
  return `  [${item.name}] ${clip(String(target).replace(/\s+/g, ' '), 160)}`;
}

// Keeps what was said and which tools were used; drops tool results and file contents, which are most of a transcript.
function condenseTranscript(id) {
  const file = app.findJsonl(id);
  if (!file) {
    return '';
  }
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) {
      continue;
    }
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      continue;
    }
    if (entry.isMeta || !entry.message) {
      continue;
    }
    const content = entry.message.content;
    if (entry.type === 'user') {
      const texts = typeof content === 'string'
        ? [content]
        : (Array.isArray(content) ? content.filter((c) => c.type === 'text').map((c) => c.text) : []);
      for (const text of texts.map(stripReminders).filter(Boolean)) {
        out.push('USER: ' + clip(text, TEXT_MAX));
      }
    } else if (entry.type === 'assistant' && Array.isArray(content)) {
      for (const item of content) {
        if (item.type === 'text' && item.text.trim()) {
          out.push('AGENT: ' + clip(item.text.trim(), TEXT_MAX));
        } else if (item.type === 'tool_use') {
          out.push(toolLine(item));
        }
      }
    }
  }
  const text = out.join('\n');
  if (text.length <= CONDENSED_MAX) {
    return text;
  }
  return text.slice(0, CONDENSED_HEAD) + '\n\n[… middle of the session omitted …]\n\n' +
    text.slice(text.length - (CONDENSED_MAX - CONDENSED_HEAD));
}

function runClaudePrint(args, input, cwd) {
  return new Promise((resolve, reject) => {
    const file = app.resolveClaude();
    const viaShell = /\.cmd$/i.test(file);
    const child = spawn(viaShell ? `"${file}"` : file, viaShell ? args.map((a) => '"' + a.replace(/"/g, '\\"') + '"') : args, {
      cwd,
      env: app.claudeEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: viaShell
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-2000); });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const result = JSON.parse(stdout);
        if (result.is_error || !result.result) {
          reject(new Error(result.result || 'empty reply'));
        } else {
          resolve(result.result);
        }
      } catch (e) {
        reject(new Error(stderr.trim().split('\n').pop() || 'claude exited with code ' + code));
      }
    });
    // The transcript goes through stdin: Windows limits a command line to about 32,000 characters.
    child.stdin.end(input);
  });
}

function summarizeAgent(agent) {
  const condensed = condenseTranscript(agent.id);
  if (!condensed) {
    return Promise.reject(new Error('No transcript found'));
  }
  const prompt = [
    'Below is a condensed transcript of a Claude Code agent session; tool results and file contents were removed.',
    'Write a handoff for a fresh agent that will continue this work in the same folder. Use these sections:',
    'Goal; Done so far (name the files); Current state; Problems and open questions; Next steps.',
    'Be specific and concise, under 400 words. Output only the handoff.',
    '',
    `Agent name: ${agent.title}`,
    `Working folder: ${agent.cwd}` + (agent.worktree ? ` (git worktree, branch ${agent.worktree.branch})` : ''),
    '',
    '--- transcript ---',
    condensed
  ].join('\n');
  return runClaudePrint(['-p', '--model', SUMMARY_MODEL, '--tools', '', '--no-session-persistence',
    '--output-format', 'json'], prompt, agent.cwd);
}

function handoffPrompt(agent, summary) {
  const task = agent.originalTask || agent.task || '';
  return [
    'You are taking over from a previous agent whose session has ended. Continue its work.',
    task ? 'Its original task was:\n' + task : '',
    'Handoff summary of its session:\n' + summary,
    'First check the current state of the files the summary mentions, then reply with a short status: what is done ' +
      'and what is left. Then wait for further instructions; do not continue the work until you are asked.'
  ].filter(Boolean).join('\n\n');
}

function setRefresh(orch, refresh) {
  orch.orch.refresh = refresh;
  app.saveStore();
  app.toRenderer('orch:refresh', { id: orch.id, refresh });
}

async function restartAgents(id, agentIds) {
  const orch = getOrch(id);
  if (orch.orch.refresh && orch.orch.refresh.phase === 'working') {
    throw new Error('Already summarizing');
  }
  const agents = workersOf(id).filter((s) => (agentIds || []).includes(s.id) && !s.retired);
  if (!agents.length) {
    throw new Error('Pick at least one agent');
  }
  const refresh = {
    phase: 'working',
    items: agents.map((a) => ({ id: a.id, label: a.title, state: 'waiting' }))
  };
  setRefresh(orch, refresh);
  const update = (item, fields) => {
    Object.assign(item, fields);
    app.saveStore();
    app.toRenderer('orch:refresh', { id, refresh });
  };
  const queue = agents.slice();
  const worker = async () => {
    while (queue.length) {
      const agent = queue.shift();
      const item = refresh.items.find((i) => i.id === agent.id);
      update(item, { state: 'summarizing' });
      try {
        const summary = await summarizeAgent(agent);
        // The handoff replaces the old agent, so its process (if any) is no longer needed.
        app.killPty(agent.id);
        const fresh = spawnAgent(orch, { label: agent.title, task: handoffPrompt(agent, summary) }, {
          cwd: agent.cwd,
          worktree: agent.worktree,
          fields: { originalTask: agent.originalTask || agent.task, handoff: summary, replaces: agent.id }
        });
        agent.retired = true;
        agent.replacedBy = fresh.agentId;
        update(item, { state: 'done', newId: fresh.agentId });
      } catch (e) {
        app.log.warn('summarize & restart failed for', agent.id, e.message);
        update(item, { state: 'error', error: e.message.split('\n')[0] });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(SUMMARY_PARALLEL, agents.length) }, worker));
  update(refresh, { phase: 'done' });
  // Sidebar rows of the replaced agents change, so send the updated sessions.
  for (const agent of agents) {
    app.toRenderer('session:updated', agent);
  }
  return refresh;
}

function dismissRefresh(id) {
  const orch = getOrch(id);
  if (orch.orch.refresh && orch.orch.refresh.phase !== 'working') {
    setRefresh(orch, null);
  }
}

// Plans that were planning or running when the app closed cannot continue.
function recoverPlans() {
  for (const s of app.store().sessions) {
    const plan = s.kind === 'orchestrator' && s.orch.plan;
    if (plan && plan.phase === 'planning') {
      s.orch.plan = { phase: 'idle', goal: plan.goal, log: [], tasks: [] };
    } else if (plan && plan.phase === 'running') {
      s.orch.plan = Object.assign({}, plan, { phase: 'done', wrapping: false, interrupted: true });
    }
    const refresh = s.kind === 'orchestrator' && s.orch.refresh;
    if (refresh && refresh.phase === 'working') {
      for (const item of refresh.items) {
        if (item.state === 'waiting' || item.state === 'summarizing') {
          Object.assign(item, { state: 'error', error: 'Interrupted when the app closed' });
        }
      }
      refresh.phase = 'done';
    }
  }
}

function shutdown() {
  for (const child of planners.values()) {
    child.kill();
  }
  planners.clear();
}

function clampMax(value) {
  return Math.min(10, Math.max(1, Math.round(Number(value) || 5)));
}

function normalizeOptions(fields) {
  const maxAgents = clampMax(fields.maxAgents);
  return {
    goal: String(fields.goal || '').trim(),
    maxAgents,
    isolation: fields.isolation === 'worktree' ? 'worktree' : 'shared',
    permissionMode: PERMISSION_MODES.includes(fields.permissionMode) ? fields.permissionMode : 'manual',
    autoApproveTools: fields.autoApproveTools === true
  };
}

module.exports = {
  init, extraArgs, handleRequest, onStatus, workersOf, normalizeOptions,
  startPlan, cancelPlan, discardPlan, runPlan, shutdown, restartAgents, dismissRefresh, onUserInput, setMaxAgents
};
