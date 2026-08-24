# development/todos.md — verified survey (2026-08-24)

Produced by an Opus 5 subagent (`todo-survey`), dispatched read-only. Every shortlisted item was
required to cite `file:line` from real source, because the file's own header warns:
"Verify every backlog claim against current source before treating it as open."

**Coverage claimed:** all 1356 lines. One soft spot disclosed by the agent itself — lines 520-539
were seen only through a truncated output preview, not a clean read.

**Independently re-verified by the coordinator before relaying** (subagent reports are claims, not
results): item #1 and stale-finding S1 below. Both confirmed. The rest carries the agent's citations
but was NOT re-checked — treat as high-confidence-unverified.

## Can start immediately (no owner decision)

1. **Analytics screen tells users a lie** — XS · BUG · VERIFIED (re-verified by coordinator)
   Copy says hits are "currently sitting in memory". On a real install they are durable on disk.
   - `apps/admin/src/features/analytics/Analytics.tsx:40` — the false copy
   - `src/server/deps.ts:766` — binds `SqliteBufferSink`, whose own comment says "durable — survives
     a restart, closing the `LocalBufferSink.capabilities().durable` misreport"
   - `src/server/app.ts:520` — `LocalBufferSink` only on the in-memory path (`TOVU_DB=memory`)
   One sentence. Makes the product sound worse than it is.

2. **A permission can be added to a policy but never removed** — M · BUG · VERIFIED (agent)
   Only escape is delete + recreate, and delete is blocked while anything uses the policy.
   - `apps/admin/src/features/roles/Roles.tsx:26-28` — states it plainly
   - `src/server/routes/admin/users/write-policy-permission.ts:50` — the ADD route
   - 11 role/policy routes exist; none removes a permission

3. **A diverged database never warns anyone** — M · BUG (safety) · VERIFIED (agent)
   Detection is built; nothing surfaces it.
   - `src/db/drift.ts:47` — `getDriftStatus` returns `"diverged"`
   - `apps/admin/src/features/database/Database.tsx:24` — drift banner + PENDING_MIGRATION boot
     banner "have no route yet"
   - `src/server/routes/admin/database/` — migrate-forward, restore-points, timeline only

4. **Media Images/Videos tabs are dead ends** — M · FEATURE · VERIFIED (agent)
   Root cause is data, not UI: content-type is accepted then discarded at upload.
   - `apps/admin/src/features/media/Media.tsx:582-596` — the placeholder
   - `src/server/routes/admin/media/upload.ts:29` — accepts contentType, throws it away
   - `src/db/schema.ts:1172-1179` — `asset_blobs` has no content-type column
   Needs a column + migration + backfill.

5. **Correct the backlog itself** — S · CLEANUP · VERIFIED (agent)
   Seven provably-wrong entries (S1-S7 below).

6. **Taxonomy cannot reparent / deprecate / slug a term** — L · FEATURE · VERIFIED (agent)
   `apps/admin/src/features/taxonomy/Taxonomy.tsx:42-48`. Three separate gaps in one entry; split
   before starting.

7. **Article text sits left-of-center on `basic`** — XS · BUG · **UNVERIFIED (visually)**
   - `src/themes/static/basic/css/theme.css:285` — `.post-detail` centered at 720px
   - `src/themes/static/basic/css/theme.css:289` — `.post-detail-body` caps at 66ch, NO auto margins
   Agent reasoned from CSS only and never rendered the page. Eyeball `/welcome` before touching it;
   may be intentional.

## Needs an owner decision first

8. **Newsletter admin screens** — L · FEATURE · BLOCKED
   The file contradicts itself: line 213 says build them; line 851 says "intentionally parked per
   explicit owner request (not a gap — deferred indefinitely by choice)".
   `apps/admin/src/features/newsletter/` does not exist. Backend is real (ADR-034).

Also decision-gated: the Security/credential-inventory page (8 sealed stores, nothing lists them).

## Demonstrably stale — backlog says open, source says otherwise

- **S1 (re-verified by coordinator): AW-1 and AW-4 are unreachable.** Both target
  `themes/tovu-official/styles.css`. That path does not exist. The theme is archived at
  `src/theme-archive/tovu-official/`, and `src/server/seed.ts`'s own comment confirms that directory
  is one "which discovery never scans". `column` and `dispatch` are archived alongside it. AW-2's
  mobile-overflow finding is stale for the same reason. **These are not fixable bugs; they are dead
  entries.**
- **S2:** line 803 "Comments backend NOT built yet" — false. `src/comments/` has 17 files including
  `repo.sqlite.ts`, `write-service.ts`, `spam.heuristic.ts`. Contradicts line 210 of the same file.
- **S3:** line 709 "no MCP code exists in src/" — false. `src/assistant/` has 20+ MCP files plus an
  `mcp-federation/` subsystem.
- **S4:** line 728 "no eslint/prettier config", line 730 "no .github/workflows/", lines 599+1066 "no
  dependency-cruiser" — all three exist at repo root (`eslint.config.mjs`, `.github/workflows/ci.yml`,
  `.dependency-cruiser.cjs`).
- **S5:** Backups/Recovery row "interrupted-migration unblock route still open" — false. Restore IS
  the unblock ceremony (`src/features/recovery/gated-hooks.ts:42-46`, `:127-134`).
- **S6:** line 706 "ADR-013 names AG-UI; no implementation yet" — superseded twice (ADR-049, then
  ADR-059, marked RESOLVED at the top of this same file, which flags the staleness at lines 81-84
  and then never fixes it).
- **S7:** lines 587-589 "Agentic UI/AI layer almost entirely unbuilt — only a stub FAB" — badly out
  of date. AssistantDock, the daemon, BYOK, MCP federation and a tool registry all ship.

## Agent's own recommendation

#1 today, then #5 while the evidence is fresh, then #3 — "a silently-diverged database is the only
item here that can lose someone's data."
