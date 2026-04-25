#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs-extra';
import * as path from 'path';
import Table from 'cli-table3';
import { readConfig, writeConfig, configPath } from './config';
import { installRuntime } from './installer';
import { runCommand } from './runner';
import { scanProject } from './scanner';
import {
  parseRuntimeSpec,
  runtimesDir,
  runtimeDir,
  runtimeBinDir,
  containlessDir,
  isSupportedRuntime,
  SUPPORTED_RUNTIMES,
  logSuccess,
  logInfo,
  logWarn,
  logError,
  checkGitignore,
} from './utils';
import { getRuntimeInfo } from './runtimes/index';

// ── ASCII Banner ────────────────────────────────────────────────────────────

const BANNER = chalk.bold.cyan(`
   ██████╗ ██████╗ ███╗   ██╗████████╗ █████╗ ██╗███╗   ██╗██╗     ███████╗███████╗███████╗
  ██╔════╝██╔═══██╗████╗  ██║╚══██╔══╝██╔══██╗██║████╗  ██║██║     ██╔════╝██╔════╝██╔════╝
  ██║     ██║   ██║██╔██╗ ██║   ██║   ███████║██║██╔██╗ ██║██║     █████╗  ███████╗███████╗
  ██║     ██║   ██║██║╚██╗██║   ██║   ██╔══██║██║██║╚██╗██║██║     ██╔══╝  ╚════██║╚════██║
  ╚██████╗╚██████╔╝██║ ╚████║   ██║   ██║  ██║██║██║ ╚████║███████╗███████╗███████║███████║
   ╚═════╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚═╝  ╚═╝╚═╝╚═╝  ╚═══╝╚══════╝╚══════╝╚══════╝╚══════╝
`);

// ── Program Setup ───────────────────────────────────────────────────────────

const program = new Command();

program
  .name('containless')
  .description(
    chalk.dim('Docker-like runtime isolation — install and run runtimes locally, no containers needed.')
  )
  .version('0.2.0')
  .addHelpText('before', BANNER);

// ── Command: run ────────────────────────────────────────────────────────────

program
  .command('run')
  .description('Read containless.json, ensure runtimes are installed, and run the start command')
  .option('-c, --config <path>', 'Path to containless.json', 'containless.json')
  .action(async (opts) => {
    try {
      console.log(BANNER);
      await checkGitignore();

      const config = await readConfig();

      if (!config.start) {
        logError('No "start" command defined in containless.json');
        process.exit(1);
      }

      // Install all runtimes defined in config
      logInfo(chalk.bold('Ensuring runtimes are installed...\n'));
      for (const [name, version] of Object.entries(config.runtime)) {
        if (!isSupportedRuntime(name)) {
          logWarn(`Skipping unsupported runtime: ${name}`);
          continue;
        }
        await installRuntime(name, version);
      }

      console.log('');
      logInfo(chalk.bold('Starting application...\n'));

      // Run the start command
      const exitCode = await runCommand({
        command: config.start,
        runtimes: config.runtime,
      });

      process.exit(exitCode);
    } catch (err: any) {
      logError(err.message);
      process.exit(1);
    }
  });

// ── Command: init ───────────────────────────────────────────────────────────

program
  .command('init')
  .description('Scan the project and auto-generate containless.json')
  .option('-f, --force', 'Overwrite existing containless.json')
  .action(async (opts) => {
    try {
      console.log(BANNER);

      const cfgPath = configPath();

      // Check if config already exists
      if (!opts.force && (await fs.pathExists(cfgPath))) {
        logWarn('containless.json already exists. Use --force to overwrite.');
        return;
      }

      logInfo('Scanning project to detect runtimes...\n');

      const result = await scanProject();

      if (Object.keys(result.runtimes).length === 0) {
        logError('No runtimes detected in this project.');
        logInfo(
          'Make sure your project has recognizable config files ' +
          '(package.json, go.mod, pyproject.toml, pom.xml, etc.)'
        );
        return;
      }

      // Display detection results as a table
      const table = new Table({
        head: [
          chalk.cyan('Runtime'),
          chalk.cyan('Version'),
          chalk.cyan('Detected From'),
        ],
        style: {
          head: [],
          border: ['dim'],
        },
        chars: {
          top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          left: '│', 'left-mid': '├',
          mid: '─', 'mid-mid': '┼',
          right: '│', 'right-mid': '┤',
          middle: '│',
        },
      });

      for (const det of result.detections) {
        table.push([
          chalk.bold(det.runtime),
          det.version,
          chalk.dim(det.source),
        ]);
      }

      console.log(table.toString());
      console.log('');

      if (result.start) {
        logInfo(`Start command: ${chalk.bold(result.start)}`);
      }

      // Build and write config
      const config = {
        runtime: result.runtimes,
        ...(result.start ? { start: result.start } : {}),
      };

      await writeConfig(config);
      console.log('');
      logSuccess(`Generated ${chalk.bold('containless.json')}`);

      // Show the generated content
      console.log('');
      console.log(chalk.dim(JSON.stringify(config, null, 2)));
      console.log('');

      logInfo(
        'You can now run ' +
        chalk.bold('containless run') +
        ' to start your project.'
      );
    } catch (err: any) {
      logError(err.message);
      process.exit(1);
    }
  });

