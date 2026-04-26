import * as path from 'path';
import * as fs from 'fs';

export interface DetectedRuntimes {
  [runtimeName: string]: string; // runtime name -> version
}

export class RuntimeDetector {
  private workspaceRoot: string;
  private containlessDir: string;
  private runtimesDir: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.containlessDir = path.join(workspaceRoot, '.containless');
    this.runtimesDir = path.join(this.containlessDir, 'runtimes');
  }

  /**
   * Detect installed runtimes by scanning the .containless/runtimes directory
   * Looks for directories matching the pattern: {runtime}-{version}
   */
  async detectInstalledRuntimes(): Promise<DetectedRuntimes> {
    const runtimes: DetectedRuntimes = {};

    if (!fs.existsSync(this.runtimesDir)) {
      return runtimes;
    }

    try {
      const entries = fs.readdirSync(this.runtimesDir);

      for (const entry of entries) {
        const match = entry.match(/^(node|python|java|go)-(.+)$/);
        if (match) {
          const [, name, version] = match;
          const fullPath = path.join(this.runtimesDir, entry);

          // Verify it's actually a directory
          if (fs.statSync(fullPath).isDirectory()) {
            runtimes[name] = version;
          }
        }
      }
    } catch (error) {
      throw new Error(`Failed to scan runtimes directory: ${error instanceof Error ? error.message : String(error)}`);
    }

    return runtimes;
  }

  /**
   * Get the binary path for a specific runtime
   */
  getRuntimeBinPath(runtime: string, version: string): string {
    const runtimePath = path.join(this.runtimesDir, `${runtime}-${version}`);
    const isWindows = process.platform === 'win32';

    switch (runtime) {
      case 'node':
        // Node.js binary is at root on Windows, in bin/ on Unix
        return isWindows ? runtimePath : path.join(runtimePath, 'bin');

      case 'python':
        // Python binary is at root on Windows, in bin/ on Unix
        return isWindows ? runtimePath : path.join(runtimePath, 'bin');

      case 'java':
        // Java bin path
        if (process.platform === 'darwin') {
          return path.join(runtimePath, 'Contents', 'Home', 'bin');
        }
        return path.join(runtimePath, 'bin');

      case 'go':
        // Go bin path (always has bin subdirectory)
        return path.join(runtimePath, 'bin');

      default:
        return path.join(runtimePath, 'bin');
    }
  }

  /**
   * Get the full path to a runtime executable
   */
  getRuntimeExecutable(runtime: string, version: string): string {
    const binPath = this.getRuntimeBinPath(runtime, version);
    const isWindows = process.platform === 'win32';

    switch (runtime) {
      case 'node':
        return path.join(binPath, isWindows ? 'node.exe' : 'node');

      case 'python':
        return path.join(binPath, isWindows ? 'python.exe' : 'python');

      case 'java':
        return path.join(binPath, isWindows ? 'java.exe' : 'java');

      case 'go':
        return path.join(binPath, isWindows ? 'go.exe' : 'go');

      default:
        return path.join(binPath, runtime);
    }
  }
}
