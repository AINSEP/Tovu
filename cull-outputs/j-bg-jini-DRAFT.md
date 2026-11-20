BOOTSTRAP: dispatched job (<<PEER_DISPATCH>>). This clone has no AI-Dev-Shop folder; that is expected. This prompt is complete; proceed.
DRAFT (coordinator review before dispatch; cull 11-20, cull-bugs2).
You are a bug-fix programmer. Read <repos>/Jini/AI-Dev-Shop/agents/refactor/skills.md and <repos>/Jini/AI-Dev-Shop/skills/refactor-patterns/SKILL.md first.
REPO: your cwd = private Jini clone, branch codex/bg-jini, HEAD = Jini integ/merge-6-2026-11-19 (d3e78b387). No pushed branch is needed: jz2-a, jz2-b, rs3-jini, jb2 and the held ex-err-jini (89 files) touch none of this job's files (checked 11-20).
TASK (JINI ONLY; in this order; no sidekicks/subagents): J-401, J-EMBED, J-LOCK-OWNER EXACTLY as the OVER-ENGINEERING CULL (section at the end) defines them; the CULL wins over the design. Every sheet is a bug fix: write its test FIRST; it must fail on merge-6 (J-401: the original red is the flaky write ECONNRESET, 2 of 9 runs; record it as flaky-red), then the smallest fix.
BASES per sheet: J-401, J-EMBED, J-LOCK-OWNER all on Jini merge-6 d3e78b387. SKIP any sheet whose base is not an ancestor of HEAD and say so.
STOP rules per sheet: J-401 — the harness drains the unauthenticated body before replying, or rawRequest no longer passes explicit headers. J-EMBED — the real embed needs another host port to render its embed variant, or a production importer of mountEmbedChat appears (none on merge-6 in Jini or Tovu). J-LOCK-OWNER — a pushed successor already changes recognized-owner eviction, or the fix needs liveness-probe or partial-record recovery changes; an existing test that asserts age eviction of a FULLY IDENTIFIED foreign holder is the decided behaviour change: update it in this sheet and list it in COMMIT-PLAN.md (none found in platform/src/fs/__tests__ or agent-plugins lifecycle tests on merge-6).
COMMIT-PLAN.md: one entry per sheet: sheet ID, base, files touched, tests written, red witness (fails on merge-6), the mutation to run in cloud, BREAKS line (J-EMBED only), STOP/skip reason if any, deletions made in the final diff re-read. No debt rows change. Chrome look owed: J-EMBED (open, close, unmount). Commit per sheet; message `bg-jini: <sheet id> …`.

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

## DESIGN (Codex 6.2, r62t-bugs2) — sheets for this job only
## Common job brief

Copy this block into each job.

> Preserve behavior except for the named fix. Put the failing witness first. Apply `(required, optional = {})` to new public functions, with framework-dictated signatures exempt. Keep functions at most 50 lines and complexity at most 10. Record files over 500 lines in root `COMMIT-PLAN.md` and continue. Keep hooks injected as props, vendor code in provider packages, and server frameworks outside Jini domain code. New Jini code carries no Tovu names. Use no re-export shells, new dependencies, `eslint-disable`, `@ts-ignore`, `as any`, or `as never`.
>
> Edit only the named files and declarations. Move statements and why-comments verbatim in existing order. Add only named helpers, ports, options, tests, and mutations. Keep the diff minimal. Re-read the diff and list removed extraneous changes in `COMMIT-PLAN.md`.
>
> Stop the affected sheet for a missing declaration, an unlisted production importer, a required cast, or a function limit violation. Use `git grep -n -F '<symbol>' -- apps/ development/ packages/` for importer checks. Record unlisted test importers needing only the same repoint in `REFRESH.md`. Continue independent sheets.
>
> Keep `.git` read-only. Use no other repository-wide scans, codebase-memory-mcp, tests, builds, installs, type checks, or linters. Record base, touched files, red witnesses, cloud mutations, debt, look owed, deletions, and stop reasons in root `COMMIT-PLAN.md`. Cloud runs verification. Lockfiles, new dependencies, and new packages go to Opus Cloud.

Unlisted accounting is zero. An in-place edit retains its existing import lines. New and changed imports are identified below.

## Jini sheets

### J-401 · Jini merge-6 · 1.2k tokens

- **Test first.** In `P/daemon/src/http/__tests__/tool-execution-rpc.test.ts:366–375`, require an unauthenticated 401 and zero executor calls using the existing raw helper. Send JSON headers declaring the large body and omit the body argument. Keep the authenticated request with the actual body as the 413 control. The original flaky red is `write ECONNRESET`. Mutation moves authentication after the body read. The unauthenticated status assertion or existing deadline must fail.
- **Edit.** At `:370`, use `headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }`. The helper at `:335–349` already ends the request. Only the test changes. No import or export changes.
- **STOP** if the combined harness drains the unauthenticated request before replying or the helper no longer passes explicit headers.

### J-EMBED · Jini merge-6 · 2.4k tokens

