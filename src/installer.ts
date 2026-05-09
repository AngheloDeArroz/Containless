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

  if (name === 'php') {
    await setupPhpIni(destDir);
    await setupPhpComposer(binPath, cwd);
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

// ── PHP INI Setup ──────────────────────────────────────────────────────

/**
 * Create a php.ini in the PHP runtime directory if one does not already exist.
 *
 * Windows NTS builds from windows.php.net extract with NO php.ini — only the
 * template files php.ini-development and php.ini-production. Without a php.ini,
 * PHP loads zero extensions, which causes:
 *   • Composer to fail:  "The openssl extension is required for SSL/TLS"
 *   • `php artisan serve` to fail to bind on any port  (reason: ?) because
 *     the socket/SSL layer cannot initialize without the openssl extension.
 *
 * PHP automatically searches for php.ini in the directory of the binary, so
 * placing the file in destDir (where php.exe lives) is sufficient.
 *
 * On Linux/macOS, shivammathur builds have extensions compiled in, so we only
 * write a minimal settings file without extension_dir.
 */
async function setupPhpIni(destDir: string): Promise<void> {
  const phpIniPath = path.join(destDir, 'php.ini');

  // Never overwrite a user-managed or previously generated php.ini
  if (await fs.pathExists(phpIniPath)) {
    logInfo('php.ini already exists — skipping auto-generation.');
    return;
  }

  let iniContent: string;

  if (isWindows()) {
    // Dynamically discover which extensions have DLL files in ext/.
    //
    // PHP 8.x compiles many extensions (pdo, dom, xml, simplexml, bcmath,
    // xmlwriter, tokenizer, ctype, json …) directly into the binary — they
    // have NO corresponding .dll in ext/. Trying to load them via extension=
    // produces "Unable to load dynamic library" startup warnings.
    //
    // By scanning what actually exists in ext/ we only emit extension= lines
    // for DLLs that are physically present, so the ini is correct across all
    // PHP versions without a manually maintained allow-list.
    const extDir = path.join(destDir, 'ext');
    const extensionLines: string[] = [];

    if (await fs.pathExists(extDir)) {
      // Ordered list of extensions we want to enable (if available).
      // Order matters: some extensions depend on others (e.g. pdo_sqlite → pdo).
      const WANTED = [
        // Composer requirements
        'openssl', 'curl', 'mbstring',
        // Laravel / Symfony / WordPress requirements
        'fileinfo', 'pdo_sqlite', 'pdo_mysql', 'pdo_pgsql', 'sqlite3',
        // Commonly needed extras
        'gd', 'zip', 'intl', 'exif', 'sodium', 'imap', 'ldap', 'xsl',
      ];

      // Build a set of lowercase DLL basenames present in ext/
      const dllFiles = new Set(
        (await fs.readdir(extDir))
          .filter(f => f.toLowerCase().endsWith('.dll'))
          .map(f => f.toLowerCase())
      );

      for (const ext of WANTED) {
        // PHP names the DLL php_<extname>.dll
        if (dllFiles.has(`php_${ext}.dll`)) {
          extensionLines.push(`extension=${ext}`);
        }
      }
    }

    const lines = [
      '; php.ini — generated by Containless',
      '; Only extensions whose DLL files were found in ext/ are enabled.',
      '; Add project-specific PHP settings below or override in your own php.ini.',
      '',
      'extension_dir = "ext"',
      '',
      ...extensionLines,
      '',
      '; ====== Runtime settings ======',
      'date.timezone = UTC',
      'memory_limit = 512M',
      'upload_max_filesize = 64M',
      'post_max_size = 64M',
    ];
    iniContent = lines.join('\r\n');
  } else {
    // Linux/macOS: shivammathur builds compile extensions in — no extension_dir needed.
    const lines = [
      '; php.ini — generated by Containless',
      'date.timezone = UTC',
      'memory_limit = 512M',
      'upload_max_filesize = 64M',
      'post_max_size = 64M',
    ];
    iniContent = lines.join('\n');
  }

  await fs.writeFile(phpIniPath, iniContent, 'utf-8');
  logSuccess('Created php.ini with extension configuration.');
}

// ── PHP Composer Setup ──────────────────────────────────────────────────────

async function setupPhpComposer(phpExecutable: string, cwd?: string): Promise<void> {
  const composerJsonPath = path.resolve(cwd || process.cwd(), 'composer.json');
  if (!(await fs.pathExists(composerJsonPath))) return;

  // Download Composer PHAR if not already cached
  const cache = cacheDir(cwd);
  await fs.ensureDir(cache);
  const composerPhar = path.join(cache, 'composer.phar');

  if (!(await fs.pathExists(composerPhar))) {
    logInfo('Downloading Composer...');
    const tempPhar = composerPhar + '.download';
    try {
      await downloadFile('https://getcomposer.org/composer-stable.phar', tempPhar, 'composer', 'stable');
      await fs.rename(tempPhar, composerPhar);
    } catch (err) {
      await fs.remove(tempPhar).catch(() => {});
      logWarn('Failed to download Composer. Skipping dependency installation.');
      return;
    }
  }

  // Inject the directory containing the sandboxed php binary into PATH so that
  // Composer scripts and PHP sub-processes find the correct runtime.
  const phpBinDir = path.dirname(phpExecutable);
  const sep = isWindows() ? ';' : ':';
  const sandboxEnv = {
    ...process.env,
    PATH: phpBinDir + sep + (process.env.PATH || ''),
    // PHP_BINARY is read by Laravel's artisan serve to locate the runtime for
    // the built-in web-server worker process it spawns.
    PHP_BINARY: phpExecutable,
  };

  logInfo('Found composer.json, checking dependencies...');
  try {
    await runProcess(phpExecutable, [composerPhar, 'install', '--no-interaction'], cwd, sandboxEnv);
    logSuccess('Composer dependencies installed successfully.');
  } catch (err: any) {
    logError(`Failed to install Composer dependencies: ${err.message}`);
  }
}

function runProcess(
  executable: string,
  args: string[],
  cwd?: string,
  env?: NodeJS.ProcessEnv
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const child = spawn(executable, args, {
      cwd: cwd || process.cwd(),
      stdio: 'inherit',
      // Use a custom environment if provided (e.g. to inject the sandbox PATH)
      // so child processes spawned by the executable can also find runtimes.
      env: env ?? process.env,
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

  const totalLength = parseInt(String(response.headers['content-length'] ?? '0'), 10);

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
    await extractZip(archivePath, destDir, stripLevel);
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

async function extractZip(archivePath: string, destDir: string, stripLevel: number = 1): Promise<void> {
  const unzipper = await import('unzipper');
  const zip = fs.createReadStream(archivePath).pipe(unzipper.Parse({ forceStream: true }));
  const resolvedDest = path.resolve(destDir);

  for await (const entry of zip) {
    const entryPath: string = entry.path;
    const type: string = entry.type;

    // Strip the specified number of leading directory components
    const parts = entryPath.split(/[/\\]/);
    const stripped = parts.slice(stripLevel).join(path.sep);

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
