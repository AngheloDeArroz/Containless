import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { getOutputChannel, logInfo, logError, logCommand } from './outputChannel';

/**
 * Locate the containless CLI binary.
 * Search order:
 *   1. User-configured path (containless.cliPath setting)
 *   2. Local node_modules/.bin/containless in the workspace
 *   3. Global 'containless' on PATH (resolved via 'where' on Windows, 'which' on Unix)
 *
 * Returns the resolved path, or null if not found.
 */
export async function findContainlessCLI(workspaceRoot: string): Promise<string | null> {
  // 1. Check user setting
  const config = vscode.workspace.getConfiguration('containless');
  const userPath = config.get<string>('cliPath');
  if (userPath && fs.existsSync(userPath)) {
    logInfo(`Using CLI from setting: ${userPath}`);
    return userPath;
  }

  // 2. Check local node_modules
  const isWindows = process.platform === 'win32';
  const localBin = path.join(
    workspaceRoot,
    'node_modules',
    '.bin',
    isWindows ? 'containless.cmd' : 'containless'
  );
  if (fs.existsSync(localBin)) {
    logInfo(`Using local CLI: ${localBin}`);
    return localBin;
  }

  // 3. Check global PATH
  const globalPath = await resolveGlobalCLI();
  if (globalPath) {
    logInfo(`Using global CLI: ${globalPath}`);
    return globalPath;
  }

  return null;
}

/**
 * Resolve the global containless binary using 'where' (Windows) or 'which' (Unix).
 */
function resolveGlobalCLI(): Promise<string | null> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const cmd = isWindows ? 'where' : 'which';
    const child = spawn(cmd, ['containless'], { stdio: ['ignore', 'pipe', 'ignore'] });

    let stdout = '';
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        // 'where' on Windows can return multiple lines; take the first
        resolve(stdout.trim().split(/\r?\n/)[0]);
      } else {
        resolve(null);
      }
    });

    child.on('error', () => {
      resolve(null);
    });
  });
}

// Reusable terminal reference so we don't spawn a new one each time
let containlessTerminal: vscode.Terminal | undefined;

/**
 * Run a containless command in the VS Code integrated terminal.
 * Used for interactive commands like 'containless run' that need stdio.
 */
export async function runInTerminal(
  workspaceRoot: string,
  cliPath: string,
  args: string[]
): Promise<void> {
  // Dispose old terminal if it was closed by the user
  if (containlessTerminal) {
    try {
      containlessTerminal.processId; // Check if terminal is still alive
    } catch {
      containlessTerminal = undefined;
    }
  }

  if (!containlessTerminal || containlessTerminal.exitStatus !== undefined) {
    containlessTerminal = vscode.window.createTerminal({
      name: 'Containless',
      cwd: workspaceRoot,
    });
  }

  const fullCommand = `"${cliPath}" ${args.join(' ')}`;
  logCommand(fullCommand);

  containlessTerminal.show();
  containlessTerminal.sendText(fullCommand);
}

/**
 * Run a containless command in the background as a child process.
 * Streams output to the Containless output channel.
 * Returns the exit code.
 */
export function runInBackground(
  workspaceRoot: string,
  cliPath: string,
  args: string[]
): Promise<number> {
  return new Promise((resolve) => {
    const fullCommand = `${cliPath} ${args.join(' ')}`;
    logCommand(fullCommand);

    const channel = getOutputChannel();
    channel.show(true);

    // Determine if we need to use shell mode for .cmd files on Windows
    const useShell = process.platform === 'win32' && cliPath.endsWith('.cmd');

    const child = spawn(cliPath, args, {
      cwd: workspaceRoot,
      env: { ...process.env },
      shell: useShell,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data: Buffer) => {
      // Strip ANSI escape codes for cleaner output channel display
      const text = stripAnsi(data.toString());
      channel.append(text);
    });

    child.stderr.on('data', (data: Buffer) => {
      const text = stripAnsi(data.toString());
      channel.append(text);
    });

    child.on('close', (code) => {
      channel.appendLine('');
      channel.appendLine(`[INFO] Command exited with code ${code ?? 0}`);
      resolve(code ?? 0);
    });

    child.on('error', (err) => {
      logError(`Failed to run command: ${err.message}`);
      resolve(1);
    });
  });
}

/**
 * Strip ANSI escape codes from a string so output channel text is clean.
 */
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Dispose the terminal reference on deactivation.
 */
export function disposeTerminal(): void {
  if (containlessTerminal) {
    containlessTerminal.dispose();
    containlessTerminal = undefined;
  }
}
