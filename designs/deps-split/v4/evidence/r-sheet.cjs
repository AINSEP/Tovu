// Design-time generator for sheet R (root phases). node r-sheet.cjs <tip deps.ts> <deps.before-R.ts> <deps.after-sheets.ts> <deps.after-R.ts> <phases.json> <r-imports.json> <leftover.json> <B-census.json> <tests.txt> <out.md>
const ts = require('/opt/node-tools/node_modules/typescript'); const fs = require('fs'); const crypto = require('crypto');
const [TIPF, beforeF, sheetsF, afterF, pF, iF, leftF, bF, testsF, OUTF] = process.argv.slice(2);
const before = fs.readFileSync(beforeF, 'utf8').split('\n'); const sheets = fs.readFileSync(sheetsF, 'utf8').split('\n');
const PH = JSON.parse(fs.readFileSync(pF, 'utf8')).phases; const I = JSON.parse(fs.readFileSync(iF, 'utf8')); const left = JSON.parse(fs.readFileSync(leftF, 'utf8')).filter((x) => x.n !== 'warnOnOrphanedChatRows');
const B = JSON.parse(fs.readFileSync(bF, 'utf8')); const tests = fs.readFileSync(testsF, 'utf8').trim().split('\n');
const DIR = 'apps/website/src/server/runtime/composition', DEPS = `${DIR}/deps.ts`, SD = `${DIR}/site-deps`;
const tick = (s) => '`' + String(s).replace(/\|/g, '\\|').replace(/`/g, "'") + '`';
const pascal = (s) => s[0].toUpperCase() + s.slice(1);
// normalized hash of the root at R's start (code lines only: blank and comment lines dropped)
const s0 = before.findIndex((l) => l === 'async function composeSiteRouteDeps(') + 1; let e0 = s0; while (before[e0 - 1] !== '}') e0++;
const norm = before.slice(s0 - 1, e0).filter((l) => !/^\s*($|\/\/|\/\*|\*)/.test(l));
const hash = crypto.createHash('sha256').update(norm.join('\n') + '\n').digest('hex');
// root statements after R
const after = fs.readFileSync(afterF, 'utf8'); const asf = ts.createSourceFile('a.ts', after, ts.ScriptTarget.Latest, true);
const rootAfter = asf.statements.find((s) => s.name && s.name.text === 'composeSiteRouteDeps').body.statements.map((s) => s.getText().split('\n')[0].trim());
const ssf = ts.createSourceFile('s.ts', sheets.join('\n'), ts.ScriptTarget.Latest, true); const sroot = ssf.statements.find((s) => s.name && s.name.text === 'composeSiteRouteDeps').body.statements;
const bOut = new Map(); B.forEach((c) => c.range && c.outputs.forEach((o) => bOut.set(o, c)));
const pOut = new Map(); PH.forEach((p) => p.outputs.forEach((o) => pOut.set(o, p.name)));
const H = { projectKeys: 'compositionProjectKeys', commerceBinding: 'compositionCommerce' };
const typeOf = (i, p) => { if (i.from === 'root parameter') return 'root parameter (rule)'; const q = pOut.get(i.n); if (q && q !== p.name) return tick(`ReturnType<typeof ${q}>["${i.n}"]`); const c = bOut.get(i.n); if (c) return tick(`ReturnType<typeof ${c.fn}>["${i.n}"]`); if (H[i.n]) return tick(`ReturnType<typeof ${H[i.n]}>`); return tick(i.declText); };
const FILE = (p) => PH.indexOf(p) < 5 ? 'boot-phases' : 'assembly-phases';
const callOf = (p) => (p.outputs.length ? `const { ${p.outputs.join(', ')} } = ` : '') + `${p.name}({ ${p.inputs.map((i) => i.mode === 'getter' ? `${i.n}: () => ${i.n}` : i.n).join(', ')} });`;
const topFor = { logMediaProviderRefusals: 'boot-phases', flushLifecycleEvents: 'boot-phases', compositionApprovalOverrides: 'assembly-phases', compositionConsentOptions: 'assembly-phases', configureVisitorConsentAnalytics: 'assembly-phases' };
const tipLines = fs.readFileSync(TIPF, 'utf8').split('\n');
const tipTop = { logMediaProviderRefusals: 935, flushLifecycleEvents: 2950, compositionApprovalOverrides: 646, compositionConsentOptions: 2957, configureVisitorConsentAnalytics: 2967 };
const phaseMd = PH.map((p, k) => { const st = sroot.slice(p.i0, p.i1 + 1).map((s) => s.getText().split('\n')[0].trim());
  return `### ${k + 1}. \`${p.name}\` → \`site-deps/${FILE(p)}.ts\` (${p.statements} root statements, ${p.code} code lines; function ${p.code + 4} lines)
Takes the root statements from \`${st[0].slice(0, 90)}\` through \`${st.at(-1).slice(0, 90)}\`, **verbatim, with the comments between them**. Root call (replaces them, same place):
\`\`\`ts
  ${callOf(p)}
\`\`\`
Outputs (${p.outputs.length}): ${p.outputs.length ? p.outputs.map((o) => '`' + o + '`').join(', ') : 'none (statements only)'}.

<details><summary>${pascal(p.name)}Required — ${p.inputs.length} fields (${p.inputs.filter((i) => i.mode === 'getter').length} getters)</summary>

| field | how passed | type |
|---|---|---|
${p.inputs.map((i) => `| \`${i.n}\` | ${i.mode === 'getter' ? `**getter** \`() => ${i.n}\`` : 'value'} | ${typeOf(i, p)} |`).join('\n')}
</details>`; }).join('\n\n');
const hoistLines = ['  let routeDepsBuiltForPluginHost: { readonly pluginHost?: RouteDeps["pluginHost"] } | undefined;', '  let formCollectionProviders = () => createFormCollectionRegistry({});', '  let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) | undefined;'];
const imports = (file) => { const rows = I.phaseImports.filter((x) => { const used = PH.filter((p) => FILE(p) === file).some((p) => sheets.slice(p.startLine - 1, p.endLine).join('\n').match(new RegExp(`\\b${x.n}\\b`))); return used; });
  return rows.map((x) => `\`${x.n}\`${x.type ? ' (type)' : ''} from \`${x.spec}\` (${x.alsoOutside ? 'copy' : 'move'})`).join(', '); };
