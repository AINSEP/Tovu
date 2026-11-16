# Stop lost updates — design (hard item #8), revision 2

Date: 2026-11-16. Docs only; no source was edited.
Code read at: Tovu `origin/integ/wave-b-r2` @ `65302ee5`, Jini `origin/integ/wave-b-r2` @ `02edbb68`.
Input: `design-inputs/lost-update.tsv` (97 sites, audit of 2026-11-11). Per-site verdicts: `SITES.tsv`.
Personas: software-architect (lead), database, programmer, tdd.
Revision 2 answers `CODEX-JUDGE.md` (1 blocker, 11 majors). Each finding was checked against the
code before anything changed; the result is in §12.

## 1. Answer in short

- **35 of the 97 sites are a real risk** (revision 1 said 28). 16 have no guard at all. 19 have a
  guard that a caller can skip, or that only stops two server calls from interleaving and does
  nothing about a save sent from an old screen.
- **6 more writers were found outside the list** (`SITES.tsv` rows X1–X6).
- **7 sites are already guarded.** **55 are not lost-update bugs**: 24 single-writer or
  lock-serialised with no stale input, 12 last-writer-wins on purpose, 19 false positives.
- **The generic mechanism already exists**: `@jini-ai/core/optimistic-concurrency`. This design adds
  no second one. Revision 1 found five gaps in how it is used; the judge found five more kinds of
  gap, now rules M3 and M7–M9.
- The judge's blocker is real and wider than reported: the external MCP row has **seven** whole-row
  writers in three Jini packages plus an access writer that never advances the version (§4.4).
- About 30 records are affected. New since revision 1: identity users, search index bookkeeping,
  publish baselines, email templates, page HTML, and the two assistant credentials.

## 2. What exists today (search for owners first)

### 2.1 The owner: `@jini-ai/core/optimistic-concurrency`

Storage-neutral; imports only core files (253 lines). Exports:

| Export | Use |
|---|---|
| `RecordVersionConflictError` (`code: VERSION_CONFLICT`) | Plain-words message, `recordKind`, `recordId`, `expectedVersion`, `currentVersion` (`null` = deleted) |
| `assertVersionedWrite({ changedRows, …, readCurrentVersion })` | Finishes `UPDATE … WHERE version = :expected`; reads the live version only on a miss |
| `parseExpectedVersion` / `requireExpectedVersion` / `requireEditorVersion` | Optional basis / mandatory for tools / mandatory for a person's form (428) |
| `versionConflictBody` (409) / `versionRequiredBody` (428) | The HTTP bodies, `{ error, code, details }` |
| `versionConflictRule({ readToolId })` | Model-facing rule: re-read, reapply, resend; never resend unchanged |
| `fromSettingsRevisionConflict` | Maps the settings ledger's conflict onto the shared error |

`versionConflictBody` takes a `RecordVersionConflictError` and `versionConflictRule` matches that
constructor (`optimistic-concurrency.ts:166`, `:241`). A domain that throws its own class cannot use
either as they are (§4.9).

### 2.2 Other owners this design reuses

| Owner | Where | What it already does |
|---|---|---|
| Post conditional save | `features/post/repo.ts:177` `saveIfVersion`; `post.ts:1721` `persistUpdatedPost` | One `UPDATE … WHERE workspace_id AND version`; search projection refreshed only on success; tests in `repo.save-if-version.test.ts` |
| Post no-op save | `post.ts:1908` `unchangedLiveRow`, `:1978`; `post.noop-save.test.ts` | Compares `savedPostContent(a)` with `savedPostContent(b)` using `isDeepStrictEqual`; re-reads the live row and re-checks the basis before returning without a write |
| Vault revision | `secrets_vault.revision`; `VaultRepoPort.put({ expectedRevision })`, `applyBatch` | Compare-and-set per secret; media providers plan under the `secrets_vault:<ws>` lock (`provider-credential-vault.ts:112`); assistant credentials pass the revision they read (`assistant-vault.ts:86-90`) |
| Carried envelope rule | Jini `mcp/src/federation/hosted/vault.ts` `persistExternalMcpVaultEnvelope` | A carried (not re-sealed) credential envelope must still exist byte for byte, else vault `conflict` |
| Settings ledger | `packages/core/src/settings/write-service.ts:299-326` | Per-value `seq` compared under the ledger's lock (`expectedRevisionSeq`) |
| Search settle | `index-state-store.ts:104` `settle` | Compare-and-set on revision + task id |
| Command gateway | Jini `cms/src/core/commands/command.ts:101` `executeCommand` | Authorise, refuse replays, execute, record change set + event (24 call sites) |

### 2.3 Version columns

Migration `0042` added `version integer NOT NULL DEFAULT 1` to `webhook_subscriptions`,
`external_mcp_servers`, `identity_users`, `roles`, `policies`, `workspaces`. Only
`webhook_subscriptions` and `workspaces` are compared. The record contracts for the other four do
not carry the field at all (`ExternalMcpServerRecord` in Jini `core/src/contracts/hosted-mcp/record.ts`;
`UserRecord` / `RoleRecord` / `PolicyRecord` in `@jini-ai/user-management`).

Tables that already had `version`: posts, entries, content types, menus, taxonomies, terms,
redirects, media, members, member tiers / subscriptions / consents, newsletter campaigns, form
definitions / submissions, setting definitions. `plugin_activations.version` is the plugin's version
string, not a revision. Credentials for media providers, the assistant and MCP servers are rows in
`secrets_vault`, which has its own `revision` (migration `0012`).

### 2.4 Four strengths of guard are in use — only one is complete

| Strength | Where | Problem |
|---|---|---|
| A. Compare in the write, basis from the caller | forms tools, webhooks update, workspace, member tiers, posts and entries **when a basis is passed** | Correct |
| A′. Compare in the write, basis read in the same request | forms `update.ts`, page HTML route, email template edit without a basis, assistant credentials, identity under its lock | Stops two server calls interleaving. Does **not** stop a save from an old screen |
| B. Compare in application code, then a blind write | content types, taxonomy terms, newsletter campaigns | A second writer can land between the compare and the write |
| C. Nothing | the 16 `REAL` rows | Silent overwrite |

Revision 1 listed posts under B. That was wrong (§12, finding 6).

### 2.5 Thirteen spellings of the same error

Besides the core class: `PostVersionConflictError`, `VersionConflictError` (entries),
`VersionConflictError` (content types, extends `ToolInputError`), `TaxonomyVersionConflictError`,
`MenuVersionConflictError`, `WidgetVersionConflictError`, `CommentVersionConflictError`,
`SeoConcurrentWriteError`, `EmailTemplateVersionConflictError`, `PageConcurrentEditError`,
`VisitorToolsRevisionConflictError`, `CustomCredentialConcurrentModificationError`,
`NewsletterConflictError`. Wire codes: `VERSION_CONFLICT`, `CONCURRENT_EDIT`,
`EMAIL_TEMPLATES_VERSION_CONFLICT`, `WIDGETS_VERSION_CONFLICT`. Renaming them is the optional step
S11. Making each of them usable **before** S11 is §4.9 and is not optional.

### 2.6 Admin UI

