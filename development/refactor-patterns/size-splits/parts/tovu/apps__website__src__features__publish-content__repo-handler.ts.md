### tovu:apps/website/src/features/publish-content/repo-handler.ts
- **Over:** `createRepoPublishHandler` 176 · nested `build` 142 (file 252, under)
- **Phase:** after-move (MOVE-AFTER type-registry generation) · **Batch:** size-50
- **Tests:** `apps/website/src/features/publish-content/__tests__/repo-handler.test.ts`, `apps/website/src/features/post/__tests__/publish-content.characterization.test.ts`, `apps/website/src/features/media/__tests__/publish-content.characterization.test.ts`, `apps/website/src/features/navigation/__tests__/publish-content.characterization.test.ts`, `apps/website/src/features/redirects/__tests__/publish-content.characterization.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `FieldDisposition`, `ErrorClass`, `RepoWriteContext`, `RepoWriteResult`, `RepoPublishTypeConfig`, `gatewayDeps`, `okOrThrow` | config contract (stay) |
| B | `createRepoPublishHandler` statements `const { entityType, permission } = config;` … `function toRowError(` | derive per-type defaults, field picks, hash, conflict/error mapping |
| C | `build` statements `const ports = () => config.ports(deps);` … `return {` minus `apply` | the per-deps handler (pack/inspect/precheck) |
| D | `build`'s `async function apply(input: {` | the apply-one-row step |

- **Splits:**
  1. HELPER `deriveRepoTypeHelpers<Row, Ports>({ config }: DeriveRepoTypeHelpersInput<Row, Ports>): RepoTypeHelpers<Row>` (module level, above `createRepoPublishHandler`) ← statements from `const { entityType, permission } = config;` through the end of `function toRowError(err: unknown, id: string): unknown {` (~L155-190, incl. the `omitWhenAbsent` doc comment). Returns `{ entityType, permission, portsKey, schemaVersion, dependsOn, idOf, versionOf, packedFields, pick, hashOf, conflict, toRowError }`; new `interface RepoTypeHelpers<Row>` declares those (`hashedFields`/`fieldsWhere`/`omittable` stay internal).
  2. HELPER `createRepoApply<Row, Ports>({ config, helpers, deps, ports, workspaceId }: CreateRepoApplyInput<Row, Ports>): PublishContentHandler["apply"]` (above step 3) ← the `async function apply(input: {` declaration (~L248-330), returned. Its first statement destructures from `helpers` the names it reads (`const { entityType, idOf, versionOf, conflict, toRowError, ... } = helpers;`) so the body is unchanged. If `PublishContentHandler["apply"]` is not assignable, keep the function's own declared signature as the return type.
  3. HELPER `buildRepoPublishHandler<Row, Ports>({ config, helpers, deps }: BuildRepoPublishHandlerInput<Row, Ports>): PublishContentHandler` ← body of `function build(deps: PublishContentDeps)` (~L193-344) with `const apply = createRepoApply({ config, helpers, deps, ports, workspaceId });` in place of the `apply` declaration; opens with the same `helpers` destructure.
  4. `createRepoPublishHandler` becomes: `const helpers = deriveRepoTypeHelpers({ config }); function build(deps: PublishContentDeps): PublishContentHandler { return buildRepoPublishHandler({ config, helpers, deps }); } return { entityType: helpers.entityType, dependsOn: helpers.dependsOn, build, coversTables: config.coversTables, coversRoots: config.coversRoots };`
- **Importers to update:** none (helpers private).
- **After:** file ~265; `createRepoPublishHandler` ~8; `buildRepoPublishHandler` ~62; `createRepoApply` ~80; `deriveRepoTypeHelpers` ~38.
- **Risks / notes:** Generics `<Row, Ports>` must flow through all three helpers (input types are generic interfaces). `pack` is an `async function*` that reads `ports()` lazily — keep `ports` a thunk. `hashOf`'s `config.legacyHashState` call must keep the same argument shape. The type-registry generation move only changes who calls `createRepoPublishHandler`; the split stays valid.
