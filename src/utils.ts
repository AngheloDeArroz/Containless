import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';

// ── Platform Detection ──────────────────────────────────────────────────────

export type Platform = 'linux' | 'darwin' | 'win32';
export type Arch = 'x64' | 'arm64';

export function getPlatform(): Platform {
  const p = process.platform;
  if (p === 'linux' || p === 'darwin' || p === 'win32') return p;
  throw new Error(`Unsupported platform: ${p}`);
}

export function getArch(): Arch {
  const a = process.arch;
  if (a === 'x64' || a === 'arm64') return a;
  throw new Error(`Unsupported architecture: ${a}`);
}

export function isWindows(): boolean {
  return process.platform === 'win32';
}

export function pathSeparator(): string {
  return isWindows() ? ';' : ':';
}

// ── Paths ───────────────────────────────────────────────────────────────────

export function containlessDir(cwd?: string): string {
  return path.resolve(cwd || process.cwd(), '.containless');
}

export function runtimesDir(cwd?: string): string {
  return path.join(containlessDir(cwd), 'runtimes');
}

export function cacheDir(cwd?: string): string {
  return path.join(containlessDir(cwd), 'cache');
}

export function venvDir(cwd?: string): string {
  return path.join(containlessDir(cwd), 'venv');
}

export function venvBinDir(cwd?: string): string {
  return isWindows()
    ? path.join(venvDir(cwd), 'Scripts')
    : path.join(venvDir(cwd), 'bin');
}

export function runtimeDir(name: string, version: string, cwd?: string): string {
  return path.join(runtimesDir(cwd), `${name}-${version}`);
}

export function runtimeBinDir(name: string, version: string, cwd?: string): string {
  const base = runtimeDir(name, version, cwd);
  const win = isWindows();

  if (name === 'node') {
    // Windows Node.js zip has node.exe at root level (no bin/ subdirectory)
    return win ? base : path.join(base, 'bin');
  }

  if (name === 'python') {
    // Windows python-build-standalone puts python.exe at root or in python/ dir
    return win ? base : path.join(base, 'bin');
  }

  if (name === 'java') {
    // Adoptium JDK layout varies by platform
    if (getPlatform() === 'darwin') {
      return path.join(base, 'Contents', 'Home', 'bin');
    }
    return path.join(base, 'bin');
  }

  if (name === 'go') {
    // Go on Windows still uses bin/ subdirectory
    return path.join(base, 'bin');
  }

  return path.join(base, 'bin');
}

// ── Version Parsing ─────────────────────────────────────────────────────────

export interface ParsedRuntime {
  name: string;
  version: string;
}

/**
 * Parse a string like "node@18.17.0" into { name: "node", version: "18.17.0" }
 */
export function parseRuntimeSpec(spec: string): ParsedRuntime {
  const parts = spec.split('@');
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(
      `Invalid runtime spec: "${spec}". Expected format: name@version (e.g. node@18.17.0)`
    );
  }
  return { name: parts[0].toLowerCase(), version: parts[1] };
}

// ── Logging Helpers ─────────────────────────────────────────────────────────

export function logSuccess(msg: string): void {
  console.log(chalk.green('✔') + ' ' + msg);
}

export function logInfo(msg: string): void {
  console.log(chalk.blue('ℹ') + ' ' + msg);
}

export function logWarn(msg: string): void {
  console.log(chalk.yellow('⚠') + ' ' + chalk.yellow(msg));
}

export function logError(msg: string): void {
  console.error(chalk.red('✖') + ' ' + chalk.red(msg));
}

// ── Gitignore Check ─────────────────────────────────────────────────────────

export async function checkGitignore(cwd?: string): Promise<void> {
  const gitignorePath = path.resolve(cwd || process.cwd(), '.gitignore');
  try {
    if (await fs.pathExists(gitignorePath)) {
      const content = await fs.readFile(gitignorePath, 'utf-8');
      if (!content.includes('.containless')) {
        logWarn(
          'The .containless/ directory is not in your .gitignore. ' +
          'Consider adding ".containless/" to avoid committing runtimes.'
        );
      }
    } else {
      logWarn(
        'No .gitignore found. Consider creating one and adding ".containless/" to it.'
      );
    }
  } catch {
    // Non-critical — silently skip
  }
}

// ── File Size Formatting ────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ── Supported Runtimes ──────────────────────────────────────────────────────

export const SUPPORTED_RUNTIMES = ['node', 'python', 'java', 'go'] as const;
export type RuntimeName = (typeof SUPPORTED_RUNTIMES)[number];

export function isSupportedRuntime(name: string): name is RuntimeName {
  return (SUPPORTED_RUNTIMES as readonly string[]).includes(name);
}
