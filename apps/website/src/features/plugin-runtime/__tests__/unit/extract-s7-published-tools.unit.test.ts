import assert from 'node:assert/strict';
import test from 'node:test';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { PluginInstallError } from '@jini-ai/plugins/host/node';
import { AgentPluginNotInstalledError } from '@jini-ai/agent-plugins/lifecycle';
import { buildRegistrations as installShim } from '../../install-tool.js';
import { bindPluginManagementTools } from '../../host-tool-binding.js';
import { harness, context } from '../fixtures/plugins-tool-harness.js';

const publicEntry = import.meta.resolve('@jini-ai/plugins/host/tools');
function publishedRoot(): string {
  let dir = path.dirname(fileURLToPath(publicEntry));
  while (!existsSync(path.join(dir, 'package.json'))) { const parent = path.dirname(dir); assert.notEqual(parent, dir); dir = parent; }
  return dir;
}

test('published package.json+dist imports in plain Node without writes, child processes or servers', () => {
  const cache = path.resolve('node_modules/.cache'); mkdirSync(cache, { recursive: true });
  const dir = mkdtempSync(path.join(cache, 's7-published-'));
  try {
    const installed = path.join(dir, 'node_modules/@jini-ai/plugins'); mkdirSync(installed, { recursive: true });
    const root = publishedRoot(); cpSync(path.join(root, 'package.json'), path.join(installed, 'package.json')); cpSync(path.join(root, 'dist'), path.join(installed, 'dist'), { recursive: true });
    assert.equal(existsSync(path.join(installed, 'src')), false);
    const script = path.join(dir, 'smoke.mjs');
    writeFileSync(script, `import fs from 'node:fs'; import fsp from 'node:fs/promises'; import net from 'node:net'; import cp from 'node:child_process'; import { syncBuiltinESMExports } from 'node:module';
const refuse = () => { throw new Error('import performed a startup effect'); };
for (const key of ['writeFileSync','appendFileSync','mkdirSync','renameSync','rmSync']) fs[key] = refuse;
for (const key of ['writeFile','appendFile','mkdir','rename','rm']) fsp[key] = refuse;
net.Server.prototype.listen = refuse; cp.spawn = refuse; cp.exec = refuse; cp.execFile = refuse; syncBuiltinESMExports();
const entry = import.meta.resolve('@jini-ai/plugins/host/tools');
const api = await import(entry);
for (const key of ['buildPluginManagementRegistrations','buildPluginInstallRegistrations','buildPluginSourceRegistrations']) if (typeof api[key] !== 'function') throw new Error(key);
console.log('published import has no startup effects');\n`);
    const run = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 15000 });
    assert.equal(run.status, 0, run.stderr); assert.equal(run.stdout.trim(), 'published import has no startup effects');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('resolved emitted contracts retain attached second-host notes on every local member and public method', () => {
  let members = 0; let functions = 0;
  const missing: string[] = [];
  for (const name of ['contract', 'management', 'install', 'source']) {
    const url = new URL(`./${name}.d.ts`, publicEntry);
    const ast = ts.createSourceFile(url.href, readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (ts.isPropertySignature(node) || ts.isMethodSignature(node)) {
        members++;
        const notes = ts.getJSDocTags(node).filter(tag => tag.tagName.text === 'agent-note');
        if (!notes.some(note => typeof note.comment === 'string' && note.comment.length > 25)) missing.push(`${name}:${node.name.getText(ast)}`);
      }
      if (ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        functions++;
        assert.ok(ts.getJSDocTags(node).some(tag => tag.tagName.text === 'agent-note'), node.name?.text);
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
    if (name === 'contract') {
      for (const member of ['authorize', 'approvalFingerprint', 'executeCommand', 'lowerToolAccess', 'uninstall', 'recordDeclinedAccess', 'compatibility']) {
        const matches: ts.Node[] = [];
        function find(node: ts.Node): void { if ((ts.isMethodSignature(node) || ts.isPropertySignature(node)) && node.name.getText(ast) === member) matches.push(node); ts.forEachChild(node, find); }
        find(ast); assert.ok(matches.length, member);
        assert.ok(matches.some(node => ts.getJSDocTags(node).some(tag => typeof tag.comment === 'string' && /same|canonical|existing|sole|authenticated|owner|EVERY/i.test(tag.comment))), member);
      }
    }
  }
  assert.deepEqual(missing, []); assert.ok(members > 80); assert.equal(functions, 7);
  const index = readFileSync(new URL('./index.d.ts', publicEntry), 'utf8');
  assert.match(index, /@agent-note[\s\S]*semver[\s\S]*@jini-ai\/platform/);
});

test('canonical owner errors cross the old shim and host classifier; lookalikes retain identity', async () => {
  const h = harness();
  const error = new PluginInstallError('FOREIGN_REFUSAL', 'safe owner refusal');
  assert.ok(error instanceof PluginInstallError);
  const deps = { ...h.deps, hostSignals: { hosted: false, nativeToolsRestricted: false, labels: [] }, pluginInstaller: { preview: async () => { throw error; }, install: async () => { throw new Error('write must not run'); } } };
  const registration = installShim(deps)[0]!;
  await assert.rejects(() => Promise.resolve(registration.handler(context({ source: { kind: 'folder', path: '/host-owned' } }), {})), /FOREIGN_REFUSAL: safe owner refusal/);
  const ports = bindPluginManagementTools({ deps: h.deps, surfaces: { surfaceExchanges: h.surfaceExchanges } });
  const canonical = new AgentPluginNotInstalledError({ pluginId: 'other' });
  assert.deepEqual(ports.agentPlugins.classifyError({ error: canonical }), { kind: 'not-installed', message: canonical.message });
  const lookalike = new Error('same name is insufficient'); lookalike.name = canonical.name;
  assert.equal(ports.agentPlugins.classifyError({ error: lookalike }), undefined);
  const unknownDeps = { ...deps, pluginInstaller: { ...deps.pluginInstaller, preview: async () => { throw lookalike; } } };
  await assert.rejects(() => Promise.resolve(installShim(unknownDeps)[0]!.handler(context({ source: { kind: 'folder', path: '/host-owned' } }), {})), value => value === lookalike);
});
