import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import { SettingsManager } from './settingsManager';
import * as vscode from 'vscode';

// vitest.config.ts aliases 'vscode' to our mock file, so at runtime this is the mock object.
const _testMocks = (vscode as any)._testMocks;

vi.mock('fs');

describe('SettingsManager', () => {
  const workspaceRoot = '/mock/workspace';
  let settingsManager: SettingsManager;
  let originalPlatform: string;

  beforeEach(() => {
    _testMocks.reset();
    settingsManager = new SettingsManager(workspaceRoot);
    originalPlatform = process.platform;
    vi.resetAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('configureRuntimes', () => {
    it('only updates terminal if no third-party extensions are installed', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      const runtimes = {
        node: '18.17.0',
        python: '3.11.4'
      };

      await settingsManager.configureRuntimes(runtimes);

      // Verify extension-specific settings are NOT updated
      expect(_testMocks.getConfig('eslint.runtime')).toBeUndefined();
      expect(_testMocks.getConfig('python.defaultInterpreterPath')).toBeUndefined();

      // Verify terminal PATH is updated correctly
      const terminalEnv = _testMocks.getConfig('terminal.integrated.env.linux');
      expect(terminalEnv).toBeDefined();
      expect(terminalEnv.PATH).toContain('node-18.17.0');
      expect(terminalEnv.PATH).toContain('python-3.11.4');
      expect(terminalEnv.PATH).toContain('${env:PATH}');
    });

    it('configures ESLint when installed', async () => {
      _testMocks.installExtension('dbaeumer.vscode-eslint');
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      await settingsManager.configureRuntimes({ node: '18.17.0' });

      expect(_testMocks.getConfig('eslint.runtime')).toContain(path.join('node-18.17.0', 'bin', 'node'));
    });

    it('configures Python when installed', async () => {
      _testMocks.installExtension('ms-python.python');
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(fs.existsSync).mockReturnValue(false); // No venv
      
      await settingsManager.configureRuntimes({ python: '3.11.4' });

      expect(_testMocks.getConfig('python.defaultInterpreterPath')).toContain(path.join('python-3.11.4', 'bin', 'python'));
    });

    it('prefers Python venv when it exists', async () => {
      _testMocks.installExtension('ms-python.python');
      Object.defineProperty(process, 'platform', { value: 'linux' });
      vi.mocked(fs.existsSync).mockReturnValue(true); // venv exists
      
      await settingsManager.configureRuntimes({ python: '3.11.4' });

      expect(_testMocks.getConfig('python.defaultInterpreterPath')).toContain(path.join('.containless', 'venv', 'bin', 'python'));
    });

    it('configures Java when installed', async () => {
      _testMocks.installExtension('redhat.java');
      Object.defineProperty(process, 'platform', { value: 'linux' });
      
      await settingsManager.configureRuntimes({ java: '17.0.8' });

      expect(_testMocks.getConfig('java.jdt.ls.java.home')).toContain('java-17.0.8');
    });

    it('configures Go when installed', async () => {
      _testMocks.installExtension('golang.go');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      await settingsManager.configureRuntimes({ go: '1.21.0' });

      expect(_testMocks.getConfig('go.goroot')).toContain('go-1.21.0');
      const alternateTools = _testMocks.getConfig('go.alternateTools');
      expect(alternateTools.go).toContain('go.exe');
    });

    it('configures PHP when installed', async () => {
      _testMocks.installExtension('bmewburn.vscode-intelephense-client');
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      await settingsManager.configureRuntimes({ php: '8.4.0' });

      expect(_testMocks.getConfig('php.validate.executablePath')).toContain('php.exe');
      expect(_testMocks.getConfig('intelephense.environment.phpVersion')).toBe('8.4.0');
      
      // Also verify PHP_BINARY is set in the terminal environment
      const terminalEnv = _testMocks.getConfig('terminal.integrated.env.windows');
      expect(terminalEnv.PHP_BINARY).toContain('php.exe');
    });

    it('sets PHP_BINARY correctly in terminal even if Intelephense is not installed', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      await settingsManager.configureRuntimes({ php: '8.4.0' });

      // Intelephense settings should be undefined
      expect(_testMocks.getConfig('php.validate.executablePath')).toBeUndefined();
      
      // But terminal environment MUST have PHP_BINARY
      const terminalEnv = _testMocks.getConfig('terminal.integrated.env.windows');
      expect(terminalEnv.PHP_BINARY).toContain('php.exe');
    });
  });

  describe('resetToGlobal', () => {
    it('resets all configurations', async () => {
      _testMocks.installExtension('ms-python.python');
      _testMocks.installExtension('dbaeumer.vscode-eslint');
      _testMocks.installExtension('redhat.java');
      _testMocks.installExtension('golang.go');
      _testMocks.installExtension('bmewburn.vscode-intelephense-client');
      
      // Pre-populate some configs
      _testMocks.setConfig('terminal.integrated.env.windows', { PATH: 'some-path', PHP_BINARY: 'some-php' });
      _testMocks.setConfig('terminal.integrated.env.linux', { PATH: 'some-path' });

      await settingsManager.resetToGlobal();

      expect(_testMocks.getConfig('python.defaultInterpreterPath')).toBeUndefined();
      expect(_testMocks.getConfig('eslint.runtime')).toBeUndefined();
      expect(_testMocks.getConfig('java.jdt.ls.java.home')).toBeUndefined();
      expect(_testMocks.getConfig('go.goroot')).toBeUndefined();
      expect(_testMocks.getConfig('php.validate.executablePath')).toBeUndefined();
      
      // Verify terminal resets
      expect(_testMocks.getConfig('terminal.integrated.env.windows')).toBeUndefined();
      expect(_testMocks.getConfig('terminal.integrated.env.linux')).toBeUndefined();
    });
  });
});