`apps/admin/src/lib/version-conflict.ts` owns `isVersionConflict`, `readVersionConflict` and one
message. It matches one code only (`VERSION_CONFLICT`) and re-declares the string. Posts and pages
show a banner with a retry; collections and menus show the message; every other editor treats a 409
as a generic failure. Jini `@jini-ai/ui` has no conflict feature; `@jini-ai/admin/src/widgets/rules.ts:56`
has one hard-coded sentence for `WIDGETS_VERSION_CONFLICT`.

### 2.7 The open bug: a no-op patch bumps the version

`packages/cms/src/forms/write-service.ts:276-288` builds the next record with
`version: existing.version + 1` and a fresh `updatedAt` whatever the patch holds, then writes, all
inside `executeCommand`'s `execute` callback. The gateway then builds and inserts a change set and
its `change-set.applied` event (`command.ts:115-127`). A patch that changes nothing takes the row
from 1 to 2 and leaves an audit record and an event. Same `version + 1` habit, read:
`workspace/update.ts:84`, `seo/write-service.ts:242`, `integrations/src/webhooks/subscriptions.ts:123`.
Member tiers: not read.

## 3. Classes used in `SITES.tsv`

| Class | Rev 1 | Now | Meaning |
|---|---|---|---|
| `REAL` | 13 | 16 | Two writers exist; the write has no guard against the other one |
| `REAL-OPT` | 15 | 19 | A guard exists, but the basis is optional, or comes from the request's own read (A′), or is strength B |
| `GUARDED` | 9 | 7 | Compared in the write with the caller's basis, and the caller must send it |
| `SAFE` | 27 | 24 | One writer, or serialised under a lock **and** the request carries no fields from a screen, or fenced by a state/lease predicate |
| `LWW-OK` | 14 | 12 | Last writer wins on purpose: one selector field, idempotent grant, newest authorisation |
| `FP` | 19 | 19 | Create-only, derived projection, content-addressed, or fenced in a helper the audit cannot see |

Reclassified in revision 2: 19, 91 (`GUARDED` → `REAL-OPT`); 27, 58, 74 (`SAFE` → `REAL`); 83, 85
(`LWW-OK` → `REAL-OPT`). Evidence corrected with the class kept: 6, 14, 15, 21, 26, 49, 62, 70, 72,
75, 82, 90. 27 rows are still `partial` (was 35); each says what was not traced.

The audit re-run on the current trees gives 90 hits (75 Tovu, 15 Jini); 7 input rows are cleared.

## 4. The one mechanism

No new module. The rules are the contract; `@jini-ai/core/optimistic-concurrency` is the code.

**M1. The compare lives in the write statement.**
`UPDATE … SET …, version = :next WHERE <key> AND version = :expected`, then `assertVersionedWrite`.
A compare in application code may stay in front as an early refusal; it is never the guard. Upserts
are not used for edits: create is `insert`, edit is the conditional `update`.

**M2. Every update names a basis.** The repo port's update takes a required `expectedVersion`.

**M3. A lock is not a basis.** A lock or a same-request read stops two server calls from
interleaving. Only the version the person or tool loaded stops a save from an old screen.

| Caller | Rule | On a missing basis |
|---|---|---|
| A person's form (admin UI), including a `PATCH` whose form sends more than the one field changed | Required: `requireEditorVersion` | 428 `VERSION_REQUIRED` |
| Agent write tool | Required: `requireExpectedVersion({ readToolId })`; the read tool returns `version` | `ToolInputError` naming the read tool |
| Server-internal change (status flip, background job, provider event) | The service uses the version it read in the same call | not applicable |
| Other API clients (access tokens) | Owner decision D2 | 428 after a warn-only release |

A request that carries only an intent and no fields from a screen (enable, disable, pause, delete,
set this one named field) does not need a client basis: nothing in it can be stale.

**M4. Internal single-purpose changes retry once.** On a conflict the service re-reads, re-applies
the same change and writes again, once. If that also conflicts it throws. A person's or agent's edit
never retries on its own.

**M5. A no-op changes nothing, anywhere.** No row write, no version bump, no `updatedAt` change, no
change-set record, no event, no cache invalidation. Three parts:

1. *What counts as content* is per domain: one pure projection per record, e.g.
   `savedFormContent(record)`, in the style of the existing `savedPostContent`. For forms it drops
   `version` and `updatedAt`. For plugin activations it **keeps** `version` (the plugin's version is
   content) and drops `revision` and `updatedAt`. Compared with `isDeepStrictEqual` from `node:util`,
   as posts do. Revision 1's generic `hasRecordChanged` helper is withdrawn: the standard library
   already does the compare and a default ignore-list would be wrong for plugins.
2. *The basis is still checked.* A no-op has no conditional update to reject a stale basis, so the
   service checks the caller's basis against the live row before returning it (`unchangedLiveRow`
   is the precedent).
3. *The command owner must know.* `executeCommand` records a change set whenever `execute` returns.
   `command.ts` gains one exported sibling that shares its private steps:

```ts
/** Like executeCommand, but `unchanged` runs after authorisation and the replay check and before
 *  the mutation. A non-null result means: nothing to do, record nothing, emit nothing. */
export async function executeCommandUnlessUnchanged<TResult>(
  required: ExecuteCommandRequired<TResult> & { unchanged: () => Promise<TResult | null> },
  optional: ExecuteCommandOptional = {},
): Promise<{ changed: true; result: TResult; changeSetId: UUID } | { changed: false; result: TResult }>
```

   Order: authorise → refuse a replayed idempotency key → `unchanged()` → (only when it returns
   `null`) inverse capture, execute, record. A denied caller still learns nothing. A no-op does not
   consume its idempotency key, because nothing was recorded; a retry is evaluated again and the
   basis rule still applies. `executeCommand`'s return type and its other 23 callers do not change.
   Only services that adopt the no-op rule call the new function.

**M6. One conflict shape on the wire, in every step.** HTTP `409` with
`{ error, code, details: { recordKind, recordId, expectedVersion, currentVersion } }`. Tools: the
shared guidance text. §4.9 says which class and code each domain uses until S11.

**M7. Every writer of a versioned row takes part.** Once a table's `version` is compared, each
statement that writes the row is one of two kinds:

- *Edit*: changes a column an editor or tool submits or sees as editable state. It compares
  `version` and sets `version + 1`. This includes specialised writers: access grants, security
  changes, plugin adoption, credential removal by recovery.
- *Runtime*: changes only columns no editor submits (tokens, expiry, lease, last sign-in). It is a
  column-scoped `UPDATE` that names only those columns, has its own fence, and leaves `version`
  alone, so background activity does not make a person's save fail.

A whole-row upsert built from an earlier read is neither and is not allowed on a versioned table.

**M8. Scope comes from the conflict key.** A row is "owned by this run / job / request" only when
its key contains that owner's id. If two runs can address the same key, the write is shared and
needs a fence, even when a run id is one of the values written.

**M9. Effects and undo are writes.** An operation that saves and then runs an effect (load a
plugin, call a provider) remembers the exact revision it created. Its undo is a compare-and-set on
that revision: if the row has moved on, the undo does nothing. A failed undo is reported with the
original error, never swallowed. A result that arrives late (a token set, a provider status) is
written only while the thing it belongs to is still the stored one.

**M10. New editable tables start with the rule**, and the audit's lost-update count is pinned in CI
so it cannot grow (S10).

### 4.1 How routes carry the basis

