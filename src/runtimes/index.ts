import { RuntimeName, isSupportedRuntime } from '../utils';
import { getNodeDownloadUrl, getNodeArchiveName, getNodeBinaryName, NODE_STRIP_LEVEL } from './node';
import { getPythonDownloadUrl, getPythonArchiveName, getPythonBinaryName, PYTHON_STRIP_LEVEL, resolvePythonDownloadUrl } from './python';
import { getJavaDownloadUrl, getJavaArchiveName, getJavaBinaryName, JAVA_STRIP_LEVEL } from './java';
import { getGoDownloadUrl, getGoArchiveName, getGoBinaryName, GO_STRIP_LEVEL } from './go';

// ── Runtime Info ────────────────────────────────────────────────────────────

export interface RuntimeInfo {
  downloadUrl: string;
  archiveName: string;
  binaryName: string;
  stripLevel: number;
  /** If true, downloadUrl must be resolved asynchronously before use */
  needsResolve: boolean;
}

export function getRuntimeInfo(name: string, version: string): RuntimeInfo {
  if (!isSupportedRuntime(name)) {
    throw new Error(
      `Unsupported runtime: "${name}". Supported runtimes: node, python, java, go`
    );
  }

  switch (name as RuntimeName) {
    case 'node':
      return {
        downloadUrl: getNodeDownloadUrl(version),
        archiveName: getNodeArchiveName(version),
        binaryName: getNodeBinaryName(),
        stripLevel: NODE_STRIP_LEVEL,
        needsResolve: false,
      };
    case 'python':
      return {
        downloadUrl: getPythonDownloadUrl(version),
        archiveName: getPythonArchiveName(version),
        binaryName: getPythonBinaryName(),
        stripLevel: PYTHON_STRIP_LEVEL,
        needsResolve: true,
      };
    case 'java':
      return {
        downloadUrl: getJavaDownloadUrl(version),
        archiveName: getJavaArchiveName(version),
        binaryName: getJavaBinaryName(),
        stripLevel: JAVA_STRIP_LEVEL,
        needsResolve: false,
      };
    case 'go':
      return {
        downloadUrl: getGoDownloadUrl(version),
        archiveName: getGoArchiveName(version),
        binaryName: getGoBinaryName(),
        stripLevel: GO_STRIP_LEVEL,
        needsResolve: false,
      };
  }
}

export async function resolveDownloadUrl(name: string, version: string, info: RuntimeInfo): Promise<string> {
  if (name === 'python' && info.needsResolve) {
    return resolvePythonDownloadUrl(version);
  }
  return info.downloadUrl;
}