- **Test first.** Add `P/chat/src/embed-widget/react/__tests__/embed-surfaces.test.tsx`. Use the real `ChatPane`, an open session with the existing minimal widget inputs, and `import { fakeChatSurfaces } from '../../../react/__tests__/fake-chat-surfaces.js';`. Mount into a supplied DOM element, assert the real composer and the dialog render, and verify unmount empties the element. Render the same widget via direct React under the existing provider and assert the composer renders without an added widget prop. Mutation removes the provider from the imperative mount. The real pane must fail to mount.
- **Edit.** In `P/chat/src/embed-widget/react/embed.tsx:62–65`, add required `surfaces: ChatSurfaces` to the existing first bag and render `<ChatSurfacesProvider surfaces={surfaces}><EmbedChatWidget {...widget} /></ChatSurfacesProvider>`. Add `import { ChatSurfacesProvider, type ChatSurfaces } from '../../react/surfaces.js';` and use that line in the real test too, with `../../../react/surfaces.js` as its relative path. The new test imports `import { EmbedChatWidget, mountEmbedChat } from '../embed.js';`.
- **Importer.** The only source caller found is the mocked composition test at `react/__tests__/embed.test.tsx:94`. Retain `import { EmbedChatWidget, mountEmbedChat } from '../embed.js';`, add the same `fakeChatSurfaces` import as above, and change the call to `mountEmbedChat({ element, widget, surfaces: fakeChatSurfaces() })`. The existing `./react/embed` export entry stays in place. Update the checked API signature for that entry if combine tracks declarations. **API break:** imperative callers must supply `surfaces`. Chrome owes open, close, and unmount.
- **STOP** if the real embed requires another host port to render its existing embed variant, or any production importer is discovered.

### J-LOCK-OWNER · Jini merge-6 · 2.5k tokens

- **Test first.** In `P/platform/src/fs/__tests__/file-lock.agent-plugins.test.ts:188–209`, extend U7 to cover an aged, fully parseable foreign holder in both adapters. Reuse the deterministic elapsed-time and sleep pattern from U6 at `:157–185`, with finite `staleMs`. Assert timeout, matching bytes, zero local liveness probes, and zero critical-section calls. Keep U3/U4 as the proven-dead controls and U6 as the live-local control. Mutation restores the age-only decision for an identified owner with unknown liveness. The aged foreign case must fail.
- **Edit.** In private `stale` at `P/platform/src/fs/file-lock.ts:144–146`, return false first when `unchanged(observed, current)` fails. Compute `const alive = ownerAlive(current, s);`. Return false when `current.holder !== undefined && alive !== false`. Pass `ownerAlive: alive` to the existing `isLockStale` call, keeping its other arguments. Both removal paths already call this function at `:207,266`. Age recovery continues for an unidentified record such as an empty lock.
- **Existing age witness.** In `P/platform/src/fs/__tests__/file-lock.test.ts:141–165`, use literal `"unidentified-holder"` as `holderBytes` so refreshing the mtime between inspections still exercises the age branch. Retain the inode, bytes, timeout, and read-count assertions. Change the existing description of the fixture to match. Mutation drops the unchanged check and must still fail this test. The lifecycle copy of U6 at `P/agent-plugins/src/lifecycle/__tests__/unit/exclusive-file-lock.unit.test.ts:145–164` already asserts the correct outcome. No import, export, or API row changes.
- **STOP** if a pushed successor already changes recognized-owner eviction, or the regression requires adjusting liveness probes or recovery for partial records. This sheet interprets proof of death as applying to fully identified holders.

## OVER-ENGINEERING CULL (Opus) - WINS

Verdicts for this job: J-401 KEEP · J-EMBED CUT-TO · J-LOCK-OWNER KEEP.

### J-EMBED (add to the sheet)
- Also edit `packages/chat/docs/spec/api.spec.md:268`: replace ``mountEmbedChat({element,widget}): {unmount({}):void}`` with ``mountEmbedChat({element,widget,surfaces}): {unmount({}):void}`` and add `(surfaces: ChatSurfaces, required)`. Nothing else in the spec.
- BREAKS: imperative `mountEmbedChat` callers must pass `surfaces` (no production caller in Jini or Tovu on merge-6; only `embed.test.tsx:94`).
- The bug, confirmed: `react/features/chat-pane/hooks/useChatPaneAgentControl.hooks.ts:244` calls `useChatSurfaces()`, which throws at `react/surfaces.tsx:56` without a provider; `embed.tsx:62–65` mounts none.

### J-LOCK-OWNER (clarification only)
- After the fix, the `file-lock.test.ts:141–165` fixture bytes `"unidentified-holder"` match neither the legacy `^\d+:` form nor JSON, so `ownerAlive` stays `undefined` and the age branch plus the `unchanged` term are still exercised. Replace the comment at `:141–143` with the same three-line meaning, naming an unidentified holder instead of a foreign one; no other comment edits.

### J-401
- As written. The edit is test-only.

## BUGS being fixed
1. **1271** (flaky test): `packages/daemon/src/http/__tests__/tool-execution-rpc.test.ts:369–370` writes a 1 MB body after the server has answered 401.
2. **1372**: `packages/chat/src/embed-widget/react/embed.tsx:62–65` (see J-EMBED).
3. **576**: `packages/platform/src/fs/file-lock.ts:110–111` returns undefined liveness for a foreign host; `stale` at `:144–146` then lets `isLockStale` (`:67–70`) evict on age alone.

## COMMIT-PLAN entries expected
- J-401 · merge-6 · tool-execution-rpc.test.ts only · red: flaky ECONNRESET · mutation: authenticate after reading the body (401 assertion or deadline fails).
- J-EMBED · merge-6 · embed.tsx, embed.test.tsx, new embed-surfaces.test.tsx, docs/spec/api.spec.md · red: real ChatPane throws on mount · mutation: drop the provider from the imperative mount · BREAKS line · Chrome owed.
- J-LOCK-OWNER · merge-6 · file-lock.ts, file-lock.agent-plugins.test.ts, file-lock.test.ts · red: aged foreign holder evicted · mutations: restore the age-only decision (U7 fails); drop the unchanged term (file-lock.test.ts:144 still fails).
