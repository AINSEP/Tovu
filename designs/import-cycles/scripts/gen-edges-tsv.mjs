// Builds EDGES.tsv from the two edge dumps (made by edges.mjs revision 2: runtime = statement survives real compiler emission). Usage: node gen-edges-tsv.mjs <tovu-edges.json> <jini-edges.json> <feature-ranks.json> > EDGES.tsv
import fs from 'node:fs';
const [tovuFile, jiniFile, ranksFile] = process.argv.slice(2);
const d = JSON.parse(fs.readFileSync(tovuFile, 'utf8')); const j = JSON.parse(fs.readFileSync(jiniFile, 'utf8')); const rank = JSON.parse(fs.readFileSync(ranksFile, 'utf8'));
const SRC = 'apps/website/src/';
const unit = (f) => { const p = f.slice(SRC.length).split('/'); if (p[0] === 'features') return p.length > 2 ? p[1] : null; if (p[0] === 'platform' || p[0] === 'server') return p[0] + '/' + (p.length > 2 ? p[1] : '(root)'); return p[0]; };
const isFeat = (f) => f.startsWith(SRC + 'features/') && f.slice(SRC.length).split('/').length > 2;
const SCC24 = new Set('api-connections consent content-types custom-credentials deployments entries form-destinations media media-import navigation post project-keys publish-content publish-trust redirects settings site-backup site-export site-inspection source-control taxonomy theme trash widgets'.split(' '));
const CUT = {
  'publish-trust>deployments': ['repoint-to-jini: import isContainedDeployConfigPath from @jini-ai/devops/deploy; delete the two re-export shells', 'S1'],
  'project-keys>api-connections': ['move-down: apiConnectionVaultScope + API_CONNECTION_VAULT_KIND -> platform/secrets/vault-api-connection-meta.ts; repoint 3 production + 6 test importers; delete the PLUGIN_STATE_FORMAT re-export', 'S2'],
  'custom-credentials>source-control': ['repoint-to-jini (repositoryTargetError; delete forwarder repository-target.ts) + move-to-owner (bindSourceControlWritePort -> source-control/write-port.ts); RouteDeps.sourceControlWrite bound late by the host; 15 fixtures gain the field', 'S3'],
  'custom-credentials>deployments': ['port-inversion: PublishCompatibilityPort declared by custom-credentials; binding = today\'s prepareInvalidation body moved verbatim to deployments/publish-credentials; RouteDeps.publishCompatibility bound by the host', 'S4'],
  'source-control>site-backup': ['port-inversion: StaticSitePackagerPort declared by source-control; reaches preview AND commit through CommitSiteInput.packager (RouteDeps.staticSitePackager -> SourceControlToolDeps -> commitInput); implemented in site-backup', 'S5'],
};
const SHELL = {
  'external-mcp>assistant': ['reuse existing host port: ExternalMcpToolDeps gains notifyRosterChanged: NotifyToolAccessChanged (RouteDeps.notifyRosterChanged, already bound in deps.ts:2388 and app.ts:1335)', 'B1'],
  'platform/headless-browser>server/runtime': ['move-down (git mv, one module instance): startup-secrets.ts (leaf, 0 internal imports) -> platform/secrets; repoint 11 website production files, 2 desktop files, 1 eval harness, 4 test files', 'B2'],
  'assistant>server/runtime': ['move-down startupSecretEnvironment (B2) + port-inversion warmSiteServerForAgent (host binds)', 'B2/B3'],
  'assistant>server/inbound': ['move-down: async-route.ts and public-origin.ts are leaves -> platform/http', 'B3'],
};
const agg = new Map();
for (const e of d.edges) {
  const a = unit(e.from), b = unit(e.to); if (!a || !b || a === b) continue;
  const featPair = isFeat(e.from) && isFeat(e.to); const key = a + '>' + b;
  if (!featPair && !(key in SHELL)) continue;
  for (const kind of ['runtime', 'type']) {
    const names = e.names.filter((n) => (kind === 'runtime' ? n.use === 'value' : n.use !== 'value')).map((n) => n.name);
    const counts = kind === 'runtime' ? e.kind === 'runtime' : e.kind !== 'runtime' || names.length > 0;
    if (!counts) continue;
    const k = [featPair ? 'tovu-feature' : 'tovu-shell', a, b, kind].join('\t'); let r = agg.get(k); if (!r) agg.set(k, r = { imports: 0, files: new Set(), names: new Set(), sites: [] });
    if ((kind === 'runtime') === (e.kind === 'runtime')) { r.imports++; r.files.add(e.from); r.sites.push(e.from.slice(SRC.length) + ':' + e.line); }
    for (const n of names) r.names.add(n);
    // inline `type X` specifiers of a value import are listed on the runtime row, after " | types: "
    if (kind === 'runtime') for (const n of e.names) if (n.use !== 'value') (r.inlineTypes ||= new Set()).add(n.name);
  }
}
const out = [['scope', 'from', 'to', 'kind', 'in_scc24', 'imports', 'importing_files', 'imported_names', 'sites', 'fix_kind', 'step'].join('\t')];
for (const [k, r] of [...agg].sort((x, y) => x[0].localeCompare(y[0]))) {
  if (r.imports === 0) continue; // a type row made only of inline type specifiers: already shown on the runtime row
  const [scope, a, b, kind] = k.split('\t'); const key = a + '>' + b; let fix, step;
  if (scope === 'tovu-shell') [fix, step] = kind === 'runtime' ? SHELL[key] : ['goes with the runtime row', SHELL[key][1]];
  else if (key in CUT) [fix, step] = kind === 'runtime' ? CUT[key] : ['upward type-only import on a cut pair: remove it in this step where the new port/Jini type replaces it; any that remains is a T row', CUT[key][1]];
  else if (rank[b] >= rank[a]) [fix, step] = kind === 'type' ? ['contracts: upward type-only edge (rank ' + rank[a] + ' -> ' + rank[b] + '); consumer declares the port or the type moves to #src/contracts', 'T'] : ['UNEXPECTED upward runtime edge', '?'];
  else [fix, step] = ['keep (downward, rank ' + rank[a] + ' -> ' + rank[b] + ')', '-'];
  const showSites = step !== '-' ? r.sites.join(' ') : '';
  out.push([scope, a, b, kind, scope === 'tovu-feature' && SCC24.has(a) && SCC24.has(b) ? 'yes' : 'no', r.imports, r.files.size, [...r.names].join(',') + (r.inlineTypes ? ' | types: ' + [...r.inlineTypes].join(',') : ''), showSites, fix, step].join('\t'));
}
// Jini module cycles: every runtime edge inside a file-level SCC
const JFIX = { 'agent-runtime': ['split: pure helpers + types -> json-event-stream-shared.ts (internal leaf, not exported from index.ts); the 5 defs import the leaf; dispatcher keeps the parser map', 'J1'], daemon: ['split: JINI_MCP_SERVER_KEY + default read/write/remove + mergeMcpJsonContent -> agent-executor/mcp-json-file.ts (leaf); commit 1 repoints all 9 production + 1 test consumers of the 5 names; commit 2 deletes the 2 export-from lines and repoints their 2 production + 2 test consumers', 'J2'], admin: ['split: QueueActionsCell + its hook useQueueActionsCell -> components/QueueActionsCell.tsx + hooks/QueueActionsCell.hooks.ts; QueueSection.hooks.ts imports the cell file', 'J3'] };
const cyc = [['admin', ['packages/admin/src/comments/react/components/QueueSection.tsx', 'packages/admin/src/comments/react/hooks/QueueSection.hooks.ts']], ['agent-runtime', ['packages/agent-runtime/src/json-event-stream.ts', ...['codex', 'cursor-agent', 'gemini', 'kimi', 'opencode'].map((x) => `packages/agent-runtime/src/defs/${x}/event-stream.ts`)]], ['daemon', ['packages/daemon/src/agent-executor/mcp-bridge.ts', 'packages/daemon/src/agent-executor/claude/config-dir.ts', 'packages/daemon/src/agent-executor/claude/mcp-delivery.ts', 'packages/daemon/src/agent-executor/opencode/mcp-config.ts']]];
for (const [pkg, files] of cyc) for (const e of j.edges) if (e.kind === 'runtime' && files.includes(e.from) && files.includes(e.to)) out.push(['jini-module', e.from.replace('packages/', ''), e.to.replace('packages/', ''), 'runtime', 'n/a', 1, 1, e.names.filter((n) => n.use === 'value').map((n) => n.name).join(','), e.from.replace('packages/', '') + ':' + e.line, JFIX[pkg][0], JFIX[pkg][1]].join('\t'));
// Jini imports the compiler keeps although no name is used as a value (verbatimModuleSyntax). They load the module at runtime.
for (const e of j.edges) if (e.kind === 'runtime' && (e.empty || e.unused)) out.push(['jini-kept-import', e.from.replace('packages/', ''), e.to.replace('packages/', ''), e.empty ? 'runtime-empty' : 'runtime-unused', 'n/a', 1, 1, e.names.map((n) => n.name).join(','), e.from.replace('packages/', '') + ':' + e.line, e.empty ? 'emitted as `import {} from`: write `import type { … }` if the load is not wanted' : 'value import with no value use: kept by verbatimModuleSyntax; delete it or make it `import type`', 'J4 (visible to the gate; none is in a cycle)'].join('\t'));
console.log(out.join('\n'));
