const fs = require('fs');
const path = require('path');
const util = require('util');

const MAX_SIZE = 5 * 1024 * 1024;

let logPath = null;

// Written synchronously so the last lines before a crash still reach the disk.
function init(dir) {
  fs.mkdirSync(dir, { recursive: true });
  logPath = path.join(dir, 'main.log');
  if (fs.existsSync(logPath) && fs.statSync(logPath).size > MAX_SIZE) {
    fs.renameSync(logPath, path.join(dir, 'main.old.log'));
  }
}

function write(level, args) {
  const text = args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 4 }))).join(' ');
  const line = `${new Date().toISOString()} [${level}] ${text}\n`;
  if (level === 'error') {
    process.stderr.write(line);
  }
  if (logPath) {
    try {
      fs.appendFileSync(logPath, line);
    } catch (e) {
      process.stderr.write('could not write log ' + e.message + '\n');
    }
  }
}

module.exports = {
  init,
  info: (...args) => write('info', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args)
};
