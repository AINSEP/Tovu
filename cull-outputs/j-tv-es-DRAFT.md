BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20).
You are a refactor programmer. Read <repos>/Tovu/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Tovu/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Tovu clone, branch codex/tv-es, HEAD = Tovu integ/merge-6-2026-11-19 (776ce6d0f). Sheet base: needs E6a-J-NOTICE (Jini job codex/es-jini) released into the Tovu lock by the OPUS-CLOUD run first; the finished Jini source is READ-ONLY reference.
TASK (TOVU ONLY; no sidekicks/subagents): TV-ES1 EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines it; the CULL wins. Every other Tovu sheet of this design (E4-T-PINS, E9-T-INVENTORY: DROP; E3-T-HOST, E4-T-READERS/BOUNDARY, E6a-T-READER, E9-T-IPC, E10-T-I18N: BLOCKED) is NOT done. Contract row: Site visitor (anonymous) = words + ID + "Report this error ID.", no details.
STOP rules: STOP if `ErrorNotice` from `@jini-ai/ui/panel-kit` in the locked version has no `disclosure` prop; STOP if `OwnerRecoverySignIn`'s parent does not pass a `t` built from `auth-i18n.ts`.
COMMIT-PLAN.md: one entry, TV-ES1 (base: merge-6 + E6a-J-NOTICE release). No version pins or lock edits.

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

## DESIGN (Codex 6.2, r62t-err-sys) — sheets for this job only
### E6a-J-NOTICE · Jini UI · merge-6 after the in-flight set · 4k

**Contract:** Site visitor and signed-in site owner rows.

- **Tests first.** Extend `packages/ui/src/features/panel-kit/__tests__/ErrorNotice.test.tsx:11`. With `disclosure="id-only"` and the existing fixture, assert operation words, the ID and “Report this error ID.” Assert the details, clipboard button, cause, step, versions and time are absent. An old failure without an ID shows its words without an ID prompt. Existing full-mode clipboard tests stay. Mutations render full details in visitor mode or suppress the ID prompt.
- In `ErrorNotice.tsx:8`, add `readonly disclosure?: 'full' | 'id-only'`; default it to `'full'` at `:21`. Keep the injected hook call unconditional. In ID-only mode render the operation words and, when an ID exists, the ID and translated `Report this error ID.`. Use the default markup for full mode.
- **Imports and entry.** No repoints. `index.ts:2–3` is the existing export, `ErrorNotice.test.tsx:3` and `src/__tests__/hook-injection.sweep2.test.tsx:8` retain their imports. Existing Tovu consumers keep their default; visitor call sites come with E6/E8. API baseline `api-baseline/jini-ai__ui.json:342,2751` needs generated reconciliation. No manifest or debt changes. Chrome look after visitor adoption, including a failure with no reference.
- **STOP** if the visitor rendering requires changing the hook, clipboard contracts, or Tovu callers in this sheet.


## OVER-ENGINEERING CULL (Opus) - WINS
The CULL wins over the design text above wherever they differ. Sheets the cull marks DROP / BLOCKED / NEEDS-DECISION / OWNED-ELSEWHERE are NOT done.

# Cull of r62t-err-sys (error system E3–E11) — over-engineering judge

Input: `cull-inputs-2/designs/r62t-err-sys.md`, checked against the FIXED `cull-inputs-2/error-disclosure-contract.md`. Bases: Jini `d3e78b387` (merge-6), Tovu `776ce6d0f` (merge-6). Held `codex/ex-err-jini` diff (89 files) checked: it touches none of `core/src/errors/*`, `core/src/contracts/server/*`, `http-kit/src/{adapter,origin}.ts`, `ui/.../panel-kit/*`, `sidecar/*`. Read-only; no tests or builds.

Counts (7 ready + 2 promoted): **KEEP 1** (E4-J-TRACKER) / **CUT-TO 3** (E6a-J-NOTICE, new TV-ES1 adoption, E9-J-FRAME promoted from PARTIAL) / **DROP 3** (E5-J-GUARD, E4-T-PINS, E9-T-INVENTORY) / **BLOCKED 2** (E5a-J-CORE, E5a-J-HTTP). Partial rows: agree, all BLOCKED/OWNED-ELSEWHERE as the design says, except E9-J-FRAME.

## Contract check (deviations)
- Sheets as written follow the contract. One gap: E6a-J-NOTICE leaves the visitor prop with no caller, while two **anonymous** surfaces already render the full Copy details block (step, cause, versions, time) against the visitor row → fixed by TV-ES1 below.
- E4-J-TRACKER matches the approved ER-6 shape (original object + call `exactSecrets`). Third-party "label + ID only" stays adapter-side: no live tracker consumer exists (`createErrorReporter(` has no production caller in Jini or Tovu), so the sheet's STOP is right.

