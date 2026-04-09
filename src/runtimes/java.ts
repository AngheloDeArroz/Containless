import { getPlatform, getArch, isWindows, type Platform, type Arch } from '../utils';

// ── Platform/Arch Mapping ───────────────────────────────────────────────────

function mapPlatform(p: Platform): string {
  switch (p) {
    case 'linux':  return 'linux';
    case 'darwin': return 'mac';
    case 'win32':  return 'windows';
  }
}

function mapArch(a: Arch): string {
  switch (a) {
    case 'x64':   return 'x64';
    case 'arm64': return 'aarch64';
  }
}

// ── Download URL ────────────────────────────────────────────────────────────

/**
 * Adoptium API for latest JDK binary.
 * https://api.adoptium.net/v3/binary/latest/{feature_version}/ga/{os}/{arch}/jdk/hotspot/normal/eclipse
 *
 * This returns a redirect to the actual download URL.
 */
export function getJavaDownloadUrl(version: string): string {
  const os = mapPlatform(getPlatform());
  const arch = mapArch(getArch());

  return `https://api.adoptium.net/v3/binary/latest/${version}/ga/${os}/${arch}/jdk/hotspot/normal/eclipse`;
}

// ── Archive Name (cache key) ────────────────────────────────────────────────

export function getJavaArchiveName(version: string): string {
  const os = mapPlatform(getPlatform());
  const arch = mapArch(getArch());
  const ext = isWindows() ? 'zip' : 'tar.gz';

  return `java-${version}-${os}-${arch}.${ext}`;
}

// ── Binary Path ─────────────────────────────────────────────────────────────

export function getJavaBinaryName(): string {
  return isWindows() ? 'java.exe' : 'java';
}

/**
 * Adoptium tarballs contain one top-level directory (e.g., jdk-21.0.2+13/).
 */
export const JAVA_STRIP_LEVEL = 1;
