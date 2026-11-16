# Stop lost updates — design (hard item #8)

Date: 2026-11-16. Docs only; no source was edited.
Code read at: Tovu `origin/integ/wave-b-r2` @ `65302ee5`, Jini `origin/integ/wave-b-r2` @ `02edbb68`.
Input: `design-inputs/lost-update.tsv` (97 sites, audit of 2026-11-11). Per-site verdicts: `SITES.tsv`.
Personas: software-architect (lead), database, programmer, tdd.

## 1. Answer in short

- **28 of the 97 sites are a real risk.** 13 have no guard at all. 15 have a guard that the caller can
  skip (the version is optional) or that sits in application code before a blind write.
- **9 sites are already guarded** (7 by Wave B, 2 by older domain code). **60 are not lost-update
  bugs**: 27 single-writer or lock-serialised, 14 last-writer-wins on purpose, 19 false positives.
- **The generic mechanism already exists**: `@jini-ai/core/optimistic-concurrency`
  (`packages/core/src/optimistic-concurrency.ts`). This design does not add a second one. It closes
  five gaps in how that module is used and rolls it out to the 28 sites.
- The 28 sites are 17 records: external MCP servers, webhook subscriptions, roles, policies, member
  subscriptions, member consents, member tiers, redirects, posts, entries, content types, taxonomy
  terms, newsletter campaigns, newsletter lists, newsletter subscriptions, media metadata, media
  provider credentials, plugin activations, forms, SEO entry overrides, and three settings groups
  (comments, SEO, assistant).

## 2. What exists today (search for owners first)

### 2.1 The owner: `@jini-ai/core/optimistic-concurrency`

Storage-neutral and server-neutral; imports only core files. Exports:

| Export | Use |
|---|---|
| `RecordVersionConflictError` (`code: VERSION_CONFLICT`) | Plain-words message, `recordKind`, `recordId`, `expectedVersion`, `currentVersion` (`null` = deleted) |
| `assertVersionedWrite({ changedRows, …, readCurrentVersion })` | Finishes `UPDATE … WHERE version = :expected`; reads the live version only on a miss |
| `parseExpectedVersion` / `requireExpectedVersion` / `requireEditorVersion` | Optional basis / mandatory for tools / mandatory for a person's form (428) |
| `versionConflictBody` (409) / `versionRequiredBody` (428) | The HTTP bodies, `{ error, code, details }` |
| `versionConflictRule({ readToolId })` | Model-facing rule: re-read, reapply, resend; never resend unchanged |
| `fromSettingsRevisionConflict` | Maps the settings ledger's `SettingsRevisionConflictError` onto the shared error |

Consumers today (28 import sites): forms, SEO entry overrides, workspace, webhooks (update), member
tiers, theme preview switcher. `requireEditorVersion` and the 428 body have **no consumer** outside
their own unit test.

### 2.2 Version columns

Migration `0042_optimistic_concurrency_versions` added `version integer NOT NULL DEFAULT 1` to
`webhook_subscriptions`, `external_mcp_servers`, `identity_users`, `roles`, `policies`, `workspaces`.
Only `webhook_subscriptions` and `workspaces` are compared anywhere. **`external_mcp_servers`,
`identity_users`, `roles` and `policies` have the column and no code reads it.**

Tables that already had `version`: posts, entries, content types, menus, taxonomies, terms,
redirects, media, members, member tiers / subscriptions / consents, newsletter campaigns, form
definitions / submissions, setting definitions. `plugin_activations.version` is the plugin's version
string, not a revision.

Settings values use the ledger's own per-value `seq` with `set(…, { expectedRevisionSeq })`
(`packages/core/src/settings/write-service.ts:299-326`), compared inside the ledger's lock.

### 2.3 Three strengths of guard are in use — only one is correct

