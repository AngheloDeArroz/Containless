import { getPlatform, getArch, isWindows, type Platform, type Arch } from '../utils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMajorMinor(version: string): string {
  const parts = version.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return version;
}

// ── Download URL ─────────────────────────────────────────────────────────────

/**
 * PHP binaries are sourced from:
 *   - Windows: https://windows.php.net/downloads/releases/ (NTS builds)
 *   - Linux:   https://github.com/shivammathur/php-builder
 *   - macOS:   https://github.com/shivammathur/php-builder-macos
 *
 * The actual URL must be resolved asynchronously because:
 *   - On Windows, the VS compiler version (vs16/vs17) depends on the PHP version.
 *   - On Linux/macOS, we query the GitHub API to find a matching release asset.
 */
export function getPhpDownloadUrl(version: string): string {
  return `RESOLVE_PHP:${version}`;
}

export async function resolvePhpDownloadUrl(version: string): Promise<string> {
  const platform = getPlatform();
  const arch = getArch();

  if (platform === 'win32') {
    return resolveWindowsPhpUrl(version);
  }
  return resolveUnixPhpUrl(version, platform, arch);
}

/**
 * Resolve a Windows PHP NTS binary from windows.php.net.
 * Tries vs17 (PHP 8.4+) first, then vs16 (PHP 8.0–8.3).
 * Only x64 is officially supported on Windows PHP.
 */
async function resolveWindowsPhpUrl(version: string): Promise<string> {
  const { default: axios } = await import('axios');

  for (const vs of ['vs17', 'vs16']) {
    const url = `https://windows.php.net/downloads/releases/php-${version}-nts-Win32-${vs}-x64.zip`;
    try {
      const res = await axios.head(url, {
        timeout: 10000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'Containless-CLI' },
      });
      if (res.status === 200) return url;
    } catch {
      // Try next VS version
    }
  }

  throw new Error(
    `Could not find PHP ${version} NTS binary for Windows. ` +
    `Check available versions at https://windows.php.net/downloads/releases/`
  );
}

/**
 * Resolve a Linux/macOS PHP binary from shivammathur/php-builder GitHub releases.
 * Asset naming convention: php{major}{minor}-{os}-{arch}.tar.gz
 */
async function resolveUnixPhpUrl(version: string, platform: Platform, arch: Arch): Promise<string> {
  const { default: axios } = await import('axios');
  const majorMinor = getMajorMinor(version);
  const mmNoDot = majorMinor.replace('.', ''); // e.g. "8.3" → "83"
  const repo = platform === 'darwin'
    ? 'shivammathur/php-builder-macos'
    : 'shivammathur/php-builder';
  const archStr = arch === 'arm64' ? 'arm64' : 'x86_64';

  let release: any = null;
  let attempts = 0;

  while (attempts < 3) {
    try {
      const res = await axios.get(
        `https://api.github.com/repos/${repo}/releases/latest`,
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Containless-CLI',
          },
          timeout: 15000,
        }
      );
      release = res.data;
      break;
    } catch (error: any) {
      attempts++;
      if (attempts >= 3) {
        throw new Error(`GitHub API request failed after 3 attempts: ${error.message}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  // Match by major.minor (both compact and dotted forms) and architecture
  for (const asset of release.assets as { name: string; browser_download_url: string }[]) {
    const n = asset.name;
    if (
      (n.includes(`php${mmNoDot}`) || n.includes(`php-${majorMinor}`)) &&
      n.includes(archStr) &&
      n.endsWith('.tar.gz')
    ) {
      return asset.browser_download_url;
    }
  }

  throw new Error(
    `Could not find PHP ${majorMinor} binary for ${platform}/${archStr}. ` +
    `Check https://github.com/${repo}/releases`
  );
}

// ── Archive Name (cache key) ─────────────────────────────────────────────────

export function getPhpArchiveName(version: string): string {
  const platform = getPlatform();
  const arch = getArch();
  const ext = isWindows() ? 'zip' : 'tar.gz';
  const archStr = arch === 'arm64' ? 'arm64' : 'x86_64';
  const os = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux';
  return `php-${version}-${os}-${archStr}.${ext}`;
}

// ── Binary Path ──────────────────────────────────────────────────────────────

export function getPhpBinaryName(): string {
  return isWindows() ? 'php.exe' : 'php';
}

/**
 * PHP archives extract files directly to the root (no top-level wrapper directory).
 * - Windows (windows.php.net ZIP): php.exe is at the archive root.
 * - Linux/macOS (shivammathur): php binary is at the archive root.
 */
export const PHP_STRIP_LEVEL = 0;
