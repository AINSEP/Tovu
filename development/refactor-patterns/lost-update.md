# Refactor pattern: lost updates (whole-record saves with no version check)

## Problem
Whole-record saves (PUT routes, `*_update`/`*_set` tools, full-row Kysely upserts) write whatever the caller sent over whatever is stored.
Two editors, or a person and the assistant, silently overwrite each other; nobody is told.
Posts, pages, entries, menus and content types already fixed this with a `version` integer + `expectedVersion` + `409 VERSION_CONFLICT`; everything else did not.

## Rule
Every save of a record a person or the assistant edits carries the version the editor read. The server writes only if the stored version still equals it (one conditional UPDATE, never read-then-write), bumps the version by 1, and otherwise refuses with `409 VERSION_CONFLICT` and a plain-words message. Clients never silently retry; they show the conflict and let the person reload. Exempt sites are only those matching the exemption rule below.

## Mechanism (already built — use it, never re-implement)
Jini `@jini-ai/core/optimistic-concurrency` (Jini clone `/Users/la/Programming/jini-terra-w3-db`, branch `w3-db-main`, commit 64619ab41 on top of `main-071` = Jini origin/main f6fa96ae3, 0.7.1 — the base Tovu uses; `packages/core/src/optimistic-concurrency.ts`). Never use the clone's stale branch `w3-db` (2026-10-20 base):
- `class RecordVersionConflictError extends Error` — `new RecordVersionConflictError({ recordKind, recordId, expectedVersion, currentVersion }, { cause }?)`; `code = "VERSION_CONFLICT"`; message: "This <kind> was changed by someone else after you opened it (you had version N, it is now version M). Nothing was saved. Reload it to see the latest version, then make your change again."
- `parseExpectedVersion({ value }, { field }?) → number | undefined` — HTTP bodies; absent = not sent; malformed = `ToolInputError` (400).
- `requireExpectedVersion({ value, readToolId }, { field }?) → number` — tools; missing = `ToolInputError` naming the read tool.
- `assertVersionedWrite({ changedRows, recordKind, recordId, expectedVersion, readCurrentVersion }) → Promise<void>` — call right after the conditional UPDATE.
- `versionConflictBody({ error }) → { error, code: "VERSION_CONFLICT", details: { recordKind, recordId, expectedVersion, currentVersion } }` — the 409 body.
- `versionConflictRule({ readToolId }) → ModelFacingErrorRule` — put FIRST in the domain's model-facing error list.
- `fromSettingsRevisionConflict({ error, setting }) → unknown` — turns the settings ledger's `SettingsRevisionConflictError` into `RecordVersionConflictError` (`recordKind: "setting"`, `recordId: setting`, cause kept); any other error comes back unchanged, so `catch (error) { throw fromSettingsRevisionConflict({ error, setting: "site.seo.title" }); }`.

Jini `@jini-ai/core/settings` ALREADY ships this (main `packages/core/src/settings/write-service.ts:312` `assertExpectedRevision`, called at :383 in `set` and :490 in `clear`; also in the published 0.7.0 Tovu has installed): `set(required, { expectedRevisionSeq })` / `clear(required, { expectedRevisionSeq })` compare the addressed layer's value-row `seq` (no row = 0, a cleared row keeps its seq) after `appendRevision` takes the ledger lock, and throw `SettingsRevisionConflictError { expectedRevisionSeq, actualRevisionSeq }` (message is not plain words — always pass it through `fromSettingsRevisionConflict`). Tovu's settings `set` (`apps/website/src/features/settings/site-title-write.ts:50`) already forwards `SettingsValueWriteOptions`. Do NOT add a second check.

Tovu migration `0042_optimistic_concurrency_versions` (commit 50253e2d1) added `version integer NOT NULL DEFAULT 1` to: `webhook_subscriptions`, `external_mcp_servers`, `identity_users`, `roles`, `policies`, `workspaces`. Every other FIX table already has `version`. Terra never writes migrations.

Admin (already exists): `apps/admin/src/lib/version-conflict.ts` — `isVersionConflict(error)`, `VERSION_CONFLICT_MESSAGE`.

Why version (not updated_at or a content hash): it is what 9 tables and every existing client already use; `updated_at` collides inside one millisecond and depends on clocks; a hash needs the whole row re-serialized identically on two dialects. Why a body field `expectedVersion` (not `If-Match`): every existing arm uses it, and tools have no headers.

Rollout order: Jini core release with the two subpaths (from `w3-db-main`) → Tovu bumps `@jini-ai/core` → Tovu sites. Until then Tovu tests run with the resolver shim described under Verify; `tsc` cannot see the two new subpaths until the bump, so Tovu type-checks wait for it.

## Decision table (Terra: find the row that matches, apply exactly that shape)