Body field `expectedVersion` (integer). A dozen or more routes and the admin client already do
this; tools cannot send headers, so one name works across HTTP, tools and services. `ETag` /
`If-Match` is rejected as a second carrier (D1). GET and list responses include `version` on every
editable record. Missing basis on a person's save: `428`. Stale: `409`. Malformed (`"3"`, `-1`):
`400`, never read as "no basis".

### 4.2 How agent write tools carry it

As Wave B: the read tool returns `version`; the write tool's schema lists `expectedVersion` under
`required`; the handler calls `requireExpectedVersion`. Tools that still list it as optional and are
fixed in S7b: `email_template_edit`, `pages_write_html`, `pages_write_region`, `pages_move_region`.

### 4.3 Settings groups

Comments, SEO and assistant settings are N ledger values, one `set()` per changed field. GET returns
`revisions: { <field>: seq }`. PUT / tool sends `expectedRevisions` for the fields it changes; each
`set()` passes its own `expectedRevisionSeq`, which the ledger compares under its lock. Different
fields both succeed; the same field conflicts. All N sets are one transaction (S8 pins this with a
test; comments was not verified). Alternative: one group revision (D3).

### 4.4 External MCP servers (the blocker)

Owner: the record and port contract in Jini `core/src/contracts/hosted-mcp/record.ts`, the service
in Jini `mcp/src/federation/hosted/store.ts`. Tovu holds the SQL adapter, the route, the tool and
the form binding. `ExternalMcpServerRecord` gains `version`. The port's `upsert(record)` is replaced
by three methods, each `(required, optional = {})`:

- `insert({ record })`
- `updateIfVersion({ record, expectedVersion, replaces: { envSecretId, oauthSecretId } })` —
  the edit write. `WHERE version = :expected` and, when the save re-sealed a credential from the
  stored one, `AND <pointer> IS :replaced`. Sets `version + 1`.
- `updateOAuthRuntime({ key, expectedOAuthSecretId, patch })` — the runtime write. Sets only the
  sealed-OAuth pointer, `oauth_status`, `oauth_expires_at`, `oauth_refresh_lease_until`,
  `oauth_aad_version`. `WHERE oauth_secret_id IS :expected`. Leaves `version` alone.

| Writer (file:line) | Today | After | Advances `version` |
|---|---|---|---|
| `saveExternalMcpServer`, create (`store.ts:1654`) | upsert | `insert` | starts at 1 |
| `saveExternalMcpServer`, edit | upsert | `updateIfVersion`, basis from the caller (or the read version until S10) | yes |
| `applyExternalMcpAccess` → `updateAccessIfCurrent` (`external-mcp-repo.ts:185`) | snapshot compare, no version | same compare, plus `version = version + 1` | **yes** |
| Plugin adoption (`agent-plugins/src/connect/federate-mcp.ts:520`) | upsert `{ ...existing }` | `updateIfVersion` on the read version, M4 | yes |
| Plugin tool renames (`apply-tool-renames.ts:125`) | upsert | same | yes |
| Sign-in configuration: grant, client id, endpoints, scopes (`sign-in.ts:419`) | upsert `{ ...record }` | `updateIfVersion` on the read version, M4 | yes (the form shows these) |
| `persistTokens` after callback or refresh (`sign-in.ts:621`) | upsert `{ ...record }` | `updateOAuthRuntime` | no |
| `setOAuthStatus` (`sign-in.ts:752`) | upsert `{ ...record }` | `updateOAuthRuntime`; when it also forgets a self-registered client it uses `updateIfVersion` | no / yes |
| Lease claim and release (`external-mcp-repo.ts:237`, `:250`) | conditional update | unchanged | no |
| Vault recovery `unlinkMcp` (`vault-credential-recovery.ts:42`) | pointer update fenced on the secret id | same, plus `version = version + 1` | yes (a stored credential disappears) |
| `deleteByServerId` | delete | unchanged (intent only, M3) | row gone → `currentVersion: null` |

Why two kinds: a token refresh happens in the background, often hourly. If it advanced `version`,
a person editing the form would get a conflict for a change they cannot see. If it kept writing the
whole row, it would restore the label, the enabled flag and the tool grants it read before calling
the provider. That second case is today's code and is the worst one: a refresh in flight can
re-enable a server an admin just disabled.

Edge cases, each with a named outcome:

- *Edit races a refresh.* The edit's `WHERE` passes on `version` but misses on the pointer (the
  refresh replaced the credential the edit re-sealed from), or the carried-envelope rule throws
  vault `conflict`. The service reads the live version: unchanged means "runtime moved", so it
  re-reads and rebuilds once (M4). Changed means a real conflict → 409.
- *Refresh finishes after the credential was replaced or removed.* `updateOAuthRuntime` misses. The
  new tokens belong to a credential that is gone, so they are dropped, the miss is logged with
  server id and both secret ids (no token material), and the resolver reports
  "reauthorisation required". Nothing is overwritten.
- *Access is revoked, then a stale form saves.* The revoke advanced `version`; the form's basis is
  old; 409; grants stay revoked. This is the judge's test.

### 4.5 Vault-backed credentials (media providers, assistant)

No new column. The vault's `revision` is the version; what is missing is the client's basis and a
plain answer on conflict.

*Assistant site and execution credentials* (rows 83, 85): GET returns `revision` (`null` when
nothing is stored). PUT accepts `expectedRevision`; the service passes it to `repo.put` instead of
the revision it just read. A vault `conflict` maps to `409` with the shared body
(`recordKind: 'assistant-credential'`). Today it falls through to `500 INTERNAL_ERROR`.

*Media providers map* (row 90): the body is the whole map and a built-in provider missing from it
is deleted. Policy, evaluated inside `replaceWorkspace`'s planner, which already runs under the
vault writer lock on freshly read rows:

| Stored provider `p`, client basis `B` | Outcome |
|---|---|
| `p` in the body, `B[p]` equals the stored revision (or both absent) | write `p` |
| `p` in the body, `B[p]` differs | conflict on `p` |
| `p` missing from the body, `B[p]` equals the stored revision | delete `p` (the person cleared it) |
| `p` missing from the body, `B[p]` absent or different | conflict on `p` (added or rotated after the tab loaded); nothing deleted |

Any conflict rejects the whole batch (it is already atomic). `details` lists provider ids, never
values. Carrier: the body today is the bare map, so there is no place for the basis. Recommended
(D10): wrap as `{ providers, expectedRevisions }`, and `MediaProvidersPort.saveMediaProviders` in
`@jini-ai/ui` takes `(required: { providers }, optional: { expectedRevisions } = {})`. The route
accepts the bare map until S10.

### 4.6 Plugin activations: fencing for effects and undo

Writers today, all whole-row and blind: `setPluginEnabled` (`activation.ts:192`), its undo
`restoreOnSideEffectFailure` (`:66`, swallows its own error), the tool's gateway rollback
(`tools/management.ts:463`), Tovu's route rollback (`routes/plugins/set-enabled.ts`),
`quarantinePlugin` (`quarantine.ts:22`), uninstall's delete.

New column `plugin_activations.revision` (D6). Port, each `(required, optional = {})`:
`insertActivation({ record })`, `updateActivation({ record, expectedRevision })`,
`deleteActivation({ key, expectedRevision })`. Each returns whether it applied.

`setPluginEnabled`, in order:

1. Read `existing` (revision `r0`, or absent). If the request changes nothing (`savedActivationContent`
   equal, M5): return `existing`, write nothing, **run no effect**.
