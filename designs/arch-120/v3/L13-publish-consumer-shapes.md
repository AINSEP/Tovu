# L13 — publish-content consumer shapes (4 edges, S)

- `publish-content/peer-transport.ts:11`, `tool-deps.ts:1`, `tool-registrations.ts:3` import
  `PublishHistoryStore`/`PublishTrigger` from `deployments/static-publish`. `publish-history.ts`
  cannot move down (it references deploy descriptors and `publish-content/peers`). Declare in
  `publish-content/peer-transport.ts` the **recording contract it actually calls**
  (`peer-transport.ts:620-629`, judge 2 #3) as `PublishHistoryRecorder` and the `PublishTrigger`
  literal union; `tool-deps.ts`/`tool-registrations.ts` use that type. Composition passes the real
  store (structural check at the assignment).
- `media/import-media-entity.ts:5` (`MediaSourceReplacement`) → local type of the fields read.

**Characterization (named risk: a peer publish is not recorded / recorded with the wrong trigger):**
`features/publish-content/__tests__/peer-transport*.test.ts` (history rows after push), plus a
`@ts-expect-error` type case: a store missing the recording method is rejected where composition
assigns it.

**Gates:** shared gate, `LANE=L13`.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L13.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L13`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `publish-content/peer-transport.ts` -> `deployments/static-publish/index.ts` [S] PublishHistoryStore,PublishTrigger -> local PublishHistoryRecorder
- `publish-content/tool-deps.ts` -> `deployments/static-publish/index.ts` [S] PublishHistoryStore -> PublishHistoryRecorder
- `publish-content/tool-registrations.ts` -> `deployments/static-publish/index.ts` [S] PublishHistoryStore -> PublishHistoryRecorder
- `media/import-media-entity.ts` -> `publish-content/type-registry.ts` [S] MediaSourceReplacement -> local type

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/media/import-media-entity.ts`
    - prod: features/media/publish-content.ts
    - tests: features/media/__tests__/import-media-entity.render.test.ts, features/media/__tests__/import-media-entity.rethrow.test.ts, features/media/__tests__/import-media-entity.test.ts
- `features/publish-content/peer-transport.ts`
    - prod: features/publish-content/composite-blob-source.ts, features/publish-content/publish-tool.ts, features/publish-content/pull.ts, features/publish-content/push-plan.ts, features/publish-content/tool-registrations.ts, features/site-backup/share-hosting.ts, server/inbound/admin-http/routes/publish-content/backstop.ts, server/inbound/admin-http/routes/publish-content/peer-transport.ts
    - tests: features/publish-content/__tests__/peer-transport-blob-pull.test.ts, features/publish-content/__tests__/peer-transport.l061.test.ts, features/publish-content/__tests__/peer-transport.test.ts, features/publish-content/__tests__/plan-pull-tool.test.ts, features/publish-content/__tests__/publish-guards.characterization.test.ts, features/site-backup/__tests__/share-delivery.integration.test.ts, features/site-backup/__tests__/share-hosting.unit.test.ts, server/__tests__/routes/publish-zero-setup-end-to-end.test.ts, server/inbound/admin-http/routes/publish-content/__tests__/peer-transport.routes.pins.test.ts
- `features/publish-content/tool-deps.ts`
    - prod: features/publish-content/publish-tool.ts, features/publish-content/tool-registrations.ts
    - tests: 
- `features/publish-content/tool-registrations.ts`
    - prod: assistant/tool-registrations.ts, features/publish-content/disconnect-tool.ts, server/runtime/composition/tool-catalog-manifest.ts
    - tests: features/publish-content/__tests__/backstop-gaps-tool.test.ts, features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts, features/publish-content/__tests__/plan-pull-tool.test.ts, features/publish-content/__tests__/publish-agent-tools.test.ts, features/publish-content/__tests__/publish-tool.test.ts, features/publish-content/__tests__/pull-tool-fixture.ts