| Strength | Where | Problem |
|---|---|---|
| A. Compare in the `UPDATE`'s `WHERE` | forms, webhooks update, workspace, member tiers, entries (when a basis is passed), commerce payments | Correct |
| B. Compare in application code, then a blind write | posts (`updatePost` → `repo.save`), content types, taxonomy terms, newsletter campaigns | A second writer can land between the compare and the write |
| C. Nothing | the 13 `REAL` rows | Silent overwrite |

### 2.4 Thirteen spellings of the same error

Besides the core class: `PostVersionConflictError`, `VersionConflictError` (entries),
`VersionConflictError` (content types, extends `ToolInputError`), `TaxonomyVersionConflictError`,
`MenuVersionConflictError`, `WidgetVersionConflictError`, `CommentVersionConflictError`,
`SeoConcurrentWriteError`, `EmailTemplateVersionConflictError`, `PageConcurrentEditError`,
`VisitorToolsRevisionConflictError`, `CustomCredentialConcurrentModificationError`,
`NewsletterConflictError`. Wire codes differ too: `VERSION_CONFLICT`, `CONCURRENT_EDIT`,
`EMAIL_TEMPLATES_VERSION_CONFLICT`, `WIDGETS_VERSION_CONFLICT`. Convergence is step S11 and an
owner decision (D5); nothing before S11 depends on it.

### 2.5 Admin UI

`apps/admin/src/lib/version-conflict.ts` owns `isVersionConflict`, `readVersionConflict` and one
message. Posts and pages show a banner with an explicit retry; collections and menus show the
message. Every other editor treats a 409 as a generic failure. It re-declares the string
`"VERSION_CONFLICT"` instead of importing the core constant (the core subpath is marked `universal`).

### 2.6 The open bug: a no-op patch bumps the version

Read, not run: `packages/cms/src/forms/write-service.ts:276-288` builds the next record with
`version: existing.version + 1` and a fresh `updatedAt` whatever the patch holds, then writes. A patch
that changes nothing takes the row from 1 to 2. Every other editor holding version 1 then gets a
conflict for a change that never happened. The same shape is in every service that computes
`version + 1` before comparing content. Fixed in step S0.

## 3. Classes used in `SITES.tsv`

| Class | Count | Meaning |
|---|---|---|
| `REAL` | 13 | Two writers exist in code; the write has no guard |
| `REAL-OPT` | 15 | A guard exists, but the basis is optional and a writer omits it, or the compare is strength B |
| `GUARDED` | 9 | Basis required and compared (7 Wave B; email templates and page HTML use their own spelling) |
| `SAFE` | 27 | One writer, or serialised under a lock, or fenced by a state/lease predicate |
| `LWW-OK` | 14 | Last writer wins on purpose: write-only secret, one selector field, idempotent grant |
| `FP` | 19 | Create-only, derived projection, content-addressed, or fenced in a helper the audit cannot see |

The audit re-run on the current trees gives 90 hits (75 Tovu, 15 Jini); 7 input rows are cleared.
`SITES.tsv` carries both line numbers. Its `verified` column says `read` (the write, its guard and its
callers were read) or `partial` (the row says what was not traced). 44 rows are `partial`.

Found outside the list (the audit skips a `WHERE` that names `version`):
`SqlMemberRepo.save` (`features/members/repo.ts:199-208`) guards with
`members.version <= record.version`. Two writers that both read N and both write N+1 both pass.
It is fixed with the member rows in S4.

## 4. The one mechanism

No new module. The rules below are the contract; `@jini-ai/core/optimistic-concurrency` is the code.

**M1. The compare lives in the write statement.**
`UPDATE … SET …, version = :next WHERE <key> AND version = :expected`, then
`assertVersionedWrite`. An application-level compare may stay in front as an early, cheaper refusal,
but it is never the guard. Upserts (`INSERT … ON CONFLICT DO UPDATE`) are not used for edits:
create is `insert`, edit is the conditional `update`. This is what stops an edit from re-creating a
deleted row.

