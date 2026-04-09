import * as path from 'path';
import * as fs from 'fs-extra';
import { logError } from './utils';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ContainlessConfig {
  runtime: Record<string, string>;
  start?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CONFIG_FILENAME = 'containless.json';

// ── Read Config ─────────────────────────────────────────────────────────────

export function configPath(cwd?: string): string {
  return path.resolve(cwd || process.cwd(), CONFIG_FILENAME);
}

export async function readConfig(cwd?: string): Promise<ContainlessConfig> {
  const filePath = configPath(cwd);

  if (!(await fs.pathExists(filePath))) {
    logError(`Config file not found: ${filePath}`);
    logError('Create a containless.json in your project root. Example:');
    console.log(`
{
  "runtime": {
    "node": "18.17.0"
  },
  "start": "npm run dev"
}
`);
    process.exit(1);
  }

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(raw) as ContainlessConfig;

    if (!config.runtime || typeof config.runtime !== 'object') {
      logError('"runtime" field is missing or invalid in containless.json');
      process.exit(1);
    }

    return config;
  } catch (err: any) {
    if (err.name === 'SyntaxError') {
      logError(`containless.json is not valid JSON: ${err.message}`);
    } else {
      logError(`Failed to read containless.json: ${err.message}`);
    }
    process.exit(1);
  }
}
