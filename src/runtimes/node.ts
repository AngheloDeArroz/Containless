import { getPlatform, getArch, isWindows, type Platform, type Arch } from '../utils';

// ── Platform/Arch Mapping ───────────────────────────────────────────────────

function mapPlatform(p: Platform): string {
  switch (p) {
    case 'linux':  return 'linux';
    case 'darwin': return 'darwin';
    case 'win32':  return 'win';
  }
}

function mapArch(a: Arch): string {
  switch (a) {
    case 'x64':   return 'x64';
    case 'arm64': return 'arm64';
  }
}

// ── Download URL ────────────────────────────────────────────────────────────

export function getNodeDownloadUrl(version: string): string {
  const platform = mapPlatform(getPlatform());
  const arch = mapArch(getArch());
  const ext = isWindows() ? 'zip' : 'tar.gz';

  return `https://nodejs.org/dist/v${version}/node-v${version}-${platform}-${arch}.${ext}`;
}

// ── Archive Name (cache key) ────────────────────────────────────────────────

export function getNodeArchiveName(version: string): string {
  const platform = mapPlatform(getPlatform());
  const arch = mapArch(getArch());
  const ext = isWindows() ? 'zip' : 'tar.gz';

  return `node-${version}-${platform}-${arch}.${ext}`;
}

// ── Binary Path ─────────────────────────────────────────────────────────────

export function getNodeBinaryName(): string {
  return isWindows() ? 'node.exe' : 'node';
}

/**
 * Number of directory levels to strip when extracting.
 * Node.js tarballs have one top-level directory (e.g. node-v18.17.0-linux-x64/).
 */
export const NODE_STRIP_LEVEL = 1;