### V1 L-REPO-CAS — repo upsert/UPDATE of an editable row (table has `version`)
Port: `save(record: R): Promise<void>` → `save(record: R, optional?: { expectedVersion?: number }): Promise<void>` with the doc line "Upsert without `expectedVersion` (create/import); with it, a compare-and-set that throws `RecordVersionConflictError`…".
SQL repo, before:
```ts
async save(record: R): Promise<void> {
  const row = toRow(record);
  await this.kernel.run((db) => db.insertInto("t").values(row).onConflict((oc) => oc.column("id").doUpdateSet(withoutId(row))).execute());
}
```
after:
```ts
async save(record: R, optional: { expectedVersion?: number } = {}): Promise<void> {
  const row = toRow(record);
  const { expectedVersion } = optional;
  if (expectedVersion !== undefined) {
    // One conditional UPDATE, not read-then-write: two editors that read the same version cannot both land.
    const result = await this.kernel.run((db) => db.updateTable("t").set(withoutId(row))
      .where("workspace_id", "=", record.workspaceId).where("id", "=", record.id)
      .where("version", "=", expectedVersion).executeTakeFirst());
    await assertVersionedWrite({ changedRows: result.numUpdatedRows, recordKind: "<plain noun>", recordId: record.id, expectedVersion,
      readCurrentVersion: async () => (await this.findById({ workspaceId: record.workspaceId, id: record.id }))?.version ?? null });
    return;
  }
  /* unchanged upsert */
}
```
Memory twin: before `upsertRecord(...)`, if `expectedVersion !== undefined`, find the current row and `await assertVersionedWrite({ changedRows: current?.version === expectedVersion ? 1 : 0, …, readCurrentVersion: async () => current?.version ?? null })`.
Service layer: the caller that builds the record sets `version: existing.version + 1` and passes `{ expectedVersion: <the version the editor sent> }` (from the route/tool), NOT `existing.version` read on the server — a server-side read only closes the race inside one request, not between two editors.
Worked example: `apps/website/src/features/members/repo.ts` `SqlMemberTierRepo.save` + `repo.memory.ts` (commit 2f4c4d24a).
If the record TYPE lives in Jini and lacks `version: number` — on main none of these has it: `@jini-ai/user-management` `UserRecord`/`RoleRecord`/`PolicyRecord` (`packages/user-management/src/core/types.ts:59/90/104`), `@jini-ai/integrations` `WebhookSubscriptionRecord` (`packages/integrations/src/webhooks/types.ts:20`), `@jini-ai/cms` `WorkspaceRecord` (`packages/cms/src/workspace/create.ts:26`): add `version: number` to the Jini type and its row mappers in the Jini job first (Batch J), then the Tovu repo in Batch T. Never cast to add it.

### V1b — table has `version` but the existing save uses a weaker guard (`version <= record.version`)
Do not change the existing predicate. Add the `expectedVersion` branch exactly as V1 above, ahead of it.

### V2 L-SETTINGS — write stores one settings-registry value (`setting_values_*`)
Read side returns the value row's `seq` as `revisionSeq` (unset = 0). Write side passes it and bridges the error: before `await set({ deps, input })` → after `try { await set({ deps, input }, { expectedRevisionSeq }); } catch (error) { throw fromSettingsRevisionConflict({ error, setting: `${input.namespace}.${input.key}` }); }`. Routes/tools then handle only `RecordVersionConflictError` (V3/V4 shapes). When one save writes several keys (comments settings, SEO settings), the read returns `revisions: { "<key>": seq, … }` and the save passes each key's seq to its own `set` call, all inside ONE `repo.transaction`, so a conflict on any key writes none. HTTP field name: `expectedRevisions` (object key → integer), each parsed with `parseExpectedVersion({ value }, { field: "expectedRevisions.<key>" })`. Tool field name: same, required.

### V3 L-HTTP-PUT — Express PUT route replacing an editable record
before:
```ts
app.put(path, async (req, res) => {
  try { const saved = await updateX({ deps, input: { ...fields } }); res.json({ x: toResponse(saved) }); }
  catch (error) { sendAdminFailure({ res, error }, { operation, code: "INTERNAL_ERROR" }); }
});
```
after:
```ts
app.put(path, async (req, res) => {
  try {
    const expectedVersion = parseExpectedVersion({ value: (req.body ?? {}).expectedVersion });
    const saved = await updateX({ deps, input: { ...fields } }, expectedVersion === undefined ? {} : { expectedVersion });
    res.json({ x: toResponse(saved) }); // toResponse MUST include `version`
  } catch (error) {
    if (error instanceof ToolInputError) { res.status(400).json({ error: error.message, code: "VALIDATION_ERROR" }); return; }
    if (error instanceof RecordVersionConflictError) { res.status(409).json(versionConflictBody({ error })); return; }
    sendAdminFailure({ res, error }, { operation, code: "INTERNAL_ERROR" });
  }
});
```
The matching GET response must include `version`. Keep `expectedVersion` OPTIONAL on HTTP (absent = old last-write-wins, so API-key clients do not break); the admin always sends it (V5). If the route already catches `ToolInputError`/`*ValidationError` as 400, reuse that branch.

