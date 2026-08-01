# Terra audit — batch 3, Tovu Settings domain + assistant core (36 files)

Generated: 2026-07-31 ~21:35 local.
Auditor: **`gpt-5.6-terra`, `model_reasoning_effort=xhigh`** via `codex exec` as an external reviewer
(`--ignore-rules --ignore-user-config --ephemeral`).
Packet: `terra-audit-scope/packet-batch3-tovu.md`. Raw: `terra-audit-scope/runs/batch3-tovu.jsonl`.

Run health: errors=0, **turn.failed=0**, turn.completed=1, stderr empty.
Usage: 3,387,408 input (3,095,552 cached), 18,453 output, 12,416 reasoning.

> **Checklist correction.** An earlier check of this run reported `turn.failed=2`. That was a false
> alarm caused by MY grep pattern, not by the run: `grep -c 'turn.failed'` treats `.` as a regex
> wildcard, and it matched the literal words "turn failed" twice in Terra's own output. There is no
> `"type":"turn.failed"` event in this file — verified with `grep -cF`. **Use `grep -cF
> '"type":"turn.failed"'`**, not the unescaped pattern. The other three batches were unaffected
> (they returned 0 under both patterns).

Scope: the Settings domain end-to-end plus the assistant/daemon core. About a third of these files
were **new or heavily modified in the working tree and had never been reviewed by anyone** — the
agent-callable write tool, the SSE change feed, and the value-cache removal.

> **UNVERIFIED.** Terra's claims, reproduced verbatim. Batch 1's verification pass killed two of six
> HIGH findings. Verify before fixing — and note this batch audits UNCOMMITTED code, so re-check
> each finding against the file as it stands when the fix is written.

## Coordinator notes

1. **The headline is CRITICAL and it is NOT in the new code.** `write-service.ts:264` splits
   `authWorkspaceId` (used to authorize) from `workspaceId` (used to write). That is a pre-existing
   cross-tenant write path on the generic settings setter, not something the agent-tool work
   introduced. It is the single most serious finding across all four batches. Verify first — but if
   it holds, it outranks everything else queued.

2. **The agent-writable tool's four claimed bounds were PROVED, not refuted.** The packet
   deliberately told Terra to assume the JSON Schema `enum` was bypassed and attack the bounds
   structurally. It reports: key allowlisted before authorization; scope hardcoded `"user"`; no
   input-supplied principal or workspace reaches the write; permission derives as
   `settings.user.self.write`; ledger actor is the authenticated human. That is an independent
   external confirmation of the design argument in
   `20260731-agent-writable-settings-foundation.md`. Note the irony: the *narrow* new tool held,
   while the *generic* setter it was carefully kept separate from is where the CRITICAL lives.

3. **Two MORE data-loss bugs in `use-settings-slice.hooks.ts`.** The packet noted two had already
   been found there by audit and asked Terra to look for a third. It found two more (both HIGH,
   lines 245 and 173), and both are interleavings the existing guard was never designed to catch —
   a save that *completes during* the refresh await, and an unmount flush that captures its diff
   base too early. This hook is now 4-for-4 on audits finding data loss in it. Treat it as
   structurally suspect rather than patching a fifth time.

4. **The SSE `Last-Event-ID` disclosure is subtler than the packet anticipated.** The payload
   allowlist works — no value leaks. But the *event id* is the global ledger `seq`, so gaps in it
   count hidden writes from other principals and workspaces. The disclosure channel was the cursor,
   not the payload.

---

**[SEVERITY: CRITICAL] Generic settings writes authorize one workspace and modify another**
- **File:** `src/features/settings/write-service.ts:264`
- **What is wrong:** `authWorkspaceId` is used for authorization, while the independently supplied `workspaceId` is used for definition lookup, revision append, and value writes. The service never requires them to match.
- **Failure scenario:** A principal with `settings.workspace.write` in workspace A sends the normal settings set request with `workspaceId: "B"` and `scope: "workspace"`. Authorization succeeds for A, then the service writes the workspace-B row and revision. Clear and reset have the same split, allowing cross-tenant modification.
- **Fix:** Enforce in the write service that every non-global target `workspaceId` equals `authWorkspaceId` before authorization or mutation; reject body-supplied workspace IDs in the HTTP routes and always use the route-scoped workspace.

**[SEVERITY: HIGH] SSE event IDs reveal hidden revision activity**
- **File:** `src/server/routes/admin/settings/events.ts:135`
- **What is wrong:** The feed advances and emits the global revision `seq` even for revisions filtered as invisible. `Last-Event-ID` therefore exposes gaps caused by other workspaces’ or other principals’ writes.
- **Failure scenario:** A subscriber last saw ID 100. Ninety-nine hidden user-layer or other-workspace revisions occur, then one visible revision is seq 200. The stream emits `id: 200`, revealing 99 otherwise hidden writes.
- **Fix:** Do not expose the global ledger sequence as the SSE ID. Use an opaque, authenticated resume token or a viewer-scoped cursor/sequence that contains no hidden-revision count.

**[SEVERITY: HIGH] Any settings reader can multiply unbounded SQLite polling and history scans**
- **File:** `src/server/routes/admin/settings/events.ts:149`
- **What is wrong:** There is no concurrent-stream limit, and callers may set `Last-Event-ID: 0` to make every stream scan historical revisions before settling into a one-second polling loop. `setInterval` can also overlap polls when a tick takes longer than the interval.
- **Failure scenario:** A low-privileged authenticated principal opens hundreds of SSE connections with `Last-Event-ID: 0`. Each connection repeatedly queries SQLite and drains the full revision ledger in 200-row pages, exhausting the shared database.
- **Fix:** Cap active streams per principal/workspace, bound resumable history, and replace `setInterval` with a self-scheduling loop that starts the next poll only after the prior one completes.

