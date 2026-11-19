// Design-time generator for the v4 sheets M1-M3, H1-H4, L1-L6 and R (same format as B01-B25).
// node sheets-rest.cjs <deps.ts tip> <B-census.json> <rest.json> <phases.json> <deps.before-R.ts> <deps.after-R.ts> <tests.txt> <outDir>
const ts = require('/opt/node-tools/node_modules/typescript'); const fs = require('fs'); const crypto = require('crypto');
const [F, bF, rF, pF, beforeRF, afterRF, testsF, OUT] = process.argv.slice(2);
const lines = fs.readFileSync(F, 'utf8').split('\n'); const B = JSON.parse(fs.readFileSync(bF, 'utf8')); const R = JSON.parse(fs.readFileSync(rF, 'utf8'));
const PH = JSON.parse(fs.readFileSync(pF, 'utf8')); const tests = fs.readFileSync(testsF, 'utf8').trim().split('\n');
const DIR = 'apps/website/src/server/runtime/composition'; const DEPS = `${DIR}/deps.ts`; const SD = `${DIR}/site-deps`;
const TIP = 'Design tip: Tovu `2d82735a` (`origin/integ/merge-3-2026-11-18`), Jini `d37821a4`. One commit. Self-contained: COMMON rules are restated here.';
const q = (s) => s.replace(/'/g, "'\\''");
const tick = (s) => '`' + String(s).replace(/\|/g, '\\|').replace(/`/g, "'") + '`';
const isCode = (l) => { const t = l.trim(); return t && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); };
const bOut = new Map(); B.forEach((c) => c.range && c.outputs.forEach((o) => bOut.set(o, c)));
const hOut = { projectKeys: 'compositionProjectKeys', commerceBinding: 'compositionCommerce' };
const pascal = (s) => s[0].toUpperCase() + s.slice(1);
function typeOf(i, { phaseOut } = {}) {
  if (i.decl === 'param' || i.from === 'root parameter') return 'by the rule (root parameter)';
  if (phaseOut && phaseOut.has(i.n)) return tick(`ReturnType<typeof ${phaseOut.get(i.n)}>["${i.n}"]`);
  const c = bOut.get(i.n); if (c) return `${c.id} output → ${tick(`ReturnType<typeof ${c.fn}>["${i.n}"]`)}`;
  if (hOut[i.n]) return tick(`ReturnType<typeof ${hOut[i.n]}>`);
  return i.declText ? tick(i.declText) : 'by the rule';
}
const inTable = (inputs, opts) => `| field | how passed | type source (after the earlier sheets) |\n|---|---|---|\n` + inputs.map((i) => `| \`${i.n}\` | ${i.mode === 'getter' ? `**getter** \`() => ${i.n}\`` : 'value'} | ${typeOf(i, opts)} |`).join('\n');
const argList = (inputs) => inputs.map((i) => i.mode === 'getter' ? `${i.n}: () => ${i.n}` : i.n).join(', ');
const TYPE_RULE = `Type each required field mechanically: a B-sheet output → \`ReturnType<typeof composeX>["name"]\` as shown; \`const x = f(…)\` → \`ReturnType<typeof f>\`; \`const x = await f(…)\` → \`Awaited<ReturnType<typeof f>>\`; \`const { x } = f(…)\` → \`ReturnType<typeof f>["x"]\` (renamed \`{ a: x }\` → \`["a"]\`; with \`await\`, wrap in \`Awaited<…>\` first); \`const x = await g(…)(…)\` → \`Awaited<ReturnType<ReturnType<typeof g>>>\`; \`new C(…)\` → \`C\`; an annotated declaration → its annotation; \`overrides\` → \`Partial<CreateSiteRouteDepsOverrides>\` from \`./overrides.js\`; \`dbPath\` → \`string\`; \`store\` → \`SiteStore\`; \`onStoreClose\` → \`(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void\` with \`StoreCloseRegistration\` from \`./open-store.js\`; \`kernel\` → \`SiteStore["content"]\`; \`workspaceId\` → \`string\`. A getter field is \`() => T\` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.`;
const GETTER_NOTE = 'A getter is required wherever the binding is declared after the call or is a root `let` reassigned after it; passing such a binding as a value is either a TypeScript error (TS2448/TS2454) or reads a stale cell — the characterization test fails on the latter.';
const impTable = (rows, from = 'site-deps/') => rows.length ? `| name | from (as written in deps.ts) | action |\n|---|---|---|\n` + rows.map((m) => `| \`${m.n}\`${m.type ? ' (type)' : ''} | \`${m.spec}\` | ${m.alsoOutside ? 'copy (still used in deps.ts)' : '**move** (delete from deps.ts)'} |`).join('\n') + `\n\nRelative specifiers gain one \`../\` in \`${from}\` (\`./x.js\` → \`../x.js\`, \`../../x.js\` → \`../../../x.js\`); \`#src/…\` and package specifiers are unchanged. "copy"/"move" is measured on the tip; if after the edit an import marked copy has no remaining use in deps.ts, delete it there too (R lists every leftover).` : 'None.';
const readersMd = (readers, file) => readers.length ? readers.map(([p, h]) => `- \`${p}\` — its literal(s) found in this range: ${h.slice(0, 4).map((x) => tick(x.slice(0, 70))).join(', ')}. If step 6 fails in this file, point that assertion at \`${file}\` (read both files where the test reads deps.ts); no other change to it.`).join('\n') : '- none found by literal match on the tip; step 6 runs every source reader anyway.';
const testsBlock = tests.map((t) => '  ' + t + ' \\').join('\n');
const sha = (ls, a, b) => crypto.createHash('sha256').update(ls.slice(a - 1, b).join('\n') + '\n').digest('hex');
function anchorCheck(ls, k, a, b, label) { const t = q(ls[k - 1]); return `# ${label}\ntest "$(grep -cxF -- '${t}' "$F")" -eq 1\ns=$(grep -nxF -- '${t}' "$F" | cut -d: -f1)\ntest "$(sed -n "$((s-${k - a})),$((s+${b - k}))p" "$F" | sha256sum | cut -d' ' -f1)" = ${sha(ls, a, b)}`; }
function steps({ checks, checkNote, eslintFiles, testFile, addFiles, msg, extraAdd = '', eslintDeps = false }) {
  const esl = `npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' ${eslintFiles.join(' ')}`;
  const eslDeps = eslintDeps ? `\nnpx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":"off","complexity":["error",10]}' ${DEPS}` : '';
  return `## Steps (fail-closed; every block starts with \`set -euo pipefail\`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
\`\`\`bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=${DEPS}
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
${checks}
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T"
\`\`\`
${checkNote} A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. \`--update\` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

**2. Edit** as "What moves" says. **3. Add the characterization test.** **4. Readers**: change only the assertions step 6 shows failing, as listed above.

**5. Gate (repo commands only).**
\`\`\`bash
set -euo pipefail
npm run typecheck
npm run typecheck:tests
SIZE_BASE_REF=$(cat "$T/parent") npm run check:size
npm run check:complexity
npm run check:errors -- --strict
npm run check:hooks
npm run check:architecture
node development/scripts/check-feature-ranks.mjs . development/boundaries/feature-ranks.json
npx depcruise --config .dependency-cruiser.mjs apps/website/src --ignore-known "$T/known.json"
${esl}${eslDeps}
npm run build:server
\`\`\`
**6. Tests** (the repo's own runner line from \`package.json\` "test", with explicit files: every test that boots \`createSiteRouteDeps\` without Postgres, every source reader of deps.ts, and this sheet's test).
\`\`\`bash
set -euo pipefail
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 \\
${testsBlock}
  ${testFile}
\`\`\`
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any. Delete runtime files a test run creates (\`chat.db\`, \`sites/*/agent-plugins\`) before step 7.

**7. Commit and push.**
\`\`\`bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add ${addFiles.join(' ')}
git status --short
git commit -m "${msg}"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
\`\`\`
\`git status --short\` must show only this sheet's files and the readers step 4 changed${extraAdd} — add those explicitly. If \`check:why-comments\` fails: \`git reset --soft HEAD~1\`, restore the comment, re-run 5-7. If \`git pull --rebase\` brings commits that touch deps.ts, re-run steps 5-6 before \`git push\`.
`;
}
const TEST_HEAD = (paths) => `import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

${paths}
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, \`\${name} not found\`);
  return found.body.statements;
}`;
const M_HEAD = (paths) => `import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

${paths}
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);`;
const LAZY_FN = `function eagerReads(statements: readonly ts.Node[], getters: readonly string[]): string[] {
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of statements) visit(statement, false);
  return eager;
}`;
const declNames = `const declaredNames = (file: ts.SourceFile): string[] => file.statements.flatMap((s) => (ts.isFunctionDeclaration(s) || ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)) && s.name ? [s.name.text] : []);`;
const index = [];
// ======================= M sheets
for (const m of R.M) {
  const file = `${SD}/${m.name}.ts`, testFile = `${SD}/__tests__/${m.name}.characterization.unit.test.ts`;
  const exported = m.decls.filter((d) => m.stillUsed.includes(d.n) || d.exported).map((d) => d.n);
  const types = m.decls.filter((d) => /Interface|TypeAlias/.test(d.kind)).map((d) => d.n);
  const depsImport = `import { ${m.stillUsed.map((n) => (types.includes(n) ? 'type ' : '') + n).join(', ')} } from "./site-deps/${m.name}.js";`;
  const importers = { M1: ['`apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts:15` — `type CreateSiteRouteDepsOverrides` moves to its own line `import type { CreateSiteRouteDepsOverrides } from "#src/server/runtime/composition/site-deps/overrides";` (keep `createSiteRouteDeps` imported from `deps`).'],
    M3: ['`apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts:15` — `siteIdentityFor` moves to its own line `import { siteIdentityFor } from "#src/server/runtime/composition/site-deps/provider-identity";` (keep `createSiteRouteDeps` imported from `deps`).'], M2: [] }[m.id];
  const declRows = m.decls.map((d) => `| \`${d.n}\` (${d.kind.replace('Declaration', '').toLowerCase()}) | ${d.a}-${d.b} | ${d.start} | ${exported.includes(d.n) ? 'yes' : 'no (used only inside the new file)'} |`).join('\n');
  const checks = m.decls.map((d) => anchorCheck(lines, d.start, d.a, d.b, d.n)).join('\n');
  const top = m.top.map((t) => `\`${t.n}\` → import from \`./${R.M.find((x) => x.id === t.from).name}.js\` (moved by ${t.from})`).join('; ');
  const md = `# ${m.id} — \`${m.name}\` (deps-split v4, module helpers)

${TIP}

## What moves
- **Declarations** (module level of deps.ts, each with its leading doc comment, **verbatim, in tip order**, ${m.code} code lines) → new file \`${file}\`:

| declaration | tip lines (doc + body) | anchor line | exported from the new file |
|---|---|---|---|
${declRows}

- **Edit, nothing else**: cut each row's lines from deps.ts and paste them, in this order, into the new file; add \`export\` to the rows marked "yes" (and to nothing else — no re-export from deps.ts, no shell); add the imports below to the new file. In deps.ts, add exactly one import line after the last relative \`./\` import:
\`\`\`ts
${depsImport}
\`\`\`
- **Module helpers the moved text reads that stay elsewhere**: ${top || 'none'}.${m.id === 'M2' ? '\n- **Why `hydrateContentDbIfNeeded` is here**: `openCompositionStore` calls it; leaving it in deps.ts would make `open-store.ts` import deps.ts, a cycle step 5\'s dependency-cruiser check rejects.' : ''}${m.id === 'M1' ? '\n- `CreateSiteRouteDepsOverrides` keeps `export`. Doc comments elsewhere that say "deps.ts\'s X" (`credentials-deps.ts:250`) are prose and are not edited.' : ''}${m.id === 'M3' ? '\n- Prose that says "`deps.ts`\'s `siteIdentityFor`"/"`credentialProject`" (`cli/commands/deploy-config.ts:112`, `features/webhooks/site-key-sources.ts:157`, `features/vendor-credentials/project-scope.ts:36`, `features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts:60`) is not edited.' : ''}

### Imports used by the moved text
${impTable(m.imports)}

${m.id === 'M2' ? `## Reader edit (required; found by applying M1-M3 in a scratch worktree)
\`apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts\`, test "createSiteRouteDeps: storage choice, then hydration, then the store open …", reads \`openCompositionStore\`, \`prepareCompositionStorage\` and \`startOwnerSweeps\` from deps.ts and fails with \`anchor missing: async function openCompositionStore(\`. Change exactly its three reads of those bodies to the new file: add \`const store = readCode("server/runtime/composition/site-deps/open-store.ts");\` after \`const deps = …\`, and replace \`functionBody(deps, "async function openCompositionStore(")\`, \`functionBody(deps, "function prepareCompositionStorage(")\` and \`functionBody(deps, "function startOwnerSweeps(")\` with \`functionBody(store, …)\` (same signatures). The \`createSiteRouteDeps\` read stays on deps.ts. Commit it with this sheet.

` : ''}## Importers to repoint
${importers.length ? importers.map((x) => '- ' + x).join('\n') : 'None: no moved name is imported outside deps.ts (verify: `git grep -nE "' + m.names.join('|') + '" -- apps development` lists only deps.ts, the new file, this test and prose comments).'}

## Source readers of deps.ts (literal match on the tip)
${readersMd(m.readers, file)}

## Characterization test (add \`${testFile}\`)
\`\`\`ts
${M_HEAD(`// Pins what this sheet must not change: the declarations move whole and in order, deps.ts keeps none of
// them, and deps.ts takes what it still uses from the new file (no re-export).
const DEPS = new URL("../../deps.ts", import.meta.url);
const MOVED = new URL("../${m.name}.ts", import.meta.url);`)}
${declNames}

test("${m.id}: the declarations live only in site-deps/${m.name}.ts, in tip order", () => {
  const moved = ${JSON.stringify(m.names.filter(Boolean).filter((n) => m.decls.find((d) => d.n === n)).sort((x, y) => m.decls.find((d) => d.n === x).a - m.decls.find((d) => d.n === y).a))};
  assert.deepEqual(declaredNames(parse(MOVED)).filter((n) => moved.includes(n)), moved);
  assert.deepEqual(declaredNames(parse(DEPS)).filter((n) => moved.includes(n)), []);
});

test("${m.id}: deps.ts imports exactly what it still uses from the new file", () => {
  const found = parse(DEPS).statements.find((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s) && (s.moduleSpecifier as ts.StringLiteral).text === "./site-deps/${m.name}.js");
  assert.ok(found?.importClause?.namedBindings && ts.isNamedImports(found.importClause.namedBindings), "import missing");
  assert.deepEqual(found.importClause.namedBindings.elements.map((e) => e.name.text).sort(), ${JSON.stringify([...m.stillUsed].sort())});
});
\`\`\`
Red first (prove the pins bite, then revert each): paste one moved declaration back into deps.ts → test 1 fails; swap the first two declarations in the new file → test 1 fails; drop one name from the deps.ts import line → test 2 fails (typecheck too). Record the three failing outputs in the commit message body.

${steps({ checks, checkNote: `Each hash proves one declaration (with its doc comment) is byte-identical to the design tip wherever it now sits.`, eslintFiles: [file], testFile, addFiles: [file, testFile, DEPS, ...(m.id === 'M2' ? ['apps/website/src/server/__tests__/unit/composition-boot-order.unit.test.ts'] : []), ...(m.id === 'M1' ? ['apps/website/src/server/runtime/composition/__tests__/deps-observability-wiring.integration.test.ts'] : m.id === 'M3' ? ['apps/website/src/server/runtime/composition/__tests__/deps-provider-plugin-boot.integration.test.ts'] : [])], msg: `refactor(composition): ${m.id} ${m.name} helpers move out of deps.ts (deps-split v4)` })}`;
  fs.writeFileSync(`${OUT}/${m.id}-${m.name}.md`, md);
  index.push({ id: m.id, name: m.name, lines: m.decls.map((d) => `${d.a}-${d.b}`).join(', '), code: m.code, inputs: '-', getters: '-', outputs: m.stillUsed.length });
}
// ======================= H sheets
const tipSf = ts.createSourceFile(F, lines.join('\n'), ts.ScriptTarget.Latest, true);
const fnText = (f) => lines.slice(f.a - 1, f.b);
const H_FILE = { warnCompositionChatOrphans: DEPS, compositionProjectKeys: `${SD}/project-keys.ts`, compositionSharedOAuth: `${SD}/shared-oauth-commerce.ts`, compositionCommerce: `${SD}/shared-oauth-commerce.ts`, configureSiteSharing: `${SD}/site-sharing.ts`, configureSiteImports: `${SD}/site-imports.ts` };
const H_NOTE = {
  H1: `- \`warnCompositionChatOrphans\` stays **in deps.ts**, as a module-level function placed directly after \`composeSiteRouteDeps\`'s closing brace: \`platform/db/sqlite/__tests__/chat-orphan-check.integration.test.ts\` reads deps.ts and requires \`warnOnOrphanedChatRows(\` to occur in deps.ts after \`await openCompositionStore({ dbPath }, { overrides })\` (that call is in \`createSiteRouteDeps\`, above). Its signature becomes \`async function warnCompositionChatOrphans(required: WarnCompositionChatOrphansRequired, _optional = {}): Promise<void>\` (not exported) with \`const { … } = required;\` as its first line; the body is otherwise verbatim (it keeps reading the module singleton \`consoleLogger\`).
- \`compositionProjectKeys\` reads the root \`let bindSharedApiOAuth\` inside its \`bindOAuth\` closure, so it receives a getter. The getter read needs one local so TypeScript keeps the narrowing (a second \`bindSharedApiOAuth()\` call is not narrowed): the three lines
\`\`\`ts
        if (!bindSharedApiOAuth) throw new Error("Shared connections are not available yet. Reopen this saved connection and try again.");
        return bindSharedApiOAuth(input);
\`\`\`
become exactly
\`\`\`ts
        const bind = bindSharedApiOAuth();
        if (!bind) throw new Error("Shared connections are not available yet. Reopen this saved connection and try again.");
        return bind(input);
\`\`\`
(the cell is still read once per \`bindOAuth\` call, at call time — the original read it twice synchronously, same value). Nothing else in either body changes.`,
  H2: `- \`compositionSharedOAuth\` is called inside the \`routeDeps\` literal (tip 2276, \`      ...compositionSharedOAuth(),\`), which L2 later moves; this sheet runs **before L1-L6** and edits only that one line. L2's hash is taken on the text after this edit.`,
  H3: `- **Size split (68 code lines → about 28 + 45)**: the \`delivery\` port object is built by a second module function in the same file, \`shareDeliveryPorts(required: ShareDeliveryPortsRequired, _optional = {}): Parameters<typeof resolveShareDelivery>[0]\`. Its body is, verbatim and in this order: tip lines 2846-2862 (the \`resolveShareCredential\` and \`createShareHostKit\` closures, used only by the port object's \`objectStore\`), then \`return {\`, tip lines 2877-2905 (the object's entries), \`};\`. In \`configureSiteSharing\`, tip lines 2846-2862 are deleted and tip lines 2876-2906 (\`          delivery: selection => resolveShareDelivery({\` … \`          }, selection),\`) become the one line
\`\`\`ts
          delivery: selection => resolveShareDelivery(shareDeliveryPorts({ selection, registry, credentials, routeDeps, workspaceId, guardedOutboundHttpClient, siteAssistantSecretSealer, siteAssistantSecretKeyring, publishContentPeerHttpClient, settingsRepo, mediaStorePorts }), selection),
\`\`\`
  Evaluation order inside one \`delivery(selection)\` call is unchanged (the object is built, then \`resolveShareDelivery\` runs). The two closures are now created per \`delivery\` call instead of once per boot; they hold no state (one reads \`credentials\`, the other calls \`createDeployHostKit({})\` when invoked, as before). \`ShareDeliveryPortsRequired\`: \`selection\` → \`Parameters<typeof resolveShareDelivery>[1]\`, \`registry\` → \`SiteShareRegistry\`, \`credentials\` → \`ReturnType<typeof composePublishCredentialSource>\`, the rest as in the table below. \`createDeployHostKit\`, \`toDeployTargetCredential\`, \`readMediaObjectStoreSetting\` follow the import table.`,
  H4: '',
};
for (const h of R.H) {
  const files = [...new Set(h.fns.map((f) => H_FILE[f.name]))]; const newFiles = files.filter((x) => x !== DEPS);
  const testFile = `${SD}/__tests__/${h.name}.characterization.unit.test.ts`;
  const bodies = h.fns.map((f) => { const callNew = f.name === 'compositionSharedOAuth' ? `      ...compositionSharedOAuth({ ${argList(f.inputs)} }),` : f.name === 'warnCompositionChatOrphans' ? `  await warnCompositionChatOrphans({ ${argList(f.inputs)} });` : f.name === 'compositionProjectKeys' ? `  const projectKeys = compositionProjectKeys({ ${argList(f.inputs)} });` : f.name === 'compositionCommerce' ? `  const commerceBinding = compositionCommerce({ ${argList(f.inputs)} });` : `  ${f.name}({ ${argList(f.inputs)} });`;
    f.callNew = callNew; const exported = H_FILE[f.name] !== DEPS;
    return `### \`${f.name}\` (tip ${f.a}-${f.b}, ${f.code} code lines; called at tip ${f.callAt})
- **To**: ${exported ? `\`${H_FILE[f.name]}\`, \`export function ${f.name}(required: ${pascal(f.name)}Required, _optional = {})${/: void \{|\): void/.test(lines[f.start - 1]) ? ': void' : ''}\`` : 'module level of deps.ts (see note)'}; first body line \`const { ${f.inputs.map((i) => i.n).join(', ')} } = required;\`, then the tip body **verbatim** (getter fields read as \`name()\`), leading doc comment moved with it.
- **Call** (tip ${f.callAt}, \`${lines[f.callAt - 1].trim()}\`) becomes exactly:
\`\`\`ts
${callNew}
\`\`\`
- **Inputs** (\`${pascal(f.name)}Required\`):

${inTable(f.inputs)}`; }).join('\n\n');
  const checks = h.fns.map((f) => anchorCheck(lines, f.start, f.a, f.b, f.name)).join('\n') + '\n' + h.fns.map((f) => `test "$(grep -cxF -- '${q(f.callText)}' "$F")" -eq 1`).join('\n');
  const getters = [...new Set(h.fns.flatMap((f) => f.inputs.filter((i) => i.mode === 'getter').map((i) => i.n)))];
  const tf = h.fns.map((f) => ({ name: f.name, file: H_FILE[f.name] }));
  const md = `# ${h.id} — \`${h.name}\` (deps-split v4, hoisted closures → module functions)

${TIP}

## What moves
Root-level function declarations inside \`composeSiteRouteDeps\` (hoisted closures with \`Record<string, never>\` or empty placeholder signatures) become module functions with real \`(required, optional = {})\` inputs; each call passes the variables the body reads. No \`await\` is added or moved; the call stays where it is.
${H_NOTE[h.id] ? '\n' + H_NOTE[h.id] + '\n' : ''}
${bodies}

${TYPE_RULE}

${GETTER_NOTE}

### Imports used by the moved bodies
${impTable(h.id === 'H1' ? h.imports.filter((i) => i.n !== 'warnOnOrphanedChatRows') : h.imports)}${h.id === 'H1' ? '\n\n(`warnOnOrphanedChatRows` stays imported by deps.ts: its user stays there.)' : ''}

## Importers to repoint
None: nothing exported from deps.ts moves.

## Source readers of deps.ts (literal match on the tip)
${readersMd(h.readers, newFiles[0] || DEPS)}

## Characterization test (add \`${testFile}\`)
\`\`\`ts
${TEST_HEAD(`// Pins: the calls keep their place in composeSiteRouteDeps, no root-level declaration of the moved
// functions remains, each is a module function with real inputs, and getter inputs are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);`)}
${LAZY_FN}
const FILES: Record<string, URL> = ${JSON.stringify(Object.fromEntries(tf.map((x) => [x.name, x.file === DEPS ? '../../deps.ts' : `../${x.file.split('/').pop()}`])))};