2. Write the new state with compare-and-set on `r0` (or `insert`). It now holds `created = r0 + 1`.
   A miss: re-read and re-decide once (M4; the request is an intent, not an edit).
3. Run the effect (load or unload).
4. If the effect throws, undo with compare-and-set on `created`: restore `existing` as `created + 1`,
   or `deleteActivation({ expectedRevision: created })` when there was no prior row.
   - Undo applied → rethrow the original error.
   - Undo missed (a newer change owns the row) → rethrow the original error with a note: the newer
     state was left alone.
   - Undo itself failed → throw `PluginActivationUndoError` with the original error as `cause` and
     plain words: what was attempted, that the plugin is recorded as enabled but did not load, and
     what to do (disable it, then enable it again). Details: plugin id, attempted state, `created`.
5. The gateway rollbacks at `management.ts:463` and Tovu `set-enabled.ts` use the same
   compare-and-set on `created`, which `setPluginEnabled` now returns. They stop writing
   `priorActivation` blind.

`quarantinePlugin` writes with compare-and-set on the revision it read and retries once (M4): a
quarantine is a single-purpose "turn this off".

*Does the loaded state match the stored state?* Inside one process, the whole transition (steps 2–4)
for one plugin runs under a per-plugin queue owned by the plugin runtime, so effects apply in the
order their writes committed and the last effect matches the last stored row. No such queue was
found in `runtime-core.ts`; adding it is part of S9c. Across processes this design gives only the
durable guarantee (undo never overwrites a newer row). Whether more than one process hosts a plugin
runtime was not verified (§10).

### 4.7 Shared bookkeeping rows: search index state and publish baselines

*Search* (row 58). `SearchIndexStatePort.put({ row })` is replaced by
`admit({ row, expected })`, where `expected` is the `{ revision, attempts, taskId }` the indexer
observed in `freshRecords`, or `null` for "no row". SQL: `INSERT … ON CONFLICT DO NOTHING` when
`expected` is `null`; otherwise `UPDATE … WHERE revision = … AND attempts = … AND task_id IS …`.
Returns whether it applied. On a miss the indexer re-reads that one key and decides again: skip if
the stored revision is now equal or newer, else admit against the new observation. A second miss
throws; on the event path the outbox redelivers, on the maintenance path the next pass retries.
`attempts` and `taskId` are part of the compare, so two retries of the same revision cannot both
claim the same attempt. The "not configured" write at `indexer.ts:164` uses `admit` too.

*Publish baseline* (row 74). `upsert(record)` is replaced by
`advance({ record, observed })`, where `observed` is the baseline row the run read at
`apply-loop.ts:426` (or `null`). SQL: insert-if-absent, or
`UPDATE … WHERE hash_at_last_sync = :observed.hash AND run_id = :observed.runId`. On a miss another
run moved the baseline. The run then inspects the destination once: if the destination's hash is the
one this run meant to record, it re-reads the baseline and advances against it; otherwise it leaves
the other run's baseline, which is the true one, and adds a line to its report. No new column, no
change to the handler port. The extra read happens only on a miss.

### 4.8 What the person sees

Reusable behaviour goes to Jini; HTTP and feature bindings stay in Tovu.

**Jini: `@jini-ai/ui/src/features/save-conflict/`** (new feature folder; imports only its own
package and `@jini-ai/core/optimistic-concurrency` for the codes):

- `rules.ts`, pure: `classifySaveFailure({ status, code, details }, { conflictCodes })` →
  conflict / deleted / version-required / none; `changedFieldLabels({ loaded, latest, labels })`;
  `conflictDetailsText(...)`.
- `ports.ts`: `SaveConflictPorts<TRecord> { fetchLatest(): Promise<TRecord | null>;
  copyText(required: { text }): Promise<void>; now(): string; t(required: { key }): string }`.
- `react/useSaveConflict.ts`: the lifecycle (idle → conflict, loading theirs → shown → keep editing
  | load theirs after a confirm | copied). `react/SaveConflictNotice.tsx`: the notice.

**Tovu: `apps/admin/src/lib/version-conflict.ts`** keeps the `ApiError` → `{ status, code, details }`
reading and each editor's binding: its fetch call, its field labels, its record noun.

On a 409 the editor fetches the latest record and compares field by field with the copy it loaded:

> **Someone else changed this webhook while you were editing.** They changed: Label, Target URL.
> Your changes were not saved and are still on this screen.
> [Keep editing] [Load their version] [Copy details]

- "They changed" lists field labels, never values. If no listed field differs, it says "They saved
  it without changing these fields."
- **Copy details**: record kind, record id, your version, current version, changed field names,
  time, request id. No field values.
- **Load their version** discards local edits after a confirm.
- Deleted (`currentVersion: null`): "This webhook was deleted while you were editing. Copy anything
  you want to keep."
- 428: "This page is out of date. Reload, then make your change again."
- Later (D4): "Save my changes on top" when the changed fields do not overlap.

Posts and pages keep their own banners until S11.

### 4.9 Conflict errors per domain until S11

A step may not depend on S11 to be usable or testable. Two cases:

*Domains with no conflict class today* throw `RecordVersionConflictError` and use
`versionConflictBody` / `versionConflictRule` directly: external MCP, users, roles, policies, member
subscriptions and consents, redirects, newsletter lists and subscriptions, plugin activations, media
metadata, assistant credentials, media providers.

*Domains that keep their class and wire code* get, in the same commit as their guard:

1. The four fields on the class (`recordKind`, `recordId`, `expectedVersion`, `currentVersion`)
   where missing. `PostVersionConflictError` has the two versions only (`post.ts:1003`).
2. The HTTP mapping `{ error, code: <unchanged code>, details: { the four fields } }`.
3. A model-facing rule for that class whose guidance comes from one new core export,
   `versionConflictGuidance({ readToolId })` (the text `versionConflictRule` already holds, split
   out so a rule for another class can reuse it).
4. Its code added to the list the admin classifier accepts.

| Domain | Class kept | Wire code kept |
|---|---|---|
| Posts, pages (metadata), entries, menus | `PostVersionConflictError`, entries `VersionConflictError`, `MenuVersionConflictError` | `VERSION_CONFLICT` |
| Page HTML | `PageConcurrentEditError` | `CONCURRENT_EDIT` |
| Email templates | `EmailTemplateVersionConflictError` | `EMAIL_TEMPLATES_VERSION_CONFLICT` |
| Widgets | `WidgetVersionConflictError` | `WIDGETS_VERSION_CONFLICT` |
| Content types, taxonomy terms, newsletter campaigns | their classes | not verified; S6 pins each with a contract test before changing the guard |
| Settings groups | ledger conflict → `fromSettingsRevisionConflict` | `VERSION_CONFLICT` |

Tests assert the class and code from this table, not the core class everywhere.

### 4.10 Migrations

One additive step, `0043_optimistic_concurrency_versions_2`, same form as 0042 (constant default, no
row rewrite, shared with the fresh-database bootstrap):

| Table | Column | Note |
|---|---|---|
| `newsletter_lists` | `version integer NOT NULL DEFAULT 1` | |
| `newsletter_subscriptions` | `version integer NOT NULL DEFAULT 1` | |
| `plugin_activations` | `revision integer NOT NULL DEFAULT 1` | `version` is taken (D6) |