**M2. Every update names a basis.** The repo port's update takes a required `expectedVersion`. The
service supplies the caller's basis, or, for a server-internal change (a status flip, a webhook from
a payment provider), the version it read in the same call. The blind branch is deleted.

**M3. Who must send a basis.**

| Caller | Rule | On a missing basis |
|---|---|---|
| A person's form (admin UI) | Required: `requireEditorVersion` | 428 `VERSION_REQUIRED` |
| Agent write tool | Required: `requireExpectedVersion({ readToolId })`; the read tool returns `version` | `ToolInputError` naming the read tool |
| Server-internal change (status flip, background job) | The service uses the version it just read | not applicable |
| Other API clients (access tokens) | Owner decision D2 | 428 after a warn-only release |

**M4. Internal single-purpose changes retry once.** A pause, resume, soft delete or provider status
update does not depend on the fields someone else edited. On a conflict the service re-reads,
re-applies the same change and writes again, once. If that also conflicts it throws the conflict. A
person's or agent's edit never retries on its own.

**M5. A no-op writes nothing.** After building the next record and before writing, the service
compares it with the row it read, ignoring `version` and `updatedAt`. Equal means: return the stored
record, no write, no version bump, no `updatedAt` change, no event, no revision row. The basis is
still checked first, so a stale no-op still gets a conflict. One pure helper in the core module:

```ts
/** True when `next` differs from `current` outside the bookkeeping fields. */
export function hasRecordChanged<T extends object>(
  required: { current: T; next: T },
  optional: { ignore?: readonly (keyof T)[] } = {},   // default ['version', 'updatedAt']
): boolean
```

Structural compare of plain JSON records (the services already hold both as plain objects). O(size
of record), no I/O. It has five users on day one (forms, workspace, webhooks, SEO entry, member
tiers), so it is not a one-user abstraction.

**M6. One conflict shape on the wire.** HTTP: `409` with `versionConflictBody`. Tools:
`versionConflictRule`. Settings: `fromSettingsRevisionConflict` first, then the same two.

**M7. New editable tables start with the rule.** A table a person or agent can edit gets `version`
in the migration that creates it, an `insert` and a conditional `update`, and a race test. The
audit's lost-update count is a ratchet in CI: it may not grow (step S10).

### 4.1 How routes carry the basis

Body field `expectedVersion` (integer). Reasons: about twelve routes and the admin client already do
this; tools cannot send headers, so a body field gives one name across HTTP, tools and services; no
cache sits in front of the admin API. `ETag` / `If-Match` is rejected as a second carrier for the
same value (owner decision D1). GET and list responses include `version` on every editable record
(most already do; S1, S3, S9 add it where missing).

Missing basis on a person's save: `428`, body from `versionRequiredBody`. Stale basis: `409`.
Malformed basis (`"3"`, `-1`): `400` from `parseExpectedVersion` — never read as "no basis".

### 4.2 How agent write tools carry it

Unchanged from Wave B: the read tool returns `version`; the write tool's input schema lists
`expectedVersion` under `required`; the handler calls `requireExpectedVersion`; the domain's
model-facing rules include `versionConflictRule({ readToolId })`. The guidance already tells the
model to re-read, reapply and resend, and to ask the person when the two changes disagree.

### 4.3 Settings groups

Comments, SEO and assistant settings are N values in the ledger, one `set()` per changed field.
The GET returns `revisions: { <field>: seq }`. The PUT / tool sends `expectedRevisions` for the
fields it changes. Each `set()` passes its own `expectedRevisionSeq`; the ledger already compares it
under its lock, so there is no extra read. Two people changing different fields both succeed; the
same field conflicts. All N sets must be one transaction (SEO's comment says all-or-nothing;
comments was not verified — S8 pins it with a test). Alternative: one group revision (owner
decision D3).

### 4.4 What the person sees

One shared notice replaces per-editor copy. It is built on `lib/version-conflict.ts`, which gains
the 428 case and the record-kind fields.

