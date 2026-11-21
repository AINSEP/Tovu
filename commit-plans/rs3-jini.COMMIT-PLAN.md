# rs3-jini commit plan

All four base commits are ancestors of HEAD c6a3d5a2eb46cc665918b9112cbfdf44c70ad338 on codex/rs3-jini. No tests, builds, installs, type checks, linters, or mutations were run; verification belongs to cloud. Commits are deferred because the dispatch makes .git read-only. Each sheet below is a separate planned commit, including its COMMIT-PLAN.md entry.

## J02 — DONE (edits; cloud verification pending)

- Base: jy-core 949c622a1 (ancestor confirmed).
- Commit: `rs3-jini: J02 observe exhausted-budget close rejection`.
- Files touched: `packages/diagnostics/src/web-evidence/page-work-budget.ts`, `COMMIT-PLAN.md`.
- Tests written: none. Existing witness read before editing: `packages/diagnostics/src/web-evidence/__tests__/page-work-budget.test.ts:74–91`.
- Cloud mutations: restore `void closing.catch(() => {})` to exercise the catch gate; remove `observed({ promise: closing });` to expose the late unhandled rejection in the existing witness.
- Ledger key: `(packages/diagnostics/src/web-evidence/page-work-budget.ts, catch-reads-error)`; expected shrink −1 (O333), not measured locally.
- Stop/skip: none. `close()` still runs before the branch; the exhausted path returns without waiting; the live-budget wait and all six listed importers stay in place.
- Final diff re-read: only the named import and observation replacement; no extraneous edits deleted. Required deletion: `void closing.catch(() => {});` replaced by `observed({ promise: closing });`.

## J04 — DONE (edits; cloud verification pending)

- Base: jy-core 949c622a1 (ancestor confirmed).
- Commit: `rs3-jini: J04 name config queue settlement and path fallback`.
- Files touched: `packages/mcp/src/core/config.ts`, `COMMIT-PLAN.md`.
- Tests written: none. Existing witnesses read before editing: `packages/mcp/src/core/__tests__/config.test.ts:160–203` (file is 542 lines; unchanged).
- Cloud mutations: restore `prev.catch(() => {})` in the task chain; restore the original realpath `try`/`catch` to exercise the catch gate. Use the existing writer-failure and serialization witnesses.
- Ledger key: `(packages/mcp/src/core/config.ts, catch-reads-error)`; expected shrink −2 (O363), not measured locally.
- Stop/skip: none. The queue still stores and returns the write task, propagating its error. `packages/mcp/src/index.ts:15`, every listed importer, root export tests, API baseline, and public docs are untouched, per the cull. No API removal.
- Final diff re-read: only the named import and two replacements; no extraneous edits deleted. Required deletions: anonymous previous-write catch and the original realpath `try`/`catch`, replaced by the named idioms with lexical fallback retained.

## J-06 — DONE (edits; cloud verification pending)

- Base: jy-pb 42031785d (ancestor confirmed).
- Commit: `rs3-jini: J-06 statically import the prompt file stream reader`.
- Files touched: `packages/cli/src/prompt.ts`, `COMMIT-PLAN.md`.
- Tests written: none. Existing witnesses read before editing: `packages/cli/src/__tests__/prompt-read-file-settled.test.ts:43,52`; hoisted `node:fs` mock at line 16 unchanged.
- Cloud verification: run those existing settled-guard cases and the combine build; removing the static binding must fail the build. No mutation plant requested.
- Ledger key: not applicable; expected shrink 0 (no debt change).
- Stop/skip: none. `defaultReadFile` has only its declaration and local executable reference; no public baseline entry found. Allowed historical row `packages/daemon/docs/call-shape-sweep.tsv:16753` stays unedited.
- Final diff re-read: only the named static import and dynamic-binding deletion; no extraneous edits deleted. Required deletion: `const { createReadStream } = await import('node:fs');`.

## AG0-J — DONE (edits; cloud verification pending)

- Base: jb1 6da21feaf (ancestor confirmed).
- Commit: `rs3-jini: AG0-J cover missing text and null tool result content`.
- Files touched: `packages/chat/src/core/run-events/__tests__/payload.test.ts`, `COMMIT-PLAN.md`.
- Tests written: two cases using the existing wrapper and imports: missing `text_delta.delta` produces `{ kind: "text", text: "" }`; null tool-result content with `isError: 1` produces empty content and `isError: true` for `toolUseId: "t1"`. Static test declaration count: 25 → 27; none executed. No production edits or casts.
- Cloud mutations: emit `"undefined"` for the missing text delta; emit `"null"` for null tool-result content. Each new assertion must fail its mutation.
- Ledger key: not applicable; expected shrink 0 (test-only).
- Stop/skip: none. Source inspection confirms the existing null-to-empty conversion and Boolean error conversion. `RunAgentPayload` has its existing index signature. Inspected production file `packages/chat/src/core/run-events/entry.ts` is 699 lines; unchanged.
- Final diff re-read: only the two named cases; no extraneous edits or existing tests deleted.

No REFRESH.md entries: no importer repoints. M5-J is dropped; J03, J05, and J06 remain retired; ACP-8 remains held.
