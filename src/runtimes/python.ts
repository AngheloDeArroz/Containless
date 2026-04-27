import { getPlatform, getArch, isWindows, type Platform, type Arch } from '../utils';

// ── Platform/Arch Mapping ───────────────────────────────────────────────────

function mapPlatformArch(p: Platform, a: Arch): string {
  if (p === 'linux' && a === 'x64')    return 'x86_64-unknown-linux-gnu';
  if (p === 'linux' && a === 'arm64')  return 'aarch64-unknown-linux-gnu';
  if (p === 'darwin' && a === 'x64')   return 'x86_64-apple-darwin';
  if (p === 'darwin' && a === 'arm64') return 'aarch64-apple-darwin';
  if (p === 'win32' && a === 'x64')   return 'x86_64-pc-windows-msvc';

  throw new Error(`Unsupported platform/arch for Python: ${p}/${a}`);
}

// ── Download URL ────────────────────────────────────────────────────────────

/**
 * Uses python-build-standalone release assets.
 * Example URL pattern:
 *   https://github.com/indygreg/python-build-standalone/releases/download/
 *     20231002/cpython-3.11.6+20231002-x86_64-unknown-linux-gnu-install_only.tar.gz
 *
 * Since release tags change, we use the GitHub API to find the latest release
 * that contains the requested Python version. This function returns a
 * *pattern* that the installer will resolve at download time.
 */
export function getPythonDownloadUrl(version: string): string {
  const triple = mapPlatformArch(getPlatform(), getArch());
  const ext = isWindows() ? 'tar.gz' : 'tar.gz'; // python-build-standalone also uses tar.gz on Windows

  // We use GitHub releases API to resolve the actual URL at install time.
  // Return a placeholder that the installer knows to resolve via the API.
  return `RESOLVE_PYTHON:${version}:${triple}:${ext}`;
}

/**
 * Resolve the actual download URL from GitHub releases.
 */
export async function resolvePythonDownloadUrl(version: string): Promise<string> {
  const { default: axios } = await import('axios');
  const triple = mapPlatformArch(getPlatform(), getArch());

  // The python-build-standalone project (via astral-sh fork for better reliability) publishes releases:
  // cpython-{version}+{date}-{triple}-install_only.tar.gz
  const apiUrl = 'https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest';

  let latestRelease: any = null;
  let attempts = 0;
  while (attempts < 3) {
    try {
      const response = await axios.get(apiUrl, {
        headers: { 
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Containless-CLI'
        },
        timeout: 15000 // 15s timeout
      });
      latestRelease = response.data;
      break;
    } catch (error: any) {
      attempts++;
      if (attempts >= 3) {
        throw new Error(`GitHub API request failed after 3 attempts: ${error.message}`);
      }
      // Wait 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  for (const asset of latestRelease.assets) {
    const name: string = asset.name;
    // Match pattern: cpython-3.11.0+...-x86_64-unknown-linux-gnu-install_only.tar.gz
    if (
      name.startsWith(`cpython-${version}`) &&
      name.includes(triple) &&
      name.includes('install_only') &&
      name.endsWith('.tar.gz')
    ) {
      return asset.browser_download_url;
    }
  }

  throw new Error(
    `Could not find python-build-standalone release for Python ${version} on ${triple}. ` +
    `Check available versions at https://github.com/astral-sh/python-build-standalone/releases`
  );
}

// ── Archive Name (cache key) ────────────────────────────────────────────────

export function getPythonArchiveName(version: string): string {
  const triple = mapPlatformArch(getPlatform(), getArch());
  return `python-${version}-${triple}-install_only.tar.gz`;
}

// ── Binary Path ─────────────────────────────────────────────────────────────

export function getPythonBinaryName(): string {
  return isWindows() ? 'python.exe' : 'python3';
}

/**
 * python-build-standalone tarballs contain a top-level `python/` directory.
 */
export const PYTHON_STRIP_LEVEL = 1;