// ── Command: install ────────────────────────────────────────────────────────

program
  .command('install <runtime>')
  .description('Download and install a runtime locally (e.g. node@18.17.0)')
  .action(async (runtimeSpec: string) => {
    try {
      console.log(BANNER);
      await checkGitignore();

      const { name, version } = parseRuntimeSpec(runtimeSpec);

      if (!isSupportedRuntime(name)) {
        logError(
          `Unsupported runtime: "${name}". Supported: ${SUPPORTED_RUNTIMES.join(', ')}`
        );
        process.exit(1);
      }

      await installRuntime(name, version);
    } catch (err: any) {
      logError(err.message);
      process.exit(1);
    }
  });

// ── Command: clean ──────────────────────────────────────────────────────────

program
  .command('clean')
  .description('Delete all locally installed runtimes (.containless/runtimes/)')
  .option('-a, --all', 'Delete the entire .containless/ directory (including cache)')
  .action(async (opts) => {
    try {
      console.log(BANNER);

      if (opts.all) {
        const dir = containlessDir();
        if (await fs.pathExists(dir)) {
          await fs.remove(dir);
          logSuccess(`Removed entire .containless/ directory`);
        } else {
          logInfo('Nothing to clean — .containless/ does not exist.');
        }
      } else {
        const dir = runtimesDir();
        if (await fs.pathExists(dir)) {
          await fs.remove(dir);
          logSuccess(`Removed all installed runtimes from .containless/runtimes/`);
        } else {
          logInfo('Nothing to clean — no runtimes are installed.');
        }
      }
    } catch (err: any) {
      logError(err.message);
      process.exit(1);
    }
  });

// ── Command: info ───────────────────────────────────────────────────────────

program
  .command('info')
  .description('Show what runtimes are currently installed locally')
  .action(async () => {
    try {
      console.log(BANNER);

      const rtDir = runtimesDir();

      if (!(await fs.pathExists(rtDir))) {
        logInfo('No runtimes installed. Use ' + chalk.bold('containless install <runtime@version>') + ' to get started.');
        return;
      }

      const entries = await fs.readdir(rtDir, { withFileTypes: true });
      const runtimes = entries.filter((e) => e.isDirectory());

      if (runtimes.length === 0) {
        logInfo('No runtimes installed.');
        return;
      }

      const table = new Table({
        head: [
          chalk.cyan('Runtime'),
          chalk.cyan('Version'),
          chalk.cyan('Binary Path'),
          chalk.cyan('Status'),
        ],
        style: {
          head: [],
          border: ['dim'],
        },
        chars: {
          top: '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
          bottom: '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
          left: '│', 'left-mid': '├',
          mid: '─', 'mid-mid': '┼',
          right: '│', 'right-mid': '┤',
          middle: '│',
        },
      });

      for (const entry of runtimes) {
        const dirName = entry.name; // e.g. "node-18.17.0"
        const dashIdx = dirName.indexOf('-');
        if (dashIdx === -1) continue;

        const name = dirName.substring(0, dashIdx);
        const version = dirName.substring(dashIdx + 1);

        let binaryPath = '—';
        let status = chalk.red('✖ binary not found');

        if (isSupportedRuntime(name)) {
          const info = getRuntimeInfo(name, version);
          const binDir = runtimeBinDir(name, version);
          const fullBinPath = path.join(binDir, info.binaryName);
          binaryPath = path.relative(process.cwd(), fullBinPath);

          if (await fs.pathExists(fullBinPath)) {
            status = chalk.green('✔ ready');
          }
        } else {
          status = chalk.yellow('? unknown runtime');
        }

        table.push([
          chalk.bold(name),
          version,
          chalk.dim(binaryPath),
          status,
        ]);
      }

      console.log(table.toString());
      console.log('');
      logInfo(`Runtimes directory: ${chalk.dim(path.relative(process.cwd(), rtDir))}`);
    } catch (err: any) {
      logError(err.message);
      process.exit(1);
    }
  });

// ── Parse & Run ─────────────────────────────────────────────────────────────

program.parse(process.argv);
