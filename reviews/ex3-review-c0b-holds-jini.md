REVIEW r62t-rev-ex3 COMPLETE

Reviewed both Jini branches against `origin/integ/merge-13-2026-11-22`, using Tovu `41e948ee4a` for source comparisons. This was a read-only review. Test and mutation runs cited below come from the builder reports.

## `codex/ex3-c0b-jini` — FIX

The ten DTOs match Tovu’s wire shapes. `AdminSiteKeyState` inlines the same five literals, so the contract satisfies XP4. The universal export triple, API baseline, and Core patch changeset match the addition. The compile fixture catches the specified mutation because removing a status variant invalidates its exhaustive `Record`.

1. `packages/core/src/__tests__/site-key.unit.test.ts:93` — Add a compile-time assertion that `hex` is absent from the `keyof` of each non-reveal response DTO. Adding `hex?: string` to `AdminGeneratedSiteKey` currently leaves both the fixture and the runtime assertions green. Use that addition as the mutation for this assertion.
2. `cloud-results/ex3-c0b-jini.md:34` — Correct the C5.T/R6.T handoff to require type equality between `AdminSiteKeyState` and `(typeof ADMIN_SITE_KEY_STATES)[number]`, alongside the existing runtime comparison with the server union. The suggested `satisfies` check only validates values already in the host tuple and misses a new Core state that the tuple omits.

## `codex/ex2-holds-jini`

### RT-1 · Retire `@jini-ai/sqlite` — FIX

The workspace, lockfile importer, API baseline, and four injection exceptions are gone. I found zero live Jini or Tovu consumers of the retired package. Every former public symbol still resolves through an owner entry. The fixed-group major recorded on `@jini-ai/db` is a workable way to carry the retirement in Changesets.

1. `.changeset/rt1-retire-sqlite.md:13` — Include the exact type owners from the deleted barrel. `ChatSessionMode` comes from `@jini-ai/chat/store/legacy`, and `ToolCatalogEntry` and `ToolCatalogSearchHit` come from `@jini-ai/registry/tool-catalog`. Keep the SQLite entries in the migration note for their runtime exports.
2. `packages/capability-providers/src/unsafe-reference/db.ts:9` — Replace the chat-store example with `SqliteDbProvider` from `@jini-ai/capability-providers/adapters/sqlite`. The current replacement exports a chat store. The sibling adapter implements the `DbProvider` interface referenced by this comment.

### RT-2 · Retire `@jini-ai/infra/db` shims — FIX

The database sources, exports, type aliases in `typesVersions`, optional peer, lockfile entry, and injection exception are gone. The Infra major changeset maps every removed symbol. The outbox export and its API baseline match the base. Restoring either shim export trips the manifest and physical-install checks. The separate test for eventual removal of the entire Infra workspace has the same reported failures on base and head.

1. `scripts/__tests__/injection-exceptions.q2.test.ts:45` — Assert an `L5-injected-edge` on `packages/infra/src/db/sqlite/index.ts` for `@jini-ai/db/sqlite` with kind `export-from`. The current `found.length` assertion can pass on the independently forbidden manifest peer even when the scanner misses the shim’s re-export.
2. `packages/db/src/core/ports.ts:10` — Point the driver-neutrality comment to `@jini-ai/db/core`. Preserve the explanation of the R12 check and remove the obsolete shim recommendation.
3. `cloud-results/ex2-holds-jini.md:27` — Record the complete Tovu consumer inventory below. There are zero consumers of the removed DB shims. Tovu’s root `package.json:153` declares Infra for the retained outbox, used by these six files under `apps/website/src/`:

   - `contracts/core/events/enqueue-only-outbox.ts:2`
   - `contracts/core/events/jini-outbox-adapter.ts:3`
   - `contracts/core/events/outbox-drainer.ts:3`, `:32`, `:34`
   - `contracts/core/events/outbox-retry-policies.ts:2`
   - `contracts/core/events/outbox-worker.ts:3`, `:33`, `:44`, `:56`
   - `server/runtime/composition/__tests__/form-delivery-vertical-slice.integration.test.ts:9`

### C-contracts-core-1 · Held vocabulary and guard — FIX

The union and frozen array match Tovu verbatim. The Core root subpath keeps the runtime value outside `src/contracts` under XP4, and its two-symbol API baseline matches. The freeze assertion catches removal of `Object.freeze`. The proposed Tovu regex accepts the new exact specifier and rejects the three known-bad cases: a private redeclaration, a different import, and a look-alike subpath. Apply it with the two Tovu import repoints and deletion of the local declaration.

1. `.changeset/core-extension-capability-vocabulary.md:2` — Change `@jini-ai/core` from `minor` to `patch` to follow P9 §1’s extraction changeset rule.

### C026 · Vendor neutrality — APPROVE for Jini

C026 remains open in Tovu. The three current hits in `apps/website/src/features/agent-plugins/bundled-catalog.ts:47`, `:48`, and `:57` are host inventory. Add those exact `path:text` entries to `apps/website/src/features/api-connections/__tests__/vendor-neutrality.test.ts:52`. In `apps/website/src/features/api-connections/shared-owner.ts:81`, change “Picker projection” to “Label projection.” That hit is generic wording, and the guard can keep detecting `picker` elsewhere.
