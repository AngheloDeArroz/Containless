import * as path from 'path';
import * as fs from 'fs-extra';
import chalk from 'chalk';
import { logInfo, logWarn } from './utils';

// ── Types ───────────────────────────────────────────────────────────────────

export interface Detection {
  runtime: string;
  version: string;
  source: string;
}

export interface ScanResult {
  runtimes: Record<string, string>;
  start?: string;
  detections: Detection[];
}

// ── Default Fallback Versions ───────────────────────────────────────────────

const DEFAULT_VERSIONS: Record<string, string> = {
  node: '22.14.0',
  python: '3.12.0',
  java: '21',
  go: '1.22.0',
};

// ── Main Scanner ────────────────────────────────────────────────────────────

export async function scanProject(cwd?: string): Promise<ScanResult> {
  const dir = cwd || process.cwd();
  const detections: Detection[] = [];
  const runtimes: Record<string, string> = {};

  // Scan each runtime
  const nodeResult = await detectNode(dir);
  if (nodeResult) {
    detections.push(nodeResult);
    runtimes.node = nodeResult.version;
  }

  const pythonResult = await detectPython(dir);
  if (pythonResult) {
    detections.push(pythonResult);
    runtimes.python = pythonResult.version;
  }

  const goResult = await detectGo(dir);
  if (goResult) {
    detections.push(goResult);
    runtimes.go = goResult.version;
  }

  const javaResult = await detectJava(dir);
  if (javaResult) {
    detections.push(javaResult);
    runtimes.java = javaResult.version;
  }

  // Detect start command
  const start = await detectStartCommand(dir, runtimes);

  return { runtimes, start, detections };
}

// ── Node.js Detection ───────────────────────────────────────────────────────

async function detectNode(dir: string): Promise<Detection | null> {
  // 1. Check .nvmrc
  const nvmrcPath = path.join(dir, '.nvmrc');
  if (await fs.pathExists(nvmrcPath)) {
    const raw = (await fs.readFile(nvmrcPath, 'utf-8')).trim();
    const version = cleanNodeVersion(raw);
    if (version) {
      return { runtime: 'node', version, source: '.nvmrc' };
    }
  }

  // 2. Check .node-version
  const nodeVersionPath = path.join(dir, '.node-version');
  if (await fs.pathExists(nodeVersionPath)) {
    const raw = (await fs.readFile(nodeVersionPath, 'utf-8')).trim();
    const version = cleanNodeVersion(raw);
    if (version) {
      return { runtime: 'node', version, source: '.node-version' };
    }
  }

  // 3. Check package.json engines.node
  const pkgPath = path.join(dir, 'package.json');
  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
      if (pkg?.engines?.node) {
        const version = extractVersionFromRange(pkg.engines.node, 'node');
        return { runtime: 'node', version, source: 'package.json (engines.node)' };
      }
      // If package.json exists but no engines field, still detect Node
      return { runtime: 'node', version: DEFAULT_VERSIONS.node, source: 'package.json (detected)' };
    } catch {
      // Malformed JSON — still counts as a Node project
      return { runtime: 'node', version: DEFAULT_VERSIONS.node, source: 'package.json (detected)' };
    }
  }

  // 4. Fallback: check for .js or .ts files
  const files = await fs.readdir(dir).catch(() => []);
  if (files.some(f => f.endsWith('.js') || f.endsWith('.ts'))) {
    return { runtime: 'node', version: DEFAULT_VERSIONS.node, source: 'source files (.js/.ts)' };
  }

  return null;
}

/**
 * Clean a version string from .nvmrc or .node-version.
 * Handles formats like "v18.17.0", "18.17.0", "lts/hydrogen", "18"
 */
function cleanNodeVersion(raw: string): string {
  // Strip leading 'v'
  let version = raw.replace(/^v/i, '').trim();

  // If it's an LTS codename, use default
  if (version.startsWith('lts/') || !/\d/.test(version)) {
    return DEFAULT_VERSIONS.node;
  }

  // If it's just a major version (e.g. "18"), expand to a full version
  if (/^\d+$/.test(version)) {
    return expandMajorNodeVersion(version);
  }

  // If it's major.minor (e.g. "18.17"), append .0
  if (/^\d+\.\d+$/.test(version)) {
    return version + '.0';
  }

  return version;
}

/**
 * Expand a major Node version to a commonly available full version.
 */
function expandMajorNodeVersion(major: string): string {
  const knownLTS: Record<string, string> = {
    '18': '18.20.0',
    '20': '20.18.0',
    '22': '22.14.0',
  };
  return knownLTS[major] || `${major}.0.0`;
}

// ── Python Detection ────────────────────────────────────────────────────────

