BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20, cull-resheet3).
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Jini clone, branch codex/rs3-jini, HEAD = Jini integ/merge-6-2026-11-19 (d3e78b387) with origin/codex/jy-core (949c622a1), origin/codex/jy-pb (42031785d) and origin/codex/jb1 (6da21feaf) combined in by the coordinator.
TASK (JINI ONLY; in this order; no sidekicks/subagents): J02, J04, J-06, AG0-J EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them; the CULL wins over the design. M5-J is DROPPED (not done). J03, J05, J06 (no hyphen) are RETIRED (done on codex/jz2-b 6a156a70e). ACP-8 stays HELD. In-place edits only: no moves, no export changes, no package.json, changeset or baseline edits. Tests first where the sheet names a new case.
BASES per sheet: J02 jy-core 949c622a1; J04 jy-core 949c622a1; J-06 jy-pb 42031785d; AG0-J jb1 6da21feaf. SKIP any sheet whose base commit is not an ancestor of HEAD and say so.
STOP rules per sheet: J02 — the exhausted path starts waiting or `close()` can be skipped. J04 — any edit to `src/index.ts` or another export would be needed, or the queue starts returning its settlement promise. J-06 — another executable reference to `defaultReadFile` (the TSV row `packages/daemon/docs/call-shape-sweep.tsv:16753` is EXPECTED and ALLOWED; leave it unedited). AG0-J — either assertion needs a production edit.
COMMIT-PLAN.md: one entry per sheet: sheet ID, base, files touched, tests written, the mutation to run in cloud, ledger key `(path, catch-reads-error)` and expected shrink (J02 page-work-budget.ts −1; J04 mcp/src/core/config.ts −2), STOP/skip reason if any, deletions made in the final diff re-read. Commit per sheet; message `rs3-jini: <sheet id> …`.

## NO OVER-ENGINEERING (owner rule, HARD — read before every edit)
- Do EXACTLY what the sheet names. If the sheet does not name it, do not add it.
- No new helpers, wrappers, adapters, ports, interfaces, types, generics, options, config flags or abstraction layers unless the sheet lists them by name.
- No "just in case" code: no extra validation, defensive checks, fallbacks, try/catch, null guards, retries or default values the moved code did not already have.
- No speculative generality: no parameters "for later", no unused exports, no optional args nobody passes, no `_optional` pads.
- Moves are VERBATIM: same statements, same order, same names. Do not rewrite, rename, "clean up", reformat or modernize the code you move.
- Tests: only the cases the sheet lists (+ the named mutation). No extra test scaffolding, fixtures or factories beyond what those cases need.
- Comments: move existing why-comments verbatim; add NO new comments except a one-line neutral note where the sheet asks for one.
- Smallest diff that satisfies the sheet. If something seems to need more, STOP that step and report it instead of building it.
- Before finishing, re-read your diff and DELETE anything not required by the sheet. List any deletions in COMMIT-PLAN.md.

## OWNER RULES (HARD)
Behaviour identical except the bug fix a sheet names (failing test first); errors never generic (plain words + redacted details; follow the error disclosure contract quoted in the sheet); never raise a debt number; API args (required, optional = {}) for NEW functions only, framework-dictated signatures (Express handlers, React events, comparators, type guards) exempt; every custom hook injected as a prop defaulted to the real hook; no re-export shells (delete + repoint); no new deps; no vendor code in Jini core; no specific server framework in Jini domain code; no product names (Tovu, tovu.dev) anywhere in Jini; no new eslint-disable/@ts-ignore/as any/as never; functions <= 50 lines, complexity <= 10 (HARD). A file over 500 lines is NOT a stop reason: note it in COMMIT-PLAN.md and continue. STOP a sheet (continue the others) if a named declaration is missing, an unlisted PRODUCTION importer appears (`git grep -n -F '<symbol>' -- apps/ development/ packages/`; unlisted TEST importers needing only the same repoint are fine, record in REFRESH.md), a cast is needed, or a hard limit is exceeded. MACHINE RULE: no other repo-wide scans; NO tests, builds, installs, type-checks, linters (Codex 6.1 Sol executors run none; cloud runs them); no codebase-memory-mcp; .git read-only; COMMIT-PLAN.md at repo root, one entry per sheet (sheet ID, base, files touched, tests written, the mutation to run in cloud, STOP/skip reason if any, deletions made in the final diff re-read).

## REPORT (<= 300 words)
Per sheet: DONE / STOPPED (why, file:line) / SKIPPED. List every file touched, every REFRESH.md entry, and anything the cull text did not cover.


## DESIGN (Codex 6.2, r62t-resheet3) — sheets for this job only
Copy this block into each job brief and apply it before every edit.

