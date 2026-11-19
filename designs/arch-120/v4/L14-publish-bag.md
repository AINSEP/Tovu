# L14 — publish bag stays in composition (17 edges; S + H + I + D) — one repo (Tovu); Opus executor (generic migration discovered by `typecheck:tests`)

**Root cause:** `publish-content/tovu-publish-ports.ts` is Tovu's product bag (every content type's
ports), but it lives inside the engine feature. Contributors import *up* into it (12 edges), and it
imports *down* into post, media and theme (3 edges). **Coordinator decision:** the bag moves to
`server/runtime/composition/` and stays there. The engine stays generic.

### 1. The bag (H, 3 edges)
`git mv features/publish-content/tovu-publish-ports.ts server/runtime/composition/tovu-publish-ports.ts`.
Every key, doc comment and optionality stays the same: `post` (`repo` required; `forgetRemoved?` and
`remove?` apply-only), `media`, `redirect`, `menu`, `theme-files` (`onReplaced?` and `fileBlobIndex?`),
`form`, `content-type`, `taxonomy`, `term`, `collection-entry`, `widget`, `widget-area`,
`site-setting`, `active-theme`, and `hooks?`. One key is added: `termSync` (§3). The three shared
slice interfaces move to their owners and are imported by the bag:
`TaxonomyPublishPorts` → `taxonomy/publish-content.ts`, `EntryPublishPorts` → `entries/publish-content.ts`,
`WidgetPublishPorts` → `widgets/publish-content.ts`. Exported importers to repoint (prod):
`server/runtime/composition/content-publish-ports.ts`, `server/inbound/admin-http/routes/publish-content/deps.ts`
(server code may import composition, as `deps.ts:3,6` already does).

### 2. Engine generic, default `object` (H)
- `type-registry.ts:80` `PublishContentDeps<TPorts extends object = object>` and `:385`
  `PublishContentContributor<TPorts extends object = object>`. `ports: Partial<TPorts>` (`:109`) is
  unchanged. The default is `object` because the engine never reads a bag field. A caller that
  does read one must name the slice it reads (compile error otherwise). A caller that only passes
  deps through is unchanged.
- `apply-port.ts:22-26` `PublishContentApplyDeps<TPorts extends object>` with `ports: TPorts`.
  `toPublishContentApplyDeps<TPorts>` and `createPublishContentApplyPort<TPorts>` are generic too.
  Both roots instantiate them with `TovuPublishPorts`: `composition/deps.ts:138` and
  `memory-deps/slices/publish-apply.ts:3`. The full bag is still required where apply is wired.
- `tool-deps.ts`: `PublishContentToolSources` (`:22-39`, 16 fields typed `TovuPublishPorts[...]`; no
  feature file reads them — rg on tip: 0 reads) moves to
  `server/runtime/composition/tovu-publish-ports.ts`, next to the bag. `PublishContentToolDeps`
  becomes `PublishContentToolDeps<TPorts extends object = object>` with
  `makePublishContentDeps?: () => PublishContentDeps<TPorts>` and `publishContentPorts?: Partial<TPorts>`.
  The three fields the feature does read get local structural types with exactly the members
  read: `themes` (1 read), `fileBlobIndex` (`FileBlobIndexPort`, already in the feature), `mediaRepo` (1 read).
  The concrete tool deps are `PublishContentToolDeps<TovuPublishPorts> & PublishContentToolSources`.
  They are named once in the composition file and used by `tool-catalog-manifest.ts`.
- **The fallback bag stays and keeps its exact behaviour** (`tool-registrations.ts:441-445`):
  without `makePublishContentDeps`, `ports = { ...(publishContentPorts ?? {}), hooks: { beforeSave: deps.pluginBeforeSaveHook } }`.
  `hooks` is always set and **overrides** any `hooks` inside `publishContentPorts`, and
  `beforeSave` may be `undefined`. Only the type changes (`Partial<TPorts>`).