On a 409 the editor fetches the latest record and compares field by field with the copy it loaded.
The notice says, in plain words:

> **Someone else changed this webhook while you were editing.** They changed: Label, Target URL.
> Your changes were not saved and are still on this screen.
> [Keep editing] [Load their version] [Copy details]

- "They changed" lists field labels from the form's own schema, never values.
- **Copy details** gives pasteable text: record kind, record id, your version, current version,
  changed field names, time, request id. No field values, so it is safe to paste into a ticket.
- **Load their version** discards the local edits after a confirm.
- If the record was deleted (`currentVersion: null`): "This webhook was deleted while you were
  editing. Copy anything you want to keep."
- On a 428: "This page is out of date. Reload, then make your change again."
- Later, when the fields the person changed and the fields the other writer changed do not overlap,
  a fourth button "Save my changes on top" resends the dirty fields with the new version (owner
  decision D4; not in the first rollout).

Posts and pages keep their existing banners until S11.

### 4.5 Migrations

One additive ADR-066 step, `0043_optimistic_concurrency_versions_2`, same form as 0042 (constant
default, no row rewrite on SQLite or Postgres 11+, shared with the fresh-database bootstrap):

| Table | Column | Note |
|---|---|---|
| `newsletter_lists` | `version integer NOT NULL DEFAULT 1` | |
| `newsletter_subscriptions` | `version integer NOT NULL DEFAULT 1` | |
| `plugin_activations` | `revision integer NOT NULL DEFAULT 1` | `version` is taken by the plugin version (D6) |
| media provider credentials table | `version integer NOT NULL DEFAULT 1` | Only if S9 finds a whole-map replace; table name not verified |

No backfill. Rollback: the columns are unused until the repo step lands, so the migration can ship
ahead. DDL stays in Tovu: the host owns its tables even when the repo file moves to Jini (the moved
repos take table names from the host).

## 5. Tests: a two-writer race per site, proven red today

Seam that exists: `describeEachDialect` (`packages/cms/src/forms/__tests__/support/dialect-matrix.fixture.ts`)
runs the same cases over the in-memory repo and the SQL repo; `repo.lost-update.test.ts` beside it is
the precedent. Runner: `npm --prefix packages/<pkg> run test` (vitest). Tovu's website runner command
was not verified.

Three test shapes, all through ports and fakes of ports (no `vi.mock` of another package):

**T1 stale editor (every `REAL` / `REAL-OPT` row).** Read twice. Writer 1 saves change X. Writer 2
saves change Y with the basis it read. Assert: writer 2 rejects with `RecordVersionConflictError`,
`expectedVersion` and `currentVersion` equal the two versions, and the stored row still holds X.
**Red today**: writer 2 resolves and X is gone.

**T2 interleave (server-internal read-modify-write: sites 7, 16, 29, 30, 41, 76).** Wrap the repo
port in a `gateReads` fake whose `findById` waits on a deferred. Start both service calls, let both
read, then release. Assert: both changes are in the stored row (after the M4 retry) or exactly one
call got the conflict; never one change silently missing. **Red today**: the second write restores
the first writer's old fields.

**T3 no-op (every service touched).** Save a patch equal to the stored record. Assert: version,
`updatedAt`, revision rows and emitted events are unchanged; a second editor's save with the old
basis succeeds. **Red today** for forms (1 → 2).

Per test, before the fix lands: run it and paste the failing assertion into the commit message. After
the fix: mutate (delete the `WHERE version` line; make `hasRecordChanged` return `true`) and confirm
the test goes red again. HTTP tests assert status **and** `code` **and** `details`; tool tests assert
the error class and code. Each route also gets: missing basis → 428, `"3"` → 400.

A conformance suite per repo port (memory fake + SQL) includes one deliberately broken adapter (no
`WHERE version`) that must fail it, so the fake cannot drift from the SQL repo.