```text
Behaviour identical except for the named AP-T and M5 behavior and J04’s
specified root API removal. API args (required, optional = {}) for NEW
functions only, with framework-dictated signatures exempt. No re-export
shells, new deps, eslint-disable, @ts-ignore, as any or as never. Functions
<= 50 lines and complexity <= 10. Record files over 500 lines in root
COMMIT-PLAN.md and continue. STOP the affected sheet if a named declaration
is missing, an unlisted PRODUCTION importer appears (git grep -n -F
'<symbol>' -- apps/ development/ packages/), a cast is needed, or a function
exceeds either cap. Unlisted TEST importers needing only the same repoint
are fine, record in REFRESH.md. Hooks are injected as props. No vendor code
or specific server framework in Jini domain packages. Anything needing a
lockfile change, new npm dependency or new Jini package is OPUS-CLOUD.

Only named source and test edits. No repo-wide scans beyond the specified
symbol checks. No tests, builds, installs, type checks, linters or
codebase-memory-mcp. .git is read-only. Apply the owner’s minimal-diff rule.
Move named statements and why-comments verbatim, in order. Add only the
named helpers, fields, cases and mutations. Re-read the diff, delete
extraneous edits and list those deletions in root COMMIT-PLAN.md.
```

Paths below use `P＝packages`, `W＝apps/website/src`, `R＝W/server/runtime/composition`, `S＝apps/site-chat/src`, and `D＝apps/desktop/src`. Import lines shown for in-place changes are retained. Error-gate rows refer to `(file, catch-reads-error)`. Combine runs the tests, applies the named mutations, and updates debt or API baselines once verified.

### J02 · Jini · `jy-core` `949c622a1` · 1.1k tokens

- **Tests first.** Use the existing exhausted-budget late-rejection case in `P/diagnostics/src/web-evidence/__tests__/page-work-budget.test.ts:74–91`. Mutation removes `observed`, leaving the late rejection unhandled. Restoring the original catch exercises the gate.
- **Edit.** In `P/diagnostics/src/web-evidence/page-work-budget.ts`, `PageWorkBudget.release` at `:79–89`, add `import { observed } from "@jini-ai/core/errors/idioms";`. Replace only `void closing.catch(() => {});` at `:82` with `observed({ promise: closing });`. Keep `close()` and the live-budget wait in their original positions.
- **Importers.** `collect-page-evidence.ts:48`, `playwright-browser.ts:25`, `public-page.ts:6` each retain `import { PageWorkBudget, PageWorkTimeout } from "./page-work-budget.js";`. `render-page.ts:2` retains `import { PageWorkBudget, PageWorkDeadline, PageWorkTimeout } from "./page-work-budget.js";`. `__tests__/page-work-budget.test.ts:7` retains `import { PageWorkBudget, PageWorkTimeout } from '../page-work-budget.js';`. `__tests__/render-page.test.ts:9` retains `import { PageWorkBudget } from "../page-work-budget.js";`. All paths are under `P/diagnostics/src/web-evidence/`.
- **Accounting and STOP.** O333 −1. No export, manifest, injection or visual check. STOP if the exhausted path starts waiting or `close()` can be skipped.

### J04 · Jini · `jy-core` `949c622a1` · 1.8k tokens

- **Tests first.** In `P/mcp/src/__tests__/index.test.ts:8–33`, remove `writeMcpConfig` from the positive export list and add `expect(mcp).not.toHaveProperty('writeMcpConfig');` in that test. Restoring the root export makes it red. Use the existing config writer failure, serialization, and missing-path containment cases in `P/mcp/src/core/__tests__/config.test.ts` as combine witnesses. For queue behavior, mutate the new await chain to plain `prev.then(...)` and queue a second write behind a failing first write. For containment, remove the lexical fallback and exercise a missing child under the projects directory.
- **Edit.** In `P/mcp/src/core/config.ts:273–285`, use `const task = afterSettled({ promise: prev }).then(() => doWrite(dataDir, body, files));`. At `:302–308`, return `orFallbackSync({ work: () => realpathSync.native(p), fallback: undefined, step: 'Resolve MCP config path' }) ?? path.resolve(p);`. Add `import { afterSettled, orFallbackSync } from '@jini-ai/core/errors/idioms';`. Delete `writeMcpConfig,` at `P/mcp/src/index.ts:15`.
- **Importers.** The root test keeps `import * as mcp from '../index.js';` at `:2`. `P/mcp/src/__tests__/args-convention.unit.test.ts:2` already imports the writer from `'../core/config.js'`. Under `P/mcp/src/core/__tests__/`, `config.write.unit.test.ts:3` retains `import { writeMcpConfig, type McpConfigFilesPort } from '../config.js';`, and `secret-defaults.test.ts:39` retains `import { writeMcpConfig } from '../config.js';`. The held `config.test.ts:7–19` imports `../index.js`, which resolves to `P/mcp/src/core/index.ts:10` and its existing `export * from './config.js';`. Leave that held test and the internal barrel. `resolveRealOrLexical` has only the local default reference at `config.ts:326`.
- **Accounting and STOP.** O363, two catch sites. Combine removes `writeMcpConfig` from the root baseline at `api-baseline/jini-ai__mcp.json:108` and reconciles the public references in `P/mcp/{API.md,README.md,docs/spec/api.spec.md}`. No manifest, injection or visual change. STOP if a tracked root consumer appears or the queue begins returning its settlement promise. The package declares no public config subpath.
- **BREAKS:** Consumers importing `writeMcpConfig` from published `@jini-ai/mcp` lose that import. There is no supported deep-import replacement in this sheet.