### 3. Term sync (I + D, 2 edges), nested shapes
- **D:** `TERM_SYNC_PERMISSION` (string constant) and `withTermIds` (pure, generic, no imports)
  move from `taxonomy/publish-term-ids.ts:17,31` to `contracts/core/term-ids.ts`.
  `taxonomy/term-sync.ts:2` stops re-exporting them, and every importer (post, entries, taxonomy
  tests) imports from `contracts/core/term-ids.ts`.
- **I:** `readTermIds` and `prepareTermSync` (state and I/O; they stay in taxonomy) reach post and
  entries as a bound port. Each consumer declares the same local shape:
  ```ts
  type TermSyncPort = {
    read(input: { contentType: string; contentId: string }): Promise<string[] | undefined>;
    prepare(input: { deps: PublishContentDeps; entityType: string; entityId: string; principalId: string; contentType: string; wanted: unknown }):
      Promise<{ readonly apply: () => Promise<void>; readonly revert: () => Promise<void> }>;
  };
  ```
  Composition builds it once per taxonomy object in `content-publish-ports.ts`
  (`buildContentPublishPorts`, `:55`):
  `const termSync = { read: (i) => readTermIds({ ports: taxonomy, ...i }), prepare: (i) => prepareTermSync({ ports: taxonomy, ...i }) }`.
  It returns `termSync` as a new top-level key (like `hooks`, not an entity type, so the registry
  never sees it). `collection-entry.terms` becomes `termSync` in place of the raw `taxonomy`. Because
  `term` and `termSync` come from the same builder, every bag that has `term` has `termSync`.
- **entries** (`entries/publish-content.ts:49-62`): `EntryPublishPorts.terms: TermSyncPort`.
  `readTermIds({ ports: p.terms, contentType, contentId })` → `p.terms.read({ contentType, contentId })`.
  `prepareTermSync({ ports: ports.terms, deps, … })` → `ports.terms.prepare({ deps, … })`. The order
  is unchanged: prepare before `importEntry`, `apply()` after.
- **post** (`post/publish-content.ts:276,285,293,346,384,427`): `PostPorts` becomes
  `PostPublishPorts["post"] & { readonly termSync?: TermSyncPort }`, and line 346 passes
  `termSync: deps.ports.termSync`. When `termSync` is absent, the behaviour is today's
  `ports === undefined` branch: `read` gives `undefined`, and `prepare` is a no-op when `wanted`
  is empty. Otherwise it throws the same `Error` with the same message as
  `publish-term-ids.ts:66-69`, written in post as a 4-line local `absentTermSync`. Its comment
  names the source line.
- The taxonomy contributor keeps reading `ports.taxonomy` and `ports.term` as `TaxonomyPublishPorts`, unchanged.

### 4. Contributors own their slice (S, 12 edges)
Each contributor declares `XPublishPorts`: exactly the bag keys it reads, using its own and Jini
types. It is typed `PublishContentContributor<XPublishPorts>`. Files and keys:
content-types (`content-type`), entries (`collection-entry`), forms (`form`), media and
`media/verify-published-media.ts` (`media`), navigation (`menu`), post (`post`, `termSync`, `hooks`),
settings (`site-setting`), taxonomy (`taxonomy`, `term`) and `taxonomy/publish-term-ids.ts`
(`TaxonomyPublishPorts` now local to taxonomy), `theme/active-theme-publish-content.ts` (`active-theme`),
widgets (`widget`, `widget-area`). Also, since they read the bag and the default is now `object`:
`theme/publish-content.ts` (`theme-files`), `redirects/publish-content.ts` (`redirect`),
`publish-content/raw-file-contributor.ts:52` (`media`: local subset).
**Registration is the completeness check:** `server/runtime/composition/publish-content-manifest.ts`
registers `PublishContentContributor<TovuPublishPorts>[]`. Each contributor is assignable only if
the bag's members satisfy its slice, so a missing or misspelled required member fails there.