Removed from revision 1: the media-provider credential column (the table no longer exists). No
backfill. The columns are unused until their repo step lands, so the migration can ship ahead. DDL
stays in Tovu.

## 5. Tests: by what each one can prove

Runner: `npm --prefix packages/<pkg> run test` (vitest). Tovu's website runner command was not
verified. All tests go through ports and fakes of ports; no `vi.mock` of another package.

Seam that exists: `describeEachDialect` (`packages/cms/src/core/__tests__/support/dialect-matrix.ts`)
runs one suite on **SQLite and PGlite**, both through real `@jini-ai/db` kernels. It is a test of the
SQL adapter, not of a memory fake (revision 1 described it wrongly). Each port's conformance suite is
one function taking `make()`: the package runs it on the memory fake; the SQL adapter's own test file
runs it on the dialect matrix, as `repo.lost-update.test.ts` does today. Where those adapter tests
should live is owner decision D12.

Five shapes. One shape cannot stand in for another.

**T-stale (a save from an old screen).** Read twice. Writer 1 saves X and finishes. Writer 2 then
saves Y with the basis it read. Assert: writer 2 is rejected with the class and code from §4.9,
both versions are in the error, the stored row still holds X. Every `REAL` / `REAL-OPT` record with
a client basis. This is the only shape that catches an A′ guard: the competing save has fully
finished before the stale one arrives.

**T-cas (the guard is in the write).** Two parts. Port level: two updates with the same basis, run
together, exactly one applies. Service level: wrap the repo port in a fake whose conditional write
first lets a competing write land, then continues. The service has already passed its own
application compare, so only a compare in the write can refuse. Every strength-B domain (content
types, taxonomy terms, campaigns), posts without a basis, redirects, members. A sequential
service-level test cannot tell B from A; this one can.

**T-serial (work under a lock).** For identity. No barrier on reads: with the read inside the
exclusive transaction, holding both readers would deadlock a correct implementation. Instead: start
call A; hold it at its *write* (the port fake awaits a signal); start call B, which must block on
the lock; release A. Assert B's read saw A's committed row and the final row has both effects or
one named conflict. Precondition, tested first: the memory `IdentityTransactionPort` really is
exclusive. If it is not, this shape passes for the wrong reason.

**T-effect (effects and undo).** Plugins. (a) Enable's hook is held; a disable completes; the hook
then fails; assert the row is still the disable's and the error says the newer state was kept.
(b) The undo write fails; assert `PluginActivationUndoError` with the original as `cause`.
(c) A no-op enable runs no hook.

**T-noop (every service that adopts M5).** Save a patch equal to the stored record. Assert version,
`updatedAt`, change-set rows, events and invalidations are all unchanged, and a second editor's save
with the old basis succeeds. Plus: a no-op with a stale basis is still a conflict; a denied caller
gets the same refusal as before.

Named tests the judge asked for: access revoked then stale whole-record save (S1); refresh in
flight while an admin disables (S1); event versus backfill on one document (S12); delayed baseline
write across two runs (S13); delayed basis-less template edit (S7b).

Per test, before the fix: run it and paste the failing assertion into the commit message. After the
fix: mutate (delete the `WHERE version` line; make the content projection return a constant) and
confirm it goes red. HTTP tests assert status, `code` and `details`. Each route also gets: missing
basis → 428 (from S10), `"3"` → 400. Each conformance suite includes one deliberately broken adapter
(no `WHERE version`) that must fail it.

## 6. Rollout

Order is by damage. Each step is one or more commits that compile and pass alone and lists the
callers and the **existing tests** it changes. The basis stays optional on the wire until S10, so no
step breaks an open admin tab. Size rule for every step: §8 row 3.

Move rule: fix a file where it lives when the step runs. Steps touching a `MOVE` / `MOVE-AFTER` file
run before that file's move slice, or the move slice carries the fix. Per-file lane overlap
(`LANES-files.tsv`) was not checked; the coordinator runs `overlap.py` before dispatch.