**[SEVERITY: HIGH] A delayed refresh can overwrite an edit that completed during the load**
- **File:** `apps/admin/src/hooks/use-settings-slice.hooks.ts:245`
- **What is wrong:** `refresh()` rechecks only pending/unsaved state after `load()`. An edit can be saved successfully during that await, clearing both guards, after which the stale load result overwrites the newly saved value.
- **Failure scenario:** Refresh starts loading value A. The operator changes it to B; the debounce saves B and clears `hasUnsavedEdits`. The original load of A returns, passes the post-await guard, and replaces the UI and `persisted` state with A.
- **Fix:** Increment an edit generation on every `onChange`, capture it before `load()`, and apply the loaded value only if the generation is unchanged. Also serialize or version concurrent refreshes.

**[SEVERITY: HIGH] Unmount flush compares the final edit against a stale base**
- **File:** `apps/admin/src/hooks/use-settings-slice.hooks.ts:173`
- **What is wrong:** The unmount cleanup captures `persisted.current` before prior queued saves complete. Unlike the normal debounce path, it does not obtain the diff base when its queued save actually runs.
- **Failure scenario:** Persisted value is `light`; a save of `dark` is in flight. The operator changes back to `light` and navigates away. Cleanup captures base `light`, queues after the `dark` save, then finds no diff and sends nothing; durable value remains `dark`.
- **Fix:** Queue a closure that reads both `latest.current` and `persisted.current` at execution time, using the same save/update logic as the normal debounce path.

**[SEVERITY: MEDIUM] A revoked principal retains an already-open settings stream**
- **File:** `src/server/routes/admin/settings/events.ts:129`
- **What is wrong:** Authorization is checked only when the stream opens. Subsequent polls neither revalidate the session nor re-run workspace authorization.
- **Failure scenario:** A principal opens the feed, then is disabled or loses `settings.read`. The connection remains open and continues receiving future namespace notifications that a new request would be denied.
- **Fix:** Revalidate the session and `settings.read` grant on each poll or at a short bounded interval; close the stream immediately on failure.

**[SEVERITY: MEDIUM] Definition cache is indefinitely stale across the server/daemon process boundary**
- **File:** `src/features/settings/settings.ts:291`
- **What is wrong:** Definition cache invalidation is process-local. A definition lifecycle write in the main server does not invalidate the daemon’s `WeakMap` cache, so the daemon can keep a tombstoned or retyped definition indefinitely.
- **Failure scenario:** The daemon caches `core.instructions.custom`; an administrator tombstones it through the server. The daemon continues resolving the cached definition and can keep reading/injecting the stored value despite the tombstone.
- **Fix:** Remove the cross-process definition cache or make it revision/epoch-backed in SQLite and revalidate it across processes.

**[SEVERITY: MEDIUM] Namespace reset is partially applied on a later failure**
- **File:** `src/features/settings/write-service.ts:479`
- **What is wrong:** `resetNamespace()` clears keys one at a time, each in its own transaction. It has no enclosing transaction for the reset operation.
- **Failure scenario:** Resetting three keys clears the first; SQLite then errors or a concurrent definition change makes the second clear fail. The API returns an error while the namespace is left partially reset.
- **Fix:** Resolve and clear the complete namespace inside one transaction, appending all corresponding revisions in that same transaction.

**[SEVERITY: MEDIUM] Removing value caching turns each analytics configuration read into multiple SQLite reads**
- **File:** `src/analytics/config.settings.ts:170`
- **What is wrong:** Analytics loads six settings independently. With no workspace overrides, each now performs a workspace lookup plus a global lookup, producing twelve SQLite value queries per configuration read.
- **Failure scenario:** Public analytics ingestion repeatedly requests configuration for a workspace with default settings, causing twelve database reads per beacon rather than a bounded batch read.
- **Fix:** Add a repository batch read for the six setting IDs and resolve precedence in one settings-level operation, without restoring a process-local value cache.

## Assessed and found clean

- **1. Agent-callable write bounds:** proved. The key is structurally allowlisted before readiness/authorization; scope is hardcoded to `"user"`; no input-supplied principal or workspace reaches the write call and permission derives as `settings.user.self.write`; the ledger actor is `ctx.principal.id`, the authenticated human operator.
- **2. SSE baseline controls:** initial authentication/workspace authorization, default-deny handling of unknown value scopes, parameterized cursor query, and value-free payloads are sound. The global-cursor disclosure and post-connect authorization gap are reported above.
- **3. SSE teardown/query bounds:** disconnect handlers clear timers, and each ledger query is ordered, indexed by `seq`, and limited. Connection/history bounds are not sound as reported above.
- **4. Value-cache removal/purge:** reads now reach the repository, so the retained no-op purge invalidator cannot return purged value rows. Definition-cache cross-process correctness and analytics read amplification are reported above.
- **5. Repository value isolation and single-write atomicity:** layer predicates, precedence, and individual value-plus-revision transactions are sound. Cross-tenant authorization/target mismatch and reset atomicity are reported above.
- **6. Daemon surface:** bearer tokens are random and timing-safe compared; direct routes are bearer-gated, delegated calls are tied to active runs, and proxied tool contexts retain the authenticated workspace/principal.
- **7. Refresh guard baseline:** it correctly refuses while a debounce is pending or edits remain unsaved. Its completed-save and unmount interleavings are not sound as reported above.