## Verdicts

| Sheet | Verdict | Base | Reason |
|---|---|---|---|
| E4-J-TRACKER | KEEP | merge-6 | Anchors verified: `reporter.ts:27` interface, `:115` `trackerCarrier`, `:122` `reportToTracker`, `:142/:160` `recordIncident`; only type importer `testing.ts:9`. Exactly the approved ER-6 change. |
| E5a-J-CORE | BLOCKED (E3-J-SERVER) | — | Adds optional `RouteHostContext.statusFor` + exported `routeStatus` that **no host passes** (catalog `statusFor` exists at `core/src/errors/catalog.ts:34,185` but nothing binds a catalog to a route host; no route emits a catalog code today). An option nobody passes. Land it in the same commit as the first host that passes `statusFor: catalog.statusFor` (E3-J-SERVER), as ONE sheet with E5a-J-HTTP. |
| E5a-J-HTTP | BLOCKED (E3-J-SERVER) | — | Follows E5a-J-CORE. Anchors (`adapter.ts:7,65,108,130`, `origin.ts:3,16`) are correct for later. |
| E5-J-GUARD | DROP | — | Guards `*.sentences.ts` files: **zero exist** in Jini merge-6 (only `core/src/errors/sentences.ts` itself). A new 2-function script for nothing. Put the one-import rule into the first sheet that creates a `*.sentences.ts` (E5-J-FORMS). |
| E6a-J-NOTICE | CUT-TO | merge-6 | Contract names `ErrorNotice disclosure="id-only"`, so the prop is right; cut the markup to the contract row and give it its two real callers (TV-ES1). |
| TV-ES1 (new) | CUT-TO | needs E6a-J-NOTICE + Jini release | Anonymous `Login.tsx:52` and `OwnerRecoverySignIn.tsx:26` render full details today. |
| E4-T-PINS | DROP | — | Test-only characterization of a wire whose change sheets (E4-T-READERS/BOUNDARY) are not dispatchable; mocks built-in `randomUUID` via `syncBuiltinESMExports`. The 5 existing cases in `user-facing-failure.test.ts:5,16,30,48,65` already pin anonymous/opt-in/secret/route-template behaviour. The two cases that matter (reuse an existing `ERR-` ID; disk-space 507) become the failing tests of E4-T-BOUNDARY. |
| E9-T-INVENTORY | DROP | — | A COMMIT-PLAN-only inventory by an executor; stale by the time E9-T-IPC (PARTIAL) dispatches. Belongs in the E9-T-IPC design pass. |
| E9-J-FRAME (promoted) | CUT-TO | merge-6 | Real contract bug, one-statement fix; does not grow the over-limit function, so the size prerequisite is not needed for it. |
| E9-J-HANDLER | BLOCKED (sidecar size decision) | — | Injecting the reporter grows a 156-line function. |
| E3-J-SERVER / E3-T-HOST, E4-T-READERS/BOUNDARY, E5a-J-DAEMON, E5-J-FORMS…RULES, E6a-J-READER/HOOKS, E6a-T-READER, E6 W6, E8-*, E9-T-IPC, E10-T-I18N, E11 | BLOCKED (as design) | — | Agree with the design's prerequisites. |
| E4-J-HTTP, E10-J-PARAMS | OWNED-ELSEWHERE ex-err-jini | — | Agree. |
| E0, E1, E2, E7 shared impl | RETIRE | — | Agree (E2 leaves verified under `core/src/errors/`). |

## Exact cut text

### E4-J-TRACKER — KEEP as written
Add one line to the sheet: also update the comment at `reporter.ts:9` and delete the comment at `:114` with `trackerCarrier`; replace `:157–158` comment with "`diagnostic` is the operator-only record. The tracker gets the original `error` and the call's `exactSecrets`; the tracker adapter blanks secrets before anything leaves the process." No other text.

### E6a-J-NOTICE (Jini `packages/ui/src/features/panel-kit/ErrorNotice.tsx`)
1. Tests first in `__tests__/ErrorNotice.test.tsx`: (a) `disclosure="id-only"` with a failure carrying `errorId` renders `message`, `action`, the ID and `Report this error ID.`; no `<details>`, no Copy button, no `step`/`cause`/version/time text; (b) same mode without `errorId` renders words only, no "Report this error ID." Existing full-mode tests unchanged. Mutation: render `<details>` in id-only.
2. Props: add `readonly disclosure?: 'full' | 'id-only';` to `ErrorNoticeProps`. Destructure `disclosure = 'full'`. Hook call stays first and unconditional.
3. Body: keep `<p>{failure.message}</p><p>{failure.action}</p>`; then `disclosure === 'id-only' ? (failure.errorId ? <p>{failure.errorId} — {t('Report this error ID.')}</p> : null) : <details>…existing…</details>`. No other change. Do NOT edit `admin/src/react/kit.tsx:117` (no admin-kit caller needs it).

