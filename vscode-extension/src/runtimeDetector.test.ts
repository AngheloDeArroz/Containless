import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { RuntimeDetector } from './runtimeDetector';

vi.mock('fs');

describe('RuntimeDetector', () => {
  const workspaceRoot = '/mock/workspace';
  let detector: RuntimeDetector;
  let originalPlatform: string;

  beforeEach(() => {
    detector = new RuntimeDetector(workspaceRoot);
    originalPlatform = process.platform;
    vi.resetAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('detectInstalledRuntimes', () => {
    it('returns empty object if runtimes dir does not exist', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const result = await detector.detectInstalledRuntimes();
      expect(result).toEqual({});
    });

    it('detects valid runtime directories', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([
        'node-18.17.0',
        'python-3.11.4',
        'java-17.0.8',
        'invalid-dir',
        'some-modules',
        'php-8.4.0',
        'ruby-3.3.0'
      ] as any);
      
      vi.mocked(fs.statSync).mockImplementation((pathStr) => {
        return { isDirectory: () => true } as any;
      });

      const result = await detector.detectInstalledRuntimes();
      expect(result).toEqual({
        node: '18.17.0',
        python: '3.11.4',
        java: '17.0.8',
        php: '8.4.0',
        ruby: '3.3.0'
      });
    });

    it('ignores non-directories matching the pattern', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(['go-1.21.0'] as any);
      
      vi.mocked(fs.statSync).mockImplementation(() => {
        return { isDirectory: () => false } as any; // Not a directory
      });

      const result = await detector.detectInstalledRuntimes();
      expect(result).toEqual({});
    });
  });

  describe('getRuntimeBinPath', () => {
    it('handles Windows paths correctly', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const base = path.join(workspaceRoot, '.containless', 'runtimes');

      expect(detector.getRuntimeBinPath('node', '18')).toBe(path.join(base, 'node-18'));
      expect(detector.getRuntimeBinPath('python', '3.11')).toBe(path.join(base, 'python-3.11'));
      expect(detector.getRuntimeBinPath('java', '17')).toBe(path.join(base, 'java-17', 'bin'));
      expect(detector.getRuntimeBinPath('go', '1.21')).toBe(path.join(base, 'go-1.21', 'bin'));
      expect(detector.getRuntimeBinPath('php', '8.4')).toBe(path.join(base, 'php-8.4'));
      expect(detector.getRuntimeBinPath('ruby', '3.3')).toBe(path.join(base, 'ruby-3.3', 'bin'));
    });

    it('handles Unix/macOS paths correctly', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      const base = path.join(workspaceRoot, '.containless', 'runtimes');

      expect(detector.getRuntimeBinPath('node', '18')).toBe(path.join(base, 'node-18', 'bin'));
      expect(detector.getRuntimeBinPath('python', '3.11')).toBe(path.join(base, 'python-3.11', 'bin'));
      expect(detector.getRuntimeBinPath('go', '1.21')).toBe(path.join(base, 'go-1.21', 'bin'));
      expect(detector.getRuntimeBinPath('php', '8.4')).toBe(path.join(base, 'php-8.4'));
      expect(detector.getRuntimeBinPath('ruby', '3.3')).toBe(path.join(base, 'ruby-3.3', 'bin'));
    });

    it('handles macOS Java specific path', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const base = path.join(workspaceRoot, '.containless', 'runtimes');
      expect(detector.getRuntimeBinPath('java', '17')).toBe(path.join(base, 'java-17', 'Contents', 'Home', 'bin'));
    });
  });

  describe('getRuntimeExecutable', () => {
    it('appends .exe on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(detector.getRuntimeExecutable('node', '18')).toContain('node.exe');
      expect(detector.getRuntimeExecutable('python', '3')).toContain('python.exe');
      expect(detector.getRuntimeExecutable('java', '17')).toContain('java.exe');
      expect(detector.getRuntimeExecutable('go', '1')).toContain('go.exe');
      expect(detector.getRuntimeExecutable('php', '8')).toContain('php.exe');
      expect(detector.getRuntimeExecutable('ruby', '3')).toContain('ruby.exe');
    });

    it('uses standard names on Unix', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(detector.getRuntimeExecutable('node', '18')).toMatch(/node$/);
      expect(detector.getRuntimeExecutable('python', '3')).toMatch(/python$/);
      expect(detector.getRuntimeExecutable('java', '17')).toMatch(/java$/);
      expect(detector.getRuntimeExecutable('go', '1')).toMatch(/go$/);
      expect(detector.getRuntimeExecutable('php', '8')).toMatch(/php$/);
      expect(detector.getRuntimeExecutable('ruby', '3')).toMatch(/ruby$/);
    });
  });
});
