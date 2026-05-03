import * as vscode from 'vscode';
import { DetectedRuntimes } from './runtimeDetector';

let statusBarItem: vscode.StatusBarItem | undefined;

/**
 * Create and return the Containless status bar item.
 * It is placed on the left side of the status bar with a medium priority.
 */
export function createStatusBarItem(): vscode.StatusBarItem {
  if (!statusBarItem) {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      50
    );
    statusBarItem.command = 'containless.showQuickPick';
  }
  return statusBarItem;
}

/**
 * Update the status bar to reflect the currently detected runtimes.
 */
export function updateStatusBar(runtimes: DetectedRuntimes): void {
  if (!statusBarItem) {
    return;
  }

  const entries = Object.entries(runtimes);

  if (entries.length === 0) {
    statusBarItem.text = '$(warning) Containless: No runtimes';
    statusBarItem.tooltip = 'No runtimes detected. Click to run commands.';
    statusBarItem.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );
  } else {
    const summary = entries
      .map(([name, version]) => `${name}@${version}`)
      .join(' | ');
    statusBarItem.text = `$(package) Containless: ${summary}`;
    statusBarItem.tooltip = `Active runtimes: ${summary}\nClick for commands`;
    statusBarItem.backgroundColor = undefined;
  }

  statusBarItem.show();
}

/**
 * Hide the status bar item (e.g. when no containless.json exists).
 */
export function hideStatusBar(): void {
  if (statusBarItem) {
    statusBarItem.hide();
  }
}

/**
 * Dispose the status bar item on deactivation.
 */
export function disposeStatusBar(): void {
  if (statusBarItem) {
    statusBarItem.dispose();
    statusBarItem = undefined;
  }
}