const sheetFns = (file) => I.phaseSheet.filter((x) => PH.filter((p) => FILE(p) === file).some((p) => sheets.slice(p.startLine - 1, p.endLine).join('\n').includes(x.n + '('))).map((x) => `\`${x.n}\` (\`${x.from}\`)`).join(', ');
const testsBlock = tests.map((t) => '  ' + t + ' \\').join('\n');
const testFile = `${SD}/__tests__/root-phases.characterization.unit.test.ts`;
const getters = Object.fromEntries(PH.map((p) => [p.name, p.inputs.filter((i) => i.mode === 'getter').map((i) => i.n)]));
const phaseStmts = Object.fromEntries(PH.map((p) => [p.name, sroot.slice(p.i0, p.i1 + 1).map((s) => s.getText().split('\n')[0].trim().slice(0, 100))]));
const md = `# R — root phases (deps-split v4, last sheet)

Design tip: Tovu \`2d82735a\` (\`origin/integ/merge-3-2026-11-18\`), Jini \`d37821a4\`. One commit. Self-contained: COMMON rules are restated here. Runs after M1-M3, B01-B25, H1-H4, L1-L6.

## Owner rule this sheet satisfies (no exception)
\`composeSiteRouteDeps\` must end at **≤ 50 code lines and complexity ≤ 10**. After every other sheet the root is 129 code lines (measured by ESLint's own \`max-lines-per-function\` on the synthesized post-sheet text, \`evidence/deps.after-sheets-2d82735a.ts.txt\`). This sheet splits it into **7 ordered phase functions** (each ≤ 50 lines) between the root's fixed points. Measured on the synthesized result (\`evidence/deps.after-R-2d82735a.ts.txt\`) with the repo's size config: **root 49 lines, complexity 7**; phases 7, 19, 15, 9, 7, 39, 19 lines, complexity 2 each (3 for \`assembleRouteDepsPhase\`).

What stays in the root, and why (each is a line the phases cannot own without changing behaviour):
- the 9 \`await\`s, verbatim (no phase contains an \`await\`: a phase is synchronous, so no async turn is added; v4's no-await rule extends to phases);
- the 4 \`let\` cells and their 4 writes (\`formCollectionProviders =\`, \`lifecycleTracker =\`, \`bindSharedApiOAuth =\`, \`routeDepsBuiltForPluginHost =\`); phases read the cells through getters;
- \`const { store, onStoreClose } = opened;\`, \`const pendingLifecycleEvents …\`, \`const chatDbPath …\`, \`const chat …\`, \`setServerLogTraceReader(…)\` (single lines between fixed points), the 2 one-line slice calls that sit alone between awaits (B17, B18) and \`return routeDeps;\`.

Phase boundaries are exactly the fixed points above, so statement order is unchanged by construction: every phase is a contiguous run of root statements, called at the run's place.

## Steps of the edit
**a. Hoist three \`let\` declarations** (with the comment lines directly above them, which move with them) to directly after \`let lifecycleTracker …\`, in this order:
\`\`\`ts
${hoistLines.join('\n')}
\`\`\`
They have no initializer or a side-effect-free one (a closure), and no statement reads them before their tip position except through a getter, so declaring them earlier changes nothing observable; it removes three phase boundaries.

**b. Create the phase files.** \`site-deps/boot-phases.ts\` holds phases 1-5, \`site-deps/assembly-phases.ts\` holds 6-7 (one file would pass 500 lines with the \`Required\` types). Each phase is \`export function <name>(required: <Name>Required, _optional = {})\` whose body is: \`const { <every field> } = required;\`, the statements listed below **verbatim, comments included, getter fields read as \`name()\`**, then \`return { <outputs> };\` (omitted when there are none). No phase contains \`await\`.

${phaseMd}

${'Type each field as the table says: a phase output → `ReturnType<typeof phase>["name"]`; a B-sheet output → `ReturnType<typeof composeX>["name"]`; otherwise the declaration rule (`const x = f(…)` → `ReturnType<typeof f>`, `const { a: x } = await f(…)` → `Awaited<ReturnType<typeof f>>["a"]`, `const x = await g(…)(…)` → `Awaited<ReturnType<ReturnType<typeof g>>>`, `new C(…)` → `C`, annotated → the annotation; `dbPath` → `string`, `overrides` → `Partial<CreateSiteRouteDepsOverrides>`, `store` → `SiteStore`, `onStoreClose` → its `opened` field type with `StoreCloseRegistration` from `./open-store.js`, `opened` → the root parameter\'s `opened` type). A getter field is `() => T`. If typecheck rejects one field\'s type, replace that field\'s type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.'}

**c. Module helpers that only the phases read move with them** (verbatim, with their doc comments, unexported; leaving them in deps.ts would make the phase files import deps.ts — a cycle step 5 rejects): ${Object.entries(topFor).map(([n, f]) => `\`${n}\` (tip ${tipTop[n]}) → \`${f}.ts\``).join(', ')}.

