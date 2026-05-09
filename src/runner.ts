import { spawn } from 'child_process';
import * as path from 'path';
import chalk from 'chalk';
import { runtimeBinDir, pathSeparator, isWindows, logInfo, logError, logWarn } from './utils';

// ── Run Command ─────────────────────────────────────────────────────────────

export interface RunOptions {
  command: string;
  runtimes: Record<string, string>;
  cwd?: string;
}

/**
 * Dangerous shell metacharacters that could be used for command injection.
 * These are blocked to prevent arbitrary command execution via the start field.
 */
const SHELL_INJECTION_PATTERN = /[;`|&$(){}\\<>!\n\r]/;

/**
 * Allowlist of executables that may appear as the first token of a start command.
 * This prevents containless.json from being used to execute arbitrary binaries.
 * The check is case-insensitive and ignores .exe/.cmd suffixes on Windows.
 */
const ALLOWED_EXECUTABLES = new Set([
  'node', 'npm', 'npx', 'yarn', 'pnpm', 'bun',      // Node.js ecosystem
  'python', 'python3', 'pip', 'pip3', 'uvicorn',       // Python ecosystem
  'go',                                                  // Go
  'java', 'javac', 'mvn', 'mvnw', 'gradle', 'gradlew', // Java ecosystem
  'ts-node',                                             // TypeScript
  'php',                                                 // PHP
]);

/**
 * Validate the executable (first token) of a command against the allowlist.
 * Throws if the executable is not recognized as safe.
 */
function validateExecutable(executable: string): void {
  // Normalize: take only the basename, strip .exe/.cmd, lowercase
  let name = path.basename(executable).toLowerCase();
  name = name.replace(/\.(exe|cmd|bat|sh)$/, '');

  if (!ALLOWED_EXECUTABLES.has(name)) {
    throw new Error(
      `Executable "${executable}" is not in the allowed list. ` +
      `Allowed executables: ${Array.from(ALLOWED_EXECUTABLES).join(', ')}. ` +
      `If you believe this executable should be allowed, please open an issue.`
    );
  }
}

/**
 * Validate a command string for potentially dangerous shell metacharacters.
 * Throws an error if injection patterns are detected.
 */
function validateCommand(command: string): void {
  if (SHELL_INJECTION_PATTERN.test(command)) {
    throw new Error(
      `Potentially dangerous characters detected in command: "${command}". ` +
      `Shell metacharacters (;, |, &, $, \`, etc.) are not allowed for security reasons. ` +
      `If you need complex shell commands, wrap them in a script file and reference that instead.`
    );
  }
}

/**
 * Spawn a child process with all local runtime bin directories prepended to PATH.
 * This ensures the local runtimes take precedence over any global installation.
 *
 * Security: shell is disabled to prevent command injection. The command string
 * is parsed manually and executed directly without a shell interpreter.
 */
export async function runCommand(opts: RunOptions): Promise<number> {
  const { command, runtimes, cwd } = opts;
  const workDir = cwd || process.cwd();
  const sep = pathSeparator();

  // Validate the command for shell injection attempts
  validateCommand(command);

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

  // Build runtime-specific extra environment variables.
  // PHP_BINARY is read by Laravel's artisan serve command to locate the runtime
  // for the built-in web-server worker process it spawns internally. Without this,
  // the worker falls back to the system PHP (or fails if PHP is not globally installed).
  const extraEnv: Record<string, string> = {};
  if (runtimes.php) {
    const phpBinDir = runtimeBinDir('php', runtimes.php, workDir);
    const phpExe = path.join(phpBinDir, isWindows() ? 'php.exe' : 'php');
    extraEnv['PHP_BINARY'] = phpExe;
  }

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

  // Security: Validate the executable against the allowlist
  validateExecutable(executable);

  // On Windows, Node.js CLI wrappers (npm, npx, yarn, pnpm, bun, ts-node) are
  // installed as .cmd scripts. spawn() with shell:false searches for a file
  // named exactly 'npm' — which doesn't exist; the real file is 'npm.cmd'.
  // Appending .cmd lets us keep shell:false (and its security guarantees) while
  // correctly resolving the wrapper on Windows.
  const WIN_CMD_WRAPPERS = new Set(['npm', 'npx', 'yarn', 'pnpm', 'bun', 'ts-node']);
  const resolvedExecutable =
    isWindows() && WIN_CMD_WRAPPERS.has(executable.toLowerCase())
      ? executable + '.cmd'
      : executable;

  return new Promise<number>((resolve) => {
    const child = spawn(resolvedExecutable, args, {
      env: {
        ...process.env,
        PATH: injectedPath,
        ...extraEnv,
      },
      stdio: 'inherit',
      cwd: workDir,
      // Security: shell is intentionally set to false to prevent command injection.
      // The command is parsed and executed directly without a shell interpreter.
      shell: false,
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
