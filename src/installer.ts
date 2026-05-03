import * as path from 'path';
import * as fs from 'fs-extra';
import axios from 'axios';
import * as tar from 'tar';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import {
  cacheDir,
  venvDir,
  venvBinDir,
  runtimeDir,
  runtimeBinDir,
  isWindows,
  logSuccess,
  logInfo,
  logWarn,
  logError,
  formatBytes,
} from './utils';
import { getRuntimeInfo, resolveDownloadUrl } from './runtimes/index';

// ── Main Install Function ───────────────────────────────────────────────────

export async function installRuntime(
  name: string,
  version: string,
  cwd?: string
): Promise<void> {
  const destDir = runtimeDir(name, version, cwd);
  const binDir = runtimeBinDir(name, version, cwd);
  const info = getRuntimeInfo(name, version);

  // Check if already installed
  if (await fs.pathExists(destDir)) {
    const binPath = path.join(binDir, info.binaryName);
    if (await fs.pathExists(binPath)) {
      logInfo(`${chalk.bold(name)}@${chalk.bold(version)} is already installed.`);
      if (name === 'python') {
        await setupPythonVenv(binPath, cwd);
      }
      return;
    }
    // Directory exists but binary is missing — re-install
    logInfo(`Existing installation appears broken. Re-installing...`);
    await fs.remove(destDir);
  }

  // Resolve the download URL (may need async resolution for Python)
  logInfo(`Resolving download URL for ${chalk.bold(name)}@${chalk.bold(version)}...`);
  const downloadUrl = await resolveDownloadUrl(name, version, info);

  // Check cache
  const cache = cacheDir(cwd);
  await fs.ensureDir(cache);
  const cachedArchive = path.join(cache, info.archiveName);

  if (await fs.pathExists(cachedArchive)) {
    logInfo(`Using cached archive: ${chalk.dim(info.archiveName)}`);
  } else {
    // Security: Download to a temporary file first, then rename atomically.
    // This prevents partial/corrupt downloads from being treated as valid cache entries.
    const tempArchive = cachedArchive + '.download';
    try {
      await downloadFile(downloadUrl, tempArchive, name, version);
      await fs.rename(tempArchive, cachedArchive);
    } catch (err) {
      // Clean up partial download on failure
      await fs.remove(tempArchive).catch(() => {});
      throw err;
    }

    // TODO: Verify SHA256 checksum against the source's published checksums.
    // Each runtime source provides checksums:
    //   - Node.js: https://nodejs.org/dist/vX.Y.Z/SHASUMS256.txt
    //   - Python:  sha256 in GitHub release asset names
    //   - Java:    Adoptium API provides checksum endpoints
    //   - Go:      https://go.dev/dl/ provides sha256
    // This should be implemented to prevent tampered archive execution.
    logWarn('Checksum verification is not yet implemented. Downloaded archives are not integrity-checked.');
  }

  // Extract
  logInfo(`Extracting ${chalk.bold(name)}@${chalk.bold(version)}...`);
  await fs.ensureDir(destDir);
  await extractArchive(cachedArchive, destDir, info.stripLevel);

  // Verify binary
  const binPath = findBinary(destDir, info.binaryName);
  if (!binPath) {
    logError(
      `Binary "${info.binaryName}" not found after extraction. ` +
      `The archive format may have changed. Try cleaning and reinstalling.`
    );
    process.exit(1);
  }

  // Make binary executable on Unix
  if (!isWindows()) {
    await fs.chmod(binPath, 0o755);
  }

  logSuccess(
    `${chalk.bold(name)}@${chalk.bold(version)} installed → ${chalk.dim(path.relative(process.cwd(), destDir))}`
  );

  if (name === 'python') {
    await setupPythonVenv(binPath, cwd);
  }
}

// ── Python Venv Setup ───────────────────────────────────────────────────────

async function setupPythonVenv(pythonExecutable: string, cwd?: string): Promise<void> {
  const venvPath = venvDir(cwd);
  
  if (!(await fs.pathExists(venvPath))) {
    logInfo('Creating Python virtual environment...');
    await runProcess(pythonExecutable, ['-m', 'venv', venvPath], cwd);
    logSuccess(`Virtual environment created → ${chalk.dim(path.relative(process.cwd(), venvPath))}`);
  }

  const reqPath = path.resolve(cwd || process.cwd(), 'requirements.txt');
  if (await fs.pathExists(reqPath)) {
    logInfo('Found requirements.txt, checking dependencies...');
    const pipExe = path.join(venvBinDir(cwd), isWindows() ? 'pip.exe' : 'pip');
    
    try {
      await runProcess(pipExe, ['install', '-r', 'requirements.txt'], cwd);
      logSuccess('Dependencies installed successfully.');
    } catch (err: any) {
      logError(`Failed to install requirements: ${err.message}`);
    }
  }
}

