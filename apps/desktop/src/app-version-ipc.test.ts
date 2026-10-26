/** Owner 2026-10-09: the nav version comes from Electron through the fixed preload contract. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
import { RUNNER_APP_VERSION_CHANNEL } from './contracts/app-version.ts';
import { devAppVersion, registerAppVersionIpc } from './app-version-ipc.ts';

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

test('dev launch without git or a tag falls back to package.json version plus -dev', async () => {
  assert.equal(await devAppVersion({ repoRoot: '/repo', packageVersion: '0.1.22' },
    { describeTag: async () => { throw new Error('spawn git ENOENT'); } }), '0.1.22-dev');
  assert.equal(await devAppVersion({ repoRoot: '/repo', packageVersion: '0.1.22' },
    { describeTag: async () => '' }), '0.1.22-dev');
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

test('main registers the version adapter with Electron before opening the sites home renderer', () => {
  const file = sourceFile('../main.ts');
  const registration = findNode(file, (node): node is ts.CallExpression =>
    ts.isCallExpression(node) && node.expression.getText(file) === 'registerAppVersionIpc');
  const handlers = new Map<string, () => string | Promise<string>>();
  evaluate(registration.getText(file), {
    registerAppVersionIpc,
    REPO_ROOT: '/repo',
    ipcMain: { handle: (channel: string, handler: () => string) => { handlers.set(channel, handler); } },
    app: { getVersion: () => '6.3.1', isPackaged: true },
  });
  assert.equal(handlers.get(RUNNER_APP_VERSION_CHANNEL)!(), '6.3.1');
  const opening = findNode(file, (node): node is ts.CallExpression =>
    ts.isCallExpression(node) && node.expression.getText(file) === 'openSitesHomeWindow');
  assert.ok(registration.getStart(file) < opening.getStart(file));
});