test("${h.id}: the calls keep their place and the root declares none of the functions", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  assert.deepEqual(body.filter((s) => ts.isFunctionDeclaration(s)).map((s) => (s as ts.FunctionDeclaration).name?.text).filter((n) => ${JSON.stringify(h.fns.map((f) => f.name))}.includes(n ?? "")), []);
${h.fns.filter((f) => f.name !== 'compositionSharedOAuth').map((f) => { const i = tipSf.statements.find((s) => s.name && s.name.text === 'composeSiteRouteDeps').body.statements; const idx = i.findIndex((s) => tipSf.getLineAndCharacterOfPosition(s.getStart()).line + 1 === f.callAt); const prev = i[idx - 1]; const prevFirst = prev.getText().split('\n')[0].trim(); const bc = B.find((c) => c.range && tipSf.getLineAndCharacterOfPosition(prev.getStart()).line + 1 >= c.range[0] && tipSf.getLineAndCharacterOfPosition(prev.end).line + 1 <= c.range[1]); const pf = bc ? `const { ${bc.outputs.join(', ')} } = ${bc.fn}(` : prevFirst; const own = f.callNew.trim().split('({')[0] + '({';
    return `  { const at = body.findIndex((s) => firstLine(s).startsWith(${JSON.stringify(own)})); assert.ok(at > 0, "${f.name} call missing"); assert.ok(firstLine(body[at - 1]).startsWith(${JSON.stringify(pf.slice(0, 120))})); }`; }).join('\n')}
});

