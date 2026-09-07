# Refactor(Execution): AAD backfill dedupe + `@complexity` audit — 2026-09-06

Dispatched by team-lead. Source: `ADS-memory/reports/2026-09-01-to-03-review-excess-code.md` (commit `b8c321ef`).

## Item 1 — collapse six AAD backfill scripts

### Enumerated real differences (found BEFORE extracting anything)

| Script | Key shape | AAD builder(s) | Update columns | Default `--db` | Wording variant |
|---|---|---|---|---|---|
| `backfill-composio-config-aad.ts` | bare `workspaceId` | `buildComposioConfigAad({workspaceId})` | `sealed_*`, `aad_version=1` | `infra/content.db` (never exists — forces `--db`) | "with a key to migrate" |
| `backfill-connector-credential-aad.ts` | composite `(workspaceId, connectorId)` | `buildConnectorCredentialAad({workspaceId, connectorId})` | `sealed_*`, `aad_version=1` | `infra/content.db` | **"with credentials to migrate"** (differs from the other four) |
| `backfill-execution-credential-aad.ts` | composite `(workspaceId, principalId)` | `buildExecutionCredentialAad({workspaceId, principalId})` | `sealed_*`, `aad_version=1` | `infra/content.db` | "with a key to migrate" |
| `backfill-external-mcp-aad.ts` | composite `(workspaceId, serverId)` **+ two independent blobs per row** (`env`, `oauth`) | `buildExternalMcpEnvAad`/`buildExternalMcpOAuthAad`, selected by `slot` | env slot → `sealed_*`/`aad_version`; oauth slot → `oauth_sealed_*`/`oauth_aad_version`; target version is the **constant** `EXTERNAL_MCP_AAD_VERSION`, not a literal `1` | **`sites/tovu-com/content.db`** — a real, existing site db, unlike the other five's dead default | counts **"blob(s)"**, not "row(s)"; "Nothing to migrate" phrased around "sealed blob" |
| `backfill-media-provider-credential-aad.ts` | composite `(workspaceId, providerId)` | `buildMediaProviderCredentialAad({workspaceId, providerId})` | `sealed_*`, `aad_version=1` | `infra/content.db` | "with a key to migrate" |
| `backfill-site-assistant-credential-aad.ts` | bare `workspaceId` | `buildSiteAssistantCredentialAad({workspaceId})` | `sealed_*`, `aad_version=1` | `infra/content.db` | "with a key to migrate" |

**Flagged, not normalized** (per dispatch instruction — a difference that looks accidental is reported, never silently unified):

