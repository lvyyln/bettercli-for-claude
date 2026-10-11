// MCP server (stdio) that gives an orchestrator session tools to run worker sessions in BetterCLI.
// Claude Code starts it from the orchestrator's --mcp-config, running the app's own executable with
// ELECTRON_RUN_AS_NODE=1, so users do not need Node installed. Every tool call is forwarded to the
// app's local server, which owns the worker processes.
const http = require('http');
const readline = require('readline');

const PORT = Number(process.env.BETTERCLI_PORT);
const TOKEN = process.env.BETTERCLI_TOKEN;
const ORCH_ID = process.env.BETTERCLI_ORCH_ID;

const TOOLS = [
  {
    name: 'spawn_agent',
    description: 'Start a new worker agent: a full Claude Code session the user can watch and type into. ' +
      'Give it a complete, self-contained task; it does not see this conversation. Returns its agentId.',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short name shown on the agent tile, e.g. "API tests".' },
        task: { type: 'string', description: 'Full instructions for the agent, including what to report back when done.' }
      },
      required: ['label', 'task']
    }
  },
  {
    name: 'list_agents',
    description: 'List this orchestration\'s agents with their status (busy, waiting, idle, stopped) and working folder.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'wait_for_agents',
    description: 'Block until the given agents (default: all running ones) have finished their turn, stopped, ' +
      'or need the user\'s input, or until the timeout. Returns each agent\'s status and last reply.',
    inputSchema: {
      type: 'object',
      properties: {
        agentIds: { type: 'array', items: { type: 'string' } },
        timeoutSeconds: { type: 'number', description: 'Default 300, maximum 1800.' }
      }
    }
  },
  {
    name: 'read_agent_output',
    description: 'Return an agent\'s status and its most recent reply.',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string' } },
      required: ['agentId']
    }
  },
  {
    name: 'send_to_agent',
    description: 'Send a message to an agent as if the user typed it. If the agent is busy, Claude queues it.',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string' }, message: { type: 'string' } },
      required: ['agentId', 'message']
    }
  },
  {
    name: 'stop_agent',
    description: 'Stop an agent\'s process. Its conversation is kept and the user can resume it.',
    inputSchema: {
      type: 'object',
      properties: { agentId: { type: 'string' } },
      required: ['agentId']
    }
  }
];

function callApp(tool, args) {
  const body = JSON.stringify({ token: TOKEN, orchestratorId: ORCH_ID, tool, args: args || {} });
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: PORT,
      path: '/orchestrate',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(text));
        } catch (e) {
          reject(new Error('Bad reply from BetterCLI: ' + text.slice(0, 200)));
        }
      });
    });
    req.on('error', (e) => reject(new Error('BetterCLI is not reachable: ' + e.message)));
    req.end(body);
  });
}

function send(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

async function handle(msg) {
  if (msg.method === 'initialize') {
    return {
      protocolVersion: (msg.params && msg.params.protocolVersion) || '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'bettercli', version: '1.0.0' }
    };
  }
  if (msg.method === 'ping') {
    return {};
  }
  if (msg.method === 'tools/list') {
    return { tools: TOOLS };
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params || {};
    try {
      const reply = await callApp(name, args);
      if (reply.error) {
        return { content: [{ type: 'text', text: reply.error }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(reply.result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: e.message }], isError: true };
    }
  }
  throw Object.assign(new Error('Method not found: ' + msg.method), { code: -32601 });
}

readline.createInterface({ input: process.stdin }).on('line', async (line) => {
  if (!line.trim()) {
    return;
  }
  let msg;
  try {
    msg = JSON.parse(line);
  } catch (e) {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  // Notifications (no id) need no reply.
  if (msg.id === undefined || msg.id === null) {
    return;
  }
  try {
    send({ jsonrpc: '2.0', id: msg.id, result: await handle(msg) });
  } catch (e) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: e.code || -32603, message: e.message } });
  }
});