async function detectPython(dir: string): Promise<Detection | null> {
  // 1. Check .python-version
  const pyVersionPath = path.join(dir, '.python-version');
  if (await fs.pathExists(pyVersionPath)) {
    const raw = (await fs.readFile(pyVersionPath, 'utf-8')).trim().split('\n')[0].trim();
    if (/\d/.test(raw)) {
      const version = cleanPythonVersion(raw);
      return { runtime: 'python', version, source: '.python-version' };
    }
  }

  // 2. Check pyproject.toml for requires-python
  const pyprojectPath = path.join(dir, 'pyproject.toml');
  if (await fs.pathExists(pyprojectPath)) {
    const content = await fs.readFile(pyprojectPath, 'utf-8');
    const match = content.match(/requires-python\s*=\s*"([^"]+)"/);
    if (match) {
      const version = extractVersionFromRange(match[1], 'python');
      return { runtime: 'python', version, source: 'pyproject.toml (requires-python)' };
    }
    // pyproject.toml exists — it's a Python project
    return { runtime: 'python', version: DEFAULT_VERSIONS.python, source: 'pyproject.toml (detected)' };
  }

  // 3. Check for requirements.txt (presence-only detection)
  const reqPath = path.join(dir, 'requirements.txt');
  if (await fs.pathExists(reqPath)) {
    return { runtime: 'python', version: DEFAULT_VERSIONS.python, source: 'requirements.txt (detected)' };
  }

  // 4. Check for setup.py
  const setupPath = path.join(dir, 'setup.py');
  if (await fs.pathExists(setupPath)) {
    return { runtime: 'python', version: DEFAULT_VERSIONS.python, source: 'setup.py (detected)' };
  }

  // 5. Fallback: check for .py files
  const files = await fs.readdir(dir).catch(() => []);
  if (files.some(f => f.endsWith('.py'))) {
    return { runtime: 'python', version: DEFAULT_VERSIONS.python, source: 'source files (.py)' };
  }

  return null;
}

function cleanPythonVersion(raw: string): string {
  // Handle "3.12.0", "3.12", "3"
  if (/^\d+\.\d+\.\d+$/.test(raw)) return raw;
  if (/^\d+\.\d+$/.test(raw)) return raw + '.0';
  if (/^\d+$/.test(raw)) return raw + '.0.0';
  return DEFAULT_VERSIONS.python;
}

// ── Go Detection ────────────────────────────────────────────────────────────

async function detectGo(dir: string): Promise<Detection | null> {
  const goModPath = path.join(dir, 'go.mod');
  if (await fs.pathExists(goModPath)) {
    const content = await fs.readFile(goModPath, 'utf-8');
    // Match the `go 1.21` or `go 1.21.0` directive
    const match = content.match(/^go\s+(\d+\.\d+(?:\.\d+)?)\s*$/m);
    if (match) {
      let version = match[1];
      // Ensure it's a full version (e.g. 1.21 -> 1.21.0)
      if (/^\d+\.\d+$/.test(version)) {
        version += '.0';
      }
      return { runtime: 'go', version, source: 'go.mod' };
    }
    return { runtime: 'go', version: DEFAULT_VERSIONS.go, source: 'go.mod (detected)' };
  }

  // 2. Fallback: check for .go files
  const files = await fs.readdir(dir).catch(() => []);
  if (files.some(f => f.endsWith('.go'))) {
    return { runtime: 'go', version: DEFAULT_VERSIONS.go, source: 'source files (.go)' };
  }

  return null;
}

// ── Java Detection ──────────────────────────────────────────────────────────

