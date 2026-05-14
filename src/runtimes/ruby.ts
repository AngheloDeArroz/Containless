import { getPlatform, getArch, isWindows, type Platform, type Arch } from '../utils';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMajorMinor(version: string): string {
  const parts = version.split('.');
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return version;
}

// ── Download URL ─────────────────────────────────────────────────────────────

/**
 * Ruby binaries are sourced from:
 *   - Windows: https://github.com/oneclick/rubyinstaller2/releases
 *              Slim ZIP (no devkit) e.g. rubyinstaller-3.3.0-1-x64.zip
 *   - Linux:   https://github.com/ruby/ruby-builder/releases
 *              e.g. ruby-3.3.0-ubuntu-22.04.tar.gz
 *   - macOS:   https://github.com/ruby/ruby-builder/releases
 *              e.g. ruby-3.3.0-macos-13.tar.gz
 *
 * The actual URL must be resolved asynchronously because release asset names
 * include build numbers and OS version suffixes that vary per release.
 */
export function getRubyDownloadUrl(version: string): string {
  return `RESOLVE_RUBY:${version}`;
}

export async function resolveRubyDownloadUrl(version: string): Promise<string> {
  const platform = getPlatform();
  const arch = getArch();

  if (platform === 'win32') {
    return resolveWindowsRubyUrl(version, arch);
  }
  return resolveUnixRubyUrl(version, platform, arch);
}

/**
 * Resolve a Windows Ruby slim ZIP from rubyinstaller2 GitHub releases.
 * Asset naming: rubyinstaller-<version>-<build>-x64.zip
 * Only x64 is supported (RubyInstaller2 does not publish arm64 for Windows).
 */
async function resolveWindowsRubyUrl(version: string, arch: Arch): Promise<string> {
  const { default: axios } = await import('axios');

  const majorMinor = getMajorMinor(version);

  let release: any = null;
  let attempts = 0;

  while (attempts < 3) {
    try {
      const res = await axios.get(
        'https://api.github.com/repos/oneclick/rubyinstaller2/releases',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Containless-CLI',
          },
          timeout: 15000,
        }
      );
      // Find a release whose tag starts with "RubyInstaller-<major.minor>"
      const tag = `RubyInstaller-${version}`;
      const tagPrefix = `RubyInstaller-${majorMinor}`;
      release = (res.data as any[]).find(
        (r: any) => r.tag_name === tag || r.tag_name.startsWith(tagPrefix)
      );
      if (!release) {
        // Fall back to first release that contains the major.minor in the tag
        release = (res.data as any[]).find((r: any) =>
          r.tag_name.includes(majorMinor)
        );
      }
      break;
    } catch (error: any) {
      attempts++;
      if (attempts >= 3) {
        throw new Error(`GitHub API request failed after 3 attempts: ${error.message}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!release) {
    throw new Error(
      `Could not find a RubyInstaller2 release for Ruby ${version}. ` +
      `Check https://github.com/oneclick/rubyinstaller2/releases`
    );
  }

  // Match slim ZIP (without devkit, without -with-devkit) for x64
  const archStr = arch === 'arm64' ? 'x64' : 'x64'; // RubyInstaller only ships x64
  for (const asset of release.assets as { name: string; browser_download_url: string }[]) {
    const n = asset.name;
    if (
      n.startsWith('rubyinstaller-') &&
      !n.includes('devkit') &&
      n.includes(archStr) &&
      n.endsWith('.zip')
    ) {
      return asset.browser_download_url;
    }
  }

  throw new Error(
    `Could not find a slim ZIP asset for Ruby ${version} on Windows. ` +
    `Check https://github.com/oneclick/rubyinstaller2/releases`
  );
}

/**
 * Resolve a Linux/macOS Ruby binary from ruby/ruby-builder GitHub releases.
 * Asset naming:
 *   Linux:  ruby-<version>-ubuntu-<os_version>.tar.gz
 *   macOS:  ruby-<version>-macos-<os_version>.tar.gz
 */
async function resolveUnixRubyUrl(version: string, platform: Platform, arch: Arch): Promise<string> {
  const { default: axios } = await import('axios');

  const osLabel = platform === 'darwin' ? 'macos' : 'ubuntu';
  // ruby-builder does not publish arm64 Linux builds, only macOS arm64
  const archStr = (platform === 'darwin' && arch === 'arm64') ? 'arm64' : '';

  let release: any = null;
  let attempts = 0;

  while (attempts < 3) {
    try {
      const res = await axios.get(
        'https://api.github.com/repos/ruby/ruby-builder/releases',
        {
          headers: {
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Containless-CLI',
          },
          timeout: 15000,
        }
      );
      // Find a release whose tag matches the requested version
      const releases = res.data as any[];
      release = releases.find((r: any) => r.tag_name === version) ||
                releases.find((r: any) => r.tag_name.startsWith(getMajorMinor(version)));
      break;
    } catch (error: any) {
      attempts++;
      if (attempts >= 3) {
        throw new Error(`GitHub API request failed after 3 attempts: ${error.message}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (!release) {
    throw new Error(
      `Could not find a ruby-builder release for Ruby ${version}. ` +
      `Check https://github.com/ruby/ruby-builder/releases`
    );
  }

  // Prefer an asset matching the arch if specified, otherwise any matching OS
  const assets = release.assets as { name: string; browser_download_url: string }[];

  // First pass: try exact arch match
  if (archStr) {
    for (const asset of assets) {
      const n = asset.name;
      if (
        n.startsWith(`ruby-${version}`) &&
        n.includes(osLabel) &&
        n.includes(archStr) &&
        n.endsWith('.tar.gz')
      ) {
        return asset.browser_download_url;
      }
    }
  }

  // Second pass: any asset matching OS label (pick the latest OS version, usually last listed)
  const candidates = assets.filter(
    a => a.name.startsWith(`ruby-`) && a.name.includes(osLabel) && a.name.endsWith('.tar.gz')
  );

  if (candidates.length > 0) {
    // Prefer the highest OS version (e.g. ubuntu-22.04 over ubuntu-20.04)
    candidates.sort((a, b) => b.name.localeCompare(a.name));
    return candidates[0].browser_download_url;
  }

  throw new Error(
    `Could not find Ruby ${version} binary for ${platform}/${arch}. ` +
    `Check https://github.com/ruby/ruby-builder/releases`
  );
}

// ── Archive Name (cache key) ─────────────────────────────────────────────────

export function getRubyArchiveName(version: string): string {
  const platform = getPlatform();
  const arch = getArch();
  const ext = isWindows() ? 'zip' : 'tar.gz';
  const os = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : 'linux';
  const archStr = arch === 'arm64' ? 'arm64' : 'x64';
  return `ruby-${version}-${os}-${archStr}.${ext}`;
}

// ── Binary Path ──────────────────────────────────────────────────────────────

export function getRubyBinaryName(): string {
  return isWindows() ? 'ruby.exe' : 'ruby';
}

/**
 * Both rubyinstaller2 ZIPs and ruby-builder tarballs have a single top-level
 * directory (e.g. rubyinstaller-3.3.0-1-x64/ or ruby-3.3.0/), with the
 * `bin/` subdirectory inside it.
 */
export const RUBY_STRIP_LEVEL = 1;
