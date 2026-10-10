import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import ts from 'typescript';
import { loadInspector, bootCoveredEnv, pluginIdentity, createResolver, sourceFiles, displayGraphFile } from '../check-hardwiring.mjs';

const api = await loadInspector();
const inspector = api.createHardwiringInspector({ compiler: ts });

test('boot coverage requires the same env key in envSnapshot and a real refusal branch', () => {
  const wiringSource = `runGate({envSnapshot: {
    hasDevSecretPlaceholder: !process.env.ANALYTICS_ROOT_KEY_SEED,
    hasDefaultOwnerPassword: (process.env.TOVU_ADMIN_PASSWORD ?? DEFAULT_OWNER_PASSWORD) === DEFAULT_OWNER_PASSWORD,
    harmless: !process.env.UNGATED
  }}); // process.env.COMMENTS_IP_SALT`;
  const refusalSource = `function refuse(envSnapshot) {
    if (envSnapshot.hasDevSecretPlaceholder) failures.push(unsafeDefaultFailure("secret"));
    if (envSnapshot.hasDefaultOwnerPassword) failures.push(unsafeDefaultFailure("password"));
    if (envSnapshot.harmless) console.warn("warning only");
  }`;
  const covered = bootCoveredEnv({ inspector, wiringSource, refusalSource });
  assert.deepEqual([...covered].sort(), ['ANALYTICS_ROOT_KEY_SEED', 'TOVU_ADMIN_PASSWORD']);
  const input = { file: 'composition.ts', mode: 'consumer', bootCoveredEnv: covered };
  assert.deepEqual(inspector.inspect({ ...input, source: 'const seed = process.env.ANALYTICS_ROOT_KEY_SEED ?? "dev-only-insecure-seed";' }), []);
  assert.deepEqual(inspector.inspect({ ...input, source: 'const salt = process.env.COMMENTS_IP_SALT ?? "dev-only-insecure-salt";' }).map((v) => v.rule), ['HW6-boot-default']);
  assert.deepEqual(inspector.inspect({ ...input, source: 'const salt = process.env.UNGATED ?? "dev-only-insecure-salt";' }).map((v) => v.rule), ['HW6-boot-default']);
});

test('plugin owners cover site/agent runtimes and individual installed plugins without a facade exception', () => {
  assert.equal(pluginIdentity({ file: '/repo/apps/website/src/features/plugin-runtime/tools.ts' }), 'plugin-runtime');
  assert.equal(pluginIdentity({ file: '/repo/apps/website/src/features/agent-plugins/tools.ts' }), 'agent-plugins');
  assert.equal(pluginIdentity({ file: '/repo/content/agent-plugins/github/tool.mjs' }), 'agent-plugins/github');
  assert.equal(pluginIdentity({ file: '/repo/apps/website/src/features/plugins/lipay/entry.ts' }), 'plugins/lipay');
  assert.equal(pluginIdentity({ file: '/repo/apps/website/src/contracts/ports.ts' }), undefined);
  assert.equal(pluginIdentity({ file: '/repo/apps/admin/src/features/plugins/PluginPanel.tsx' }), undefined);
  assert.equal(pluginIdentity({ file: '/repo/apps/website/src/features/plugins/data-module.ts' }), undefined);
  assert.equal(pluginIdentity({ file: '/repo/content/agent-plugins/resend/tool.mjs' }), 'agent-plugins/resend');
  const source = 'export * from "../agent-plugins/facade.js";';
  const input = { file: 'apps/website/src/features/plugin-runtime/tools.ts', source, mode: 'consumer', pluginIdentity: (file) => pluginIdentity({ file }), resolveImport: () => 'apps/website/src/features/agent-plugins/facade.ts' };
  assert.deepEqual(inspector.inspect(input).map((v) => v.rule), ['HW9-plugin-import']);
  assert.deepEqual(inspector.inspect({ ...input, resolveImport: () => 'apps/website/src/contracts/ports.ts' }), []);
  const installed = { ...input, file: 'content/agent-plugins/github/tool.mjs', source: 'import "../../resend/tool.mjs";', resolveImport: () => 'content/agent-plugins/resend/tool.mjs' };
  assert.deepEqual(inspector.inspect(installed).map((v) => v.rule), ['HW9-plugin-import']);
});

test('workspace and registry runtime paths normalize to the same package identity for debt', () => {
  const root = mkdtempSync(join(tmpdir(), 'hardwiring-package-'));
  try {
    for (const location of ['workspace/package', 'node_modules/package']) {
      const dir = join(root, location);
      mkdirSync(join(dir, 'dist'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: '@jini-ai/chat' }));
      assert.equal(displayGraphFile({ file: join(dir, 'dist/widget.js'), root }), 'node_modules/@jini-ai/chat');
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the public graph resolves executable browser exports rather than declarations that hide React', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'hardwiring-browser-')));
  try {
    const dir = join(root, 'node_modules/fixture-widget');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'fixture-widget', type: 'module', exports: { '.': { types: './index.d.ts', browser: './browser.js', default: './server.js' } } }));
    writeFileSync(join(dir, 'index.d.ts'), 'export declare const widget: number;');
    writeFileSync(join(dir, 'browser.js'), 'import "react"; export const widget = 1;');
    writeFileSync(join(dir, 'server.js'), 'export const widget = 1;');
    const entry = join(root, 'entry.ts');
    writeFileSync(entry, 'import { widget } from "fixture-widget";');
    const resolver = createResolver({ root, runtime: true });
    assert.equal(resolver('fixture-widget', entry), join(dir, 'browser.js'));
    const graph = inspector.inspectPublicGraph({ entries: [entry], readSource: (file) => ts.sys.readFile(file), resolveImport: resolver, displayFile: (file) => displayGraphFile({ root, file }) });
    assert.deepEqual(graph.map((v) => [v.rule, v.file]), [['HW7-public-react', 'node_modules/fixture-widget']]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('host resolution follows JS-suffixed source and aliases and fails closed on a missing code edge', () => {
  const root = mkdtempSync(join(tmpdir(), 'hardwiring-resolve-'));
  try {
    const dir = join(root, 'apps/website/src');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'entry.ts'), '');
    writeFileSync(join(dir, 'widget.ts'), 'export const value = 1;');
    const resolveImport = createResolver({ root });
    assert.equal(resolveImport('./widget.js', join(dir, 'entry.ts')), join(dir, 'widget.ts'));
    assert.equal(resolveImport('#src/widget', join(dir, 'entry.ts')), join(dir, 'widget.ts'));
    assert.equal(resolveImport('node:fs', join(dir, 'entry.ts')), undefined);
    assert.equal(resolveImport('./style.css', join(dir, 'entry.ts')), undefined);
    assert.throws(() => resolveImport('./missing.js', join(dir, 'entry.ts')), { message: 'Unresolved code import in apps/website/src/entry.ts (specifier omitted); refusing an incomplete public/plugin graph.' });
    mkdirSync(join(dir, '__tests__'));
    writeFileSync(join(dir, '__tests__/violation.ts'), 'fetch(url)');
    assert.deepEqual(sourceFiles({ directory: root }), [join(dir, 'entry.ts'), join(dir, 'widget.ts')]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
