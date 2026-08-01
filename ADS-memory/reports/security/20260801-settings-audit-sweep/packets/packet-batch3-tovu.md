You are performing a rigorous code audit as an external reviewer. Answer directly; do not perform any startup ceremony.

DO NOT READ `AGENTS.md`, `CLAUDE.md`, `CONTEXT.md`, or any `AI-Dev-Shop/` or `ADS-memory/` file. They are irrelevant and expensive. If you open one by reflex, stop and move on.

## Repo
`/Users/la/Programming/Tovu` — a TypeScript CMS whose React admin app (`apps/admin/`) embeds an AI assistant. Branch `feat/ai-chat-persistence`. Node server + Drizzle/SQLite. The SQLite file (`content.db`) is **multi-tenant by design** — one file holds several workspaces.

## What you are auditing and why

This is the THIRD batch. Batch 1 covered chat persistence; batch 2 covered the admin section components, the admin API client, and the assistant execution routes. **This batch is the Settings domain end-to-end, plus the assistant/daemon core that now writes to it.**

Roughly a third of these files are **brand new or heavily modified in the working tree and have never been reviewed by anyone**. They implement three things that are new to this codebase and are the reason this batch exists:

1. **The first agent-callable settings WRITE.** `settings_set_ui_preference` lets the embedded AI assistant change a UI preference. Every other settings write tool (`settings_set`, `settings_clear`, `settings_reset`, `settings_register_definitions`) remains deliberately excluded from agent callability. The new tool is supposed to be safe *structurally*, not behaviourally, via four claimed bounds:
   - target key is a closed enum (`agent-writable-preferences.ts`), refused before any `authorize()` call;
   - scope is the hardcoded constant `"user"` and is not an input;
   - the target principal is never named — the write service falls back to the caller's own principal, so the derived permission should be the narrowest write grant in the system;
   - the revision ledger records the HUMAN operator's principal id as actor.
2. **A server→browser settings change feed over SSE** (`change-feed.ts`, `routes/admin/settings/events.ts`, `lib/settings-events.ts`, `lib/settings-refresh-bus.ts`). It **polls the revision ledger** (`setting_revisions.seq`, a monotonic autoincrement) rather than using an in-process emitter, because the writer may be a different OS process. `Last-Event-ID` doubles as the ledger cursor. Disclosure is meant to be an allowlist: global and own-workspace changes are visible; another principal's user-layer change is NOT (it would reveal that principal exists and is active); an unrecognized scope is withheld rather than passed through. The bus is meant to carry **namespace names only, never values**, so a subscriber always re-reads through the normal authorized path.
3. **The settings value cache was REMOVED outright** (`settings.ts`), because it was a per-process module-level `WeakMap` with no TTL and the agent daemon is a separate OS process — a daemon write invalidated one cache and left the other stale. `invalidateWorkspaceSettingsCache` is retained as a deliberate no-op. The **definition** cache was deliberately KEPT.

Assume all three are wrong until you have proven otherwise by reading the actual code path.

Read each file in full:

```
src/features/settings/agent-writable-preferences.ts
src/features/settings/agent-tools.ts
src/features/settings/tool-registrations.ts
src/features/settings/change-feed.ts
src/features/settings/settings.ts
src/features/settings/write-service.ts
src/features/settings/repo.sqlite.ts
src/features/settings/repo.memory.ts
src/features/settings/ports.ts
src/features/settings/types.ts
src/features/settings/ui-tab-definitions.ts
src/features/settings/ensure-definitions.ts
src/server/routes/admin/settings/events.ts
src/server/modules/settings.ts
src/server/app.ts
src/server/deps.ts
src/server/routes/types.ts
src/index.ts
src/assistant/agent-daemon-server.ts
src/assistant/custom-instructions.ts
src/assistant/execution-mode-settings.ts
src/analytics/config.settings.ts
apps/admin/src/App.tsx
apps/admin/src/components/AssistantDock.tsx
apps/admin/src/lib/settings-refresh-bus.ts
apps/admin/src/lib/settings-events.ts
apps/admin/src/lib/settings-tabs.ts
apps/admin/src/lib/ledger-slice.ts
apps/admin/src/lib/assistant-chats.ts
apps/admin/src/lib/app-version.ts
apps/admin/src/hooks/use-settings-slice.hooks.ts
apps/admin/src/hooks/use-assistant-chats.hooks.ts
apps/admin/src/hooks/assistant-chats-port.hooks.ts
apps/admin/src/hooks/assistant-chats-dependencies.hooks.ts
apps/admin/src/sections/SettingsUi.tsx
apps/admin/vite.config.ts
```

Read surrounding/imported files freely to judge correctness — especially `src/server/routes/admin/settings/*` (the HTTP siblings of the tool handlers) and the authorization layer the write service calls into. FINDINGS must be about the files above.

## What matters most, in priority order

