import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RuntimeDetector } from './runtimeDetector';
import { SettingsManager } from './settingsManager';
import { getOutputChannel, logInfo, logError, showAndLog, disposeOutputChannel } from './outputChannel';
import { findContainlessCLI, runInTerminal, runInBackground, disposeTerminal } from './cliRunner';
import { createStatusBarItem, updateStatusBar, hideStatusBar, disposeStatusBar } from './statusBar';

let detector: RuntimeDetector;
let settingsManager: SettingsManager;
let workspaceRoot: string;

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;

  if (!workspaceFolders) {
    return;
  }

  workspaceRoot = workspaceFolders[0].uri.fsPath;
  const containlessJsonPath = path.join(workspaceRoot, 'containless.json');

  // Check if this workspace has a containless.json
  if (!fs.existsSync(containlessJsonPath)) {
    return;
  }

  logInfo('Containless extension activated');

  detector = new RuntimeDetector(workspaceRoot);
  settingsManager = new SettingsManager(workspaceRoot);

  // Create the status bar item
  const statusBar = createStatusBarItem();
  context.subscriptions.push(statusBar);

  // ── Existing Commands ───────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.detectRuntimes', async () => {
      await detectAndConfigureRuntimes();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.resetRuntimes', async () => {
      await settingsManager.resetToGlobal();
      updateStatusBar({});
      vscode.window.showInformationMessage('Runtimes reset to global defaults');
    })
  );

  // ── CLI Commands ────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.init', async () => {
      const cliPath = await requireCLI();
      if (!cliPath) { return; }

      // Check if containless.json already exists and prompt to overwrite
      const configExists = fs.existsSync(path.join(workspaceRoot, 'containless.json'));
      const args = ['init'];

      if (configExists) {
        const overwrite = await vscode.window.showWarningMessage(
          'containless.json already exists. Overwrite it?',
          { modal: true },
          'Overwrite'
        );

        if (overwrite !== 'Overwrite') { return; }
        args.push('--force');
      }

      logInfo(`Running: containless ${args.join(' ')}`);
      const code = await runInBackground(workspaceRoot, cliPath, args);

      if (code === 0) {
        vscode.window.showInformationMessage('Containless: Project initialized successfully');
        // Re-detect runtimes after init generates containless.json
        await detectAndConfigureRuntimes();
      } else {
        vscode.window.showErrorMessage('Containless: Init failed. Check the Output panel for details.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.run', async () => {
      const cliPath = await requireCLI();
      if (!cliPath) { return; }

      logInfo('Running: containless run');
      await runInTerminal(workspaceRoot, cliPath, ['run']);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.install', async () => {
      const cliPath = await requireCLI();
      if (!cliPath) { return; }

      // Pick a runtime
      const runtime = await vscode.window.showQuickPick(
        ['node', 'python', 'java', 'go'],
        {
          placeHolder: 'Select a runtime to install',
          title: 'Containless: Install Runtime',
        }
      );

      if (!runtime) { return; }

      // Prompt for version
      const version = await vscode.window.showInputBox({
        prompt: `Enter the ${runtime} version to install`,
        placeHolder: getVersionPlaceholder(runtime),
        title: `Install ${runtime}`,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Version is required';
          }
          if (!/^[a-zA-Z0-9._\-+]+$/.test(value)) {
            return 'Version can only contain alphanumeric characters, dots, dashes, underscores, and plus signs';
          }
          return null;
        },
      });

      if (!version) { return; }

      logInfo(`Installing ${runtime}@${version}`);
      vscode.window.showInformationMessage(`Containless: Installing ${runtime}@${version}...`);

      const code = await runInBackground(workspaceRoot, cliPath, ['install', `${runtime}@${version}`]);

      if (code === 0) {
        vscode.window.showInformationMessage(`Containless: ${runtime}@${version} installed successfully`);
        await detectAndConfigureRuntimes();
      } else {
        vscode.window.showErrorMessage(`Containless: Failed to install ${runtime}@${version}. Check the Output panel.`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.clean', async () => {
      const cliPath = await requireCLI();
      if (!cliPath) { return; }

      const choice = await vscode.window.showWarningMessage(
        'This will delete all locally installed runtimes. Continue?',
        { modal: true },
        'Clean Runtimes',
        'Clean All (including cache)'
      );

      if (!choice) { return; }

      const args = choice === 'Clean All (including cache)' ? ['clean', '--all'] : ['clean'];

      logInfo(`Running: containless ${args.join(' ')}`);
      const code = await runInBackground(workspaceRoot, cliPath, args);

      if (code === 0) {
        vscode.window.showInformationMessage('Containless: Runtimes cleaned');
        await detectAndConfigureRuntimes();
      } else {
        vscode.window.showErrorMessage('Containless: Clean failed. Check the Output panel.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.info', async () => {
      const cliPath = await requireCLI();
      if (!cliPath) { return; }

      logInfo('Running: containless info');
      const code = await runInBackground(workspaceRoot, cliPath, ['info']);

      if (code === 0) {
        showAndLog('Runtime info displayed above');
      } else {
        vscode.window.showErrorMessage('Containless: Failed to get info. Check the Output panel.');
      }
    })
  );

  // ── Quick Pick (status bar click) ───────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.showQuickPick', async () => {
      const items: vscode.QuickPickItem[] = [
        { label: '$(play) Run Project', description: 'containless run', detail: 'Install runtimes and execute the start command' },
        { label: '$(add) Install Runtime', description: 'containless install', detail: 'Download and install a specific runtime version' },
        { label: '$(file-add) Initialize Project', description: 'containless init', detail: 'Scan the project and generate containless.json' },
        { label: '$(refresh) Detect Runtimes', description: 'Reconfigure', detail: 'Re-scan installed runtimes and update VS Code settings' },
        { label: '$(info) Show Runtime Info', description: 'containless info', detail: 'Display installed runtimes and their status' },
        { label: '$(trash) Clean Runtimes', description: 'containless clean', detail: 'Delete all locally installed runtimes' },
        { label: '$(discard) Reset to Global', description: 'Reset settings', detail: 'Remove sandbox settings and restore global defaults' },
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Containless command',
        title: 'Containless',
      });

      if (!selected) { return; }

      switch (selected.label) {
        case '$(play) Run Project':
          vscode.commands.executeCommand('containless.run');
          break;
        case '$(add) Install Runtime':
          vscode.commands.executeCommand('containless.install');
          break;
        case '$(file-add) Initialize Project':
          vscode.commands.executeCommand('containless.init');
          break;
        case '$(refresh) Detect Runtimes':
          vscode.commands.executeCommand('containless.detectRuntimes');
          break;
        case '$(info) Show Runtime Info':
          vscode.commands.executeCommand('containless.info');
          break;
        case '$(trash) Clean Runtimes':
          vscode.commands.executeCommand('containless.clean');
          break;
        case '$(discard) Reset to Global':
          vscode.commands.executeCommand('containless.resetRuntimes');
          break;
      }
    })
  );

  // ── Auto-detect on activation ───────────────────────────────────────────

  await detectAndConfigureRuntimes();

  // ── Watch for changes to containless.json ───────────────────────────────

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, 'containless.json')
  );

  watcher.onDidChange(async () => {
    logInfo('containless.json changed, re-detecting runtimes...');
    vscode.window.showInformationMessage('containless.json changed, re-detecting runtimes...');
    await detectAndConfigureRuntimes();
  });

  context.subscriptions.push(watcher);

  // ── Auto-prompt if runtimes are missing ─────────────────────────────────

  const runtimesDir = path.join(workspaceRoot, '.containless', 'runtimes');
  if (!fs.existsSync(runtimesDir) || fs.readdirSync(runtimesDir).length === 0) {
    const action = await vscode.window.showInformationMessage(
      'Containless: No runtimes installed yet. Would you like to install them now?',
      'Run containless run',
      'Dismiss'
    );

    if (action === 'Run containless run') {
      vscode.commands.executeCommand('containless.run');
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function detectAndConfigureRuntimes() {
  try {
    const runtimes = await detector.detectInstalledRuntimes();

    if (Object.keys(runtimes).length === 0) {
      updateStatusBar({});
      vscode.window.showWarningMessage(
        'No Containless runtimes detected. Have you run "containless run" yet?'
      );
      return;
    }

    await settingsManager.configureRuntimes(runtimes);
    updateStatusBar(runtimes);

    const runtimeList = Object.entries(runtimes)
      .map(([name, version]) => `${name}@${version}`)
      .join(', ');

    logInfo(`Sandbox active — using local runtimes (${runtimeList})`);
    vscode.window.showInformationMessage(
      `Containless: Sandbox active — using local runtimes (${runtimeList})`
    );
  } catch (error) {
    logError(`Failed to detect runtimes: ${error instanceof Error ? error.message : String(error)}`);
    vscode.window.showErrorMessage(
      `Containless: Failed to detect runtimes - ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Locate the CLI and show an error if it's not found.
 */
async function requireCLI(): Promise<string | null> {
  const cliPath = await findContainlessCLI(workspaceRoot);

  if (!cliPath) {
    const action = await vscode.window.showErrorMessage(
      'Containless CLI not found. Install it with: npm install -g containless',
      'Copy Install Command'
    );

    if (action === 'Copy Install Command') {
      await vscode.env.clipboard.writeText('npm install -g containless');
      vscode.window.showInformationMessage('Install command copied to clipboard');
    }
    return null;
  }

  return cliPath;
}

/**
 * Get a version placeholder string for the input box.
 */
function getVersionPlaceholder(runtime: string): string {
  switch (runtime) {
    case 'node': return 'e.g. 18.17.0, 20.11.0';
    case 'python': return 'e.g. 3.11.0, 3.12.0';
    case 'java': return 'e.g. 21, 17';
    case 'go': return 'e.g. 1.21.0, 1.22.0';
    default: return 'e.g. 1.0.0';
  }
}

export function deactivate() {
  disposeStatusBar();
  disposeTerminal();
  disposeOutputChannel();
}
