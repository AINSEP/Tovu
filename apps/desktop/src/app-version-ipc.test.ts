/** Owner 2026-10-09: the nav version comes from Electron through the fixed preload contract. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { RUNNER_APP_VERSION_CHANNEL } from './contracts/app-version.ts';
import { describeDesktopTag, registerAppVersionIpc } from './app-version-ipc.ts';

/** Read actual wiring expressions without importing Electron or mocking a module. */
function sourceFile(relative: string): ts.SourceFile {
  return ts.createSourceFile(relative, readFileSync(new URL(relative, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
}

function findNode<T extends ts.Node>(file: ts.SourceFile, predicate: (node: ts.Node) => node is T): T {
  let found: T | undefined;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (predicate(node)) found = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(found, 'expected version wiring in the actual source');
  return found;
}

function evaluate<T>(expression: string, deps: Record<string, unknown>): T {
  const code = ts.transpile(`const value = ${expression};`, { target: ts.ScriptTarget.ES2022 });
  return new Function(...Object.keys(deps), `${code}; return value;`)(...Object.values(deps)) as T;
}

test('packaged: version IPC registers the exact contract channel and reads app.getVersion on each request', () => {
  const handlers = new Map<string, () => string | Promise<string>>();
  let version = '8.2.7';
  let reads = 0;
  registerAppVersionIpc({
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); } },
    app: { getVersion: () => { reads++; return version; }, isPackaged: true },
  }, { describeTag: async () => assert.fail('a packaged build never runs git') });
  assert.equal(RUNNER_APP_VERSION_CHANNEL, 'runner:app:version');
  assert.deepEqual([...handlers.keys()], [RUNNER_APP_VERSION_CHANNEL]);
  assert.equal(reads, 0, 'registration does not cache a package version');
  assert.equal(handlers.get(RUNNER_APP_VERSION_CHANNEL)!(), '8.2.7');
  version = '8.2.8-beta.3';
  assert.equal(handlers.get(RUNNER_APP_VERSION_CHANNEL)!(), '8.2.8-beta.3');
  assert.equal(reads, 2);
});

test('dev launch: the nearest desktop-v tag plus -dev, read once in the repo root', async () => {
  const handlers = new Map<string, () => string | Promise<string>>();
  const cwds: string[] = [];
  registerAppVersionIpc({
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); } },
    app: { getVersion: () => '0.1.22', isPackaged: false },
  }, { repoRoot: '/repo', describeTag: async ({ cwd }) => { cwds.push(cwd); return 'desktop-v0.1.24\n'; } });
  const handler = handlers.get(RUNNER_APP_VERSION_CHANNEL)!;
  assert.equal(await handler(), '0.1.24-dev');
  assert.equal(await handler(), '0.1.24-dev');
  assert.deepEqual(cwds, ['/repo'], 'git runs once at registration, not per request');
});

/** The fallback itself is the engine's (`@jini-ai/desktop-host` app-version.test.ts); this pins Tovu's `desktop-v` rule and `-dev` suffix through the real registrar. */
async function devVersionFor(describeTag: () => Promise<string>): Promise<string> {
  const handlers = new Map<string, () => string | Promise<string>>();
  registerAppVersionIpc({
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); } },
    app: { getVersion: () => '0.1.22', isPackaged: false },
  }, { repoRoot: '/repo', describeTag });
  return handlers.get(RUNNER_APP_VERSION_CHANNEL)!();
}

test('dev launch without git, a tag, or a desktop-v tag falls back to package.json version plus -dev', async () => {
  assert.equal(await devVersionFor(async () => { throw new Error('spawn git ENOENT'); }), '0.1.22-dev');
  assert.equal(await devVersionFor(async () => ''), '0.1.22-dev');
  assert.equal(await devVersionFor(async () => 'desktop-v'), '0.1.22-dev');
  assert.equal(await devVersionFor(async () => 'release-v0.1.24'), '0.1.22-dev');
});

