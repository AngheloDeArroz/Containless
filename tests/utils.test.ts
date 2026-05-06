/**
 * tests/utils.test.ts
 * Unit tests for src/utils.ts — all pure functions, no I/O.
 */
import { describe, it, expect } from 'vitest';
import * as path from 'path';
import {
  validateVersion,
  parseRuntimeSpec,
  formatBytes,
  isSupportedRuntime,
  containlessDir,
  runtimesDir,
  cacheDir,
  venvDir,
  runtimeDir,
  runtimeBinDir,
} from '../src/utils';

// ── validateVersion ──────────────────────────────────────────────────────────

describe('validateVersion', () => {
  it('accepts a standard semver version', () => {
    expect(() => validateVersion('18.17.0')).not.toThrow();
  });

  it('accepts a version with dashes and plus signs', () => {
    expect(() => validateVersion('3.12.0-alpha+1')).not.toThrow();
  });

  it('accepts a version with underscores', () => {
    expect(() => validateVersion('1_0_0')).not.toThrow();
  });

  it('accepts a single major number', () => {
    expect(() => validateVersion('21')).not.toThrow();
  });

  it('rejects an empty string', () => {
    expect(() => validateVersion('')).toThrow();
  });

  it('rejects a version longer than 64 characters', () => {
    expect(() => validateVersion('1'.repeat(65))).toThrow();
  });

  it('rejects path traversal with ..', () => {
    expect(() => validateVersion('../etc/passwd')).toThrow();
  });

  it('rejects a version with a forward slash', () => {
    expect(() => validateVersion('18/17/0')).toThrow();
  });

  it('rejects a version with a backslash', () => {
    expect(() => validateVersion('18\\17\\0')).toThrow();
  });

  it('rejects shell special characters', () => {
    expect(() => validateVersion('18!0')).toThrow();
    expect(() => validateVersion('$(evil)')).toThrow();
    expect(() => validateVersion('18;0')).toThrow();
  });
});

// ── parseRuntimeSpec ─────────────────────────────────────────────────────────

describe('parseRuntimeSpec', () => {
  it('parses a valid spec', () => {
    expect(parseRuntimeSpec('node@18.17.0')).toEqual({ name: 'node', version: '18.17.0' });
  });

  it('lowercases the runtime name', () => {
    expect(parseRuntimeSpec('Node@18.17.0').name).toBe('node');
  });

  it('works for all supported runtimes', () => {
    expect(parseRuntimeSpec('python@3.12.0').name).toBe('python');
    expect(parseRuntimeSpec('go@1.22.0').name).toBe('go');
    expect(parseRuntimeSpec('java@21').name).toBe('java');
  });

  it('throws if there is no @ separator', () => {
    expect(() => parseRuntimeSpec('node18.17.0')).toThrow();
  });

  it('throws if the name is empty', () => {
    expect(() => parseRuntimeSpec('@18.17.0')).toThrow();
  });

  it('throws if the version is empty', () => {
    expect(() => parseRuntimeSpec('node@')).toThrow();
  });

  it('throws for multiple @ signs', () => {
    expect(() => parseRuntimeSpec('node@18@17')).toThrow();
  });
});

// ── formatBytes ──────────────────────────────────────────────────────────────

describe('formatBytes', () => {
  it('formats 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes under 1 KB', () => {
    expect(formatBytes(512)).toBe('512.0 B');
  });

  it('formats exactly 1 KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats GB', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });
});

// ── isSupportedRuntime ───────────────────────────────────────────────────────

describe('isSupportedRuntime', () => {
  it.each(['node', 'python', 'java', 'go'])('accepts %s', (runtime) => {
    expect(isSupportedRuntime(runtime)).toBe(true);
  });

  it.each(['ruby', 'dotnet', 'rust', 'php', '', 'NODE', 'Python'])(
    'rejects %s',
    (runtime) => {
      expect(isSupportedRuntime(runtime)).toBe(false);
    }
  );
});

// ── Path helpers ─────────────────────────────────────────────────────────────

describe('path helpers', () => {
  const base = '/tmp/my-project';

  it('containlessDir returns <cwd>/.containless', () => {
    expect(containlessDir(base)).toBe(path.resolve(base, '.containless'));
  });

  it('runtimesDir returns .containless/runtimes', () => {
    expect(runtimesDir(base)).toBe(path.join(containlessDir(base), 'runtimes'));
  });

  it('cacheDir returns .containless/cache', () => {
    expect(cacheDir(base)).toBe(path.join(containlessDir(base), 'cache'));
  });

  it('venvDir returns .containless/venv', () => {
    expect(venvDir(base)).toBe(path.join(containlessDir(base), 'venv'));
  });

  it('runtimeDir includes name-version segment', () => {
    const dir = runtimeDir('node', '18.17.0', base);
    expect(dir).toContain('node-18.17.0');
  });
});

// ── runtimeBinDir ────────────────────────────────────────────────────────────

describe('runtimeBinDir', () => {
  const base = '/tmp/my-project';

  it('returns a non-empty string for node', () => {
    expect(runtimeBinDir('node', '18.17.0', base)).toBeTruthy();
  });

  it('returns a non-empty string for python', () => {
    expect(runtimeBinDir('python', '3.12.0', base)).toBeTruthy();
  });

  it('returns a path containing "bin" for go', () => {
    expect(runtimeBinDir('go', '1.22.0', base)).toContain('bin');
  });

  it('returns a path containing "bin" for java', () => {
    expect(runtimeBinDir('java', '21', base)).toContain('bin');
  });

  it('is nested inside runtimeDir', () => {
    const binDir = runtimeBinDir('go', '1.22.0', base);
    expect(binDir.startsWith(runtimeDir('go', '1.22.0', base))).toBe(true);
  });
});