## 6. Rollout

Order is by damage: credentials and background writers first, content next, settings and
new-column tables last. Each step is one or more commits that compile and pass alone; each lists its
callers. The basis stays **optional on the wire** until S10, so no step breaks an open admin tab.

Move rule: fix a file where it lives when the step runs. The race tests go through the port, so they
move with the repo unchanged. Steps touching a `MOVE` / `MOVE-AFTER` file (see `move_label` in
`SITES.tsv`) run **before** that file's move slice, or the move slice carries the fix; never both
editing the same file in one wave. `LANES.md` was read for order only (waves A–E); per-file lane
overlap (`LANES-files.tsv`) was not checked — the coordinator runs `overlap.py` before dispatch.

| Step | Sites | Repo | What changes | Callers updated in the same commit | Tests red first |
|---|---|---|---|---|---|
| **S0** | none (prerequisite) + fixes §2.6 | Jini core, cms; Tovu | Add `hasRecordChanged`. Apply M5 in forms, workspace, webhooks update, SEO entry, member tiers. | Those five services only; no signature change | T3 ×5 |
| **S0b** | none (prerequisite) | Tovu admin | Shared conflict notice + 428 case in `lib/version-conflict.ts`; import the code constant from core | No editor wired yet | Component tests: 409, deleted, 428, Copy details has no values |
| **S1** | 21, 87 | Tovu | External MCP. Split the writer: OAuth callback/refresh writes only the OAuth columns, fenced on the secret id it replaced; `saveExternalMcpServer` does the conditional update. Route parses `expectedVersion`, maps 409. GET returns `version`. Admin form sends it. | `put.ts`, OAuth callback, token refresh, `external-mcp/tool-registrations.ts`, admin MCP form, memory repo | T1; T2 refresh-vs-PUT |
| **S2** | 76 | Jini integrations, Tovu | Webhook pause / resume / delete use the read version as basis with one retry (M4). | `subscriptions.ts` (both repos), `integrations/pause.ts`, tool handlers, memory fixtures | T2 pause-vs-update |
| **S3** | 16, 29, 30 | Jini user-management, Tovu | `updateRole` / `updatePolicy` run inside `inAuthorizedIdentityTransaction`, as `updateUser` does, so read and write are under the `identity:<ws>` lock. No client basis: these are field patches. | The two services; no port change | T2 ×2 |
| **S4** | 40, 41, 44 + `SqlMemberRepo.save` | Tovu | Subscriptions and consents: conditional update on the read version, M4 retry for provider events. Tiers: basis always passed. Members: `<=` becomes `=` with the read version. | `members/write-service.ts` (5 saves), `consent-service.ts` (3), `password-auth.ts`, `member-login/link-service.ts`, `unlink-identity.ts`, provider webhook handler, memory repos | T1 ×3; T2 webhook-vs-admin |
| **S5** | 7 | Jini cms | Redirects: `save` becomes insert + conditional update; `updateRedirect` accepts a basis; slug-change capture uses M4. | `redirects.ts`, `capture.ts`, `repo.memory.ts`, Tovu redirect routes and tools | T1; T2 capture-vs-edit |
| **S6** | 18, 20, 45, 49, 61 | Tovu, Jini cms | Move the compare into the `WHERE` (strength B → A) for posts, content types, taxonomy terms, campaigns; entries pass a basis on every update. Each domain keeps its own error class and wire code for now. | The five repos, their memory fakes, `updatePost` + autosave + scheduled publish, cms write-services | T1 ×5; T2 scheduled-publish-vs-editor |
| **S7** | 6, 88, 89, 94 | Tovu, Jini cms | Forms update route and SEO entry route read the basis; admin form editor and SEO panel send it; delete the dead blind branch in `forms/sql/repo.ts`. | `forms/update.ts`, `forms/authoring.ts`, `seo/put-entry.ts`, admin form and SEO hooks, `repo.memory.ts` | T1 ×3 over HTTP |
| **S8** | 17, 53, 84, 86, 95 (and 55–57 need no change) | Tovu | Settings groups per §4.3. | `comments/settings.ts`, `seo/settings.ts`, assistant settings service, three PUT routes, three GETs, two tools, admin settings forms | T1 same-field ×3; different-fields-both-land ×3; all-or-nothing |
| **S9** | 14, 46, 47, 69, 90 | Tovu, Jini plugins | Migration 0043 first, alone. Then one commit per record: newsletter lists, newsletter subscriptions (unsubscribe uses M4 and must win over a stale admin save), plugin activations, media metadata, media providers (only if confirmed). | Per record: repo, memory fake, service, route, tool, admin editor | T1 ×5; T2 unsubscribe-vs-admin |
| **S10** | all | both | Contract: person saves use `requireEditorVersion` (428); repo ports take a required `expectedVersion` (`update(required: { record, expectedVersion }, optional = {})`); blind branches deleted; audit lost-update count pinned in CI. | Every port, fake and caller of S1–S9 | 428 per route; conformance broken-adapter |
| **S11** (optional, D5) | 19, 91 + §2.4 | both | Converge the 13 error classes and 4 wire codes on core. Wire-code changes are a compatibility break for API clients. | All classifiers in admin, all model-facing rule lists | Contract tests on codes |