1. **Can the agent-callable write escape its four claimed bounds?** This is the highest-severity area in the batch and the reason it is being audited. Trace `agent-tools.ts` → `tool-registrations.ts` → `write-service.ts` and prove or refute each bound *independently of schema enforcement* — assume the JSON Schema `enum` is bypassed, because the claim is that the bounds are structural. Specifically: can a caller-supplied `principalId`, `scope`, `workspaceId`, `key`, or nested/prototype-polluting input reach the write service and target another principal's layer, the workspace layer, or an unlisted key? Does the key check genuinely run **before** `authorize()`, or can an unlisted key be used to probe which grants the caller holds? Does the derived permission actually come out as the narrowest self-write grant on every path, including error and retry paths? Is the recorded actor really the human operator and not the agent?

2. **Does the SSE change feed disclose anything the caller could not otherwise read?** Trace `events.ts` and `change-feed.ts`. Verify: authentication and workspace-scoped authorization are enforced on the SSE route *before* the first event and re-checked as appropriate for a long-lived connection; another principal's user-layer revision cannot be inferred (including by *timing*, sequence-number gaps, or event counts, not only by payload); an unrecognized or newly-added scope is withheld by default rather than passed through; and no setting **value** ever reaches the wire. Also check the `Last-Event-ID` cursor: a client-supplied cursor is untrusted input reaching a SQL query — check for injection, for a cursor that replays another workspace's revisions, and for one that causes an unbounded scan.

3. **Resource exhaustion and lifecycle on the SSE route.** It is a long-lived polling endpoint. Check: is there a cap on concurrent connections per principal; is the poll interval bounded; is the DB query indexed and bounded (`LIMIT`); is the poll timer cleared on client disconnect/abort, or does a disconnected client leave a timer polling SQLite forever; what happens on a DB error mid-stream. An unauthenticated or trivially-openable endpoint that spawns a per-connection SQLite poll loop is a denial-of-service finding.

4. **Did removing the value cache introduce a correctness or performance regression?** Verify no remaining code path assumes a cached read, that `invalidateWorkspaceSettingsCache`'s no-op cannot silently defeat a *purge* (i.e. a purged value being readable afterwards), and that the retained **definition** cache is genuinely safe from cross-process staleness given who can write definitions. Also check for a read amplification the removal introduced on a hot path.

5. **Multi-tenant scoping in the settings repositories.** `repo.sqlite.ts` and `write-service.ts` are the core. Audit every query for a missing or bypassable workspace/principal predicate, for layer-resolution order bugs (a user-layer row shadowing or failing to shadow the workspace default incorrectly), and for non-atomic read-modify-write sequences. Check transaction boundaries: partial writes, missing rollback, and whether the revision-ledger append and the value write are atomic with respect to each other — the feed's correctness depends on it.

6. **Authorization on the daemon surface.** `agent-daemon-server.ts` is a real HTTP server. Verify every route enforces authentication AND workspace-scoped authorization before doing work — do not assume shared middleware covers it; trace it. Check how its token is generated, compared (timing-safe?), and scoped.

7. **The refresh-vs-unsaved-edits guard.** `use-settings-slice.hooks.ts`'s `refresh()` is supposed to REFUSE while the operator has a pending debounce, unsaved edits, or a save in flight, and to re-check *after its own await* since `load()` is a round trip an edit can start during. This hook has already had two data-loss bugs found by audit. Look hard for a third: any interleaving of keystroke, debounce fire, save, refresh, and unmount that loses a keystroke or writes a stale value over a newer one.

## Caveats that will otherwise waste your time
- The working tree has substantial UNCOMMITTED modifications, including most of the files above. **Audit what is on disk.** Do not report the uncommitted state itself as a defect, and do not report "this is not committed" or "this lacks a migration" as findings.
- Do NOT report missing/incomplete CSS or visual styling — separately tracked and not your finding to make.
- Do NOT report that a settings control saves a value nothing consumes — that is a known, separately-documented gap. Report it only if the listed files contain a distinct, concrete defect.
- Several files carry long explanatory header comments recording prior decisions. They are evidence of intent, not proof of correctness — verify the code matches the comment, and **report it as a finding when it does not**.
- Do not report: formatting, naming, "add a comment", "extract a helper", test-coverage gaps as such, or anything you cannot tie to a concrete failure.

## Output format — strict

Return ONLY findings, most severe first. For each:

**[SEVERITY: CRITICAL | HIGH | MEDIUM | LOW] Short title**
- **File:** `path:line`
- **What is wrong:** one or two sentences.
- **Failure scenario:** concrete inputs or event sequence → the actual bad outcome. If you cannot write this, do not report the finding.
- **Fix:** the specific change.

End with `## Assessed and found clean` listing which of the seven priority areas you checked and believe are sound, so absence of a finding is distinguishable from not having looked. For area 1 specifically, state each of the four claimed bounds and whether you proved or refuted it.

Do not pad. A short correct report beats a long speculative one. Do not report anything you have not verified by reading the actual code path.
