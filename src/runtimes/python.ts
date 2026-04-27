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
 * Extract major.minor from a version string like "3.12.0" → "3.12"
 */
function getMajorMinor(version: string): string {
  const parts = version.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return version;
}

/**
 * Resolve the actual download URL from GitHub releases.
 *
 * python-build-standalone only publishes the *latest patch* of each minor
 * series (e.g. 3.12.13, not 3.12.0). So when a user asks for "3.12.0" we
 * match on the major.minor prefix ("3.12") and accept whatever patch is
 * available.
 */
export async function resolvePythonDownloadUrl(version: string): Promise<string> {
  const { default: axios } = await import('axios');
  const triple = mapPlatformArch(getPlatform(), getArch());
  const majorMinor = getMajorMinor(version);

  // ── Step 1: Discover the latest release tag via latest-release.json ────
  //    This is far more reliable than the GitHub API /releases/latest endpoint
  //    and avoids rate-limit issues.
  let releaseTag: string | null = null;
  let assetUrlPrefix: string | null = null;

  try {
    const metaResponse = await axios.get(
      'https://raw.githubusercontent.com/astral-sh/python-build-standalone/latest-release/latest-release.json',
      { timeout: 15000, headers: { 'User-Agent': 'Containless-CLI' } }
    );
    releaseTag = metaResponse.data.tag;
    assetUrlPrefix = metaResponse.data.asset_url_prefix;
  } catch {
    // Fall through to GitHub API below
  }

  // ── Step 2: Fetch the release assets ───────────────────────────────────
  const apiUrl = releaseTag
    ? `https://api.github.com/repos/astral-sh/python-build-standalone/releases/tags/${releaseTag}`
    : 'https://api.github.com/repos/astral-sh/python-build-standalone/releases/latest';

  let release: any = null;
  let attempts = 0;
  while (attempts < 3) {
    try {
      const response = await axios.get(apiUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Containless-CLI'
        },
        timeout: 15000
      });
      release = response.data;
      break;
    } catch (error: any) {
      attempts++;
      if (attempts >= 3) {
        throw new Error(`GitHub API request failed after 3 attempts: ${error.message}`);
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // ── Step 3: Find a matching asset ──────────────────────────────────────
  //    Match on major.minor prefix so "3.12.0" finds "cpython-3.12.13+…"
  for (const asset of release.assets) {
    const name: string = asset.name;
    if (
      name.startsWith(`cpython-${majorMinor}.`) &&
      name.includes(triple) &&
      name.includes('install_only') &&
      name.endsWith('.tar.gz')
    ) {
      return asset.browser_download_url;
    }
  }

  throw new Error(
    `Could not find python-build-standalone release for Python ${majorMinor}.x on ${triple}. ` +
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