### 5. Every generic caller (AST/rg inventory at tip; bare = no type argument)
- **Name `TovuPublishPorts` explicitly** (they build or hold the product bag): `server/runtime/composition/{content-publish-ports,publish-content-manifest,tool-catalog-manifest,publish-content-seed-hash}.ts`,
  `server/inbound/admin-http/routes/publish-content/{deps,backstop,import,export,peer-transport,capabilities,bundle-create}.ts`.
  `toPublishContentDeps` (`deps.ts:128`) returns `PublishContentDeps<TovuPublishPorts>`.
- **Unchanged pass-through engine files** (bare type is fine; they never read a key): `repo-handler.ts`, `raw-row-contributor.ts`, `gated-hooks.ts`, `seed-hash.ts`,
  `apply-run.ts`, `planner.ts`, `push-plan.ts`, `export-bundle.ts`, `publish-tool.ts`, `tool-registrations.ts` (except the type of `publishContentPorts`).
- **Test fixtures:** bare-typed fixtures that only pass a bag compile unchanged, because an object
  literal against `Partial<object>` (`{}`) has no excess-property check. Fixtures that read a key
  of `deps.ports`, or type a bag as `TovuPublishPorts`, import it from
  `#src/server/runtime/composition/tovu-publish-ports` or the contributor's slice:
  `features/publish-content/__tests__/{round-trip-harness.ts:27,media-video-embed.round-trip.test.ts:37,101,apply-loop.test.ts,type-registry.test.ts,repo-handler*.test.ts,raw-file-contributor*.test.ts}`,
  `features/media/__tests__/{verify-published-media.test.ts:6,publish-content.apply.test.ts,publish-content.overwrite.test.ts}`,
  `features/entries/__tests__/unit/publish-content.test.ts:12`, `features/taxonomy/__tests__/{publish-content,publish-term-ids}.test.ts`,
  `features/post/__tests__/publish-content.terms.test.ts`, `server/runtime/composition/__tests__/publish-content-manifest.test.ts`.
  `typecheck:tests` names any other. Each gets the slice type it reads, never an `as` cast.

### Characterization tests (write on the parent first where they compile there; must pass on candidate)
- **New `server/runtime/composition/__tests__/tovu-publish-ports.type-pin.ts`** (type-checked by `typecheck:tests`, like `extract-s8-c2p1-ports.type-pin.ts`):
  (a) `// @ts-expect-error` registering the post contributor against a bag whose `post` lacks the **required** `repo`;
  (b) `// @ts-expect-error` a `collection-entry` whose `terms` lacks `prepare`;
  (c) `// @ts-expect-error` an apply bag (`PublishContentApplyDeps<TovuPublishPorts>`) missing the `media` key;
  (d) a positive case with the full bag. v3's negative case removed the optional `forgetRemoved`, which proved nothing.
- **Fallback hook:** add to `features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts`
  a case with no `makePublishContentDeps` and with `publishContentPorts.hooks.beforeSave` set to an
  allowing hook while `pluginBeforeSaveHook` refuses. The pull is refused, which proves that the
  fallback's `hooks` overrides the bag's.
- **Term sync:** `features/post/__tests__/publish-content.terms.test.ts`, `features/entries/__tests__/unit/publish-content.test.ts`
  plus one case each: a bag without `termSync` and with non-empty `termIds` throws the same message
  as on the parent. A bag without `termSync` and with no `termIds` applies normally.
- Behaviour: `features/publish-content/__tests__/*round-trip*.test.ts`, `apply-run*.test.ts`, `push-plan*.test.ts`,
  every contributor's `publish-content` tests, `server/__tests__/routes/publish-trust-apply-coverage.test.ts`.

### STOP
- If any feature file other than those in §4 reads a key of `deps.ports`, give it a local slice. Never widen the default.
- If a contributor cannot be assigned to `PublishContentContributor<TovuPublishPorts>` because of
  contravariance (and not because a member is missing), stop and report it with the compiler error.