### J-06 · Jini · `jy-pb` `42031785d` · 0.8k tokens

- **Tests first.** Existing `P/cli/src/__tests__/prompt-read-file-settled.test.ts:43,52` covers late error after end and late end after size rejection. Keep the hoisted `node:fs` mock at `:16`. No test edits or mutation plant. Removing the static binding fails the combine build.
- **Edit.** In `P/cli/src/prompt.ts`, immediately after the header ending at `:34`, add `import { createReadStream } from 'node:fs';`. Delete `const { createReadStream } = await import('node:fs');` from `defaultReadFile` at `:110`. Its only executable reference is local at `:105`. **Leave `P/daemon/docs/call-shape-sweep.tsv:16753`**, a generated snapshot of a historical comment.
- **Accounting and STOP.** No caller repoints, export, manifest, baseline, debt or visual change. STOP for another executable reference to `defaultReadFile` or a public baseline entry. The named TSV row is allowed.

### AG0-J · Jini · `jb1` `6da21feaf` · 1.1k tokens

- **Tests first and entire edit.** Add two cases to `P/chat/src/core/run-events/__tests__/payload.test.ts` after the existing cases at `:20–22` and `:59–62`, using the existing wrapper for `translateRunAgentPayload` from `'../entry.js'` at `:3–5`. Port the assertions from Tovu `tv-b2:W/server/runtime/composition/modules/__tests__/assistant-ag-ui.wire.unit.test.ts:20–21` exactly in meaning:
  - `{ type: "text_delta" }` → `{ kind: "text", text: "" }`. Mutation emits `"undefined"`.
  - `{ type: "tool_result", toolUseId: "t1", content: null, isError: 1 }` → `{ kind: "tool_result", toolUseId: "t1", content: "", isError: true }`. Mutation emits `"null"`.
- **Accounting and STOP.** Test-only. No source, imports, exports, manifest, baseline, debt or look. STOP if either assertion needs a production edit. AG0-T can consume the result after this lands.

## OVER-ENGINEERING CULL (Opus) - WINS

The executor-rules sentence "…and J04's specified root API removal" is overridden: J04 removes NOTHING from the API.

Verdicts for this job: J02 KEEP · J04 CUT-TO · J-06 KEEP · AG0-J KEEP · M5-J DROP (one caller; the collector source stays in Tovu M5-T).

### J04 (Jini, `jy-core`)
Replace the sheet's **Tests first**, **Edit**, **Accounting** and **BREAKS** with the following:
1. Edits: `config.ts:278` becomes `const task = afterSettled({ promise: prev }).then(() => doWrite(dataDir, body, files));`. `:302–308` becomes `return orFallbackSync({ work: () => realpathSync.native(p), fallback: undefined, step: 'Resolve MCP config path' }) ?? path.resolve(p);`. Add `import { afterSettled, orFallbackSync } from '@jini-ai/core/errors/idioms';`.
2. **Do not edit `src/index.ts`, `__tests__/index.test.ts`, the API baseline, API.md, README.md or api.spec.md.** `index.ts:15` is a listed production importer and keeps its line. Every other listed importer keeps its line too (`args-convention.unit.test.ts:2`, `core/__tests__/config.test.ts:12`, `config.write.unit.test.ts:3`, `secret-defaults.test.ts:39`).
3. Witnesses: the existing `config.test.ts:160–203` writer cases. The mutation restores `prev.catch(() => {})` / the try. No BREAKS.

### J02, J-06, AG0-J
KEEP as written above. J02: the six listed importers keep their lines; that list is complete on jy-core (four production, two test). J-06: leave the TSV row, as stated. AG0-J: `RunAgentPayload` (`entry.ts:40–43`) has an index signature, so no cast.

## COMMIT-PLAN entries expected
- J02 · base jy-core · page-work-budget.ts · no new test (witness page-work-budget.test.ts:74–91) · mutation: restore `void closing.catch(() => {})` · ledger −1.
- J04 · base jy-core · mcp/src/core/config.ts · no new test (witness core/__tests__/config.test.ts:160–203) · mutations: restore `prev.catch(() => {})` / the try · ledger −2 · index.ts untouched.
- J-06 · base jy-pb · cli/src/prompt.ts · no test edit · witness prompt-read-file-settled.test.ts:43,52 · TSV row left.
- AG0-J · base jb1 · chat/src/core/run-events/__tests__/payload.test.ts · two cases · mutations: emit "undefined" / "null".
