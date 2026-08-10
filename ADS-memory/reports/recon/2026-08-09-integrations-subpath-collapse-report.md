# Integrations subpath collapse — handoff report

**Date:** 2026-08-09
**Repo:** `/Users/la/Programming/Jini`, branch `refactor/jini-admin-extraction` (all changes UNCOMMITTED, per instruction)
**Agent:** Programmer (Agent Direct Mode, AI-Dev-Shop `AI-Dev-Shop/agents/programmer/skills.md` v1.7.0)
**Task:** Collapse `packages/integrations/{composio,media-providers}` (two sibling packages) into one package, `@jini-ai/integrations`, with `./composio` and `./media-providers` subpath exports.

---

## Persona / skill bootstrap

- `AI-Dev-Shop/agents/programmer/skills.md` read and confirmed loaded before any work (v1.7.0).
- `AI-Dev-Shop/AGENTS.md` read; this is a dispatched-subagent context (task prompt with full inline context) — Mandatory Startup does not apply, no interactive banner.
- Conditional skill activated: **`backend-implementation`** (as directed).
- Other conditional skills checked, none triggered:
  - `adr-governance` — `ADS-memory/governance/adrs/ADR-INDEX.md`'s only scope globs (`src/features/**`, `src/core/gated-mutations/**`, `src/identity/**`, etc.) are Tovu-app paths; none match `packages/integrations/**` in Jini.
  - `adversarial-test-design`, `secure-input-handling`, `observability-implementation`, `change-management` — no new validation/batch/endpoint/I-O/rollout logic; this is a pure relocation plus config assembly.
  - `focused-test` — implicitly in effect throughout (per-package `pnpm --filter` runs, never a full-suite run), consistent with standing scoped-test-run practice.
  - `superpowers-using-git-worktrees` / `finishing-a-development-branch` — no worktree, task explicitly says stay uncommitted.

---

## Files changed

**New/moved, `packages/integrations/` (git status: `A`/`AM` — renames tracked as add since the sources were already uncommitted `A` before this pass):**
- `packages/integrations/package.json`, `tsconfig.json`, `vitest.config.ts`, `README.md` — new, root of the consolidated package.
- `packages/integrations/src/composio/**` — moved from `packages/integrations/composio/src/**` (11 source files, 9 test files, `source-map.md`), via `git mv`.
- `packages/integrations/src/media-providers/**` — moved from `packages/integrations/media-providers/src/**` (all source, `__tests__/`, `dispatch/` incl. `dispatch/providers/`), via `git mv`.
- `packages/integrations/src/media-providers/{source-map.md,README.md,CHANGELOG.md}` — moved from `packages/integrations/media-providers/{...}`, via `git mv`.

**Removed:**
- `packages/integrations/composio/{package.json,tsconfig.json,vitest.config.ts}` — untracked, removed with `rm` (never staged in git).
- `packages/integrations/media-providers/{package.json,tsconfig.json,vitest.config.ts}` — staged (`AM`/`A`), removed with `git rm -f` (content differed from HEAD/index; content was read in full beforehand — see Task 1 in the session, values transcribed into the new consolidated `package.json`).
- `packages/integrations/composio/` and `packages/integrations/media-providers/` directories deleted entirely after confirming (`git check-ignore -v`) their only remaining contents were gitignored `node_modules`/`dist`.

**Doc-comment / self-reference fixes (current-identity only; see "Historical references left alone" below):**
- `packages/integrations/src/media-providers/{policy.ts,task-store.ts,types.ts,index.ts,tokens.ts,dispatch/types.ts,dispatch/vendor-registry.ts,dispatch/engine.ts,sqlite-task-store.ts,__tests__/index.test.ts,__tests__/tokens.test.ts,README.md}` — `@jini-ai/media` / `@jini-ai/integrations-media-providers` self-references → `@jini-ai/integrations/media-providers`.
- `packages/integrations/src/composio/index.ts` — `@module` JSDoc tag `@jini-ai/integrations-composio` → `@jini-ai/integrations/composio`.
- `packages/admin/README.md` — "Composio integration has moved" section and "Status" line: stale `@jini-ai/integrations-composio` current-identity mentions → `@jini-ai/integrations/composio`.

**Config/workspace:**
- `pnpm-workspace.yaml` — removed the `packages/integrations/*` glob and its two-line comment (now covered by the existing `packages/*` glob).
- `examples/reference-web/package.json` — `@jini-ai/integrations-media-providers` dependency → `@jini-ai/integrations`.
- `examples/reference-web/src/daemon.ts` — import specifier → `@jini-ai/integrations/media-providers`.