- If `check:architecture` reports a back-edge into composition, stop. No feature may import `tovu-publish-ports.ts`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `content-types/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `entries/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] EntryPublishPorts declared in entries (terms: TermSyncPort)
- `forms/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `media/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `media/verify-published-media.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `navigation/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `post/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice (post, termSync, hooks)
- `settings/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `taxonomy/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] TaxonomyPublishPorts declared in taxonomy
- `taxonomy/publish-term-ids.ts` -> `publish-content/tovu-publish-ports.ts` [S] TaxonomyPublishPorts declared in taxonomy
- `theme/active-theme-publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `widgets/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] WidgetPublishPorts declared in widgets
- `publish-content/tovu-publish-ports.ts` -> `media/index.ts` [H] bag moves to server/runtime/composition/tovu-publish-ports.ts
- `publish-content/tovu-publish-ports.ts` -> `post/contracts.ts` [H] same
- `publish-content/tovu-publish-ports.ts` -> `theme/catalog.ts` [H] same
- `entries/publish-content.ts` -> `taxonomy/term-sync.ts` [I+D] read/prepare via bag `collection-entry.terms` (TermSyncPort); TERM_SYNC_PERMISSION, withTermIds -> contracts/core/term-ids.ts
- `post/publish-content.ts` -> `taxonomy/term-sync.ts` [I+D] read/prepare via bag `termSync`; constants/pure -> contracts/core/term-ids.ts

#### Exact importers of each changed source file (callers that construct/pass its deps, and tests)
- `features/content-types/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/content-types/__tests__/publish-content.test.ts, features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts
- `features/entries/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/entries/__tests__/unit/publish-content.test.ts, features/publish-content/__tests__/references.test.ts
- `features/forms/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/forms/__tests__/publish-content.test.ts, features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts
- `features/media/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/media/__tests__/library-publish-transport.test.ts, features/media/__tests__/library-publish.test.ts, features/media/__tests__/publish-content.apply.test.ts, features/media/__tests__/publish-content.characterization.test.ts, features/media/__tests__/publish-content.overwrite.test.ts, features/media/__tests__/publish-content.write.test.ts, features/post/__tests__/publish-content.terms.test.ts, features/publish-content/__tests__/apply-loop.test.ts, features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts, features/publish-content/__tests__/media-video-embed.round-trip.test.ts, features/publish-content/__tests__/planner.test.ts, features/site-backup/__tests__/library-share.integration.test.ts
- `features/media/verify-published-media.ts`
    - prod: features/media/publish-content.ts
    - tests: features/media/__tests__/verify-published-media.test.ts
- `features/navigation/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/navigation/__tests__/publish-content.characterization.test.ts, features/navigation/__tests__/publish-content.test.ts, features/navigation/__tests__/reverters.test.ts, features/publish-content/__tests__/apply-loop.test.ts, features/publish-content/__tests__/references.test.ts
- `features/post/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/post/__tests__/L156-characterization.test.ts, features/post/__tests__/publish-content.characterization.test.ts, features/post/__tests__/publish-content.round-trip.test.ts, features/post/__tests__/publish-content.schedule-featured.test.ts, features/post/__tests__/publish-content.terms.test.ts, features/post/__tests__/publish-content.test.ts, features/publish-content/__tests__/apply-loop.test.ts, features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts, features/publish-content/__tests__/planner.test.ts, features/publish-content/__tests__/references.test.ts
- `features/publish-content/tovu-publish-ports.ts`
    - prod: features/content-types/publish-content.ts, features/entries/publish-content.ts, features/forms/publish-content.ts, features/media/publish-content.ts, features/media/verify-published-media.ts, features/navigation/publish-content.ts, features/post/publish-content.ts, features/publish-content/apply-port.ts, features/publish-content/tool-deps.ts, features/publish-content/tool-registrations.ts, features/publish-content/type-registry.ts, features/settings/publish-content.ts, features/taxonomy/publish-content.ts, features/taxonomy/publish-term-ids.ts, features/theme/active-theme-publish-content.ts, features/widgets/publish-content.ts, server/runtime/composition/content-publish-ports.ts
    - tests: features/entries/__tests__/unit/publish-content.test.ts, features/media/__tests__/verify-published-media.test.ts, features/publish-content/__tests__/media-video-embed.round-trip.test.ts, features/publish-content/__tests__/round-trip-harness.ts, features/taxonomy/__tests__/publish-content.test.ts
- `features/settings/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/settings/__tests__/publish-content.round-trip.test.ts
- `features/taxonomy/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/entries/__tests__/unit/publish-content.test.ts, features/post/__tests__/publish-content.terms.test.ts, features/publish-content/__tests__/apply-loop.test.ts, features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts, features/publish-content/__tests__/planner.test.ts, features/publish-content/__tests__/references.test.ts, features/taxonomy/__tests__/publish-content.test.ts
- `features/taxonomy/publish-term-ids.ts`
    - prod: features/taxonomy/term-sync.ts
    - tests: features/taxonomy/__tests__/publish-term-ids.test.ts
- `features/theme/active-theme-publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/settings/__tests__/publish-content.round-trip.test.ts
- `features/widgets/publish-content.ts`
    - prod: server/runtime/composition/publish-content-manifest.ts
    - tests: features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts, features/publish-content/__tests__/references.test.ts, features/widgets/__tests__/unit/publish-content.test.ts

