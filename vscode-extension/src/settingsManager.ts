import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { RuntimeDetector, DetectedRuntimes } from './runtimeDetector';

/**
 * Extension IDs for third-party extensions whose configuration keys we write.
 * We must check these are installed before updating their settings, otherwise
 * VS Code rejects the write because the key is not registered.
 */
const EXT_PYTHON  = 'ms-python.python';
const EXT_ESLINT  = 'dbaeumer.vscode-eslint';
const EXT_JAVA    = 'redhat.java';
const EXT_GO      = 'golang.go';
const EXT_PHP     = 'bmewburn.vscode-intelephense-client';
const EXT_RUBY    = 'Shopify.ruby-lsp';

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

    // Configure Python (only if the Python extension is installed)
    if (runtimes.python && this.isExtensionInstalled(EXT_PYTHON)) {
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

      // Point ESLint to use the local Node.js runtime (only if ESLint extension is installed)
      if (this.isExtensionInstalled(EXT_ESLINT)) {
        await config.update('eslint.runtime', nodeExe, vscode.ConfigurationTarget.Workspace);
      }
      // Note: Node.js PATH is injected into the integrated terminal via updateTerminalPath(),
      // which is the correct mechanism. npm.binPath is not a registered VS Code configuration.
    }

    // Configure Java (only if the Java extension is installed)
    if (runtimes.java && this.isExtensionInstalled(EXT_JAVA)) {
      const javaHome = path.join(this.workspaceRoot, '.containless', 'runtimes', `java-${runtimes.java}`);

      // Handle macOS layout where Java home is nested
      const macJavaHome = path.join(javaHome, 'Contents', 'Home');
      const effectiveJavaHome = (process.platform === 'darwin' && fs.existsSync(macJavaHome))
        ? macJavaHome
        : javaHome;

      // For VS Code Java extension (Extension Pack for Java)
      await config.update('java.jdt.ls.java.home', effectiveJavaHome, vscode.ConfigurationTarget.Workspace);
    }

    // Configure Go (only if the Go extension is installed)
    if (runtimes.go && this.isExtensionInstalled(EXT_GO)) {
      const goExe = this.detector.getRuntimeExecutable('go', runtimes.go);
      const goRoot = path.join(this.workspaceRoot, '.containless', 'runtimes', `go-${runtimes.go}`);

      // go.goroot tells the Go extension where the Go SDK lives
      await config.update('go.goroot', goRoot, vscode.ConfigurationTarget.Workspace);
      // go.alternateTools lets the Go extension find the exact binary
      await config.update('go.alternateTools', { go: goExe }, vscode.ConfigurationTarget.Workspace);
    }

    // Configure PHP (only if the Intelephense extension is installed)
    if (runtimes.php && this.isExtensionInstalled(EXT_PHP)) {
      const phpExe = this.detector.getRuntimeExecutable('php', runtimes.php);
      // Intelephense uses php.executablePath to locate the PHP binary for diagnostics
      await config.update('php.validate.executablePath', phpExe, vscode.ConfigurationTarget.Workspace);
      await config.update('intelephense.environment.phpVersion', runtimes.php, vscode.ConfigurationTarget.Workspace);
    }

    // Configure Ruby (only if the Ruby LSP extension is installed)
    if (runtimes.ruby && this.isExtensionInstalled(EXT_RUBY)) {
      const rubyExe = this.detector.getRuntimeExecutable('ruby', runtimes.ruby);
      // Ruby LSP uses rubyLsp.rubyExecutablePath to locate the ruby binary
      await config.update('rubyLsp.rubyExecutablePath', rubyExe, vscode.ConfigurationTarget.Workspace);
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

      // PHP_BINARY must be set explicitly so that `php artisan serve` spawns its
      // built-in web-server worker with the sandboxed PHP, not a globally installed
      // one. Laravel reads this env var when forking the server worker process.
      // This is independent of any editor extension (Intelephense, etc.).
      if (runtimes.php) {
        currentEnv['PHP_BINARY'] = this.detector.getRuntimeExecutable('php', runtimes.php);
      } else {
        // PHP was not detected this cycle — clear any stale value
        delete currentEnv['PHP_BINARY'];
      }

      // GEM_HOME / GEM_PATH must point to the Containless-managed gems directory
      // so that `bundle exec`, `rails`, and `gem install` all use the sandbox.
      if (runtimes.ruby) {
        const rubyRuntimePath = path.join(this.workspaceRoot, '.containless', 'runtimes', `ruby-${runtimes.ruby}`);
        const gemHome = path.join(rubyRuntimePath, 'lib', 'ruby', 'gems');
        currentEnv['GEM_HOME'] = gemHome;
        currentEnv['GEM_PATH'] = gemHome;
      } else {
        delete currentEnv['GEM_HOME'];
        delete currentEnv['GEM_PATH'];
      }

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

    // Reset Python (only if the extension is installed)
    if (this.isExtensionInstalled(EXT_PYTHON)) {
      await config.update('python.defaultInterpreterPath', undefined, vscode.ConfigurationTarget.Workspace);
    }

    // Reset Node.js (ESLint only — npm.binPath is not a registered VS Code configuration)
    if (this.isExtensionInstalled(EXT_ESLINT)) {
      await config.update('eslint.runtime', undefined, vscode.ConfigurationTarget.Workspace);
    }

    // Reset Java (only if the extension is installed)
    if (this.isExtensionInstalled(EXT_JAVA)) {
      await config.update('java.jdt.ls.java.home', undefined, vscode.ConfigurationTarget.Workspace);
    }

    // Reset Go (only if the extension is installed)
    if (this.isExtensionInstalled(EXT_GO)) {
      await config.update('go.goroot', undefined, vscode.ConfigurationTarget.Workspace);
      await config.update('go.alternateTools', undefined, vscode.ConfigurationTarget.Workspace);
    }

    // Reset PHP (only if the Intelephense extension is installed)
    if (this.isExtensionInstalled(EXT_PHP)) {
      await config.update('php.validate.executablePath', undefined, vscode.ConfigurationTarget.Workspace);
      await config.update('intelephense.environment.phpVersion', undefined, vscode.ConfigurationTarget.Workspace);
    }

    // Reset Ruby (only if the Ruby LSP extension is installed)
    if (this.isExtensionInstalled(EXT_RUBY)) {
      await config.update('rubyLsp.rubyExecutablePath', undefined, vscode.ConfigurationTarget.Workspace);
    }

    // Reset terminal PATH and PHP_BINARY for all platforms
    const envConfig = vscode.workspace.getConfiguration('terminal.integrated.env', vscode.Uri.file(this.workspaceRoot));
    for (const platformKey of ['windows', 'linux', 'osx']) {
      const currentEnv = envConfig.get<Record<string, string>>(platformKey);
      if (currentEnv && (currentEnv['PATH'] || currentEnv['PHP_BINARY'] || currentEnv['GEM_HOME'])) {
        delete currentEnv['PATH'];
        delete currentEnv['PHP_BINARY'];
        delete currentEnv['GEM_HOME'];
        delete currentEnv['GEM_PATH'];
        const newValue = Object.keys(currentEnv).length > 0 ? currentEnv : undefined;
        await envConfig.update(platformKey, newValue, vscode.ConfigurationTarget.Workspace);
      }
    }
  }

  /**
   * Check whether a VS Code extension is currently installed.
   * Used to avoid writing configuration keys that are only registered
   * by specific extensions — VS Code rejects updates for unregistered keys.
   */
  private isExtensionInstalled(extensionId: string): boolean {
    return vscode.extensions.getExtension(extensionId) !== undefined;
  }
}
