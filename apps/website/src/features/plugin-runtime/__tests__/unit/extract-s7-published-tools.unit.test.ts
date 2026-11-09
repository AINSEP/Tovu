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

test('resolved emitted contracts document the security and ordering obligations a second host needs', () => {
  let functions = 0;
  const requiredNotes: Record<string, RegExp> = {
    authorize: /same permission evaluator.*after human approval/i,
    approvalFingerprint: /same fingerprint owner.*every supplied revision/i,
    executeCommand: /existing command gateway.*rollback/i,
    lowerToolAccess: /after durable OFF.*propagate cleanup failure/i,
    uninstall: /complete authorize, preview, confirm and remove.*authenticated exchange/i,
    recordDeclinedAccess: /only a genuine declined answer.*same scoped connection owner/i,
    compatibility: /every supplied revision.*without relisting/i,
    handler: /authenticated actor\/tool\/exchange.*missing transport.*unanswered required approval/i,
    prepare: /Authorize before disclosing.*detach the proposal identity/i,
    run: /Reauthorize and revalidate.*before.*mutation/i,
    inactivePluginIds: /Strict approval reads must refuse.*non-strict list reads/i,
    setEnabled: /Share the workspace admission queue and activation repository/i,
    provisionMcp: /only after successful enable.*approved access key unchanged/i,
    classifyError: /canonical host error classes.*unknown failures.*identity/i,
    pluginActivationRepo: /Share this workspace-scoped repository.*same activation state/i,
    pluginSource: /Record source approval before enabling.*OFF if recording fails/i,
    rollback: /exact prior activation row.*newly created row.*hooks/i,
    flag: /false-valued result field.*declined is absent/i,
    ask: /false skips the human dialog and runs immediately/i,
    declined: /Replace the default no-answer result.*without running the mutation/i,
    listInstalled: /rejected listing empties the entire agentPlugins list.*isolate failure/i,
    updatePendingNextStep: /Only PLUGIN_UPDATE_PENDING is recoverable by restart.*other update codes/i,
    registration: /List rejects all input.*family\/pluginId\/enabled.*exactly site-runtime or agent-plugin/i,
    toolIds: /Every operation reads id.*name\/description.*oldString\/newString.*replaceAll/i,
    installer: /canonical PluginInstallError.*relayable refusals.*opaque failure/i,
  };
  const documented = new Set<string>();
  let sourceErrorNote = false;
  let constructionNote = false;
  for (const name of ['contract', 'management', 'install', 'source']) {
    const url = new URL(`./${name}.d.ts`, publicEntry);
    const declaration = readFileSync(url, 'utf8');
    assert.doesNotMatch(declaration, /Preserve the existing caller-safe plugin protocol value|Required host inputs have no vocabulary defaults/);
    const ast = ts.createSourceFile(url.href, declaration, ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node): void {
      if (name === 'contract' && (ts.isPropertySignature(node) || ts.isMethodSignature(node))) {
        const notes = ts.getJSDocTags(node).filter(tag => tag.tagName.text === 'agent-note');
        const member = node.name.getText(ast);
        if (notes.some(note => typeof note.comment === 'string' && requiredNotes[member]?.test(note.comment))) documented.add(member);
        if (member === 'pluginSource' && notes.some(note => typeof note.comment === 'string' && /canonical PluginSourceError or PluginInstallError.*relayable refusals/i.test(note.comment))) sourceErrorNote = true;
        if (member === 'handler' && notes.some(note => typeof note.comment === 'string' && /set-enabled.*at registration.*uninstall.*per call/i.test(note.comment))) constructionNote = true;
      }
      if (ts.isFunctionDeclaration(node) && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        functions++;
      }
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  for (const member of Object.keys(requiredNotes)) assert.ok(documented.has(member), member);
  assert.equal(sourceErrorNote, true);
  assert.equal(constructionNote, true);
  assert.equal(functions, 7);
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