Admin editors are wired to the shared notice in the step that covers their record.

Not changed, on purpose: the 27 `SAFE`, 14 `LWW-OK` and 19 `FP` rows. Commerce catalog saves (10–12)
are create-only today and are covered by M7 and the ratchet.

## 7. Estimate

| Step | Size | Step | Size |
|---|---|---|---|
| S0 | 0.5 day | S6 | 2 days |
| S0b | 1 day | S7 | 0.5 day |
| S1 | 1.5 days | S8 | 1.5 days |
| S2 | 0.5 day | S9 | 2.5 days |
| S3 | 0.5 day | S10 | 1 day |
| S4 | 1 day | S11 | 1.5 days (optional) |
| S5 | 0.5 day | | |

About 13 working days without S11, roughly 11 agent lanes. S1–S5 can run in parallel after S0
(disjoint files); S6–S9 in parallel after that; S10 is last and serial. These are estimates from
reading the code, not from a spike.

## 8. Owner practices — checked one by one

| # | Practice | Result |
|---|---|---|
| 1 | DI via typed ports from the host | Kept. Repos stay behind their ports; no new global. |
| 2 | Args `(required, optional = {})` | New helper follows it. **Conflict:** existing ports are `update(record, optional?)`; S10 changes them to `update(required, optional = {})`, a port change done per repo with its fake and callers. |
| 3 | Functions ≤ 50, files ≤ 500, complexity ≤ 10 | **Not measured per function.** Known file sizes: `identity/repo.ts` 710, `media-repo.ts` 719, `forms/tool-registrations.ts` 660, `newsletter/repo.ts` 644, `members/repo.ts` 604 are already over 500; steps add about 6 lines per repo method. Size splits are a separate item and must not be mixed into these commits. |
| 4 | Feature slicing | Each step stays in its feature folder; the shared part is the core module. |
| 5 | No barrels / forwarders | None added. Admin imports the constant from core directly. |
| 6 | Why-comments move with code | The comments on blind branches are deleted with the branches in S10; the reason goes to the conditional update. |
| 7 | Generic → Jini; a Jini package imports itself + core + protocol | Helper lives in core. No `@jini-ai/db` helper is added (cms importing db would break this rule); the six-line conditional update stays inline per repo. |
| 8 | Tests: fakes of interfaces, red first, mutate | §5. |
| 9 | Errors: plain words, what changed, what to do, pasteable redacted details | §4.4. The server message already says what to do; "what changed" is the field list the editor computes. |
| 10 | No new disables; no silent behaviour changes | **Behaviour changes, all named:** a no-op save no longer bumps the version or `updatedAt` (S0); a stale save now fails where it used to win (every step); a save without a basis fails with 428 (S10). |
| 11 | Smallest change; reuse first; no one-user abstraction | No new module; one new function with five users; the settings ledger's own compare is reused. |
| 12 | Memory / IO on hot paths | Success path: zero extra reads (the compare is in the `WHERE`). Conflict path: one read. M4 retry: one read + one write, only on conflict. M5: one in-memory compare and it removes a write. Settings: no extra read. |