test("${h.id}: each function is a module function whose first statement destructures its inputs", () => {
  for (const [name, url] of Object.entries(FILES)) {
    const first = bodyOf(parse(new URL(url, import.meta.url)), name)[0];
    assert.ok(first && ts.isVariableStatement(first) && first.getText().endsWith("= required;"), name);
  }
});

test("${h.id}: getter inputs are only read lazily", () => {
  const getters: readonly string[] = ${JSON.stringify(getters)};
  for (const [name, url] of Object.entries(FILES)) assert.deepEqual(eagerReads(bodyOf(parse(new URL(url, import.meta.url)), name), getters), [], name);
});
\`\`\`
Red first (prove the pins bite, then revert each): move one call one statement down → test 1 fails; replace one function's first line with a plain statement → test 2 fails${getters.length ? `; add \`void ${getters[0]}();\` as the second statement of \`compositionProjectKeys\` → test 3 fails` : ''}. Record the failing outputs in the commit message body.

${steps({ checks, checkNote: 'Each hash proves one function declaration (with its doc comment) is byte-identical to the design tip; each call line is checked to be present exactly once.', eslintFiles: newFiles.length ? newFiles : [DEPS], testFile, addFiles: [...newFiles, testFile, DEPS], msg: `refactor(composition): ${h.id} ${h.name} become module functions with real inputs (deps-split v4)` })}`;
  fs.writeFileSync(`${OUT}/${h.id}-${h.name}.md`, md);
  index.push({ id: h.id, name: h.name, lines: h.fns.map((f) => `${f.a}-${f.b}`).join(', '), code: h.fns.reduce((s, f) => s + f.code, 0), inputs: h.fns.reduce((s, f) => s + f.inputs.length, 0), getters: getters.length, outputs: h.fns.length });
}
// ======================= L sheets
const linesAfterH2 = lines.slice(); { const f = R.H.find((h) => h.id === 'H2').fns[0]; linesAfterH2[f.callAt - 1] = f.callNew; }
const tipFn = tipSf.statements.find((s) => s.name && s.name.text === 'composeSiteRouteDeps');
const lit = tipFn.body.statements.find((s) => ts.isVariableStatement(s) && s.declarationList.declarations[0].name.getText() === 'routeDeps');
const props = lit.declarationList.declarations[0].initializer.properties; const PL = (p) => tipSf.getLineAndCharacterOfPosition(p.getStart()).line + 1; const PE = (p) => tipSf.getLineAndCharacterOfPosition(p.end).line + 1;
const allRuns = R.L.flatMap((l) => l.fns);
const itemAt = (line) => props.find((p) => PL(p) <= line && PE(p) >= line);
const firstOf = (p) => { const r = allRuns.find((f) => PL(p) >= f.a && PE(p) <= f.b); return r ? `...${r.fn}(` : p.getText().split('\n')[0].trim(); };
for (const l of R.L) {
  const file = `${SD}/${l.name}.ts`, testFile = `${SD}/__tests__/${l.name}.characterization.unit.test.ts`;
  const getters = [...new Set(l.fns.flatMap((f) => f.inputs.filter((i) => i.mode === 'getter').map((i) => i.n)))];
  const firstP = itemAt(l.fns[0].a + (l.fns[0].anchorAt - l.fns[0].a)); const iFirst = props.indexOf(props.find((p) => PE(p) >= l.fns[0].a)); const lastRun = l.fns[l.fns.length - 1];
  const iLast = props.indexOf(props.filter((p) => PE(p) <= lastRun.b).at(-1));
  const seq = []; for (let i = iFirst; i <= iLast + 1 && i < props.length; i++) { const r = l.fns.find((f) => PL(props[i]) >= f.a && PE(props[i]) <= f.b); const t = r ? `...${r.fn}(` : props[i].getText().split('\n')[0].trim(); if (seq.at(-1) !== t) seq.push(t); }
  const prev = iFirst > 0 ? firstOf(props[iFirst - 1]) : null;
  const fnsMd = l.fns.map((f) => `### \`${f.fn}\` — tip ${f.a}-${f.b} (${f.entries} entries, ${f.code} code lines; first key \`${f.keys[0]}\`, last \`${f.keys.at(-1)}\`)
- **To** \`${file}\`: \`export function ${f.fn}(required: ${pascal(f.fn)}Required, _optional = {}): Pick<NewsletterRouteDeps & ByokToolSurfaceDeps, ${f.keys.map((k) => JSON.stringify(k)).join(' | ')}>\` with body \`const { ${f.inputs.map((i) => i.n).join(', ')} } = required;\` then \`return {\`, the tip lines **verbatim** (entries, comments between them, same order, getter fields read as \`name()\`)${f.hCalls && f.hCalls.length ? ` — the line \`...compositionSharedOAuth({ … }),\` is as H2 left it; \`compositionSharedOAuth\` is imported from \`./shared-oauth-commerce.js\`` : ''}, then \`};\`. The \`Pick<…>\` return type keeps every entry contextually typed against the same property types the root literal's annotation gives it.
- **In the literal** the lines become exactly:
\`\`\`ts
    ...${f.fn}({ ${argList(f.inputs)} }),
\`\`\`
- **Inputs** (\`${pascal(f.fn)}Required\`):

${inTable(f.inputs)}`).join('\n\n');
  let checks = l.fns.map((f) => anchorCheck(linesAfterH2, f.anchorAt, f.a, f.b, f.fn)).join('\n');
  const helperTxt = l.top.some((t) => t.n === 'resolveSiteBackupSources') ? fs.readFileSync(process.env.L3_HELPERS, 'utf8') : null;
  const helper = helperTxt ? JSON.parse(helperTxt.slice(0, helperTxt.indexOf('\n# '))) : null;
  if (helperTxt) checks += '\n' + helperTxt.slice(helperTxt.indexOf('\n# ') + 1).trimEnd();
  const md = `# ${l.id} — \`${l.name}\` (deps-split v4, literal runs)

${TIP}

## What moves
Contiguous entry runs of the \`routeDeps\` object literal (tip \`const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {\`, 2135-2715). A run never crosses one of the literal's 7 spreads (they stay in the literal, in place), so every key keeps its position relative to every spread and every other key: property evaluation order and overwrite order are unchanged by construction. Each run becomes one spread of a call at the run's place. No run contains a top-level \`await\` (the 7 \`await\`s inside entries are in nested async functions and move with them). Self-reads of \`routeDeps\` are getters. Runs are cut at ≤44 code lines so each function is ≤50 with its 4 frame lines. This sheet runs after H2${l.id === 'L1' ? '' : ` and ${['L1', 'L2', 'L3', 'L4', 'L5'].slice(0, Number(l.id.slice(1)) - 1).join(', ')}`}.

${fnsMd}

${TYPE_RULE}

${GETTER_NOTE}

### Imports used by the moved entries
${impTable(l.imports)}

Also import \`type NewsletterRouteDeps\` (\`../../../inbound/admin-http/routes/newsletter/deps.js\`) and \`type ByokToolSurfaceDeps\` (deps.ts's specifier with one more \`../\`) for the return types; both stay imported by deps.ts (the root literal's annotation).${l.top.length ? `\n\nModule helpers read by the entries: ${l.top.map((t) => `\`${t.n}\` (tip ${t.line})`).join(', ')}${l.top.some((t) => t.n === 'credentialProject') ? ' — `credentialProject` is imported from `./provider-identity.js` (M3)' : ''}${helper ? ` — \`resolveSiteBackupSources\` (used only by this run) and \`readTovuVersion\` (used only by it) move into the run file, **verbatim with their doc comments, unexported**, tip order (${helper.decls.map((d) => `${d.n} ${d.a}-${d.b}`).join(', ')}); step 1 checks each by anchor + hash. Their imports: ${helper.rows.map((r) => `\`${r.n}\`${r.type ? ' (type)' : ''} from \`${r.spec}\` (${r.alsoOutside ? 'copy' : 'move'})`).join(', ')}.\n\n**Error debt (same shape as B05's note).** \`readTovuVersion\`'s \`catch {\` (tip 602) is the other \`catch-reads-error\` finding counted for deps.ts in \`development/scripts/error-gate-debt.json\` (B05 left that row at \`"value": 1\`). In this commit delete the deps.ts \`catch-reads-error\` row and add \`{ "file": "${file}", "rule": "catch-reads-error", "value": 1 }\` in its sorted place (by \`file\`). \`check:errors -- --strict\` in step 5 proves the edit; if it names a different catch, STOP-ERROR-DEBT.` : ''}.` : ''}

## Importers to repoint
None.

## Source readers of deps.ts (literal match on the tip)
${readersMd(l.readers, file)}

## Characterization test (add \`${testFile}\`)
\`\`\`ts
${TEST_HEAD(`// Pins: each run's call sits in the routeDeps literal exactly where its entries sat (between the same
// neighbours, spreads included), each run returns its keys in tip order, and getters are read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const RUNS = new URL("../${l.name}.ts", import.meta.url);`)}
${LAZY_FN}
function literalItems(): string[] {
  const statement = bodyOf(parse(DEPS), "composeSiteRouteDeps").find((s) => ts.isVariableStatement(s) && s.declarationList.declarations[0]?.name.getText() === "routeDeps");
  assert.ok(statement && ts.isVariableStatement(statement));
  const literal = statement.declarationList.declarations[0].initializer;
  assert.ok(literal && ts.isObjectLiteralExpression(literal));
  return literal.properties.map((p) => firstLine(p));
}

