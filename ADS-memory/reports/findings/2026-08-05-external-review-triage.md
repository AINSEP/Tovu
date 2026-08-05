# External code-review triage — 2026-08-05

Verification of eight findings raised by an external AI reviewer across Tovu and Jini. Every
finding below was checked against source; five were fixed in this session, three are deferred
because the fix is a design decision rather than a patch.

Source reports (written by the reviewer, not by this session):

- `Tovu/ADS-memory/reports/audits/2026-08-01-saturday-admin-settings-code-review.md`
- `Jini/ADS-memory/reports/audits/2026-08-01-saturday-code-security-review.md`
- `Jini/ADS-memory/reports/audits/2026-08-02-03-sunday-monday-code-security-review.md`

## Verdict summary

| # | Finding | Verdict | Status |
|---|---|---|---|
| 1 | DNS rebinding / redirect bypass of the SSRF preflight | Partly right, mis-located | Redirect half fixed |
| 2 | Provider clears undone by concurrent reload | Confirmed, worse than reported | **Deferred** |
| 3 | Asset resurrection via overlapping live-update flushes | Confirmed | **Deferred** |
| 4 | Composio file lock fails on a normal release race | Confirmed by repro | Fixed |
| 5 | Dashboard page rows link to the post editor | Confirmed | **Deferred** |
| 6 | Lightbox preview fallback state carried across assets | Confirmed | Fixed |
| 7 | MCP-UI form: Enter re-submits while a call is in flight | Confirmed | Fixed |
| 8 | Partial undo/redo/restore leaves unrecoverable writes | Confirmed | Fixed |

## Fixed in this session

**#1 (partial) — redirect following.** The reviewer cited `connection-guard.ts:198` and claimed both
rebinding and redirects. `model-catalog.ts` already sets `redirect: 'error'`; the exposed caller was
`openai-chat.ts#runOpenAiCompatibleRequest` (shared by openai-chat, azure-chat, ollama-chat), which
used the default `redirect: 'follow'`. Added `redirect: 'error'` there.

The **rebinding** half is real and NOT fixed: `validateBaseUrlResolved` resolves the hostname, then
`fetch` resolves it again independently. No preflight check can close that — it needs an IP-pinning
dispatcher. Severity is lower than the reported High: `baseUrl` is operator-configured BYOK
provider config, so the guard is defence-in-depth, not the primary trust boundary.

**#4 — file lock.** `file-lock.ts:39` stat'd the lock path inside the EEXIST branch and discarded
the result — vestigial code from an age-based eviction that had already been removed. If the owner
released between the failed `openSync` and that stat, the ENOENT escaped `withExclusiveFileLock`
instead of retrying. Removed. One pre-existing test asserted the removed line's EACCES pass-through
and was dropped with it; the scenario is unreachable in reality (if `openSync` can see the file well
enough to report EEXIST, `statSync` on the same path will not return EACCES) and a real permissions
failure still surfaces through `openSync`, which the same test already covers.

**#6 — lightbox.** `useMediaPreview`'s `stage` is component state with no reset-on-`item`, and the
lightbox is one shared instance at a fixed tree position. Added `key={item.id}`.

**#7 — MCP-UI form.** `setBusy` disables only `[data-mcpui-action]` buttons; the Enter handler is
bound to controls that stay enabled on purpose. Added a shared `pending` flag covering submit and
cancel, cleared on failure only (the success path tears the surface down).

**#8 — history.** `undo`/`redo` popped before replaying and `restore` pushed after, so a mid-replay
throw stranded the entry in neither stack. Switched to peek-then-move for undo/redo and
record-before-replay for restore. This is the same principle decision 3 in that module's own doc
already states for `transaction` — the three replay paths simply did not follow it.

## Deferred — need a decision, not a patch

### #2 — Provider clears undone by a reload

`Jini/packages/ui/src/features/media-providers/react/hooks/useMediaProvidersTab.ts:292`

Confirmed, and it does not need a concurrent save at all: **`reload()` alone resurrects a cleared
provider.** Two reinforcing causes:

- `clearProvider` deliberately does not add the id to `pendingProviderIds` (it is documented as a
  decisive action, not a pending edit), so the id is absent from `preserveLocalProviderIds`.
- `mergeDaemonProviders` (`rules.ts:105`) writes back `{...daemonEntry}` for every daemon-present
  id unless preserved *and* `hasRecoverableFields(localEntry)` — a cleared entry is `undefined`, so
  that is false either way.

Separately, `fetchAndReconcile` captures `localBeforeMerge` at *request* time, so any edit made
during the fetch flight merges against a stale base. `mutatedSinceSend` guards the save path; the
load path has no equivalent.

**Why deferred:** the fix is a design choice between (a) giving the load path its own
`mutatedSinceLoad` ticket mirroring `mutatedSinceSend`, (b) tracking cleared ids in a separate
`clearedProviderIds` set that `mergeDaemonProviders` honours as a tombstone, or (c) re-reading
`providersRef.current` at merge time instead of snapshotting. (b) is the most honest model of what
a clear means, but it adds a concept to `rules.ts`'s merge contract.

### #3 — Asset resurrection via overlapping flushes

`Jini/packages/ui/src/features/asset-grid/react/hooks/useAssetGridLiveUpdates.ts:59`

Confirmed. `flush` sets `timer = null` on entry then awaits, and `schedule()` only checks `timer`,
so nothing tracks an in-flight flush. Flush #1 can be awaiting `fetchById([A])` — having already
drained `pendingIngest` — when flush #2 fires, filters A out of the list, and finds nothing left in
`pendingIngest` to cancel. Flush #1 then merges A back in.

Narrow window: needs the fetch to outlive `coalesceMs` *and* to have resolved with A before the
delete landed server-side. Otherwise `fetched.some(a => a === null)` forces a full reload and
self-corrects. Real, but closer to low than medium.

**Why deferred:** the obvious fix (a `flushing` flag that defers `schedule()` until the current
flush settles) changes the coalescing contract, and the more correct fix (re-check `pendingDelete`
against `resolved` after the await, before merging) needs a decision about whether a delete arriving
mid-fetch should suppress the merge or force a reload.

### #5 — Dashboard page rows link to the post editor

`Tovu/apps/admin/src/features/dashboard/Dashboard.tsx:89`

Confirmed. `use-dashboard.hooks.ts:77` feeds `listPages()` rows into the same `mergeRecent` as
posts, and each row renders `{row.kind}` — so page rows exist and are visibly labelled as pages, yet
every row hrefs to `/admin/posts/${row.id}`.

**Why deferred:** this is not a one-line href change. `panels.tsx:113` gives the `pages` panel **no
detail view** — only `posts` has a `post-editor` view — so there is nowhere for a page row to go.
Either link page rows to `/admin/pages` (correct today, slightly worse UX) or build the page detail
route (larger, and overlaps the pages-vibecoding workstream, which is changing what a page editor
even is).