function runProcess(executable: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const child = spawn(executable, args, {
      cwd: cwd || process.cwd(),
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code: number) => {
      if (code !== 0) {
        reject(new Error(`Process exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

// ── Download File ───────────────────────────────────────────────────────────

async function downloadFile(
  url: string,
  dest: string,
  name: string,
  version: string
): Promise<void> {
  logInfo(`Downloading ${chalk.bold(name)}@${chalk.bold(version)}...`);
  logInfo(`URL: ${chalk.dim(url)}`);

  const response = await axios.get(url, {
    responseType: 'stream',
    maxRedirects: 10,
    headers: {
      'User-Agent': 'containless-cli',
    },
  });

  const totalLength = parseInt(response.headers['content-length'] || '0', 10);

  const bar = new cliProgress.SingleBar(
    {
      format: `  ${chalk.cyan('{bar}')} ${chalk.bold('{percentage}%')} | ${chalk.dim('{value}/{total}')} | {speed}`,
      barCompleteChar: '█',
      barIncompleteChar: '░',
      hideCursor: true,
    },
    cliProgress.Presets.shades_classic
  );

  if (totalLength > 0) {
    bar.start(totalLength, 0, { speed: '...' });
  } else {
    process.stdout.write(chalk.dim('  Downloading (size unknown)... '));
  }

  const writer = fs.createWriteStream(dest);
  let downloaded = 0;
  const startTime = Date.now();

  return new Promise<void>((resolve, reject) => {
    response.data.on('data', (chunk: Buffer) => {
      downloaded += chunk.length;
      if (totalLength > 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const speed = elapsed > 0 ? formatBytes(downloaded / elapsed) + '/s' : '...';
        bar.update(downloaded, { speed });
      }
    });

    response.data.pipe(writer);

    writer.on('finish', () => {
      if (totalLength > 0) {
        bar.stop();
      } else {
        process.stdout.write(chalk.green('done') + ` (${formatBytes(downloaded)})\n`);
      }
      resolve();
    });

    writer.on('error', (err: Error) => {
      if (totalLength > 0) bar.stop();
      reject(err);
    });

    response.data.on('error', (err: Error) => {
      if (totalLength > 0) bar.stop();
      reject(err);
    });
  });
}

// ── Extract Archive ─────────────────────────────────────────────────────────

async function extractArchive(
  archivePath: string,
  destDir: string,
  stripLevel: number
): Promise<void> {
  if (archivePath.endsWith('.zip')) {
    await extractZip(archivePath, destDir);
  } else {
    await extractTarGz(archivePath, destDir, stripLevel);
  }
}

async function extractTarGz(
  archivePath: string,
  destDir: string,
  strip: number
): Promise<void> {
  await tar.extract({
    file: archivePath,
    cwd: destDir,
    strip,
  });
}

async function extractZip(archivePath: string, destDir: string): Promise<void> {
  const unzipper = await import('unzipper');
  const zip = fs.createReadStream(archivePath).pipe(unzipper.Parse({ forceStream: true }));
  const resolvedDest = path.resolve(destDir);

  for await (const entry of zip) {
    const entryPath: string = entry.path;
    const type: string = entry.type;

    // Strip the top-level directory from the path
    const parts = entryPath.split(/[/\\]/);
    const stripped = parts.slice(1).join(path.sep);

    if (!stripped) {
      entry.autodrain();
      continue;
    }

    const fullPath = path.resolve(destDir, stripped);

    // Security: Prevent ZipSlip / path traversal attacks.
    // Ensure the resolved path is within the intended destination directory.
    if (!fullPath.startsWith(resolvedDest + path.sep) && fullPath !== resolvedDest) {
      entry.autodrain();
      throw new Error(
        `Zip entry "${entryPath}" resolves outside the target directory (path traversal detected). Aborting extraction.`
      );
    }

    if (type === 'Directory') {
      await fs.ensureDir(fullPath);
      entry.autodrain();
    } else {
      await fs.ensureDir(path.dirname(fullPath));
      entry.pipe(fs.createWriteStream(fullPath));
      await new Promise<void>((resolve, reject) => {
        entry.on('end', resolve);
        entry.on('error', reject);
      });
    }
  }
}

// ── Find Binary ─────────────────────────────────────────────────────────────

/**
 * Recursively search for a binary file within the extracted directory.
 * This handles cases where the directory structure may vary.
 */
function findBinary(dir: string, binaryName: string): string | null {
  // First, check the standard bin/ path
  const standardPaths = [
    path.join(dir, 'bin', binaryName),
    path.join(dir, binaryName),
    // macOS Java layout
    path.join(dir, 'Contents', 'Home', 'bin', binaryName),
    // Windows Python layout
    path.join(dir, 'python.exe'),
    // Windows may have binaries at root level within the extracted dir
  ];

  for (const p of standardPaths) {
    if (fs.existsSync(p)) return p;
  }

  // Walk the bin/ directories if present
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const binPath = path.join(dir, entry.name, 'bin', binaryName);
        if (fs.existsSync(binPath)) return binPath;

        // Check macOS java layout
        const macJavaPath = path.join(dir, entry.name, 'Contents', 'Home', 'bin', binaryName);
        if (fs.existsSync(macJavaPath)) return macJavaPath;
      }
    }
  } catch {
    // ignore
  }

  return null;
}