async function detectJava(dir: string): Promise<Detection | null> {
  // 1. Check .java-version
  const javaVersionPath = path.join(dir, '.java-version');
  if (await fs.pathExists(javaVersionPath)) {
    const raw = (await fs.readFile(javaVersionPath, 'utf-8')).trim();
    if (/\d/.test(raw)) {
      return { runtime: 'java', version: raw, source: '.java-version' };
    }
  }

  // 2. Check pom.xml (Maven)
  const pomPath = path.join(dir, 'pom.xml');
  if (await fs.pathExists(pomPath)) {
    const content = await fs.readFile(pomPath, 'utf-8');

    // Look for <java.version>21</java.version>
    let match = content.match(/<java\.version>\s*(\d+)\s*<\/java\.version>/);
    if (match) {
      return { runtime: 'java', version: match[1], source: 'pom.xml (java.version)' };
    }

    // Look for <maven.compiler.source>21</maven.compiler.source>
    match = content.match(/<maven\.compiler\.source>\s*(\d+)\s*<\/maven\.compiler\.source>/);
    if (match) {
      return { runtime: 'java', version: match[1], source: 'pom.xml (maven.compiler.source)' };
    }

    // pom.xml exists — it's a Java project
    return { runtime: 'java', version: DEFAULT_VERSIONS.java, source: 'pom.xml (detected)' };
  }

  // 3. Check build.gradle or build.gradle.kts (Gradle)
  const gradlePath = path.join(dir, 'build.gradle');
  const gradleKtsPath = path.join(dir, 'build.gradle.kts');
  const actualGradlePath = (await fs.pathExists(gradlePath))
    ? gradlePath
    : (await fs.pathExists(gradleKtsPath))
      ? gradleKtsPath
      : null;

  if (actualGradlePath) {
    const content = await fs.readFile(actualGradlePath, 'utf-8');
    const fileName = path.basename(actualGradlePath);

    // Look for sourceCompatibility = JavaVersion.VERSION_21 or sourceCompatibility = '21'
    let match = content.match(/sourceCompatibility\s*=\s*(?:JavaVersion\.VERSION_)?['"]?(\d+)['"]?/);
    if (match) {
      return { runtime: 'java', version: match[1], source: `${fileName} (sourceCompatibility)` };
    }

    // Look for java { toolchain { languageVersion.set(JavaLanguageVersion.of(21)) } }
    match = content.match(/JavaLanguageVersion\.of\(\s*(\d+)\s*\)/);
    if (match) {
      return { runtime: 'java', version: match[1], source: `${fileName} (toolchain)` };
    }

    // Gradle file exists — it's a Java project
    return { runtime: 'java', version: DEFAULT_VERSIONS.java, source: `${fileName} (detected)` };
  }

  // 4. Fallback: check for .java files
  const files = await fs.readdir(dir).catch(() => []);
  if (files.some(f => f.endsWith('.java'))) {
    return { runtime: 'java', version: DEFAULT_VERSIONS.java, source: 'source files (.java)' };
  }

  return null;
}

// ── Start Command Detection ─────────────────────────────────────────────────

async function detectStartCommand(
  dir: string,
  runtimes: Record<string, string>
): Promise<string | undefined> {
  // Node.js projects
  if (runtimes.node) {
    const pkgPath = path.join(dir, 'package.json');
    if (await fs.pathExists(pkgPath)) {
      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        const scripts = pkg?.scripts || {};

        // Priority: dev > start > main field
        if (scripts.dev) return 'npm run dev';
        if (scripts.start) return 'npm start';
        if (pkg.main) return `node "${pkg.main}"`;
      } catch {
        // ignore
      }
    }

    // Fallback: single file
    const files = await fs.readdir(dir).catch(() => []);
    const jsFiles = files.filter(f => f.endsWith('.js') || f.endsWith('.ts'));
    if (jsFiles.length === 1) {
      const file = jsFiles[0];
      return file.endsWith('.ts') ? `npx ts-node "${file}"` : `node "${file}"`;
    }
  }

  // Python projects
  if (runtimes.python) {
    // Django
    if (await fs.pathExists(path.join(dir, 'manage.py'))) {
      return 'python manage.py runserver';
    }
    // Common entry points
    for (const entry of ['app.py', 'main.py', 'run.py']) {
      if (await fs.pathExists(path.join(dir, entry))) {
        return `python "${entry}"`;
      }
    }

    // Fallback: single file
    const files = await fs.readdir(dir).catch(() => []);
    const pyFiles = files.filter(f => f.endsWith('.py'));
    if (pyFiles.length === 1) {
      return `python "${pyFiles[0]}"`;
    }
  }

  // Go projects
  if (runtimes.go) {
    const files = await fs.readdir(dir).catch(() => []);
    const goFiles = files.filter(f => f.endsWith('.go'));
    if (goFiles.length === 1) {
      return `go run "${goFiles[0]}"`;
    }
    return 'go run .';
  }

  // Java — Maven
  if (runtimes.java) {
    if (await fs.pathExists(path.join(dir, 'pom.xml'))) {
      // Check for Spring Boot
      const pomContent = await fs.readFile(path.join(dir, 'pom.xml'), 'utf-8');
      if (pomContent.includes('spring-boot')) {
        return 'mvn spring-boot:run';
      }
      return 'mvn exec:java';
    }

    // Gradle
    const hasGradle =
      (await fs.pathExists(path.join(dir, 'build.gradle'))) ||
      (await fs.pathExists(path.join(dir, 'build.gradle.kts')));
    if (hasGradle) {
      const gradleFile = (await fs.pathExists(path.join(dir, 'build.gradle')))
        ? path.join(dir, 'build.gradle')
        : path.join(dir, 'build.gradle.kts');
      const content = await fs.readFile(gradleFile, 'utf-8');
      if (content.includes('spring-boot') || content.includes('org.springframework.boot')) {
        return 'gradle bootRun';
      }
      return 'gradle run';
    }

    // Fallback: single file
    const files = await fs.readdir(dir).catch(() => []);
    const javaFiles = files.filter(f => f.endsWith('.java'));
    if (javaFiles.length === 1) {
      return `java "${javaFiles[0]}"`;
    }
  }

  return undefined;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract a concrete version from a semver range string.
 * For example: ">=18.0.0" → "18.0.0", "^3.11" → "3.11.0", "~20.10" → "20.10.0"
 */
function extractVersionFromRange(range: string, runtime: string): string {
  // Clean common prefixes
  const cleaned = range.replace(/^[>=^~<!\s]+/, '').trim();

  // Try to pull out a version number
  const match = cleaned.match(/(\d+(?:\.\d+)*)/);
  if (!match) {
    return DEFAULT_VERSIONS[runtime] || cleaned;
  }

  let version = match[1];

  // Ensure we have a full version
  const parts = version.split('.');
  if (runtime === 'node') {
    if (parts.length === 1) return expandMajorNodeVersion(parts[0]);
    if (parts.length === 2) return version + '.0';
  } else if (runtime === 'python') {
    if (parts.length === 1) return version + '.0.0';
    if (parts.length === 2) return version + '.0';
  }

  return version;
}