test('the preload forwards getAppVersion with no renderer-supplied payload', async () => {
  const file = sourceFile('./preload/preload.mts');
  const property = findNode(file, (node): node is ts.PropertyAssignment =>
    ts.isPropertyAssignment(node) && node.name.getText(file) === 'getAppVersion');
  const calls: unknown[][] = [];
  const getAppVersion = evaluate<() => Promise<string>>(property.initializer.getText(file), {
    RUNNER_APP_VERSION_CHANNEL,
    ipcRenderer: { invoke: async (...args: unknown[]) => { calls.push(args); return '9.4.6'; } },
  });
  assert.equal(await getAppVersion(), '9.4.6');
  assert.deepEqual(calls, [[RUNNER_APP_VERSION_CHANNEL]]);
  assert.ok(file.statements.some((node) => ts.isImportDeclaration(node)
    && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text === '../contracts/app-version.js'));
});

// Source text on purpose: the Electron entry (src/main/index.ts) imports "electron" at module scope
// and cannot load under node --test, and the registration is one line of its sites-home boot. The
// adapter's behaviour is covered by the tests above, and that it is registered before the sites home
// window opens by `src/main/boot/boot-sequence.test.ts` (`runSitesHomeBoot`). This pins only that the
// entry hands it Electron's own app and the repo root.
test('main registers the version adapter with Electron\'s own app and the repo root', () => {
  const file = sourceFile('./main/index.ts');
  const registration = findNode(file, (node): node is ts.CallExpression =>
    ts.isCallExpression(node) && node.expression.getText(file) === 'registerAppVersionIpc');
  assert.equal(registration.getText(file), 'registerAppVersionIpc({ ipcMain, app }, { repoRoot: REPO_ROOT })');
});

test('the real Git port finds the desktop tag past a newer unrelated tag', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'tovu-desktop-version-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', [
    '-c', 'user.name=Desktop Test', '-c', 'user.email=desktop@example.test', '-c', 'commit.gpgSign=false',
    '-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args,
  ], { cwd, stdio: 'pipe' });
  git('init', '--quiet');
  git('commit', '--quiet', '--allow-empty', '-m', 'desktop release');
  await assert.rejects(describeDesktopTag({ cwd }), { code: 128 });
  git('tag', 'desktop-v8.3.2');
  git('commit', '--quiet', '--allow-empty', '-m', 'unrelated release');
  git('tag', 'website-v9.0.0');
  assert.equal((await describeDesktopTag({ cwd })).trim(), 'desktop-v8.3.2');
});

test('the real Git port rejects when the executable is absent from PATH', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'tovu-no-git-'));
  const originalPath = process.env.PATH;
  const originalAgentHome = process.env.AGENT_RUNTIME_HOME;
  t.after(() => {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalAgentHome === undefined) delete process.env.AGENT_RUNTIME_HOME;
    else process.env.AGENT_RUNTIME_HOME = originalAgentHome;
    rmSync(cwd, { recursive: true, force: true });
  });
  process.env.PATH = cwd;
  process.env.AGENT_RUNTIME_HOME = cwd;
  await assert.rejects(describeDesktopTag({ cwd }), { message: 'git executable is unavailable.' });
});

test('dev launch with no injected git port reads the real repo root tag through describeDesktopTag', async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), 'tovu-desktop-default-port-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', [
    '-c', 'user.name=Desktop Test', '-c', 'user.email=desktop@example.test', '-c', 'commit.gpgSign=false',
    '-c', 'tag.gpgSign=false', '-c', 'core.hooksPath=/dev/null', ...args,
  ], { cwd, stdio: 'pipe' });
  git('init', '--quiet');
  git('commit', '--quiet', '--allow-empty', '-m', 'desktop release');
  git('tag', 'desktop-v7.5.1');
  const handlers = new Map<string, () => string | Promise<string>>();
  registerAppVersionIpc({
    ipcMain: { handle: (channel, handler) => { handlers.set(channel, handler); } },
    app: { getVersion: () => '0.1.22', isPackaged: false },
  }, { repoRoot: cwd });
  assert.equal(await handlers.get(RUNNER_APP_VERSION_CHANNEL)!(), '7.5.1-dev');
});
