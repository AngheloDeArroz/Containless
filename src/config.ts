import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { logError, logInfo, logSuccess, logWarn, validateVersion, isSupportedRuntime } from './utils';
import { scanProject } from './scanner';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ContainlessConfig {
  runtime: Record<string, string>;
  start?: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

const CONFIG_FILENAME = 'containless.json';

// ── Paths ───────────────────────────────────────────────────────────────────

export function configPath(cwd?: string): string {
  return path.resolve(cwd || process.cwd(), CONFIG_FILENAME);
}

// ── Write Config ────────────────────────────────────────────────────────────

export async function writeConfig(
  config: ContainlessConfig,
  cwd?: string
): Promise<string> {
  const filePath = configPath(cwd);
  const json = JSON.stringify(config, null, 2) + '\n';
  await fs.writeFile(filePath, json, 'utf-8');
  return filePath;
}

// ── Read Config ─────────────────────────────────────────────────────────────

export async function readConfig(cwd?: string): Promise<ContainlessConfig> {
  const filePath = configPath(cwd);

  if (!(await fs.pathExists(filePath))) {
    // Auto-scan the project and generate config
    logInfo('No containless.json found — scanning project to auto-detect runtimes...\n');

    const result = await scanProject(cwd);

    if (Object.keys(result.runtimes).length === 0) {
      logError('Could not detect any runtimes in this project.');
      logError('Create a containless.json in your project root manually. Example:');
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

    // Build the config from scan results
    const config: ContainlessConfig = {
      runtime: result.runtimes,
    };
    if (result.start) {
      config.start = result.start;
    }

    // Log detections
    for (const det of result.detections) {
      logSuccess(
        `Detected ${chalk.bold(det.runtime)}@${chalk.bold(det.version)} from ${chalk.dim(det.source)}`
      );
    }
    if (result.start) {
      logSuccess(`Detected start command: ${chalk.bold(result.start)}`);
    }

    // Write the config file
    await writeConfig(config, cwd);
    console.log('');
    logSuccess(`Generated ${chalk.bold('containless.json')}`);
    console.log('');

    return config;
  }

  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const config = JSON.parse(raw) as ContainlessConfig;

    if (!config.runtime || typeof config.runtime !== 'object') {
      logError('"runtime" field is missing or invalid in containless.json');
      process.exit(1);
    }

    // Security: Validate all runtime names and version strings from the config.
    // These values are used in filesystem paths and download URLs, so they
    // must be validated to prevent path traversal and injection attacks.
    for (const [name, version] of Object.entries(config.runtime)) {
      if (!isSupportedRuntime(name)) {
        logError(`Unsupported runtime in containless.json: "${name}"`);
        process.exit(1);
      }
      if (typeof version !== 'string') {
        logError(`Invalid version for runtime "${name}" in containless.json: expected a string`);
        process.exit(1);
      }
      try {
        validateVersion(version);
      } catch (err: any) {
        logError(`Invalid version for runtime "${name}" in containless.json: ${err.message}`);
        process.exit(1);
      }
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
