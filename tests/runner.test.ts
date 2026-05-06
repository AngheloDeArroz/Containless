/**
 * tests/runner.test.ts
 * Security tests for src/runner.ts — validates shell injection prevention
 * and the executable allowlist without modifying any source code.
 *
 * All tests go through the public `runCommand` API, which is the real
 * attack surface. Validation errors are thrown before any process spawns.
 */
import { describe, it, expect } from 'vitest';
import { runCommand } from '../src/runner';

// ── Shell injection prevention ────────────────────────────────────────────────

describe('runCommand — shell injection prevention', () => {
  it('rejects commands containing a semicolon', async () => {
    await expect(
      runCommand({ command: 'node index.js; rm -rf /', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing a pipe', async () => {
    await expect(
      runCommand({ command: 'node app.js | cat /etc/passwd', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing a backtick', async () => {
    await expect(
      runCommand({ command: 'node `whoami`', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing an ampersand', async () => {
    await expect(
      runCommand({ command: 'node app.js & malicious', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing a dollar sign', async () => {
    await expect(
      runCommand({ command: 'node $HOME/evil.js', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing a subshell $(...)', async () => {
    await expect(
      runCommand({ command: 'node $(cat /etc/passwd)', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing a newline', async () => {
    await expect(
      runCommand({ command: 'node app.js\nrm -rf /', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing a carriage return', async () => {
    await expect(
      runCommand({ command: 'node app.js\rrm -rf /', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing a redirection >', async () => {
    await expect(
      runCommand({ command: 'node app.js > /etc/passwd', runtimes: {} })
    ).rejects.toThrow();
  });

  it('rejects commands containing a redirection <', async () => {
    await expect(
      runCommand({ command: 'node app.js < /etc/passwd', runtimes: {} })
    ).rejects.toThrow();
  });
});

// ── Executable allowlist ──────────────────────────────────────────────────────

describe('runCommand — executable allowlist', () => {
  it('rejects curl', async () => {
    await expect(
      runCommand({ command: 'curl http://evil.com', runtimes: {} })
    ).rejects.toThrow('not in the allowed list');
  });

  it('rejects wget', async () => {
    await expect(
      runCommand({ command: 'wget http://evil.com', runtimes: {} })
    ).rejects.toThrow('not in the allowed list');
  });

  it('rejects rm', async () => {
    await expect(
      runCommand({ command: 'rm -rf /', runtimes: {} })
    ).rejects.toThrow('not in the allowed list');
  });

  it('rejects bash', async () => {
    await expect(
      runCommand({ command: 'bash script.sh', runtimes: {} })
    ).rejects.toThrow('not in the allowed list');
  });

  it('rejects powershell', async () => {
    await expect(
      runCommand({ command: 'powershell -c evil', runtimes: {} })
    ).rejects.toThrow('not in the allowed list');
  });

  it('rejects an arbitrary binary', async () => {
    await expect(
      runCommand({ command: 'evil-binary --flag', runtimes: {} })
    ).rejects.toThrow('not in the allowed list');
  });

  it('rejects an absolute path to a binary not on the allowlist', async () => {
    await expect(
      runCommand({ command: '/usr/bin/curl http://evil.com', runtimes: {} })
    ).rejects.toThrow('not in the allowed list');
  });
});

// ── Allowed executables pass validation ───────────────────────────────────────
// These tests verify that allowed executables are NOT rejected by the
// security checks. The command will still fail (e.g. ENOENT) since we
// are not in a real project, but it must NOT throw "not in the allowed list".

describe('runCommand — allowed executables are not blocked by security checks', () => {
  async function isBlockedBySecurity(command: string): Promise<boolean> {
    try {
      await runCommand({ command, runtimes: {} });
      return false;
    } catch (err: any) {
      return String(err?.message).includes('not in the allowed list') ||
             String(err?.message).includes('dangerous characters');
    }
  }

  it('does not block "node --version"', async () => {
    expect(await isBlockedBySecurity('node --version')).toBe(false);
  });

  it('does not block "npm run dev"', async () => {
    expect(await isBlockedBySecurity('npm run dev')).toBe(false);
  });

  it('does not block "python main.py"', async () => {
    expect(await isBlockedBySecurity('python main.py')).toBe(false);
  });

  it('does not block "go run ."', async () => {
    expect(await isBlockedBySecurity('go run .')).toBe(false);
  });

  it('does not block "java -jar app.jar"', async () => {
    expect(await isBlockedBySecurity('java -jar app.jar')).toBe(false);
  });

  it('does not block "mvn spring-boot:run"', async () => {
    expect(await isBlockedBySecurity('mvn spring-boot:run')).toBe(false);
  });

  it('does not block "gradle bootRun"', async () => {
    expect(await isBlockedBySecurity('gradle bootRun')).toBe(false);
  });

  it('does not block "npx ts-node index.ts"', async () => {
    expect(await isBlockedBySecurity('npx ts-node index.ts')).toBe(false);
  });
});