| Step | Sites | Repo | What changes | Callers and existing tests updated in the same commit | Tests red first |
|---|---|---|---|---|---|
| **S0** | fixes §2.7 | Jini cms, integrations; Tovu | `executeCommandUnlessUnchanged` in `command.ts`. Per service a content projection and the M5 path: forms (change set + event), workspace, SEO entry (sitemap invalidation), webhooks update, member tiers (effects not read; the test lists them first). `updateFormDefinition` (64 lines) gets its record-building extracted, which both the no-op check and `execute` call. | Those five services. `command.ts` tests gain the new entry; no existing caller changes | T-noop ×5; denied-caller; stale no-op |
| **S0b** | — | Jini ui, core; Tovu admin | `features/save-conflict` in `@jini-ai/ui` (§4.8). `versionConflictGuidance` in core. Tovu `lib/version-conflict.ts` binds it, accepts the four codes, imports the constants from core. | No editor wired yet. `lib/version-conflict` tests | Rule tests: 409, deleted, 428, no-visible-change; details text has no values |
| **S1** | 21, 87, 82, X2, X3 | Jini core, mcp, integrations, agent-plugins; Tovu | §4.4. Contract and memory repo first, then one commit per writer group: store save; access; sign-in; plugin adoption and renames; Tovu SQL adapter, route (`expectedVersion`, 409), GET `version`, tool, form binding. | `store.ts`, `store.memory.ts`, `sign-in.ts`, `federate-mcp.ts`, `apply-tool-renames.ts`, `external-mcp-repo.ts`, `vault-credential-recovery.ts`, `put.ts`, `external-mcp/tool-registrations.ts`, `@jini-ai/ui` external-mcp form. Every test that calls `repo.upsert` | T-stale; T-cas; access-revoked-then-stale-save; refresh-vs-disable; refresh-after-credential-replaced |
| **S2** | 76 | Jini integrations, Tovu | Webhook pause / resume / delete use the read version with one retry (M4). | `subscriptions.ts`, `integrations/pause.ts`, tool handlers, memory fixtures | T-cas pause-vs-update |
| **S3** | 16, 27, 29, 30, 15, X5 | Jini user-management, Tovu | `version` on user, role and policy records. Repo `save` splits into insert and conditional update. `updateUser` / `updateRole` / `updatePolicy` take `expectedVersion`; the last two also move inside `inAuthorizedIdentityTransaction`. Routes parse it, GETs return it, admin forms and the four tools send it. Sign-in's `lastLoginAt` becomes a column-scoped `recordLogin` (runtime, M7). | `admin-crud-service.ts:213, :357, :411, :458`; `auth-service.ts:153`; `mfa/service.ts:71, :111`; `mfa/passkey-service.ts:126`; `grant-service.ts:299, :342, :381` and `seed.ts:230, :253, :479` (create paths → insert); Tovu `identity/repo.ts`, `api-key-service.ts:315`, user/role/policy routes, admin hooks | T-stale ×3; T-serial ×2; sign-in-vs-password-reset |
| **S4** | 40, 41, 44, X1 | Tovu | Subscriptions and consents: conditional update on the read version, M4 for provider events. Tiers: basis always passed. Members: `<=` becomes `=`. | `members/write-service.ts` (5 saves), `consent-service.ts` (3), `password-auth.ts`, `member-login/link-service.ts`, `unlink-identity.ts`, provider webhook handler, memory repos | T-stale ×3; T-cas webhook-vs-admin |
| **S5** | 7 | Jini cms | Redirects: `save` becomes insert + conditional update; `updateRedirect` accepts a basis; slug-change capture uses M4. | `redirects.ts`, `capture.ts`, `repo.memory.ts`, Tovu redirect routes and tools | T-stale; T-cas capture-vs-edit |
| **S6** | 18, 20, 45, 49, 61 | Tovu, Jini cms | **Posts: extend the existing path, add no second one.** Callers that omit the basis today pass the version they read (`persistUpdatedPost`'s `repo.save` branch; `post.ts:931`, `:1516` after a read); projection refresh, media-evidence invalidation and revision append stay as they are. Entries: same. Content types, terms, campaigns: move the compare into the write (B → A). §4.9 fields per class. | The five repos and memory fakes, `updatePost` callers (autosave, scheduled publish), cms write-services. Existing `repo.save-if-version.test.ts` and `post.noop-save.test.ts` must stay green unchanged | T-cas ×5; T-stale ×5; scheduled-publish-vs-editor |
| **S7** | 6, 88, 89, 94 | Tovu, Jini cms | Forms update route and SEO entry route read the basis; admin form editor and SEO panel send it. The blind branch in `forms/sql/repo.ts:132` is deleted. | `forms/update.ts`, `forms/authoring.ts`, `seo/put-entry.ts`, admin hooks, `repo.memory.ts`. **`repo.lost-update.test.ts` "a basis-less update stores the version the service computed" is rewritten**: what it protects (after any update a stale basis fails) is asserted through the conditional path; the test count before and after goes in the commit message | T-stale ×3 over HTTP |
| **S7b** | 19, 91, X4 | Tovu | HTML replace carriers. `email_template_edit`, `pages_write_html`, `pages_write_region`, `pages_move_region`: `expectedVersion` required in schema and handler. Page HTML route: reads `expectedVersion` from the body and passes it to the store instead of relying on its own read; admin page editor sends it. | `email-templates/agent-tools.ts`, `tool-registrations.ts`; `pages/agent-tools.ts`, `tool-registrations.ts`; `routes/pages/update-html.ts`; admin page-editor hooks; tool-contract snapshots | T-stale: delayed basis-less edit ×2; tool without basis is refused |
| **S8** | 17, 53, 84, 86, 95 | Tovu | Settings groups per §4.3. | `comments/settings.ts`, `seo/settings.ts`, assistant settings service, three PUT routes, three GETs, two tools, admin settings forms | T-stale same-field ×3; different-fields-both-land ×3; all-or-nothing |
| **S9** | 14, 46, 47, 69, 90, 83, 85, X6 | Tovu, Jini plugins, ui | Migration 0043 first, alone. Then: **a** newsletter lists; **b** newsletter subscriptions (unsubscribe uses M4 and must win over a stale admin save); **c** plugin activations (§4.6); **d** media metadata; **e** vault-backed credentials (§4.5). | Per record: repo, memory fake, service, route, tool, admin editor. 9c: `activation.ts`, `quarantine.ts`, `tools/management.ts`, `sql/repo.ts`, `repo.memory.ts`, `runtime-core.ts` (queue), Tovu `set-enabled.ts`. 9e: `assistant-vault.ts`, both credential routes and GETs, `provider-credential-store.ts`, `put-providers.ts`, `@jini-ai/ui` media-providers port | T-stale ×5; T-effect ×3; unsubscribe-vs-admin; stale tab cannot delete a new provider key |
| **S12** | 58 | Jini search, Tovu | §4.7 search `admit`. | `indexer.ts` (`freshRecords`, `putPlan`, `writeToTarget`), the port type, the memory state fake, Tovu `index-state-store.ts` | event-vs-backfill interleave; same-revision double retry |
| **S13** | 74 | Tovu | §4.7 baseline `advance`. | `publish-content-baseline-repo.ts`, its memory fake, `apply-loop.ts` `refreshBaseline` and the row context | delayed baseline write across two runs |
| **S10** | all | both | Contract: person saves use `requireEditorVersion` (428); repo ports take a required `expectedVersion`; remaining blind branches deleted; audit count pinned in CI. | Every port, fake and caller of S1–S9, S12, S13 | 428 per route; broken-adapter conformance |
| **S11** (optional, D5) | §2.5 | both | Rename the 13 classes and 4 wire codes onto core. Nothing before it depends on it. | Classifiers, rule lists | Contract tests on codes |

Not changed, on purpose: the 24 `SAFE`, 12 `LWW-OK` and 19 `FP` rows. Commerce catalog saves (10–12)
are create-only today and are covered by M10 and the ratchet.

## 7. Estimate

| Step | Size | Step | Size |
|---|---|---|---|
| S0 | 1.5 days | S7b | 1 day |
| S0b | 1.5 days | S8 | 1.5 days |
| S1 | 3 days | S9 | 4.5 days (0.25 + 0.5 + 0.75 + 1.5 + 0.5 + 1) |
| S2 | 0.5 day | S12 | 1 day |
| S3 | 2 days | S13 | 0.5 day |
| S4 | 1 day | S10 | 1.5 days |
| S5 | 0.5 day | S11 | 1.5 days (optional) |
| S6 | 2 days | | |
| S7 | 0.5 day | | |

**About 22.5 working days without S11** (revision 1 said 13), about 16 agent lanes. The growth is
S1 (four Jini packages instead of "Tovu only"), S3 (a real basis instead of a lock), S9c (fencing),
S0 (the command owner), and three new steps. Size splits, if the owner chooses them over the
no-growth rule (D11), are not in this number. S1–S5, S12, S13 can run in parallel after S0; S6–S9
after that; S10 last and serial. Estimates are from reading code, not from a spike.

## 8. Owner practices — checked one by one

| # | Practice | Result |
|---|---|---|
| 1 | DI via typed ports from the host | Kept. New behaviour is new port methods (`updateIfVersion`, `updateOAuthRuntime`, `admit`, `advance`, `updateActivation`); the UI feature takes `SaveConflictPorts`. No new global. |
| 2 | Args `(required, optional = {})`; never `?: Record<string, never>` | Every new or changed signature follows it with a named options type. **Conflict found:** signatures this plan touches use `optional?: Record<string, never>` today (`updateAccessIfCurrent` in `record.ts:127`, every `PluginActivationRepoPort` method, `vaultErrors.create`). They are fixed where the plan changes that signature anyway (S1, S9c) and nowhere else. |
| 3 | Functions ≤ 50, files ≤ 500, complexity ≤ 10 | **Measured this time.** 19 touched files are over 500 lines today (largest: `post.ts` 2596, `hosted/store.ts` 1671, `taxonomy/write-service.ts` 1120, `sign-in.ts` 1047, `apply-loop.ts` 996, `runtime-core.ts` 871, `redirects.ts` 845, `external-mcp/tool-registrations.ts` 776, `management.ts` 757, `media-repo.ts` 719, `identity/repo.ts` 710, `admin-crud-service.ts` 701). 4 touched functions are over 50: `saveExternalMcpServer` 72, `updatePost` 69, `updateFormDefinition` 64, `resetUserPassword` 64. None of these files has a size design on `plan/size-designs-2026-11-16`. **Rule for every step (the no-growth rule):** new functions go in a new sibling file in the same feature folder; an edit inside an over-limit file or function must leave it no longer than it was (the changed call becomes a call into the sibling). S0 and S1 as written shrink `updateFormDefinition` and `saveExternalMcpServer` below 50. `updatePost` and `resetUserPassword` get a one-line change and stay over. This keeps the debt from growing; it does not make the files compliant. Whether that is acceptable or splits must come first is **D11**. Complexity was not measured. |
| 4 | Feature slicing | Each step stays in its feature folder. The UI part is its own feature folder in `@jini-ai/ui`. |
| 5 | No barrels / re-export shells / forwarders | None added. `executeCommandUnlessUnchanged` shares private steps with `executeCommand` in one file; neither forwards to the other. **Existing conflict, not made worse:** Tovu `external-mcp-store.ts` and `external-mcp-vault.ts` are forwarder files onto `@jini-ai/mcp`, and `@jini-ai/ui` feature folders have `index.ts` barrels. S1 adds nothing to the forwarders; the new UI folder has no `index.ts` (it needs `exports` entries per file). |
| 6 | Why-comments move with code | The comments on blind branches (`forms/sql/repo.ts:132`, `post.ts:1709-1711`) are rewritten where the conditional write lives when S7 / S10 delete the branch. The `federate-mcp.ts:514-519` comment on why adoption writes the repo directly moves to its `updateIfVersion` call. |
| 7 | Generic → Jini, reusable UI too; a Jini package imports only itself + core + protocol | Conflict notice and its lifecycle: `@jini-ai/ui`. Contracts: core. Services stay in their Jini packages. No new cross-package import. **Existing conflict:** `@jini-ai/cms/*/sql` adapters import `@jini-ai/db`, and `@jini-ai/ui` depends on `ui-kit`, `agentic`, `platform`. This plan adds SQL to existing adapters only. |
| 8 | Tests: fakes of interfaces; red first; mutate | §5. Fakes are of ports. The dialect matrix uses the real `@jini-ai/db` kernel for the adapter that imports it in production; that is not a mock, but where it should live is D12. |
| 9 | Errors never swallowed or generic | §4.8 for the person. Fixed on the way: plugin undo no longer swallows its error (§4.6); a vault conflict is a 409 with details, not a 500 (§4.5); a dropped late token set is logged with ids (§4.4). |
| 10 | No new disables; no silent behaviour changes | **Behaviour changes, all named:** a no-op save no longer bumps the version, records a change set or emits an event (S0); a no-op plugin enable runs no hook (S9c); a stale save fails where it won (every step); a token refresh no longer rewrites label, enabled or grants (S1); role, policy and user edits need a basis (S3, S10); tools that took an optional basis now require it (S7b); a media-providers save from an old tab no longer deletes a key it never saw (S9e); a save without a basis is a 428 (S10). |
| 11 | Smallest change; reuse first; no abstraction with one user | `hasRecordChanged` withdrawn in favour of `isDeepStrictEqual`. Posts keep their existing conditional save. Vault revision reused; no credential column. Baseline needs no column. New core export: one string function with four or more users. |
| 12 | Memory / IO on hot paths | Success path: no extra read anywhere; each blind write becomes one conditional write. Miss path: one read (`assertVersionedWrite`), search one re-read of one key, baseline one `inspect`, MCP edit one re-read. M5: one in-memory compare of one record and one fewer write. The UI fetches the latest record only after a 409. |

## 9. Lessons for design briefs — how each is met

`size-designs/LESSONS-FOR-DESIGN-BRIEFS.md` at `b62acb7e` holds 11 rules. The brief names 17; rules
12–17 are not in that file. The judge's five recurring classes are applied as J1–J5.

| Lesson | Here |
|---|---|
| 1–2 Real dependency graph; inventory every site and consumer | `SITES.tsv` has all 97 plus X1–X6. §4.4 and §4.6 list every writer of the row, found by searching for the port method, not by the audit list. |
| 3–4 Late reads; inputs, outputs, owner of state | §4.4 names which writer owns which columns; §4.6 names who holds the created revision. |
| 5 Migration graph, each commit green alone | §6: prerequisites S0 / S0b / 0043; S1 is contract → writers → adapter; basis optional until S10. |
| 6 Tests that can fail on the named risk | §5: five shapes, each says what it can and cannot prove. |
| 7 Optional values and domain errors stay distinct | 428 / 400 / 409; §4.9 keeps each domain's class and code until S11. |
| 8 Owner limits inside each file | §8 row 3, measured; D11. |
| 9 Generic vs host binding; existing owner first | §2.2 lists seven owners reused. UI behaviour in Jini, HTTP binding in Tovu. |
| 10 Untangle lanes are prerequisites | Move rule in §6; file-level overlap not checked. |
| 11 Verify seams and commands exist | The dialect matrix was read and its description corrected; Tovu's runner was not verified. |
| J1 Server serialisation is not stale-client protection | M3; strength A′ in §2.4; rows 27, 83, 85, 91 reclassified. |
| J2 Every writer advances the revision | M7; §4.4 writer table; S3 writer list. |
| J3 Scope from the real conflict key | M8; rows 58, 74 reclassified; 72 and 75 re-read and kept. |
| J4 No-op across the whole command and event lifecycle | M5 and `executeCommandUnlessUnchanged`. |
| J5 Undo and late effects are concurrent writes | M9; §4.6; the dropped-token case in §4.4. |

## 10. What I could not verify

1. Nothing was run except the read-only audit script and a line-count script. "Red today" is from
   reading code.
2. 27 rows are `partial`. Not traced and able to change a verdict: chat message PUT against the run
   finaliser (1, 97); commerce ledger attempt / refund / dispute patches (13); newsletter campaigns'
   transaction lock (45); media metadata service checks (69); comments settings atomicity (17);
   member tiers' effects on save (S0).
3. The judge checked 25 rows. This revision re-read those the judge disputed and 11 more (14, 15,
   21, 26, 27, 70, 72, 75, 82, 90, 91), plus the X rows. The other `SAFE` / `LWW-OK` / `FP` rows were re-checked
   against rules M3, M7, M8 from their recorded evidence, not re-read line by line: 2–5, 9, 11, 28,
   31–34, 36, 42, 43, 48, 50, 51, 54, 65, 66, 68, 71, 73, 80, 81, 92, 93.
4. Whether more than one process hosts a plugin runtime, and whether a second process writes
   `theme.json` (row 62).
5. Whether the memory `IdentityTransactionPort` is exclusive (T-serial depends on it).
6. The wire codes of content types, taxonomy terms and newsletter campaigns.
7. Whether Tovu always binds an MFA store. If it does, X5 is closed there today by the lock and
   open only for other Jini hosts.
8. Postgres read-committed behaviour; no Postgres run.
9. Whether any non-browser client calls the affected PUT routes (D2).
10. Cyclomatic complexity of touched functions. `untangle/DESIGN.md` and `LANES-files.tsv` were not read.
11. A second copy of the forms code appears at `Jini/packages/cms/forms/src` beside
    `packages/cms/src/forms`; which one ships was not checked.
12. The audit's blind spot stands: a `WHERE` that mentions `version` clears a row even when the
    compare is weak (members, X1) or the basis is the request's own read (A′).

## 11. Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Carrier: body `expectedVersion` or `If-Match` | Body field |
| D2 | Non-browser API clients without a basis | One release that logs, then 428 for everyone |
| D3 | Settings groups: per-field revisions or one group revision | Per-field |
| D4 | Conflict UI now: keep / load theirs / copy details; "save on top" later | Yes, in that order |
| D5 | Rename 13 error classes and 4 wire codes (S11) | Yes for classes; keep old wire codes accepted for one release |
| D6 | `plugin_activations`: new column `revision` | Yes |
| D7 | Single-selector PUTs and intent-only requests stay last-writer-wins | Yes. **Changed:** credential PUTs are no longer in this group (§4.5) |
| D8 | Internal single-purpose changes retry once (M4), including plugin enable / disable / quarantine | Yes |
| D9 | Commerce catalog saves: leave as create-only upserts under the ratchet | Leave |
| D10 | **New.** Media providers PUT: wrap the body as `{ providers, expectedRevisions }` (changes a `@jini-ai/ui` port) or keep the bare map and use a header for this one route | Wrap |
| D11 | **New.** Size: split the 19 over-limit files first, or accept the no-growth rule for this item and leave splits to the size lane | No-growth rule now; `resetUserPassword` and `updatePost` are named exceptions |
| D12 | **New.** SQL-adapter race tests: beside the adapter on the dialect matrix (today's precedent) or in a separate integration host | Beside the adapter |
| D13 | **New.** Users, roles, policies: client basis (M3), or an explicit last-writer-wins exception | Client basis |
| D14 | **New.** External MCP: token refresh and OAuth status do not advance the editing version | Yes (§4.4) |

## 12. Judge response

Every finding was checked against the code at the pinned revisions before it was accepted.
Result: **11 accepted, 1 accepted in part with a rebuttal, 0 rejected.** Blockers left: 0.

| # | Severity | Verdict | Evidence I read | What changed |
|---|---|---|---|---|
| 1 | Blocker | Accepted; wider than reported | `external-mcp-repo.ts:185-204` writes access with no version. `saveExternalMcpServer` is at Jini `hosted/store.ts:1585`, `upsert` at `:1654`. Further whole-row writers the judge did not list: `sign-in.ts:419, :621, :752`; `federate-mcp.ts:520`; `apply-tool-renames.ts:125`. The record contract has no `version`. | §4.4 (writer table, two kinds of write, three edge cases), M7, S1 rescoped to four Jini packages plus Tovu, rows 21 / 82 / X2 / X3, D14. Access-revoked-then-stale-save test added. |
| 2 | Major | Accepted | `index-state-store.ts:92-98` blind upsert; `indexer.ts:122` check, `:162` await, `:170` put; `site-search.ts:299` and `:386` are separate flows with no shared lock. | Row 58 → `REAL`; §4.7 `admit`; new step S12; M8. |
| 3 | Major | Accepted | `publish-content-baseline-repo.ts:52-71` key has no run id; `apply-loop.ts:458-474`, `:911`; `execute-import.ts:14` no lock. | Row 74 → `REAL`; §4.7 `advance` (fence on the observed baseline, one inspect on a miss, no column); new step S13. Row 75 re-read and kept `SAFE`: its key is the run id minted at `apply-loop.ts:543`. |
| 4 | Major | Accepted; same class found twice more | `email-templates/agent-tools.ts:59` `required: ["id","html"]`; `operations.ts:211-214`. Same shape: `pages/agent-tools.ts:117-125` with `pages/tool-registrations.ts:135-137`; `routes/pages/update-html.ts:188` uses its own read. | Rows 19, 91 → `REAL-OPT`; row X4; new step S7b, in the required rollout; §4.2. `GUARDED` now means the caller must send the basis. |
| 5 | Major | Accepted | `update-policy.ts:13-19` takes name and description; `admin-crud-service.ts:450-458` merges them; the admin form sends both (`use-roles.hooks.ts:302`). Same for users (`admin-crud-service.ts:179-213`). | M3 "a lock is not a basis"; S3 now carries a client basis for users, roles and policies and lists every writer of those rows; row 27 → `REAL`; row X5 (sign-in whole-row save); T-serial replaces the read barrier; D13. |
| 6 | Major | Accepted | `post.ts:1721-1740` calls `saveIfVersion`; `repo.ts:177-195` is one conditional `UPDATE`; `post.ts:1908`, `:1978` no-op path with live re-check. | §2.2 names the post owners; §2.4 corrected; row 49 evidence rewritten; S6 extends the existing path and requires the two existing suites to stay green unchanged. M5 now follows the post precedent. |
| 7 | Major | Accepted | `media-provider-credential-repo.ts:15-20`; `provider-credential-vault.ts:112-126`; `assistant-vault.ts:86-90`; `put-site-credential.ts` falls to a 500 on any other error; `provider-credential-store.ts:293-295` deletes by omission. | Credential column removed from 0043; §4.5 (vault revision as basis, whole-map policy table, 409 mapping); rows 83, 85 → `REAL-OPT`; row 90 corrected; S9e; D7 narrowed; D10. |
| 8 | Major | Accepted | `write-service.ts:239-291` computes and writes inside `execute`; `command.ts:113-127` always records. | M5 rewritten in three parts; `executeCommandUnlessUnchanged`; per-domain content projection (plugins keep `version`, drop `revision`); S0 lists the effect per service; T-noop asserts change sets and events. |
| 9 | Major | Accepted; more writers found | `activation.ts:192-193` save then effect; `:66-80` undo swallows; also `tools/management.ts:463`, Tovu `set-enabled.ts`, `quarantine.ts:22-50`. | §4.6; M9; S9c; T-effect ×3; row 14 rewritten; row X6; a no-op enable runs no hook. |
| 10 | Major | Accepted | `optimistic-concurrency.ts:166`, `:241` are bound to the core class; `post.ts:1003` has only the two versions. | §4.9: per-domain class and code table, four fields added per class in the step that touches it, `versionConflictGuidance` in core, admin classifier accepts the four codes in S0b. Nothing depends on S11. |
| 11 | Major | Accepted in part | (a) `repo.lost-update.test.ts` calls the blind branch — confirmed. (b) Read barrier would deadlock under `identity/repo.ts:51` — confirmed. (c) Sequential service test cannot tell B from A — confirmed by reasoning. (d) Fixture: confirmed that it is SQLite + PGlite through `@jini-ai/db`, so my "memory + SQL" description was wrong. **Rebutted:** that it breaks the test-isolation rule. The rule bans `vi.mock` of another package's internals; the matrix uses the real public kernel for an adapter that imports `@jini-ai/db` in production under a declared opt-in peer dependency (`packages/cms/package.json:142`, `:439`). I found no "approved integration-test host" in the repo to move it to. | §5 rewritten into five shapes; S7 lists the test rewrite with a before/after count; description of the matrix corrected; where adapter tests live is D12. |
| 12 | Major | Accepted | Line counts measured (§8 row 3): 19 files over 500, 4 functions over 50, none with a size design. `@jini-ai/ui` has feature folders and already hosts the external-MCP and media-provider forms. | No-growth rule in every step and D11; S0 / S1 bring two of the four long functions under 50; conflict notice moved to `@jini-ai/ui/features/save-conflict` with typed ports, Tovu keeps the HTTP and feature bindings (§4.8, S0b). Estimate redone. |

Also corrected from the judge's row table: row 62 is an allowlist in `theme.json`, not one boolean.
The judge's note that the 28-site total should not be kept is right: it is 35, and §10 item 3 says
which rows were not re-read.