**d. Imports.** \`boot-phases.ts\` imports ${imports('boot-phases')}; and the slice functions ${sheetFns('boot-phases')}. \`assembly-phases.ts\` imports ${imports('assembly-phases')}; and ${sheetFns('assembly-phases')}. (Relative specifiers gain one \`../\`; slice files are siblings, \`./x.js\`.) deps.ts imports the 7 phase functions from the two files and deletes its imports of every slice function above.

**e. Delete the deps.ts imports that no line uses any more** (${left.length} specifiers; left over because the B-sheets' copy/move column was measured on the tip, where another range still used them — see REVISION-4b-REPORT). TypeScript rejects the deletion of any import that is still used, so this step fails closed: ${left.map((x) => '`' + x.n + '`').join(', ')}.

**f. Size debt.** \`composeSiteRouteDeps\` is no longer over the 80-line error limit, so \`check:size\` reports its row as stale. In \`development/scripts/size-debt.json\` delete exactly the object \`{ "file": "${DEPS}", "function": "composeSiteRouteDeps#1", "line": 1049, "rule": "max-lines-per-function", "value": 1199 }\` (its \`line\`/\`value\` may have shrunk; match on \`file\` + \`function\` + \`rule\`). Nothing else in that file changes; the \`<file>\` row stays (deps.ts is still over 500 lines and shrank).

## Source readers of deps.ts
The 9 readers run in step 6. \`composition-boot-order.unit.test.ts\` and \`chat-orphan-check.integration.test.ts\` read the order of await lines and the store open, which stay in the root verbatim; \`serving-app-boot-wiring.unit.test.ts\`/\`external-mcp-oauth-loopback-wiring.unit.test.ts\` read literals that may now be in a phase file. If step 6 fails in a reader, point that assertion at the phase file that now holds the line (read both files where the test reads deps.ts); no other change to it.

## Characterization test (add \`${testFile}\`)
\`\`\`ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this sheet must not change: the root's statement sequence (fixed points + phase calls), the
// statements each phase took in their root order, and that getter inputs are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const BOOT = new URL("../boot-phases.ts", import.meta.url);
const ASSEMBLY = new URL("../assembly-phases.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, \`\${name} not found\`);
  return found.body.statements;
}
function eagerReads(statements: readonly ts.Node[], getters: readonly string[]): string[] {
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of statements) visit(statement, false);
  return eager;
}
const fileOf = (name: string): URL => (${JSON.stringify(PH.slice(5).map((p) => p.name))}.includes(name) ? ASSEMBLY : BOOT);

test("R: the root is its fixed points and the phase calls, in order", () => {
  const expected: readonly string[] = ${JSON.stringify(rootAfter.map((l) => l.slice(0, 90)), null, 2).replace(/\n/g, '\n  ')};
  const actual = bodyOf(parse(DEPS), "composeSiteRouteDeps").map((s) => firstLine(s));
  assert.equal(actual.length, expected.length);
  expected.forEach((prefix, i) => assert.ok(actual[i].startsWith(prefix), \`statement \${i}: \${actual[i]}\`));
});

test("R: each phase holds its root statements in root order", () => {
  const expected: Record<string, readonly string[]> = ${JSON.stringify(phaseStmts, null, 2).replace(/\n/g, '\n  ')};
  for (const [name, statements] of Object.entries(expected)) {
    const body = bodyOf(parse(fileOf(name)), name).slice(1).map((s) => firstLine(s)).filter((t) => !t.startsWith("return {"));
    assert.equal(body.length, statements.length, name);
    statements.forEach((prefix, i) => assert.ok(body[i].replace(/\\(\\)/g, "").startsWith(prefix.replace(/\\(\\)/g, "")), \`\${name} statement \${i}: \${body[i]}\`));
  }
});

test("R: getter inputs are only read lazily", () => {
  const getters: Record<string, readonly string[]> = ${JSON.stringify(getters)};
  for (const [name, list] of Object.entries(getters)) assert.deepEqual(eagerReads(bodyOf(parse(fileOf(name)), name), list), [], name);
});
\`\`\`
(Test 2 compares prefixes with \`()\` removed, because a getter-read statement's first line gains \`()\` after a getter name.) Red first (prove the pins bite, then revert each): swap two adjacent statements inside \`composeSiteServicesPhase\` → test 2 fails; move \`setServerLogTraceReader(…)\` below \`lifecycleTracker = tracker;\` → test 1 fails; add \`void lifecycleTracker();\` as the second statement of \`composeStoragePhase\` → test 3 fails. Record the three failing outputs in the commit message body.

## Steps (fail-closed; every block starts with \`set -euo pipefail\`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
\`\`\`bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=${DEPS}
T=$(mktemp -d)
git rev-parse HEAD > "$T/parent"
test "$(grep -cxF -- 'async function composeSiteRouteDeps(' "$F")" -eq 1
s=$(grep -nxF -- 'async function composeSiteRouteDeps(' "$F" | cut -d: -f1)
e=$(awk -v s="$s" 'NR > s && $0 == "}" { print NR; exit }' "$F")
test "$(sed -n "\${s},\${e}p" "$F" | grep -Ev '^[[:space:]]*($|//|/[*]|[*])' | sha256sum | cut -d' ' -f1)" = ${hash}
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "$T/known.json"
echo "T=$T"
\`\`\`
The hash covers the whole root's **code lines** (blank and comment lines dropped, so the placement of moved comments by earlier sheets cannot matter) and proves every earlier sheet left exactly the root replacement line its sheet specifies. A mismatch is STOP-STALE: regenerate this sheet with \`designs/deps-split/v4/evidence/{synth,phases,r-imports,r-sheet}.cjs\` on the then-current deps.ts (the census needs no tip).

**2. Edit** a-f above. **3. Add the characterization test.** **4. Readers**: change only the assertions step 6 shows failing, as listed above.

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
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' ${SD}/boot-phases.ts ${SD}/assembly-phases.ts
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":"off","complexity":["error",10]}' ${DEPS}
npm run build:server
\`\`\`
The second eslint line is the owner rule's proof: every function in deps.ts, the root included, is ≤ 50 lines and complexity ≤ 10 (on the tip only \`composeSiteRouteDeps\` and \`configureSiteSharing\` fail it; H3 fixed the second). \`check:complexity\` adds the repo's cognitive-complexity ceiling.

**6. Tests** (the repo's own runner line from \`package.json\` "test", with explicit files).
\`\`\`bash
set -euo pipefail
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 \\
${testsBlock}
  ${testFile}
\`\`\`
Base status: INDEX-v4 records the 8 tests red on the tip; a test red on the parent stays red only with the same failing test names. Delete runtime files a test run creates (\`chat.db\`, \`sites/*/agent-plugins\`) before step 7.

**7. Commit and push.**
\`\`\`bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add ${SD}/boot-phases.ts ${SD}/assembly-phases.ts ${testFile} ${DEPS} development/scripts/size-debt.json
git status --short
git commit -m "refactor(composition): R composeSiteRouteDeps becomes ordered phases, root 49 lines (deps-split v4)"
npm run check:why-comments -- --base "$(cat "$T/parent")"
git pull --rebase
git push
\`\`\`
\`git status --short\` must show only these files and the readers step 4 changed — add those explicitly. If \`check:why-comments\` fails: \`git reset --soft HEAD~1\`, restore the comment, re-run 5-7. If \`git pull --rebase\` brings commits that touch deps.ts, re-run steps 5-6 before \`git push\`.
`;
fs.writeFileSync(OUTF, md);
console.log('R hash', hash, 'root statements after', rootAfter.length);
