import { spawn } from 'child_process';
import * as path from 'path';
import chalk from 'chalk';
import { runtimeBinDir, pathSeparator, logInfo, logError } from './utils';

// ── Run Command ─────────────────────────────────────────────────────────────

export interface RunOptions {
  command: string;
  runtimes: Record<string, string>;
  cwd?: string;
}

/**
 * Spawn a child process with all local runtime bin directories prepended to PATH.
 * This ensures the local runtimes take precedence over any global installation.
 */
export async function runCommand(opts: RunOptions): Promise<number> {
  const { command, runtimes, cwd } = opts;
  const workDir = cwd || process.cwd();
  const sep = pathSeparator();

  // Build the PATH with all local runtime bin directories prepended
  const binPaths: string[] = [];
  
  for (const [name, version] of Object.entries(runtimes)) {
    const binDir = runtimeBinDir(name, version, workDir);
    binPaths.push(binDir);
  }

  if (runtimes.python) {
    const { venvBinDir } = require('./utils');
    const { pathExistsSync } = require('fs-extra');
    const venvBin = venvBinDir(workDir);
    if (pathExistsSync(venvBin)) {
      binPaths.unshift(venvBin);
    }
  }

  const injectedPath = binPaths.join(sep) + sep + (process.env.PATH || '');

  logInfo(`Running: ${chalk.bold(command)}`);
  logInfo(`With runtimes: ${Object.entries(runtimes).map(([n, v]) => `${n}@${v}`).join(', ')}`);
  console.log(''); // blank line before output

  // Parse command string into executable and args
  const parts = parseCommand(command);
  if (parts.length === 0) {
    logError('Empty command');
    return 1;
  }

  const [executable, ...args] = parts;

  return new Promise<number>((resolve) => {
    const child = spawn(executable, args, {
      env: {
        ...process.env,
        PATH: injectedPath,
      },
      stdio: 'inherit',
      cwd: workDir,
      shell: true,
    });

    child.on('error', (err) => {
      logError(`Failed to run command: ${err.message}`);
      resolve(1);
    });

    child.on('close', (code) => {
      resolve(code ?? 0);
    });
  });
}

// ── Parse Command String ────────────────────────────────────────────────────

/**
 * Simple command parser that handles quoted strings.
 */
function parseCommand(cmd: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (const char of cmd) {
    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuote = char;
    } else if (char === ' ') {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) parts.push(current);
  return parts;
}
