const fs=require('fs');const [censusF,testsF,depsF,outDir]=process.argv.slice(2);
const C=require(censusF);const tests=fs.readFileSync(testsF,'utf8').trim().split('\n');const lines=fs.readFileSync(depsF,'utf8').split('\n');
const ts=require('/opt/node-tools/node_modules/typescript');const src=lines.join('\n');const sf=ts.createSourceFile('d.ts',src,ts.ScriptTarget.Latest,true);
const L=p=>sf.getLineAndCharacterOfPosition(p).line+1;const fn=sf.statements.find(s=>s.name&&s.name.text==='composeSiteRouteDeps');
const st=fn.body.statements.map(s=>({s,start:L(s.getStart()),b:L(s.end),first:s.getText().split('\n')[0].trim()}));
const owner=n=>C.find(c=>c.range&&n.start>=c.range[0]&&n.b<=c.range[1]);
const callLine=c=>`const { ${c.outputs.join(', ')} } = ${c.fn}(`;
const NOTES={
B09:'The one statement is 62 code lines: over the 50-line limit even alone. Split its `new Map<string, TrashFollowUpHooks>([ … ])` entry list at the entry that starts on tip line 1428 (`    [`, the first entry after `...(["form_submission", "form"] …).map(…)` and the menu-independent entries): `trashFollowUpHookEntriesA(required)` returns `Array<[string, TrashFollowUpHooks]>` holding the entries before it, verbatim and in order; `trashFollowUpHookEntriesB(required)` returns the entries from it to the end; `composeTrashFollowUpHooks` returns `{ trashFollowUpHooks: new Map<string, TrashFollowUpHooks>([...trashFollowUpHookEntriesA(required), ...trashFollowUpHookEntriesB(required)]) }`. Entry evaluation order and Map insertion order are unchanged by construction. Each function takes only the inputs its text reads.',
B10:'48 code lines: the slice function is at the limit. If the size gate (step 5) reports `composeTrashAdapters` over 50, move the `pluginTrashAdapter` statement into `pluginTrashAdapterFor(required)` in the same file (verbatim initializer) and call it in place; nothing else changes.',
B22:'58 code lines. Move the value of the `publishContentDeps:` property (the whole `toPublishContentApplyDeps({ … })` call, verbatim) into `publishContentApplyDeps(required)` in the same file, returning that call; the property becomes `publishContentDeps: publishContentApplyDeps({ …its inputs… }),` at the same position. Argument evaluation order is unchanged (the property keeps its place in the object literal).',
B05:'Moves `siteTitleReady.catch(() => undefined);`, which is one of the two `catch-reads-error` findings counted for `deps.ts` in `development/scripts/error-gate-debt.json` (`"value": 2`). In the same commit: set that row to `"value": 1` and add `{ "file": "apps/website/src/server/runtime/composition/site-deps/identity-settings.ts", "rule": "catch-reads-error", "value": 1 }` next to it (keep the file sorted by `file`). `check:errors -- --strict` in step 5 proves the edit; if it names a different catch, STOP-ERROR-DEBT.',
B06:'Uses the module singleton `consoleLogger` (deps.ts:417): pass it as the required input `consoleLogger` (type `ReturnType<typeof createConsoleLogger>`); do not construct a logger in the slice.',
B25:'Uses the module singleton `consoleLogger` (deps.ts:417): pass it as the required input `consoleLogger`. Keeps `consoleLogger.info` (tip 2727) and `consoleLogger.error` (tip 2731) with their texts.',
B01:'Uses the module helpers `resolveSiteBindingOverride` and `resolveThemesDirOverride` (still used elsewhere in deps.ts) and `agentPluginIdentityAdmission` (used only here). `agentPluginIdentityAdmission` (+ its `AgentPluginIdentityAdmission` type, tip 939-948) moves into the slice file. The two resolvers are NOT imported from deps.ts (that would be an import cycle the boundaries gate rejects): pass `resolvedSiteBinding`… no — they are called inside the range, so this slice runs **after M1** (see INDEX-v4), which moves them to `site-deps/overrides.ts`; import them from there.',
B04:'Calls `pluginFailureThresholdOverride` (module helper): import it from `site-deps/overrides.ts` (moved by M1).',
B05x:'',
B16:'Calls `compositionSiteKeySources` (module helper, used only here): it moves into the slice file with its doc comment.',
B18:'Contains the hoisted closure function `compositionCustomCredentials` (tip 1839-1844), called inside the range (1835): it becomes a module-level function in the slice file taking `(required, optional = {})` with the closure variables it reads as required fields; the call passes them. Calls `credentialProject` (module helper, also used at tip 2681/2692): it moves to `site-deps/provider-identity.ts` in M3 (prerequisite) and is imported from there.',
B19:'Contains the hoisted closure function `composeContentHttpClients` (tip 1937-1958, a `Record<string, never>` placeholder signature): it becomes a module-level function in the slice file with real `(required, optional = {})` inputs (the variables its body reads); the call at tip 1935 passes them.',
B23:'Contains the hoisted closure function `resolveCompositionPublicOrigin` (tip 2093-2099): module-level function with real inputs, as in B19. Line 2114 (`bindSharedApiOAuth = …`) is NOT in this slice: it writes a root `let` and stays in the root right after the call.',
B07:'Contains the hoisted closure function `registerBootOrigin` (tip 1329-1355, called at 1327): module-level function in the slice file with real `(required, optional = {})` inputs.',
B24:'`let resolveRouteDeps!` is assigned only inside the next statement\'s Promise executor, so it leaves as a returned value (root destructures it as a `const`; nothing else writes it). Same for `routeDepsBuilt`.',
B02:'`let provideMediaCredentials!` is assigned only inside the next statement\'s Promise executor (tip 1006), so it leaves as a returned value; the root destructures it as a `const` (only the after-assembly call at tip 2832 reads it).'};
const TYPE_RULE=`Type each required field mechanically from the binding's declaration (column "declared as"): \`const x = f(…)\` → \`ReturnType<typeof f>\`; \`const x = await f(…)\` → \`Awaited<ReturnType<typeof f>>\`; \`const { x } = f(…)\` → \`ReturnType<typeof f>["x"]\`; \`new C(…)\` → \`C\`; an annotated declaration → its annotation; \`overrides\` → \`Partial<CreateSiteRouteDepsOverrides>\` from \`./overrides.js\`; \`dbPath\` → \`string\`; \`store\` → \`SiteStore\`; \`onStoreClose\` → \`(required: { registration: StoreCloseRegistration }, optional?: Record<string, never>) => void\` with \`StoreCloseRegistration\` from \`./open-store.js\` (moved by M2); \`kernel\` → \`SiteStore["content"]\`; \`workspaceId\` → \`string\`. A getter field is \`() => T\` with T from the same rule. If typecheck rejects one field's type, replace that field's type with the type TypeScript names in the error and nothing else; any other typecheck error is STOP-TYPE.`;
const testsBlock=tests.map(t=>'  '+t+' \\').join('\n');
let idx=[];
for(const c of C){ if(!c.range) continue;
 const i0=st.findIndex(x=>x.start===c.startLine); const prev=st[i0-1]; const after=st.findIndex(x=>x.start>c.b); const next=st[after];
 const po=owner(prev); const PREV=po?callLine(po):prev.first; const no=owner(next); const NEXT=no?null:next.first;
 const order=st.filter(x=>x.start>=c.startLine&&x.b<=c.b&&ts.isVariableStatement(x.s)).flatMap(x=>x.s.declarationList.declarations.map(d=>d.name.getText().replace(/\s+/g,' ')));
 const getters=c.inputs.filter(i=>i.mode==='getter').map(i=>i.n);
 const file=`apps/website/src/server/runtime/composition/site-deps/${c.name}.ts`;
 const testFile=`apps/website/src/server/runtime/composition/site-deps/__tests__/${c.name}.characterization.unit.test.ts`;
 const inRows=c.inputs.map(i=>`| \`${i.n}\` | ${i.mode==='getter'?'**getter** `() => '+i.n+'`':'value'} | ${i.decl==='param'?'root parameter':'tip '+i.decl} | ${i.declText?'`'+i.declText.replace(/\|/g,'\\|').replace(/`/g,"'")+'`':''} |`).join('\n');
 const reqObj=c.inputs.map(i=>i.mode==='getter'?`${i.n}: () => ${i.n}`:i.n).join(', ');
 const impRows=c.imports.map(m=>`| \`${m.n}\` | \`${m.spec}\` | ${m.alsoOutside?'copy (still used in deps.ts)':'**move** (delete from deps.ts)'} |`).join('\n');
 const topRows=c.top.map(t=>`\`${t.n}\` (tip ${t.line}${t.alsoOutside?', also used elsewhere':', used only here'})`).join(', ');
 const readers=c.readers.map(([p,h])=>`- \`${p}\` — its literal(s) found in this range: ${h.slice(0,4).map(x=>'`'+x.slice(0,70).replace(/`/g,"'")+'`').join(', ')}. If step 6 fails in this file, point that assertion at \`${file}\` (read both files where the test reads deps.ts); no other change to it.`).join('\n')||'- none found by literal match on the tip; step 6 runs every source reader anyway.';
 const prevS=lines[c.startLine-1].replace(/'/g,"'\\''"); const span=c.b-c.a+1; const lead=c.startLine-c.a;
 const md=`# ${c.id} — \`${c.name}\` (deps-split v4)

Design tip: Tovu \`2d82735a\` (\`origin/integ/merge-3-2026-11-18\`), Jini \`d37821a4\`. One commit. Self-contained: COMMON rules are restated here.

## What moves
- **Range**: \`composeSiteRouteDeps\` statements on tip lines **${c.startLine}-${c.b}** with their leading comment lines **${c.a}-${c.startLine-1}** (${c.stmts} statements, ${c.code} code lines). No \`await\`, no write to a root \`let\` (checked by the design census).
- **To**: new file \`${file}\`, function \`export function ${c.fn}(required: ${c.fn[0].toUpperCase()+c.fn.slice(1)}Required, _optional = {})\` whose body is the range **verbatim, same order, comments included**, followed by \`return { ${c.outputs.join(', ')} };\`. Getter fields are read as \`name()\` at each use inside the moved text (the only allowed text edit besides imports). Why-comments move with their code.
- **Root replacement** (same position, one statement):
\`\`\`ts
${callLine(c)}{ ${reqObj} });
\`\`\`
- **Outputs** (destructured under the same names, so no other line of deps.ts changes): ${c.outputs.map(o=>'`'+o+'`').join(', ')}.
- **Module helpers read by the range**: ${topRows||'none'}.
${NOTES[c.id]?'- **Note**: '+NOTES[c.id]:''}

### Required inputs (\`${c.fn[0].toUpperCase()+c.fn.slice(1)}Required\`)
| field | how passed | declared at | declared as |
|---|---|---|---|
${inRows}

${TYPE_RULE}

A getter is required wherever the binding is declared after the range or is a root \`let\` reassigned later; passing such a binding as a value is either a TypeScript error (TS2448/TS2454 "used before its declaration", verified on a probe) or reads a stale cell — the characterization test below fails on the latter.

### Imports used by the range
| name | from | action |
|---|---|---|
${impRows||'| — | — | — |'}

Relative specifiers (\`./x.js\`) become \`../x.js\` in \`site-deps/\`.

## Importers to repoint
None: no exported symbol of deps.ts moves (verify: \`git grep -n "${c.fn}" -- apps\` returns only the two files of this slice after the commit).

## Source readers of deps.ts (literal match on the tip)
${readers}

## Characterization test (add \`${testFile}\`)
\`\`\`ts
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this slice must not change: its call sits where the moved statements sat, the moved
// statements keep their order, and inputs that are built later are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const SLICE = new URL("../${c.name}.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, \`\${name} not found\`);
  return found.body.statements;
}

test("${c.id}: the call keeps the moved statements' place in composeSiteRouteDeps", () => {
  const body = bodyOf(parse(DEPS), "composeSiteRouteDeps");
  const at = body.findIndex((s) => firstLine(s).startsWith(${JSON.stringify(callLine(c).split(' = ')[1])}));
  assert.ok(at > 0, "slice call missing");
  assert.equal(firstLine(body[at - 1]), ${JSON.stringify(PREV)});${NEXT?`\n  assert.equal(firstLine(body[at + 1]), ${JSON.stringify(NEXT)});`:''}
});

test("${c.id}: the moved statements keep their order", () => {
  const declared = bodyOf(parse(SLICE), ${JSON.stringify(c.fn)}).flatMap((s) => ts.isVariableStatement(s) ? s.declarationList.declarations.map((d) => d.name.getText().replace(/\\s+/g, " ")) : []);
  assert.deepEqual(declared, ${JSON.stringify(order)});
});

test("${c.id}: later-built inputs are only read lazily", () => {
  const getters: readonly string[] = ${JSON.stringify(getters)};
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of bodyOf(parse(SLICE), ${JSON.stringify(c.fn)})) visit(statement, false);
  assert.deepEqual(eager, []);
});
\`\`\`
Red first (prove the pins bite, then revert each): swap the first two moved statements → test 2 fails${getters.length?`; call \`${getters[0]}()\` once at the top of the slice body → test 3 fails`:''}; move the root call one statement down → test 1 fails. Record the three failing outputs in the commit message body.

## Steps (fail-closed; every block starts with \`set -euo pipefail\`; any non-zero exit = STOP with the step number)
**1. Start (clean tree, on the branch's last green commit).**
\`\`\`bash
set -euo pipefail
git diff --quiet && git diff --cached --quiet
F=apps/website/src/server/runtime/composition/deps.ts
T=\$(mktemp -d)
git rev-parse HEAD > "\$T/parent"
test "\$(grep -cxF -- '${prevS}' "\$F")" -eq 1
s=\$(grep -nxF -- '${prevS}' "\$F" | cut -d: -f1)
test "\$(sed -n "\$((s-${lead})),\$((s+${c.b-c.startLine}))p" "\$F" | sha256sum | cut -d' ' -f1)" = ${c.sha}
npm run check:architecture -- --update
npx depcruise --config .dependency-cruiser.mjs apps/website/src --output-type baseline --output-to "\$T/known.json"
echo "T=\$T s=\$s"
\`\`\`
The hash proves the ${span} lines are byte-identical to the design tip, wherever they now sit (earlier slices shift line numbers; they never edit this range). A mismatch is STOP-STALE: the sheet is regenerated, nothing is frozen. \`--update\` writes the parent's architecture metrics into the working-tree baseline (never committed, restored in step 7) so step 5 compares the candidate with its parent, metric by metric and edge by edge, using the tool's own comparison.

**2. Edit** as "What moves" says. **3. Add the characterization test.** **4. Readers**: change only the assertions step 6 shows failing, as listed above.

**5. Gate (repo commands only).**
\`\`\`bash
set -euo pipefail
npm run typecheck
npm run typecheck:tests
SIZE_BASE_REF=\$(cat "\$T/parent") npm run check:size
npm run check:complexity
npm run check:errors -- --strict
npm run check:hooks
npm run check:architecture
node development/scripts/check-feature-ranks.mjs . development/boundaries/feature-ranks.json
npx depcruise --config .dependency-cruiser.mjs apps/website/src --ignore-known "\$T/known.json"
npx eslint --no-config-lookup -c development/scripts/size-eslint.config.mjs --rule '{"max-lines-per-function":["error",{"max":50,"skipBlankLines":true,"skipComments":true,"IIFEs":true}],"max-lines":["error",{"max":500,"skipBlankLines":true,"skipComments":true}]}' ${file}
npm run build:server
\`\`\`
**6. Tests** (the repo's own runner line from \`package.json\` "test", with explicit files: every test that boots \`createSiteRouteDeps\` without Postgres, every source reader of deps.ts, and this slice's test).
\`\`\`bash
set -euo pipefail
TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --experimental-test-module-mocks --test-concurrency=2 \\
${testsBlock}
  ${testFile}
\`\`\`
Base status: INDEX-v4 records which of these are red on the tip (container facts); a test red on the parent stays red only with the same failing test names, compared by running this block on the parent at step 1 when INDEX-v4 lists any.

**7. Commit and push.**
\`\`\`bash
set -euo pipefail
git checkout -- development/scripts/check-architecture.baseline.json
git add ${file} ${testFile} apps/website/src/server/runtime/composition/deps.ts
git status --short
git commit -m "refactor(composition): ${c.id} ${c.name} moves out of composeSiteRouteDeps (deps-split v4)"
npm run check:why-comments -- --base "\$(cat "\$T/parent")"
git pull --rebase
git push
\`\`\`
\`git status --short\` must show only the slice's files, the readers step 4 changed, and (B05 only) the error debt file — add those explicitly. If \`check:why-comments\` fails: \`git reset --soft HEAD~1\`, restore the comment, re-run 5-7. If \`git pull --rebase\` brings commits that touch deps.ts, re-run steps 5-6 before \`git push\`.
`;
 fs.writeFileSync(`${outDir}/${c.id}-${c.name}.md`,md);
 idx.push({id:c.id,name:c.name,lines:`${c.a}-${c.b}`,code:c.code,inputs:c.inputs.length,getters:getters.length,outputs:c.outputs.length,readers:c.readers.length});}
fs.writeFileSync(`${outDir}/index.json`,JSON.stringify(idx));
