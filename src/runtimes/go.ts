import { getPlatform, getArch, isWindows, type Platform, type Arch } from '../utils';

// ── Platform/Arch Mapping ───────────────────────────────────────────────────

function mapPlatform(p: Platform): string {
  switch (p) {
    case 'linux':  return 'linux';
    case 'darwin': return 'darwin';
    case 'win32':  return 'windows';
  }
}

function mapArch(a: Arch): string {
  switch (a) {
    case 'x64':   return 'amd64';
    case 'arm64': return 'arm64';
  }
}

// ── Download URL ────────────────────────────────────────────────────────────

export function getGoDownloadUrl(version: string): string {
  const platform = mapPlatform(getPlatform());
  const arch = mapArch(getArch());
  const ext = isWindows() ? 'zip' : 'tar.gz';

  return `https://go.dev/dl/go${version}.${platform}-${arch}.${ext}`;
}

// ── Archive Name (cache key) ────────────────────────────────────────────────

export function getGoArchiveName(version: string): string {
  const platform = mapPlatform(getPlatform());
  const arch = mapArch(getArch());
  const ext = isWindows() ? 'zip' : 'tar.gz';

  return `go-${version}-${platform}-${arch}.${ext}`;
}

// ── Binary Path ─────────────────────────────────────────────────────────────

export function getGoBinaryName(): string {
  return isWindows() ? 'go.exe' : 'go';
}

/**
 * Go tarballs contain a top-level `go/` directory.
 */
export const GO_STRIP_LEVEL = 1;