## 9. Lessons for design briefs — how each is met

| Lesson | Here |
|---|---|
| Inventory every site and caller | `SITES.tsv` has all 97; §6 lists callers per step. 44 rows are `partial` and say what was not traced. |
| Migration graph, each commit green alone | §6: prerequisites S0 / S0b / migration 0043; basis optional on the wire until S10. |
| Tests that can fail | §5: each shape states what fails today; mutation check required. |
| Measure owner limits | Not done per function (§8 row 3) — flagged, not claimed. |
| Generic vs host binding; existing owner first | The owner was found (§2.1); routes and DDL stay in Tovu. |
| Behavioural port compatibility | Port signature changes only in S10, with fakes and a broken-adapter check. |
| Optional values and domain errors stay distinct | Missing (428), malformed (400) and stale (409) are three outcomes. |
| Untangle lanes are prerequisites | Move rule in §6; file-level lane overlap not checked. |
| Verify seams and commands exist | The cms dialect matrix and `npm --prefix packages/cms run test` were read; the Tovu website runner was not. |

## 10. What I could not verify

1. Nothing was run except the read-only audit script. No test was executed; "red today" is from reading code.
2. 44 rows are `partial`. The ones that could change a verdict: plugin activations (14, callers), media
   providers (90, whether the save merges per provider), media metadata (69, any service-level check),
   comments settings (17, whether the N sets are one transaction and what the form sends),
   newsletter campaigns (45, whether `campaignRepo.transaction` takes a lock), `updateRole` (29, body
   not read), commerce ledger attempt/refund/dispute patches (13), chat legacy store wrapping (1, 97).
3. Postgres behaviour: the conditional update is dialect-neutral, but strength-B windows are wider
   under Postgres read-committed than under SQLite's single writer. No Postgres run was done.
4. Whether any non-browser client (access token) calls the affected PUT routes today (matters for D2).
5. Function length and complexity inside the touched files.
6. `untangle/DESIGN.md` and `LANES-files.tsv` were not read; lane order came from `LANES.md` only.
7. `LESSONS-FOR-DESIGN-BRIEFS.md` on `plan/size-designs-2026-11-16` holds 11 rules, not the 15 the brief names.
8. The audit's own blind spot: a `WHERE` that mentions `version` clears a row even when the compare is
   weak (members). Other weak guards of that kind may exist.

## 11. Owner decisions

| # | Decision | Recommendation |
|---|---|---|
| D1 | Carrier: body `expectedVersion` or `If-Match` | Body field (already the convention; tools cannot send headers) |
| D2 | Non-browser API clients without a basis | One release that logs, then 428 for everyone |
| D3 | Settings groups: per-field revisions or one group revision | Per-field (no extra read; different fields both save) |
| D4 | Conflict UI now: keep / load theirs / copy details; "save on top" later | Yes, in that order |
| D5 | Converge 13 error classes and 4 wire codes (S11) | Yes for classes; keep old wire codes accepted for one release |
| D6 | `plugin_activations`: new column `revision` | Yes |
| D7 | Write-only secret PUTs and single-selector PUTs stay last-writer-wins | Yes |
| D8 | Internal status flips retry once on conflict (M4) | Yes |
| D9 | Commerce catalog saves: leave as create-only upserts under the ratchet, or split `insert` now | Leave; revisit with the first edit feature |