1. **`backfill-connector-credential-aad.ts` says "with credentials to migrate" / "with credentials already carries aad_version=1"** where its four `aad_version=1`-target siblings all say "with a key". This is internally consistent (both of that script's own messages use "credentials"), and its own file header calls the payload "credentials JSON" rather than "a key" — plausibly deliberate (it reseals an OAuth-style credentials JSON blob, not a bare API key), not copy-paste drift. Left exactly as-is; not fixed.
2. **`backfill-external-mcp-aad.ts` defaults `--db` to `sites/tovu-com/content.db`, a real path, while the other five default to `infra/content.db`, a path `backfill-db-path.ts`'s own header says never exists in this repo** (so those five always require an explicit `--db`, but external-mcp does not). Its usage comment also documents `--db <path>` on the dry-run line where the other five don't. This could be an intentional "point at the known site" convenience for the newest/tenth store, or an oversight that skipped the same safety posture as its siblings. **Escalating for a human/coordinator decision** — not changed. The refactor preserves this default exactly either way.
3. `external-mcp`'s two-blobs-per-row shape and its `EXTERNAL_MCP_AAD_VERSION` constant (vs. the literal `1` everywhere else) are structural, not accidental — confirmed by its own header ("the table was not in `ffb5ce44`'s five").

### Design

New shared module `development/scripts/aad-backfill-runner.ts`:
- `parseAadBackfillArgs(argv, defaultDbPath)` — identical arg parsing, default path stays a required parameter (real per-store difference, see above).
- `runAadBackfill(deps, opts, config)` — the per-unit loop (open → build aad → activeKey → seal → verify → throw-or-write → log), generalized over an `AadBackfillUnit { label, sealed, buildAad, write }` so the loop never needs to know a table's identity shape or column names.
- `runAadBackfillMain(argv, config)` — the `main()` skeleton (resolve `--db`, dry-run branch opens read-only, apply branch opens normally, skips the restore point when nothing is pending, captures one otherwise).
- **No message text is templated in the shared module.** Every operator-facing string (found/dry-run/migrated/mismatch/summary/nothing-to-migrate/done) is supplied by the calling script via an `AadBackfillMessages`/`AadBackfillMainMessages` config object, copied verbatim from that script's current source — this is what makes the wording differences above (item 1 in the flagged list) survive the refactor unchanged rather than getting silently unified.
- Each per-store script keeps its own: table import, `loadPending()` (identity shape, filter, composite key), AAD builder import(s) and `buildAad` closure, and `write()` closure (its own `WHERE`/`SET`). None of that moved into the shared module.

### Status — COMPLETE

- [x] Shared module `development/scripts/aad-backfill-runner.ts` written and unit-tested in isolation (fakes only, no DB) — `development/scripts/__tests__/aad-backfill-runner.unit.test.ts`, 4/4 passing. Proves: dry run never touches sealer/keyring, apply calls open→activeKey→seal→verify→write in order, a post-seal mismatch throws BEFORE writing, a mid-run failure leaves prior writes intact (no batching/rollback). Commit `5182994a`.
- [x] Wrote a characterization test for `backfill-external-mcp-aad.ts` BEFORE migrating it (none existed) — confirmed GREEN against the original, unmigrated script first, then again after the migration. Commit `a19708d3`.
- [x] Migrated all six scripts onto the shared helper, one commit each, running that script's own existing (or, for external-mcp, newly-added) black-box CLI test after each migration — all green:
  - `947c0fa1` backfill-composio-config-aad.ts
  - `d3161f2e` backfill-connector-credential-aad.ts
  - `3f0c9915` backfill-execution-credential-aad.ts
  - `0af0748e` backfill-media-provider-credential-aad.ts
  - `7b138c50` backfill-site-assistant-credential-aad.ts
  - `a68526dd` backfill-external-mcp-aad.ts
- [x] Scoped `eslint` run (complexity ceiling 9) across every touched file: clean, 0 errors.
- [ ] Not run: a full-repo `tsc --noEmit`/`npm run typecheck`. Six other agents are concurrently editing this shared tree; a repo-wide typecheck would mix in their in-flight state and isn't a clean signal for this change alone (`feedback_repo_wide_check_measures_the_tree`). Confidence instead comes from: every migrated script's real CLI, run as a real subprocess through `tsx` (which does execute the actual TypeScript, just without a separate type-checking pass), against real fixture SQLite databases, all green — including the corrupted-row-abort and post-seal-mismatch paths.

**Pre-existing, unrelated finding surfaced while testing (not caused by this refactor):** `backfill-execution-credential-aad.test.ts`'s second test (`--dry-run never applies a pending migration`) fails on a stale fixture constant (`NEWEST_MIGRATION_TAG = "0057_concerned_hardball"` vs. this repo's actual newest migration `0058_keen_mauler`, added by other concurrent work in this shared tree). The assertion fires inside `buildMigrationsDirMissingNewest`, before the script under test is ever invoked — confirmed this fires identically regardless of my change. Left untouched: that test file is not in my assigned file set, and updating a shared fixture constant while six other agents are landing migrations concurrently is out of scope for this dispatch.

## Item 2 — `@complexity` annotation audit, `apps/website/src/features/members/access-resolver.ts`

Checked **all 8** `@complexity` tags in the file (dispatch estimated "~15" — the file only has 8; reporting the real count rather than padding to match the estimate):

| Location | Claim | Verdict |
|---|---|---|
| `resolvePostMemberAccess` (line 42) | O(1) | Correct (no loop; single `JSON.parse`) |
| `resolveContext` (line 81) | O(1) session lookup + O(k) subscription/tier lookups | Correct — loop over `activeTierIds` (length k) with an early `break`, bounded by O(k) |
| `decide` (line 126, was) | O(t) | **Fixed → O(t·a)**, see below |
| `decidePublicAccess` (147) | O(1) | Correct |
| `decideMembersAccess` (153) | O(1) | Correct |
| `decidePaidAccess` (162) | O(1) | Correct |
| `decideTiersAccess` (176, was) | O(t) | **False — fixed → O(t·a)** (dispatch's own finding, confirmed): `requiredTierIds.some(...)` nests `context.activeTierIds.includes(...)`, t = `tierIds.length`, a = `activeTierIds.length` |
| `decideUnknownVisibilityAccess` (192) | O(1) | Correct |

`decide`'s own tag restated the same `O(t)` bound (it dispatches to `decideTiersAccess` in the worst case), so it was equally stale once `decideTiersAccess` was corrected — fixed both together, same commit.

No other false annotations found. 7 of 8 were already correct.