test("${l.id}: the run calls sit where their entries sat", () => {
  const items = literalItems();
  const at = items.findIndex((t) => t.startsWith(${JSON.stringify(seq[0])}));
  assert.ok(at >= 0, "first run call missing");${prev ? `\n  assert.ok(items[at - 1].startsWith(${JSON.stringify(prev.slice(0, 100))}));` : '\n  assert.equal(at, 0);'}
  const expected: readonly string[] = ${JSON.stringify(seq.map((s) => s.slice(0, 100)))};
  expected.forEach((prefix, i) => assert.ok(items[at + i]?.startsWith(prefix), \`item \${at + i}: \${items[at + i]}\`));
});

test("${l.id}: each run returns its keys in tip order", () => {
  const file = parse(RUNS);
  const keys: Record<string, readonly string[]> = ${JSON.stringify(Object.fromEntries(l.fns.map((f) => [f.fn, f.keys])))};
  for (const [name, expected] of Object.entries(keys)) {
    const ret = bodyOf(file, name).find((s): s is ts.ReturnStatement => ts.isReturnStatement(s));
    assert.ok(ret?.expression && ts.isObjectLiteralExpression(ret.expression), name);
    assert.deepEqual(ret.expression.properties.map((p) => p.name?.getText() ?? ""), expected);
  }
});

test("${l.id}: getter inputs are only read lazily", () => {
  const file = parse(RUNS);
  for (const name of ${JSON.stringify(l.fns.map((f) => f.fn))}) assert.deepEqual(eagerReads(bodyOf(file, name), ${JSON.stringify(getters)}), [], name);
});
\`\`\`
Red first (prove the pins bite, then revert each): swap two adjacent entries inside one run → test 2 fails; move one run call after the following spread → test 1 fails${getters.length ? `; add \`void ${getters[0]}();\` as a run's first statement → test 3 fails` : ''}. Record the failing outputs in the commit message body.

${steps({ checks, checkNote: `Each hash proves one run (with the comments between its entries) is byte-identical to the design tip${l.id === 'L2' ? ' after H2\'s one-line edit' : ''}, wherever it now sits; the anchor is the run's first line that is unique in the file.`, eslintFiles: [file], testFile, addFiles: [file, testFile, DEPS], msg: `refactor(composition): ${l.id} ${l.name} literal runs move out of composeSiteRouteDeps (deps-split v4)`, extraAdd: (l.top.some((t) => t.n === 'resolveSiteBackupSources') ? ', `development/scripts/error-gate-debt.json`' : '') + ', and `development/scripts/size-debt.json` only if `check:size` printed `Delete stale debt entry` for a deps.ts row (delete exactly that row)' })}`;
  fs.writeFileSync(`${OUT}/${l.id}-${l.name}.md`, md);
  index.push({ id: l.id, name: l.name, lines: l.fns.map((f) => `${f.a}-${f.b}`).join(', '), code: l.fns.reduce((s, f) => s + f.code, 0), inputs: l.fns.reduce((s, f) => s + f.inputs.length, 0), getters: getters.length, outputs: l.fns.length });
}
fs.writeFileSync(`${OUT}/index-rest.json`, JSON.stringify(index, null, 1));
console.log(index.map((x) => JSON.stringify(x)).join('\n'));
