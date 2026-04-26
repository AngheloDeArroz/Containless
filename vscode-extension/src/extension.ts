import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RuntimeDetector } from './runtimeDetector';
import { SettingsManager } from './settingsManager';

let detector: RuntimeDetector;
let settingsManager: SettingsManager;

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  
  if (!workspaceFolders) {
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const containlessJsonPath = path.join(workspaceRoot, 'containless.json');

  // Check if this workspace has a containless.json
  if (!fs.existsSync(containlessJsonPath)) {
    return;
  }

  detector = new RuntimeDetector(workspaceRoot);
  settingsManager = new SettingsManager(workspaceRoot);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('containless.detectRuntimes', async () => {
      await detectAndConfigureRuntimes();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('containless.resetRuntimes', async () => {
      await settingsManager.resetToGlobal();
      vscode.window.showInformationMessage('Runtimes reset to global defaults');
    })
  );

  // Auto-detect and configure on activation
  await detectAndConfigureRuntimes();

  // Watch for changes to containless.json
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceRoot, 'containless.json')
  );

  watcher.onDidChange(async () => {
    vscode.window.showInformationMessage('containless.json changed, re-detecting runtimes...');
    await detectAndConfigureRuntimes();
  });

  context.subscriptions.push(watcher);
}

async function detectAndConfigureRuntimes() {
  try {
    const runtimes = await detector.detectInstalledRuntimes();

    if (Object.keys(runtimes).length === 0) {
      vscode.window.showWarningMessage(
        'No Containless runtimes detected. Have you run "containless run" yet?'
      );
      return;
    }

    await settingsManager.configureRuntimes(runtimes);

    const runtimeList = Object.entries(runtimes)
      .map(([name, version]) => `${name}@${version}`)
      .join(', ');

    vscode.window.showInformationMessage(
      `Containless: Sandbox active — using local runtimes (${runtimeList})`
    );
  } catch (error) {
    vscode.window.showErrorMessage(
      `Containless: Failed to detect runtimes - ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export function deactivate() {}
