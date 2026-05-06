/**
 * tests/config.test.ts
 * Tests for src/config.ts — writeConfig, readConfig, configPath.
 * Uses real temp directories. process.exit is mocked so it throws instead
 * of killing the test runner.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { configPath, writeConfig, readConfig, ContainlessConfig } from '../src/config';

// Mock process.exit so error-path tests throw instead of exiting
vi.spyOn(process, 'exit').mockImplementation((code?: any) => {
  throw new Error(`process.exit(${code})`);
});

// Silence console output (log / error) during tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  // Re-apply the process.exit mock after restoreAllMocks
  vi.spyOn(process, 'exit').mockImplementation((code?: any) => {
    throw new Error(`process.exit(${code})`);
  });
});

async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'containless-cfg-test-'));
}

// ── configPath ────────────────────────────────────────────────────────────────

describe('configPath', () => {
  it('returns a path ending with containless.json', () => {
    expect(configPath('/some/project')).toMatch(/containless\.json$/);
  });

  it('is inside the given directory', () => {
    const p = configPath('/some/project');
    expect(p.startsWith(path.resolve('/some/project'))).toBe(true);
  });
});

// ── writeConfig ───────────────────────────────────────────────────────────────

describe('writeConfig', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('creates containless.json in the given directory', async () => {
    const config: ContainlessConfig = { runtime: { node: '18.17.0' } };
    await writeConfig(config, dir);
    expect(await fs.pathExists(path.join(dir, 'containless.json'))).toBe(true);
  });

  it('writes valid JSON', async () => {
    const config: ContainlessConfig = { runtime: { node: '18.17.0' } };
    await writeConfig(config, dir);
    const raw = await fs.readFile(path.join(dir, 'containless.json'), 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('writes the runtime field correctly', async () => {
    const config: ContainlessConfig = { runtime: { node: '20.11.0', python: '3.12.0' } };
    await writeConfig(config, dir);
    const parsed = JSON.parse(await fs.readFile(path.join(dir, 'containless.json'), 'utf-8'));
    expect(parsed.runtime).toEqual({ node: '20.11.0', python: '3.12.0' });
  });

  it('writes the start field when provided', async () => {
    const config: ContainlessConfig = { runtime: { node: '18.17.0' }, start: 'npm run dev' };
    await writeConfig(config, dir);
    const parsed = JSON.parse(await fs.readFile(path.join(dir, 'containless.json'), 'utf-8'));
    expect(parsed.start).toBe('npm run dev');
  });

  it('returns the path to the written file', async () => {
    const config: ContainlessConfig = { runtime: { node: '18.17.0' } };
    const result = await writeConfig(config, dir);
    expect(result).toBe(configPath(dir));
  });

  it('is pretty-printed (indented)', async () => {
    const config: ContainlessConfig = { runtime: { node: '18.17.0' } };
    await writeConfig(config, dir);
    const raw = await fs.readFile(path.join(dir, 'containless.json'), 'utf-8');
    // Indented JSON has newlines
    expect(raw).toContain('\n');
  });
});

// ── readConfig — happy path ───────────────────────────────────────────────────

describe('readConfig — valid config', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('reads back a config that was written by writeConfig', async () => {
    const config: ContainlessConfig = { runtime: { node: '18.17.0' }, start: 'npm start' };
    await writeConfig(config, dir);
    const read = await readConfig(dir);
    expect(read.runtime).toEqual({ node: '18.17.0' });
    expect(read.start).toBe('npm start');
  });

  it('accepts all four supported runtimes', async () => {
    const config: ContainlessConfig = {
      runtime: { node: '20.11.0', python: '3.12.0', go: '1.22.0', java: '21' },
    };
    await writeConfig(config, dir);
    const read = await readConfig(dir);
    expect(Object.keys(read.runtime)).toHaveLength(4);
  });
});

// ── readConfig — error paths ───────────────────────────────────────────────────

describe('readConfig — error handling', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('calls process.exit when containless.json is invalid JSON', async () => {
    await fs.writeFile(path.join(dir, 'containless.json'), '{ not valid json }');
    await expect(readConfig(dir)).rejects.toThrow('process.exit');
  });

  it('calls process.exit when runtime field is missing', async () => {
    await fs.writeFile(path.join(dir, 'containless.json'), JSON.stringify({ start: 'npm start' }));
    await expect(readConfig(dir)).rejects.toThrow('process.exit');
  });

  it('calls process.exit for an unsupported runtime name', async () => {
    await fs.writeFile(
      path.join(dir, 'containless.json'),
      JSON.stringify({ runtime: { ruby: '3.2.0' } })
    );
    await expect(readConfig(dir)).rejects.toThrow('process.exit');
  });

  it('calls process.exit for a version string with path traversal', async () => {
    await fs.writeFile(
      path.join(dir, 'containless.json'),
      JSON.stringify({ runtime: { node: '../../../evil' } })
    );
    await expect(readConfig(dir)).rejects.toThrow('process.exit');
  });

  it('calls process.exit for a version string with shell characters', async () => {
    await fs.writeFile(
      path.join(dir, 'containless.json'),
      JSON.stringify({ runtime: { node: '18.0.0; rm -rf /' } })
    );
    await expect(readConfig(dir)).rejects.toThrow('process.exit');
  });
});