**Changesets:**
- `.changeset/admin-remove-server-subpath.md` — kept `"@jini-ai/admin": minor`; prose updated to name `@jini-ai/integrations/composio`.
- `.changeset/composio-un-retirement.md`, `.changeset/media-providers-rename.md` — deleted (untracked, `rm`).
- `.changeset/integrations-subpath-collapse.md` — new, `"@jini-ai/integrations": minor`, replacing both.
- `.changeset/fold-composio-into-admin.md` — **not touched by me**; it already carried an uncommitted correction (`@jini-ai/composio` → `@jini-ai/integrations-composio`) made by a prior agent before this session started. Noted only because `git status` shows it modified — see "Correction to the brief" below.

---

## Correction to the brief

The brief's §7 stated the retired standalone names as "`@jini-ai/media` (published 0.1.2) and `@jini-ai/composio` (published 0.2.1)". I verified this against `.changeset/fold-composio-into-admin.md` (ground truth, already in the repo) before writing the new changeset: the actually-published composio name across all three of its registry versions (0.1.0, 0.2.0, 0.2.1) was **`@jini-ai/integrations-composio`**, never bare `@jini-ai/composio` — confirmed by that changeset's own `npm deprecate @jini-ai/integrations-composio ...` precedent line. (A prior agent had already independently corrected the same typo in that same file before this session started, which corroborates it.) I used the verified name `@jini-ai/integrations-composio` in the new changeset and in the deprecate follow-up, not the brief's shorthand.

---

## Historical references left alone (not updated — genuinely historical or out of pure-relocation scope)

