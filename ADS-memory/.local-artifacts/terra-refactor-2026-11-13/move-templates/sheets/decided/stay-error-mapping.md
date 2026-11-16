# ST-error-mapping-1: STAY record + doc cleanup (replaces DL-error-mapping-1)

Owner decision 2026-11-15 (#1, Codex decide-4.md §1): KEEP `respondToApiError` in Tovu. It is Tovu's shared HTTP policy adapter: Jini already owns error construction (`createApiError`, `@jini-ai/protocol`), the default status map (`statusForError`, `@jini-ai/core/contracts/server` after C4) and envelope serialization (`sendApiError`, `@jini-ai/http-kit`); what is left is Tovu's request-tracking policy (reuse `res.locals.requestId`, omit it when absent). No Jini factory, compatibility export or wrapper is added. The fold in the old DL-error-mapping-1 sheet (plan/w1-sheets-a) is CANCELLED: do not run it.
Written 2026-11-15 from Tovu `refactor/terra` b28d38c6 / `integ/wave-b` bd984120 (both blobs below identical on both).
Kind: STAY (no move). Tier: Sonnet 5.5 (or Haiku) executor, ~10k tokens.

## Coordinator bookkeeping (not the executor: executors never touch ADS-memory)
- CLASSIFY.tsv / CLASSIFY-files.tsv: `website/server/error-mapping` -> STAY, reason "Tovu request-tracking policy over Jini error owners (owner 2026-11-15)". Drop it from the move backlog.
- `untangle/sheets/C4.repoint.tsv:243` (respond.ts `statusForError` `@jini-ai/http-kit` -> `@jini-ai/core/contracts/server`) stays as is: it is the only code change this feature needs and the wave-B pass owns it. The old sheet's `untangle_followup` (re-point row 243 to recent-hits.ts) is void.
- Risk note to carry: do not auto-apply this JSON policy to OAuth, MCP or streaming/SSE responses (INFO.md "Remaining surfaces" already says so). A second host needing configurable correlation extraction would reopen this (extend `@jini-ai/http-kit`'s response owner, not a new package).

## Executable cleanup slice (the stale text the old sheet found)
precondition: **execute after wave B merge AND after C4 row 243 landed**: `rg -n "from '@jini-ai/core/contracts/server'" apps/website/src/server/error-mapping/respond.ts` prints one line, else SKIPPED "C4 row 243 not landed". (INFO.md then describes the post-C4 owners.)
paths: TOVU_CLONE=/Users/la/Programming/tovu-codex-trial-terra. No Jini commit.

```
id: ST-error-mapping-1
feature: website/server/error-mapping
tovu_files:
  - apps/website/src/server/error-mapping/INFO.md | blob 8ba1ee0e08b9c7ecfb4bc5e8fb1b994bd052edb4
  - apps/website/src/server/error-mapping/respond.ts | NOT EDITED (blob changes with C4; read-only precondition above)
census: - (doc-only)
```

Edits to INFO.md (each OLD occurs exactly once; apply in order):
1. OLD (lines 3-5):
```
Owns Tovu's domain-to-HTTP classification policy. The generic envelope,
serializer and default status mapping already belong to Jini; call them rather
than implementing another version here.
```
NEW:
```
Owns Tovu's domain-to-HTTP classification policy. The generic envelope,
serializer and default status mapping already belong to Jini; call them rather
than implementing another version here. `respond.ts` stays in Tovu on purpose:
it applies Tovu's request-tracking policy (reuse `res.locals.requestId`, omit it
when absent) on top of those Jini owners.
```
2. OLD (lines 25-26):
```
fields inside `error`. `@jini-ai/http-kit` exports `createCompatApiError`,
`sendApiError` and `statusForError`; the installed package already supplies them.
```
NEW:
```
fields inside `error`. `respond.ts` builds the error with `createApiError`
(`@jini-ai/protocol`), maps its status with `statusForError`
(`@jini-ai/core/contracts/server`) and writes it with `sendApiError` (`@jini-ai/http-kit`).
```
3. OLD (lines 68-71):
```
async-error guard and `respond.ts` correlation. Auth/session and recovery middleware
remain separate migration surfaces. Jini source changes need their normal package
build/publication/adoption before this can run against registry artifacts; none was
performed by this edit-only dispatch.
```
NEW:
```
async-error guard and `respond.ts` correlation. Auth/session and recovery middleware
remain separate migration surfaces.
```

Checks: none (markdown only; no eslint). Commit path: `apps/website/src/server/error-mapping/INFO.md`.
tovu_msg: `docs(server): error-mapping stays Tovu's correlation policy; name the post-C4 owners` | body: "respondToApiError keeps Tovu's request-id policy over Jini's createApiError/statusForError/sendApiError; drop a stale edit-only-dispatch note."
extra_stops: INFO.md blob differs -> SKIPPED (someone edited it; the coordinator re-takes the OLD texts).
Cloud run owes: nothing (doc-only).