### V4 L-TOOL — assistant write tool replacing an editable record
1. Input schema: add `expectedVersion: { type: "integer", minimum: 0, description: "The record's `version` from <readToolId>. Required." }` and add it to `required`.
2. Handler: `const expectedVersion = requireExpectedVersion({ value: input.expectedVersion, readToolId: "<readToolId>" });` and forward `{ expectedVersion }`.
3. The read/list tool named in the prompt must return `version` on each record (add it to the tool view if missing).
4. The domain's model-facing error list: insert `versionConflictRule({ readToolId: "<readToolId>" })` as the FIRST entry.
5. Tool description: append " Pass expectedVersion from <readToolId>; if someone changed it since, nothing is saved and you must re-read."

### V5 L-ADMIN — admin screen that saves the record
Send `expectedVersion: loaded.version` in the PUT body (settings: `expectedRevisions`). On error: `if (isVersionConflict(error))` show `t(VERSION_CONFLICT_MESSAGE)` in the screen's existing error banner with two actions — "Reload" (refetch, drops local edits only when clicked) and the banner's existing "Copy details" (`error.body` JSON). Keep the person's unsaved edits on screen. After a successful save, store the returned `version` as the new basis. NEVER retry the save automatically.

### V6 EXEMPT — leave the code alone
Exactly the codes listed per site in the Terra prompt. For a site the prompt does not list, use the rule below.

## Exemption rule (only these; otherwise FIX)
- E1 system-owned row: written only by server code (queues, leases, delivery state machines, run ledgers, outbox, search indexes, watermarks, migration journal, publish runs/baselines, oauth pending, gated tokens, retention purges, telemetry).
- E2 single-field set: the write sets exactly one user-meaningful field (plus timestamps/actor/version) whose new value does not depend on the old (enable/disable, publish/unpublish, status flip).
- E3 per-person private row: keyed by the signed-in person's own id (user-scope setting values, MFA, passkeys, sessions, own chat messages).
- E4 opaque secret replacement: a credential the person re-enters whole, nothing else in the write.
- E5 content-addressed or idempotent: key derived from content (sha) or an identical retry writes an identical row.
- E6 create-only: inserts a new server-generated id; the conflict branch only fires on a retry of the same create.
- E7 already guarded: an `expectedVersion`/`expectedRevisionSeq` compare already happens on this path (cite it).

## Do NOT
- Read the row, compare in JS, then write (race). Always the conditional UPDATE / `set(…, { expectedRevisionSeq })`.
- Retry a conflicted save, merge silently, or fall back to an unguarded save on conflict.
- Make `expectedVersion` required on HTTP; make it optional on tools.
- Compare against a version the server read in the same request instead of the editor's.
- Add `as any`, `!`, `eslint-disable`, or a cast to add `version` to a type.
- Write or edit a migration; delete existing "why" comments (move them with the code).
- Show a generic "save failed": the conflict message is the plain-words one above, with "Copy details".

## Verify a site is fixed
1. A regression test (written FIRST, run, seen RED): two editors read version 1; first save with `{ expectedVersion: 1 }` lands; second with `{ expectedVersion: 1 }` rejects with `RecordVersionConflictError`, `currentVersion: 2`; stored value is the first editor's. For SQL repos use `describeEachDialect` (sqlite + pglite) and run the memory twin through the same body. Template: `apps/website/src/features/members/__tests__/tier-repo.lost-update.test.ts`.
2. Routes: one test that a stale `expectedVersion` gets `409` with `code: "VERSION_CONFLICT"` and a malformed one gets `400`. Tools: missing `expectedVersion` → input error naming the read tool; stale → message containing "NOT applied".
3. Mutation: delete the `.where("version", "=", expectedVersion)` line (V2: drop the `{ expectedRevisionSeq }` argument) and confirm the test goes RED; restore.
4. Run only that file: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 <file>`. Until Jini is published, add `--import <shim>/jini-clone-register.mjs`: it maps ONLY the two new subpaths to the Jini clone's `packages/core/src` on branch `w3-db-main` (it throws if the clone is on any other branch), and loads their relative core siblings (`ToolInputError`, settings errors) from the installed package's `dist` so `instanceof` works across Tovu and the shimmed files. Full text in the Terra prompt.

## Status / remaining (2026-11-13)
Done: Jini mechanism on main (`w3-db-main` 64619ab41; tests + mutation; settings CAS is main's own, red-checked by removing its call), migration 0042, example V1 (member tiers, re-run green on the main-based shim). Not done: a V3/V4/V5 example end-to-end (route + tool + admin) — the first Terra batch item (external MCP servers) is the pilot; review it before releasing the rest. Jini release of the two subpaths, then the Tovu bump.
