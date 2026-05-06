/**
 * tests/scanner.test.ts
 * Tests for src/scanner.ts — uses real temp directories as fixtures.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import { scanProject } from '../src/scanner';

// Silence console output (logInfo / logWarn) during tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

// Creates a fresh temp directory for each test group
async function makeTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'containless-test-'));
}

// ── Node.js detection ────────────────────────────────────────────────────────

describe('Node detection', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('reads version from .nvmrc (v-prefixed)', async () => {
    await fs.writeFile(path.join(dir, '.nvmrc'), 'v18.17.0\n');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.node).toBe('18.17.0');
    expect(detections[0].source).toBe('.nvmrc');
  });

  it('reads version from .nvmrc (no prefix)', async () => {
    await fs.writeFile(path.join(dir, '.nvmrc'), '20.11.0\n');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.node).toBe('20.11.0');
  });

  it('expands major-only .nvmrc to known LTS', async () => {
    await fs.writeFile(path.join(dir, '.nvmrc'), '20\n');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.node).toBe('20.18.0');
  });

  it('uses default for LTS codename in .nvmrc', async () => {
    await fs.writeFile(path.join(dir, '.nvmrc'), 'lts/hydrogen\n');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.node).toBe('22.14.0');
  });

  it('reads version from .node-version', async () => {
    await fs.writeFile(path.join(dir, '.node-version'), '20.11.0\n');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.node).toBe('20.11.0');
    expect(detections[0].source).toBe('.node-version');
  });

  it('reads version from package.json engines.node (range)', async () => {
    await fs.writeJson(path.join(dir, 'package.json'), { engines: { node: '>=18.0.0' } });
    const { runtimes } = await scanProject(dir);
    expect(runtimes.node).toBe('18.0.0');
  });

  it('uses default when package.json has no engines field', async () => {
    await fs.writeJson(path.join(dir, 'package.json'), { name: 'my-app' });
    const { runtimes } = await scanProject(dir);
    expect(runtimes.node).toBe('22.14.0');
  });

  it('detects node from a lone .js file', async () => {
    await fs.writeFile(path.join(dir, 'index.js'), '');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.node).toBeTruthy();
    expect(detections[0].source).toContain('.js');
  });

  it('detects node from a lone .ts file', async () => {
    await fs.writeFile(path.join(dir, 'index.ts'), '');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.node).toBeTruthy();
  });

  it('returns no node runtime for an empty directory', async () => {
    const { runtimes } = await scanProject(dir);
    expect(runtimes.node).toBeUndefined();
  });
});

// ── Python detection ─────────────────────────────────────────────────────────

describe('Python detection', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('reads version from .python-version', async () => {
    await fs.writeFile(path.join(dir, '.python-version'), '3.11.0\n');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.python).toBe('3.11.0');
    expect(detections[0].source).toBe('.python-version');
  });

  it('appends .0 to major.minor in .python-version', async () => {
    await fs.writeFile(path.join(dir, '.python-version'), '3.12\n');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.python).toBe('3.12.0');
  });

  it('reads requires-python from pyproject.toml', async () => {
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nrequires-python = ">=3.11"\n');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.python).toBe('3.11.0');
  });

  it('uses default when pyproject.toml has no requires-python', async () => {
    await fs.writeFile(path.join(dir, 'pyproject.toml'), '[project]\nname = "app"\n');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.python).toBe('3.12.0');
    expect(detections[0].source).toContain('pyproject.toml');
  });

  it('detects python from requirements.txt', async () => {
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask\n');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.python).toBe('3.12.0');
    expect(detections[0].source).toContain('requirements.txt');
  });

  it('detects python from setup.py', async () => {
    await fs.writeFile(path.join(dir, 'setup.py'), 'from setuptools import setup\n');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.python).toBe('3.12.0');
  });

  it('detects python from a lone .py file', async () => {
    await fs.writeFile(path.join(dir, 'app.py'), '');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.python).toBe('3.12.0');
    expect(detections[0].source).toContain('.py');
  });
});

// ── Go detection ─────────────────────────────────────────────────────────────

describe('Go detection', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('reads version from go.mod (full semver)', async () => {
    await fs.writeFile(path.join(dir, 'go.mod'), 'module myapp\n\ngo 1.22.0\n');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.go).toBe('1.22.0');
    expect(detections[0].source).toBe('go.mod');
  });

  it('appends .0 to major.minor in go.mod', async () => {
    await fs.writeFile(path.join(dir, 'go.mod'), 'module myapp\n\ngo 1.21\n');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.go).toBe('1.21.0');
  });

  it('uses default when go.mod has no go directive', async () => {
    await fs.writeFile(path.join(dir, 'go.mod'), 'module myapp\n');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.go).toBe('1.22.0');
    expect(detections[0].source).toContain('detected');
  });

  it('detects go from a lone .go file', async () => {
    await fs.writeFile(path.join(dir, 'main.go'), '');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.go).toBe('1.22.0');
  });
});

// ── Java detection ───────────────────────────────────────────────────────────

describe('Java detection', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('reads version from .java-version', async () => {
    await fs.writeFile(path.join(dir, '.java-version'), '21\n');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.java).toBe('21');
    expect(detections[0].source).toBe('.java-version');
  });

  it('reads java.version from pom.xml', async () => {
    await fs.writeFile(path.join(dir, 'pom.xml'), '<project><properties><java.version>17</java.version></properties></project>');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.java).toBe('17');
    expect(detections[0].source).toContain('java.version');
  });

  it('reads maven.compiler.source from pom.xml', async () => {
    await fs.writeFile(path.join(dir, 'pom.xml'), '<project><properties><maven.compiler.source>11</maven.compiler.source></properties></project>');
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.java).toBe('11');
    expect(detections[0].source).toContain('maven.compiler.source');
  });

  it('uses default when pom.xml has no version hints', async () => {
    await fs.writeFile(path.join(dir, 'pom.xml'), '<project></project>');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.java).toBe('21');
  });

  it('reads sourceCompatibility from build.gradle', async () => {
    await fs.writeFile(path.join(dir, 'build.gradle'), "sourceCompatibility = '17'\n");
    const { runtimes, detections } = await scanProject(dir);
    expect(runtimes.java).toBe('17');
    expect(detections[0].source).toContain('sourceCompatibility');
  });

  it('detects java from a lone .java file', async () => {
    await fs.writeFile(path.join(dir, 'Main.java'), '');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.java).toBe('21');
  });
});

// ── Start command detection ──────────────────────────────────────────────────

describe('Start command detection', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('prefers npm run dev over npm start', async () => {
    await fs.writeJson(path.join(dir, 'package.json'), { scripts: { dev: 'vite', start: 'node index.js' } });
    const { start } = await scanProject(dir);
    expect(start).toBe('npm run dev');
  });

  it('falls back to npm start when no dev script', async () => {
    await fs.writeJson(path.join(dir, 'package.json'), { scripts: { start: 'node index.js' } });
    const { start } = await scanProject(dir);
    expect(start).toBe('npm start');
  });

  it('uses main field when no scripts', async () => {
    await fs.writeJson(path.join(dir, 'package.json'), { main: 'dist/index.js' });
    const { start } = await scanProject(dir);
    expect(start).toBe('node "dist/index.js"');
  });

  it('detects Django start command from manage.py', async () => {
    await fs.writeFile(path.join(dir, '.python-version'), '3.11.0');
    await fs.writeFile(path.join(dir, 'manage.py'), '');
    const { start } = await scanProject(dir);
    expect(start).toBe('python manage.py runserver');
  });

  it('detects python entry point from app.py', async () => {
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'flask');
    await fs.writeFile(path.join(dir, 'app.py'), '');
    const { start } = await scanProject(dir);
    expect(start).toBe('python "app.py"');
  });

  it('uses go run . for go.mod projects', async () => {
    await fs.writeFile(path.join(dir, 'go.mod'), 'module myapp\n\ngo 1.22.0\n');
    const { start } = await scanProject(dir);
    expect(start).toBe('go run .');
  });

  it('uses go run <file> for single .go file', async () => {
    await fs.writeFile(path.join(dir, 'main.go'), '');
    const { start } = await scanProject(dir);
    expect(start).toBe('go run "main.go"');
  });

  it('detects mvn spring-boot:run for Spring Boot pom.xml', async () => {
    await fs.writeFile(path.join(dir, 'pom.xml'), '<project>spring-boot</project>');
    const { start } = await scanProject(dir);
    expect(start).toBe('mvn spring-boot:run');
  });

  it('returns undefined for an empty directory', async () => {
    const { start } = await scanProject(dir);
    expect(start).toBeUndefined();
  });
});

// ── Multi-runtime project ────────────────────────────────────────────────────

describe('Multi-runtime project', () => {
  let dir: string;
  beforeEach(async () => { dir = await makeTmpDir(); });
  afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

  it('detects both node and python in the same project', async () => {
    await fs.writeJson(path.join(dir, 'package.json'), { name: 'app' });
    await fs.writeFile(path.join(dir, 'requirements.txt'), 'requests');
    const { runtimes } = await scanProject(dir);
    expect(runtimes.node).toBeTruthy();
    expect(runtimes.python).toBeTruthy();
  });
});
