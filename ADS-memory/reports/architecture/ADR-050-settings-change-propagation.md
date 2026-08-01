# ADR-050: Settings Change Propagation — Remove the Value Cache, Poll the Revision Ledger, Refuse to Clobber Edits

- Status: Accepted (implemented and verified live, 2026-07-31)
- Date: 2026-07-31
- Author: Claude Opus 5 / Leona Burime
- Amends: ADR-028 §8 ("Cache, definition cache, and API") — removes the per-layer VALUE cache it
  specified; retains the definition cache.
- Relates: ADR-007 (structural workspace scoping — the change feed's disclosure rule), ADR-021
  (`authorize()` as the single evaluator), ADR-049 (the assistant kit, whose daemon is the second
  process that made this necessary), SPEC-007 (settings ledger).

## Context

Wiring the first agent-callable settings write (`settings_set_ui_preference`) exposed three defects
in a row, each hidden behind the previous one. All three were pre-existing; the tool only made them
reachable. The chain is worth recording because the shape recurs: **a correct write that produces no
visible effect looks exactly like a broken feature, and each layer blames the one below it.**

An operator asked the admin assistant, in plain language, to switch the interface from Spanish to
English. The tool call succeeded. Nothing happened.

**Defect 1 — the read tools could not see the operator's own settings.**
`features/settings/tool-registrations.ts` passed an omitted `principalId` through as `undefined`, and
`undefined` does not mean "the caller" to `getEffective` — it means *skip the user layer*. So
`settings_get_effective` reported the definition DEFAULT. The agent was told the locale was already
`en` "from the default layer — no override anywhere" while the caller's user layer held `es`,
reasoned correctly from a false reading, and concluded there was nothing to do. The equivalent HTTP
route had already been fixed (commit `292ca12`); the tool copy never received it, despite the file's
own header claiming the two were "kept behaviorally identical by inspection."

**Defect 2 — the value cache was per-process, and the daemon is a different process.**
ADR-028 §8's layer cache lived in a module-level `WeakMap<SettingsRepoPort, …>`, invalidated only by
a `set()` against that same instance, with **no TTL** — its own note recorded the assumption
explicitly: "in production there is exactly one repo instance for the process lifetime." ADR-049's
agent daemon (`assistant/agent-daemon-server.ts`) is a second OS process with its own connection to
the same SQLite file and its own cache. A tool write invalidated the daemon's; the server's kept
answering the old value across full page reloads, indefinitely.

It reproduced only when the server happened to hold that key cached — so the same tool call appeared
to work or not depending on what had been read moments earlier. **An intermittent bug is worse than a
consistent one**: it demos fine and fails in use.

`assistant/custom-instructions.ts` had already hit this exact bug and worked around it by
force-invalidating before every read, concluding in its own header that the resulting uncached read
is "cheap: one row." That fix was per-call-site, so it protected only the one place someone noticed.

**Defect 3 — a correct, fresh server value still did not reach an open tab.** `useSettingsSlice`
loaded once at mount. Nothing re-read it.

## Decision

### 1. Delete the per-layer value cache. Do not replace it.

Layer reads go straight to the repo: at most three indexed lookups per resolved key against a local
SQLite file, and the busiest consumer (the settings dialog) issues six namespace reads per page load.

Rejected: a TTL (bounded staleness is still staleness, and the correct TTL is unknowable); a
DB-backed generation counter (keeps the cache, but adds a table, a migration, and a query per read to
protect an optimization worth less than that); cross-process invalidation messages (a broker, or a
daemon→server call path with a new auth surface and a silent-staleness failure mode when a ping is
dropped).

The precondition ADR-028 §8 stated — a single-process cache — is now permanently false, and the
workaround already in the tree had independently concluded the uncached read is cheap. This
generalizes that conclusion instead of waiting to rediscover the bug at the next call site.

**The DEFINITION cache is kept.** Its writers are boot and definition-lifecycle admin routes, and
`settings_register_definitions` is permanently excluded from agent callability, so the daemon never
writes one. That is a judgement about likelihood, recorded as one — if definition writes ever become
reachable from a second process, it goes the same way.

`invalidateWorkspaceSettingsCache` is retained as a documented **no-op** rather than deleted.
`purge-service.ts` calls it as the last step of a tenant teardown, and it is where the question "can
a purged value still be read back?" gets asked. Removing the call site would remove the question; a
future cache added without restoring a purge hook is a tenant-teardown leak.

### 2. Settings changes propagate to open tabs by two independent triggers.

Both publish to one bus (`apps/admin/src/lib/settings-refresh-bus.ts`) carrying **namespace names
only, never values**, so every subscriber re-reads through the ordinary authorized
`getSettingsEffective` path. The bus cannot become a channel that hands a component a value it was
not allowed to fetch — which is what lets the publishers stay simple, since neither has to reason
about whether a payload is safe for this principal.

**Trigger A — run completion** (`components/AssistantDock.tsx`). Fires when any assistant run reaches
a terminal state, deliberately **not** on detecting a settings tool in the transcript: matching tool
names would put a list of them in the admin shell, to fall out of date the first time the catalog
grows, and the cost of refreshing unnecessarily is a few sub-millisecond reads. Ignorance is cheaper
than coupling.

**Trigger B — an SSE change feed** (`routes/admin/settings/events.ts`), covering everything trigger A
is blind to: another tab, another operator, a background job, an agent run in a different window.

### 3. The change feed polls the revision ledger.

`setting_revisions.seq` is a monotonic AUTOINCREMENT written inside the same transaction as every
value and definition change (INV-01), in storage every process shares. Polling it observes **every**
writer — this server, the daemon, anything future — with no IPC, no broker, and no coordination to
get wrong. The same process boundary that made the cache unfixable becomes the mechanism, because the
ledger is shared state by construction and an in-process cache never was.

`Last-Event-ID` doubles as the ledger cursor, so `EventSource`'s own reconnect resumes at the missed
revision rather than skipping the gap.

**Disclosure is an allowlist** (`features/settings/change-feed.ts`), not a denylist: global and
own-workspace changes are visible; another principal's user-layer change is **not**, because even a
bare namespace name would reveal that the principal exists and is active right now; an unrecognized
scope is withheld, so a scope added to `SettingScope` later is invisible until someone decides what it
should mean.

### 4. A refresh REFUSES to overwrite uncommitted work.

`useSettingsSlice.refresh()` declines whenever a debounce is pending, `hasUnsavedEdits` is set, or a
save is in flight — and re-checks after its own `await`, because `load()` is a round trip an edit can
begin during. It does not merge, and it does not surface its own failures: a background refresh the
operator never asked for must not replace a working panel with an error state.

**A missed refresh costs a second. A swallowed keystroke does not come back.** This hook had already
had two distinct data-loss bugs found in it by audit; the asymmetry is not hypothetical.

## Consequences

- Every settings read is now a real read. Correct across any number of processes, by construction
  rather than by invalidation discipline.
- `assistant/custom-instructions.ts`'s workaround is deleted; its header is rewritten to explain why
  the cache went away, so the reasoning survives the code.
- One long-lived SSE connection per authenticated admin tab, one indexed `seq > ?` lookup per second
  per connection, and no traffic at all when nothing changes.
- **A latent bug was surfaced and fixed:** `timer.current` was never nulled when the debounce fired,
  so it read as "edit pending" forever after the first keystroke. Harmless while the unmount flush
  paired it with `hasUnsavedEdits`; fatal for a guard reading it alone, which would have refused every
  refresh for the component's remaining life. Caught by test.
- Tool-call ordering in the chat transcript was fixed alongside this in Jini (`MessageRow.tsx` +
  `message-blocks.ts`) — unrelated mechanism, same session, listed here only so the trail is findable.

## Verification

Live, in one running server, with no restart and no page reload:

1. **Cache:** read → `"en"`; out-of-band row write to `"es"` (what a daemon write looks like from the
   server's side); read → `"es"`. Pre-fix the second read returned `"en"` indefinitely.
2. **Trigger A:** the agent changed the locale via chat; the settings dialog re-rendered
   Spanish→English **in place** (identical DOM refs on unchanged nodes — a re-render, not a remount).
3. **Trigger B:** a raw `sqlite3` write straight into `content.db` — no HTTP request, no run, nothing
   this server initiated — flipped the UI within ~5s. That is the multi-tab / multi-operator case.

Tests: 121 settings (incl. 10 change-feed, 3 new always-fresh cache guards), 754 assistant, 198 admin
(incl. 5 bus, 9 slice-refresh weighted to the refusal paths). Three admin test *files* fail to load on
a missing `__TOVU_ADMIN_VERSION__` define — pre-existing, confirmed by reproducing on a clean tree.

## Accepted: the emitted SSE id is a global ledger position

Decided 2026-08-01, after the settings-domain audit sweep raised it twice.

`setting_revisions.seq` is one AUTOINCREMENT shared by every workspace, so a workspace's own
revision is stamped with a global number — one write in `ws-a` after fifty in `ws-b` emits `id: 51`.
A subscriber can difference the ids of its own consecutive events and infer roughly how many
settings writes occurred platform-wide in between.

**Decision: accept and document.** What leaks is a coarse aggregate write-count. It carries no
values, no identities, and nothing attributable to a particular tenant, and it covers only
administrative settings changes.

Rejected alternatives, and why:

| Option | Why not |
|---|---|
| Per-workspace counter column | A schema change on the ledger write path that *every* writer shares — this server and the separate agent-daemon process — plus both repo adapters, `listRevisionsSince`, `maxRevisionSeq`, the resume clamp, and the contract suite. Real correctness risk in the ledger that had just had three defects fixed in it, to hide a write-count. |
| Opaque encrypted cursor | No schema change, and the HKDF facility already exists (`analytics/salt.ts`). But it makes resume depend on a key: if that key ever changes, every reconnecting tab fails to decrypt, falls back to the head, and **silently skips the writes it missed** while the feed still looks healthy. Trading a coarse metadata leak for a silent data-loss mode is a bad trade. |

**Revisit if** the ledger begins carrying higher-frequency or more attributable events than
administrative settings changes. The inference sharpens as write volume rises.

**What is not accepted**, and is now pinned by test: emitting the global ledger *head*, which
`tick`'s internal `cursor` is deliberately advanced to so it can skip other tenants' rows cheaply.
That would publish the platform-wide position on every frame — precise rather than differential, and
readable without the subscriber writing anything at all.
`src/server/__tests__/routes/settings-events-id-disclosure.test.ts` holds that line. It works only
because a neighbour writes *after* this workspace does; with any other arrangement the two numbers
coincide and the test would pass against either behaviour.

## Known follow-up, not addressed here

`SettingsUi` appears to write its loaded values back on every mount, producing ledger revisions for a
read (observed as revision pairs ~1s apart). Pre-existing and unrelated, but it makes the revision
ledger — now load-bearing for the change feed — noisier than it should be.
