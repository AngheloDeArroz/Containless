import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RuntimeDetector, DetectedRuntimes } from './runtimeDetector';

export class SettingsManager {
  private workspaceRoot: string;
  private detector: RuntimeDetector;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.detector = new RuntimeDetector(workspaceRoot);
  }

  /**
   * Configure VS Code workspace settings to use the detected Containless runtimes.
   * This makes the project a true sandbox — all tools (terminal, extensions, debuggers)
   * use the local runtimes instead of any global installation.
   */
  async configureRuntimes(runtimes: DetectedRuntimes): Promise<void> {
    const config = vscode.workspace.getConfiguration(undefined, vscode.Uri.file(this.workspaceRoot));

    // Configure Python
    if (runtimes.python) {
      const pythonExe = this.detector.getRuntimeExecutable('python', runtimes.python);
      await config.update('python.defaultInterpreterPath', pythonExe, vscode.ConfigurationTarget.Workspace);

      // Also configure the venv interpreter if it exists
      const venvPythonExe = this.getVenvExecutable('python');
      if (venvPythonExe && fs.existsSync(venvPythonExe)) {
        // Prefer the venv interpreter since it has installed packages
        await config.update('python.defaultInterpreterPath', venvPythonExe, vscode.ConfigurationTarget.Workspace);
      }
    }

    // Configure Node.js
    if (runtimes.node) {
      const nodeExe = this.detector.getRuntimeExecutable('node', runtimes.node);
      const nodeBinDir = this.detector.getRuntimeBinPath('node', runtimes.node);

      // Point ESLint and other extensions to use the local Node.js runtime
      await config.update('eslint.runtime', nodeExe, vscode.ConfigurationTarget.Workspace);

      // Set the Node.js path for extensions that look for it
      await config.update('npm.binPath', nodeBinDir, vscode.ConfigurationTarget.Workspace);
    }

    // Configure Java
    if (runtimes.java) {
      const javaHome = path.join(this.workspaceRoot, '.containless', 'runtimes', `java-${runtimes.java}`);

      // Handle macOS layout where Java home is nested
      const macJavaHome = path.join(javaHome, 'Contents', 'Home');
      const effectiveJavaHome = (process.platform === 'darwin' && fs.existsSync(macJavaHome))
        ? macJavaHome
        : javaHome;

      // For VS Code Java extension (Extension Pack for Java)
      await config.update('java.jdt.ls.java.home', effectiveJavaHome, vscode.ConfigurationTarget.Workspace);
    }

    // Configure Go
    if (runtimes.go) {
      const goExe = this.detector.getRuntimeExecutable('go', runtimes.go);
      const goRoot = path.join(this.workspaceRoot, '.containless', 'runtimes', `go-${runtimes.go}`);

      // go.goroot tells the Go extension where the Go SDK lives
      await config.update('go.goroot', goRoot, vscode.ConfigurationTarget.Workspace);
      // go.alternateTools lets the Go extension find the exact binary
      await config.update('go.alternateTools', { go: goExe }, vscode.ConfigurationTarget.Workspace);
    }

    // Update terminal PATH to include all runtime bin directories
    await this.updateTerminalPath(runtimes);
  }

  /**
   * Update the VS Code integrated terminal environment to prepend Containless
   * runtime bin directories to PATH. This is the key piece that makes the
   * terminal act as a sandbox — any command run in the terminal will find
   * the local runtime binaries first.
   *
   * Uses platform-specific settings:
   *   terminal.integrated.env.windows
   *   terminal.integrated.env.linux
   *   terminal.integrated.env.osx
   */
  private async updateTerminalPath(runtimes: DetectedRuntimes): Promise<void> {
    const platform = process.platform;
    const pathSeparator = platform === 'win32' ? ';' : ':';

    // Determine the correct platform key for terminal.integrated.env.{platform}
    let platformKey: string;
    switch (platform) {
      case 'win32':
        platformKey = 'windows';
        break;
      case 'darwin':
        platformKey = 'osx';
        break;
      default:
        platformKey = 'linux';
        break;
    }

    // Build list of runtime bin paths
    const binPaths: string[] = [];
    for (const [runtime, version] of Object.entries(runtimes)) {
      const binPath = this.detector.getRuntimeBinPath(runtime, version);
      binPaths.push(binPath);
    }

    // Add Python venv bin path if it exists (prepend so venv takes priority)
    if (runtimes.python) {
      const venvBin = this.getVenvBinDir();
      if (venvBin && fs.existsSync(venvBin)) {
        binPaths.unshift(venvBin);
      }
    }

    if (binPaths.length > 0) {
      // Get the terminal.integrated.env section and update the platform-specific object
      const config = vscode.workspace.getConfiguration('terminal.integrated.env', vscode.Uri.file(this.workspaceRoot));
      const currentEnv = config.get<Record<string, string>>(platformKey) || {};

      // ${env:PATH} is a VS Code terminal variable that resolves to the current PATH
      currentEnv['PATH'] = binPaths.join(pathSeparator) + pathSeparator + '${env:PATH}';
      await config.update(platformKey, currentEnv, vscode.ConfigurationTarget.Workspace);
    }
  }

  /**
   * Get the Python venv bin directory path.
   * Returns the path to .containless/venv/Scripts (Windows) or .containless/venv/bin (Unix).
   */
  private getVenvBinDir(): string | null {
    const venvPath = path.join(this.workspaceRoot, '.containless', 'venv');
    if (!fs.existsSync(venvPath)) {
      return null;
    }

    return process.platform === 'win32'
      ? path.join(venvPath, 'Scripts')
      : path.join(venvPath, 'bin');
  }

  /**
   * Get the Python executable path from the venv.
   */
  private getVenvExecutable(runtime: string): string | null {
    const venvBin = this.getVenvBinDir();
    if (!venvBin) {
      return null;
    }

    const isWindows = process.platform === 'win32';
    switch (runtime) {
      case 'python':
        return path.join(venvBin, isWindows ? 'python.exe' : 'python');
      default:
        return null;
    }
  }

  /**
   * Reset all Containless-managed settings back to global defaults.
   * This removes the sandbox and restores normal VS Code behavior.
   */
  async resetToGlobal(): Promise<void> {
    const config = vscode.workspace.getConfiguration(undefined, vscode.Uri.file(this.workspaceRoot));

    // Reset Python
    await config.update('python.defaultInterpreterPath', undefined, vscode.ConfigurationTarget.Workspace);

    // Reset Node.js
    await config.update('npm.binPath', undefined, vscode.ConfigurationTarget.Workspace);
    await config.update('eslint.runtime', undefined, vscode.ConfigurationTarget.Workspace);

    // Reset Java
    await config.update('java.jdt.ls.java.home', undefined, vscode.ConfigurationTarget.Workspace);

    // Reset Go
    await config.update('go.goroot', undefined, vscode.ConfigurationTarget.Workspace);
    await config.update('go.alternateTools', undefined, vscode.ConfigurationTarget.Workspace);

    // Reset terminal PATH for all platforms
    const envConfig = vscode.workspace.getConfiguration('terminal.integrated.env', vscode.Uri.file(this.workspaceRoot));
    for (const platformKey of ['windows', 'linux', 'osx']) {
      const currentEnv = envConfig.get<Record<string, string>>(platformKey);
      if (currentEnv && currentEnv['PATH']) {
        delete currentEnv['PATH'];
        const newValue = Object.keys(currentEnv).length > 0 ? currentEnv : undefined;
        await envConfig.update(platformKey, newValue, vscode.ConfigurationTarget.Workspace);
      }
    }
  }
}