- `packages/integrations/src/media-providers/CHANGELOG.md` — body untouched (dated release notes under the old `@jini-ai/media` identity); only the required provenance header was added.
- `packages/integrations/src/composio/source-map.md:3,87` — "This layer was `@jini-ai/integrations-composio`... until 2026-08-01..." and "As `@jini-ai/integrations-composio`, `vitest.config.ts` scoped 100%..." — explicit past-tense/dated narrative, matches the fold history exactly. Left as-is.
- `packages/integrations/src/composio/composio.ts:47` — `const DEFAULT_USER_AGENT = '@jini-ai/integrations-composio/0.1';` — **this is a runtime string literal (the HTTP User-Agent sent to Composio's real API), not a doc comment.** Changing it would be a production behavior change, outside pure-relocation scope and outside the brief's "update doc-comment self-references" instruction. Deliberately left untouched — flagging for a decision if the maintainer wants it updated (would need its own version bump reasoning, since it's an observable value sent to a third party).
- `packages/integrations/src/media-providers/sqlite-task-store.ts:20-33` — the "Why this lives in `@jini-ai/media` itself, not `@jini-ai/sqlite`" block. **Genuinely ambiguous, left alone by judgment call:** it's a present-tense self-reference in form, but its entire argument is built on the locked/incubating package-boundary mechanism that `packages/README.md` says was removed repo-wide on 2026-07-28 — i.e., it's already describing now-defunct machinery under the old name. Rewriting just the package name without addressing the defunct-mechanism content would leave a doc comment that's half-updated and still wrong. Left as a historical decision record rather than partially edited. (Contrast with the *separate*, unambiguous block at lines 142-150 of the same file — the dynamic-import safety rationale — which I did update, since it has no defunct-mechanism entanglement.)

---

## Test results

`pnpm --filter @jini-ai/integrations run test:coverage` (fresh run):
- **41 test files, 784 tests, all passed.** Breakdown verified by summing suite counts: 212 composio + 572 media-providers — exact match to the prior agent's verified counts, confirming no tests were dropped in the move.
- Coverage: **100% statements / 100% branches / 100% functions / 100% lines**, across every file in `composio/`, `media-providers/`, `media-providers/dispatch/`, and `media-providers/dispatch/providers/`.
- No test content changed beyond `describe()`-label strings (`__tests__/index.test.ts`, `__tests__/tokens.test.ts`) — the brief's explicit STOP-and-report condition (test content changing beyond import-path/describe-label strings) was never triggered.

`pnpm --filter @jini-ai/admin run test`: **14 test files, 199 tests, all passed** (no composio tests remain here, as expected — composio moved out).

---

## Fresh verification commands (all run this session, in order)

```
cd /Users/la/Programming/Jini
pnpm install                                          # exit 0; "Done in 9.5s"; warnings are pre-existing/unrelated
                                                        #   (chat↔renderers-react cycle = other agent's active work;
                                                        #    sass/@radix-ui peer warnings pre-exist in ui/reference-web)
pnpm --filter @jini-ai/integrations run typecheck      # exit 0, no output (clean)
pnpm --filter @jini-ai/integrations run test:coverage  # 784/784 pass, 100%/100%/100%/100%
pnpm --filter @jini-ai/integrations run build          # exit 0
pnpm --filter @jini-ai/admin run typecheck             # exit 0, no output (clean)
pnpm --filter @jini-ai/admin run test                  # 199/199 pass
pnpm run guard                                         # 17 violations (see Architecture Audit)
pnpm --filter @jini-app/reference-web run typecheck    # exactly 1 error: pre-existing AgentLab.tsx TS2322
                                                        #   (confirmed via `grep -c "error TS"` = 1; nothing new)
```

**Build output on disk** (checked directly, not inferred from exit code):
```
packages/integrations/dist/composio/index.js        (952 bytes)
packages/integrations/dist/composio/index.d.ts       (2451 bytes)
packages/integrations/dist/media-providers/index.js  (994 bytes)
packages/integrations/dist/media-providers/index.d.ts (996 bytes)
```

**Subpath resolution proof** (real Node ESM import, run from `examples/reference-web` where the pnpm workspace symlink `node_modules/@jini-ai/integrations -> ../../../../packages/integrations` resolves):
```
$ node --input-type=module -e "import('@jini-ai/integrations/composio').then(m => console.log(Object.keys(m).length))"
composio subpath OK, exports: 24
$ node --input-type=module -e "import('@jini-ai/integrations/media-providers').then(m => console.log(Object.keys(m).length))"
media-providers subpath OK, exports: 70
```

**`better-sqlite3` optional-peer proof — executed, not a reasoned fallback.** Built an isolated Node environment outside the Jini repo's `node_modules` resolution chain (`Tovu` session scratchpad `optional-peer-proof/`), containing only: the built `@jini-ai/integrations` (`dist/` + `package.json`), the built `@jini-ai/core` (a real runtime dependency of `tokens.ts`), and a dereferenced copy of the real `undici` install (static import in `dispatch/providers/openai.ts`). `better-sqlite3` was deliberately excluded and its absence confirmed (`find ... -iname '*better-sqlite3*'` → empty). Then:
```
$ node --input-type=module -e "
const m = await import('@jini-ai/integrations/media-providers');
console.log('Export count:', Object.keys(m).length);           // 70
console.log(typeof m.renderStub, typeof m.createMediaDispatchEngine, typeof m.createInMemoryMediaTaskStore); // function function function
await m.createSqliteMediaTaskStore('/tmp/x.db').catch(e => console.log(e.code, e.message.split('\n')[0]));
"
IMPORT SUCCEEDED without better-sqlite3 resolvable. Export count: 70
renderStub present: function
createMediaDispatchEngine present: function
createInMemoryMediaTaskStore present: function
EXPECTED FAILURE calling createSqliteMediaTaskStore (only this path needs better-sqlite3):
   ERR_MODULE_NOT_FOUND - Cannot find package 'better-sqlite3' imported from .../dist/media-providers/sqlite-task-store.js
```
This is the strongest available proof: the whole subpath (70 exports) imports and every non-sqlite export works with `better-sqlite3` genuinely unresolvable; only the one factory function that needs it fails, cleanly, exactly as designed.

---

## Architecture Audit

**Status: PASS**

ADR checklist (derived from the task brief's explicit constraints, since this is Agent Direct Mode with no formal ADR artifact):
1. No `.` root export, no `main`/`types` barrel — verified: `package.json` has no `"."` key in `exports`, no top-level `main`/`types`. ✓
2. `better-sqlite3` both optional peer (`peerDependencies` + `peerDependenciesMeta.optional: true`) and devDependency — verified present in both places in the written `package.json`. ✓
3. `sideEffects` array re-rooted under `dist/media-providers/**`, composio implicitly covered by the array form (no separate `false`) — verified in `package.json`. ✓
4. `undici` stays a regular `dependencies` entry — verified. ✓
5. `pnpm-workspace.yaml`'s `packages/integrations/*` glob removed — verified, file now has only `packages/*` and `examples/*`. ✓
6. Scope boundaries honored: `packages/ui/`, `packages/chat/`, `packages/renderers-react/`, `scripts/check-engine-boundaries.ts` — none touched (confirmed via `git status` scoped diff above; the other agent's ui/renderers-react work is visible in the shared task list but was not touched by me). No `git commit`, no `pnpm changeset version`/`publish` run. ✓

**Guard count: 17 before → 17 after** (fresh `pnpm run guard` run this session). The prior two-package layout showed 18 (R8 firing on `packages/integrations/` having no `package.json`); with a real `package.json` now at that path, the R8 violation is gone and the count is back to the documented 17-violation baseline. Confirmed none of the 17 remaining violations mention "integrations" — all are the pre-existing R2/R5/R9 violations in `admin`, `chat`, `cms`, `ui`, `agentic` unrelated to this change.

No boundary ambiguity encountered; nothing to escalate to Software Architect.

---

## Pre-Completion Checklist

- **Requirements re-verified against the brief**: target directory shape matches exactly (`package.json`/`tsconfig.json`/`vitest.config.ts`/`README.md` at `packages/integrations/`, two subtrees under `src/`); `package.json` fields match the brief's template with dependency versions verified against the real old configs (not trusted blindly — see below).
- **Fresh evidence commands**: all listed above, run this session, real output pasted.
- **Test-integrity confirmed**: no certified test was deleted or weakened; the only test-file edits were `describe()`-label string updates, explicitly pre-authorized by the brief.
- **Scope confirmed**: diff is limited to `packages/integrations/**`, `pnpm-workspace.yaml`, three `.changeset/*.md` files, `packages/admin/README.md`, and `examples/reference-web/{package.json,src/daemon.ts}` — matches the brief's explicit scope exactly; no incursion into `ui`/`chat`/`renderers-react`.
- **Dependency versions verified, not transcribed blind**: read both old `package.json` files in full before `git rm`-ing them (composio: `@jini-ai/protocol` devDep only, `sideEffects: false`; media-providers: `@jini-ai/core`/`better-sqlite3`/`undici` deps + `@types/better-sqlite3` devDep) — all matched the brief's template exactly. `@vitest/coverage-v8` version (`^2.1.9`, absent from both old configs) cross-checked against 22 other `packages/*/package.json` files in the workspace — unanimous, used with confidence.
- **Open items**: none blocking. Two flagged-not-fixed items above (User-Agent string literal; sqlite-task-store.ts's defunct-mechanism doc block) are deliberate scope/ambiguity holds, not oversights.

---

## Self-Validation

Not a runtime-behavior-changing task in the sense `AI-Dev-Shop/harness-engineering/runtime/self-validation.md` targets (no server boot, no UI, no auth/migration path) — this is package restructuring. The equivalent evidence gate here is the fresh verification suite above (install → typecheck → test:coverage → build → real subpath resolution → real optional-peer isolation proof → guard → downstream consumer typecheck), all executed fresh this session, which I'm treating as this task's self-validation. Status: **PASS**.

---

## Style Notes

No new logic-bearing functions were authored — this task is relocation plus config/doc assembly, so `function-quality-assessment`'s per-function scoring doesn't apply to new code. The one piece of genuinely new prose-with-judgment-calls is the new `packages/integrations/README.md` and the consolidated changeset; both were written against the brief's explicit content requirements and cross-checked against `packages/README.md` / `packages/admin/README.md` for tone.

---

## Deviations from plan

1. **Composio's un-retired name correction** (see "Correction to the brief" above) — used verified `@jini-ai/integrations-composio`, not the brief's `@jini-ai/composio` shorthand, in the new changeset and deprecate command.
2. **`media-providers/README.md` treated as current-identity, not frozen historical** — unlike `CHANGELOG.md` (explicitly instructed to keep its body untouched), the brief gave no equivalent instruction for `README.md`. I updated its 3 self-references (title, `npm install` line, import example) to the new subpath specifiers, since leaving `npm install @jini-ai/integrations-media-providers` in a still-relevant feature-reference doc would be actively misleading (that name was never installable) rather than a preserved historical fact. Flagging this judgment call explicitly as requested.
3. **`sqlite-task-store.ts:20-33` left unedited** despite containing present-tense `@jini-ai/media` self-references, because the surrounding argument is entangled with the now-removed (2026-07-28) locked/incubating package-boundary mechanism — see "Historical references left alone" above.
4. **`composio.ts:47`'s `DEFAULT_USER_AGENT` literal left unedited** — it's runtime behavior (an HTTP header value), not a doc comment, so out of the brief's "doc-comment self-references" instruction and out of pure-relocation scope.

## Risks / tech debt

- `@jini-ai/integrations` is at `version: "0.1.0"` with a `minor` changeset attached — **this will release as `0.2.0`**, as the brief itself anticipated flagging. If a `0.1.0` initial publish is wanted, set the on-disk version to `0.0.0` before the next `pnpm changeset version` run. Not changed by me — stated per the brief's explicit instruction to flag rather than decide silently.
- Two `npm deprecate` follow-ups (`@jini-ai/media`, `@jini-ai/integrations-composio`) are documented in the new changeset but not run (no npm publish access from this agent, and the brief prohibits `pnpm changeset version`/`publish` anyway) — left for whoever runs the next release.
- The `composio.ts` User-Agent literal and the `sqlite-task-store.ts` defunct-mechanism doc block (see above) are two small, low-risk pieces of drift left in place by deliberate scope judgment, not oversight — worth a quick maintainer decision whenever that code is next touched for an unrelated reason.

## Suggested next routing

None required from a specialist agent — this task is complete and green. If the maintainer wants the two flagged ambiguous items resolved, that's a quick same-agent follow-up, not a new dispatch.