### TV-ES1 — anonymous notices (Tovu `apps/admin/src/features/auth/`)
1. `Login.tsx:52`: add `disclosure="id-only"` to `<ErrorNotice …>`. `OwnerRecoverySignIn.tsx:26`: same.
2. `auth-i18n.ts:32`: append `"Report this error ID."` to `DETAILS_KEYS` and its translation to the end of every `DETAILS_COPY` locale array (all 20 non-English locales present there). `OwnerRecoverySignIn` takes `t` from its parent (`:13`); STOP if that parent's `t` is not built from `auth-i18n.ts`.
3. Tests first: in `__tests__/Login.unit.test.tsx` and `__tests__/OwnerRecoverySignIn.unit.test.tsx`, one case each: a failure with `errorId` shows the ID and no "Copy details". No new test file.

### E9-J-FRAME (Jini `packages/sidecar/src/json-ipc.ts`)
1. Tests first: `__tests__/audit-regressions.test.ts:8` becomes "a malformed IPC frame gets a fixed BAD_FRAME refusal and no input echo": send a frame containing a canary (`{"secret-canary`), expect `{ ok: false, error: { code: 'BAD_FRAME', message: 'The sidecar could not read the request frame. Send one line of valid JSON.' } }` and the reply not to contain the canary. `json-ipc.contract.test.ts:247` case: same expected body; keep its parse-failed trace assertions.
2. Source: at `:320–325` replace `error: jsonIpcError({ error }),` with `error: { code: "BAD_FRAME", message: "The sidecar could not read the request frame. Send one line of valid JSON." },`. Keep the trace call and the `error` binding (still used by the trace).
3. Delete `jsonIpcError` (`:114–119`) and private `errorMessage` (`:99`, its only user is `:117`); keep `errorCode` (used at `:130,:154`) and its direct tests (`index.test.ts:41` import + the `describe` at `:589`; `json-ipc.contract.test.ts:10` import + `describe("jsonIpcError")` at `:130`); drop the name from `docs/spec/api.spec.md:128`. STOP if `git grep -n -F jsonIpcError -- packages/ apps/` shows any other caller.
4. Breaks: none outside this repo (`jsonIpcError` is not in the export map per `api.spec.md:128`).

## BUGS (confirmed at merge-6)
1. **Jini `packages/sidecar/src/json-ipc.ts:323`** — malformed frame reply sends `jsonIpcError({ error })` = the `SyntaxError` text, which in current Node quotes part of the frame (`Unexpected token … "…" is not valid JSON`). Contract: fixed `BAD_FRAME` sentence, no input echo. Pinned as intended by `audit-regressions.test.ts:8`. Fix: E9-J-FRAME.
2. **Jini `json-ipc.ts:368`** — handler incident words are `"internal error"` (generic) and `:355` uses `createConsoleLogger` inside Jini (contract: never a console logger in Jini). Owner: E9-J-HANDLER (BLOCKED on size).
3. **Tovu `apps/admin/src/features/auth/Login.tsx:52`, `OwnerRecoverySignIn.tsx:26`** — anonymous screens render the full Copy details block (step, cause, app/Jini versions, time). Contract visitor row: ID only. Fix: E6a-J-NOTICE + TV-ES1.
4. **Tovu `apps/website/src/server/inbound/shared/admin-failure.ts:74`** — incident ID is `randomUUID()`, not `ERR-XXXX-…` (contract rule 3); `:77` gives the disk-space refusal an `errorId` (rule 2: no ID for a refusal). Owner: E4-T-BOUNDARY (BLOCKED).
5. Gap: Jini `scripts/check-error-gate.mjs:115` `--update` rewrites the ledger even when debt grew (doc at `:18` says "only for a shrink"). Raises debt silently. Fold a shrink-only check into the first E11 activation (design already flags it).

## NEEDS-DECISION
- **E4 route seam** — may `RouteHostContext` carry the reporter as an additive field? **Recommend: yes, but only inside E3-J-SERVER, which passes it, and in the same sheet `http-kit/src/internal-error.ts` stops minting its own UUID (one ID, rule 3) — no second, parallel sink.**
- **E4 disk-space 507** — drop the legacy `errorId` + incident for `DatabaseDiskSpaceError`? **Recommend: yes.** Its words are fixed by the class (`db/src/sqlite/backup-policy.ts:14`), it is a refusal (rule 2).
- **E9 sidecar size-first** — extract the frame and handler bodies verbatim before E9-J-HANDLER? **Recommend: yes, for the HANDLER only** (no fn50 branch touches `json-ipc.ts`); E9-J-FRAME runs now without it.
