// Tracks the files a session edits through Claude's Edit/Write tools.
// The first time a session touches a file, its content is saved as the baseline;
// diffs compare that baseline with the file as it is on disk now.
const fs = require('fs');
const path = require('path');
const { structuredPatch } = require('diff');

const EDIT_TOOLS = { Edit: 'file_path', MultiEdit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' };
const MAX_BYTES = 1024 * 1024;

let dir = null;
const cache = new Map();

function init(userDataDir) {
  dir = path.join(userDataDir, 'changes');
  fs.mkdirSync(dir, { recursive: true });
}

function recordFile(id) {
  return path.join(dir, id + '.json');
}

function load(id) {
  if (!cache.has(id)) {
    const file = recordFile(id);
    cache.set(id, fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { files: {} });
  }
  return cache.get(id);
}

function snapshot(file) {
  if (!fs.existsSync(file)) {
    return { content: null };
  }
  if (fs.statSync(file).size > MAX_BYTES) {
    return { tooLarge: true };
  }
  const content = fs.readFileSync(file, 'utf8');
  if (content.includes('\u0000')) {
    return { binary: true };
  }
  return { content };
}

function isEditTool(payload) {
  return Boolean(EDIT_TOOLS[payload.tool_name]);
}

// Call on PreToolUse, before the tool runs, so the baseline is the file as it was before the edit.
function trackBeforeEdit(id, payload) {
  const key = EDIT_TOOLS[payload.tool_name];
  const target = key && payload.tool_input ? payload.tool_input[key] : null;
  if (!target) {
    return;
  }
  const file = path.resolve(payload.cwd || '.', target);
  const record = load(id);
  if (record.files[file]) {
    return;
  }
  record.files[file] = snapshot(file);
  fs.writeFileSync(recordFile(id), JSON.stringify(record));
}

function relativeTo(cwd, file) {
  const rel = path.relative(cwd, file);
  return rel.startsWith('..') || path.isAbsolute(rel) ? file : rel;
}

function diffFile(id, cwd, file) {
  const before = load(id).files[file];
  const after = snapshot(file);
  const rel = relativeTo(cwd, file);
  let status = 'modified';
  if (before.content === null && after.content !== null) {
    status = 'added';
  } else if (after.content === null && before.content !== null) {
    status = 'deleted';
  }
  const result = { path: file, rel, status, added: 0, removed: 0, hunks: [] };
  if (before.tooLarge || after.tooLarge || before.binary || after.binary) {
    result.note = before.binary || after.binary ? 'Binary file' : 'File too large to diff';
    return result;
  }
  const patch = structuredPatch(rel, rel, before.content || '', after.content || '', '', '', { context: 3 });
  result.hunks = patch.hunks;
  for (const hunk of patch.hunks) {
    for (const line of hunk.lines) {
      if (line[0] === '+') {
        result.added++;
      } else if (line[0] === '-') {
        result.removed++;
      }
    }
  }
  return result;
}

// Files whose content no longer differs from the baseline (edit denied or reverted) are left out.
function list(id, cwd) {
  return Object.keys(load(id).files)
    .map((file) => diffFile(id, cwd, file))
    .filter((d) => d.note || d.hunks.length > 0)
    .map((d) => ({ path: d.path, rel: d.rel, status: d.status, added: d.added, removed: d.removed }));
}

function remove(id) {
  cache.delete(id);
  const file = recordFile(id);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}

module.exports = { init, isEditTool, trackBeforeEdit, list, diffFile, remove };
