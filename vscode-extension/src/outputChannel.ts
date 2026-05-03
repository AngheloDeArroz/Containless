import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

/**
 * Get or create the shared Containless output channel.
 * All modules should use this single channel for logging.
 */
export function getOutputChannel(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('Containless');
  }
  return channel;
}

export function logInfo(message: string): void {
  const ch = getOutputChannel();
  ch.appendLine(`[INFO] ${message}`);
}

export function logError(message: string): void {
  const ch = getOutputChannel();
  ch.appendLine(`[ERROR] ${message}`);
}

export function logCommand(command: string): void {
  const ch = getOutputChannel();
  ch.appendLine(`[CMD] $ ${command}`);
}

export function showAndLog(message: string): void {
  const ch = getOutputChannel();
  ch.appendLine(`[INFO] ${message}`);
  ch.show(true);
}

export function disposeOutputChannel(): void {
  if (channel) {
    channel.dispose();
    channel = undefined;
  }
}
