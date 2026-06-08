import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.resolve(path.dirname(__filename), '..');
const viteBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite');

const processes = [
  {
    name: 'server',
    command: process.execPath,
    args: ['server/src/app.js']
  },
  {
    name: 'web',
    command: viteBin,
    args: ['--config', 'web/vite.config.ts', '--host', '127.0.0.1', '--port', '5173']
  }
];

const children = processes.map((item) => {
  const child = spawn(item.command, item.args, {
    cwd: rootDir,
    env: process.env,
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (signal) return;
    if (code && code !== 0) {
      console.error(`[dev] ${item.name} exited with code ${code}`);
      stopAll(code);
    }
  });

  return child;
});

function stopAll(exitCode = 0) {
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(exitCode);
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