#### Named test files (verifier runs them; every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 30 files

```text
  apps/website/src/features/content-types/__tests__/publish-content.test.ts
  apps/website/src/features/entries/__tests__/unit/publish-content.test.ts
  apps/website/src/features/forms/__tests__/publish-content.test.ts
  apps/website/src/features/media/__tests__/library-publish-transport.test.ts
  apps/website/src/features/media/__tests__/library-publish.test.ts
  apps/website/src/features/media/__tests__/publish-content.apply.test.ts
  apps/website/src/features/media/__tests__/publish-content.characterization.test.ts
  apps/website/src/features/media/__tests__/publish-content.overwrite.test.ts
  apps/website/src/features/media/__tests__/publish-content.write.test.ts
  apps/website/src/features/media/__tests__/verify-published-media.test.ts
  apps/website/src/features/navigation/__tests__/publish-content.characterization.test.ts
  apps/website/src/features/navigation/__tests__/publish-content.test.ts
  apps/website/src/features/navigation/__tests__/reverters.test.ts
  apps/website/src/features/post/__tests__/L156-characterization.test.ts
  apps/website/src/features/post/__tests__/publish-content.characterization.test.ts
  apps/website/src/features/post/__tests__/publish-content.round-trip.test.ts
  apps/website/src/features/post/__tests__/publish-content.schedule-featured.test.ts
  apps/website/src/features/post/__tests__/publish-content.terms.test.ts
  apps/website/src/features/post/__tests__/publish-content.test.ts
  apps/website/src/features/publish-content/__tests__/apply-loop.test.ts
  apps/website/src/features/publish-content/__tests__/execute-pull-tool.plugin-hook-refusal.test.ts
  apps/website/src/features/publish-content/__tests__/media-video-embed.round-trip.test.ts
  apps/website/src/features/publish-content/__tests__/new-types-sqlite-round-trip.test.ts
  apps/website/src/features/publish-content/__tests__/planner.test.ts
  apps/website/src/features/publish-content/__tests__/references.test.ts
  apps/website/src/features/settings/__tests__/publish-content.round-trip.test.ts
  apps/website/src/features/site-backup/__tests__/library-share.integration.test.ts
  apps/website/src/features/taxonomy/__tests__/publish-content.test.ts
  apps/website/src/features/taxonomy/__tests__/publish-term-ids.test.ts
  apps/website/src/features/widgets/__tests__/unit/publish-content.test.ts
```
The verifier runs every file above plus the new characterization tests this sheet names, on the parent and on the candidate (INDEX-v4 § Gate).
