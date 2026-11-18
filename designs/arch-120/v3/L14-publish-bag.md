# L14 — publish bag to composition (C1 rethought) (17 edges, S + H + I)

**Root cause:** `publish-content/tovu-publish-ports.ts` is Tovu's product bag (every content type's
ports) but lives inside the engine feature, so contributors import *up* into it (12 edges) and it
imports *down* into post/media/theme (3 edges; L01 already removed 4 Jini ones). That is a cycle by
construction; no single re-pointing fixes it.

**Change:**
1. **Contributors own their slice (S, 12 edges).** Each `X/publish-content.ts` (content-types,
   entries, forms, media, media/verify-published-media, navigation, post, settings, taxonomy ×2,
   theme/active-theme, widgets) declares `XPublishPorts` locally — exactly the members of the bag
   it reads (`ports["x"]`), using Jini or its own feature's types. `EntryPublishPorts`,
   `TaxonomyPublishPorts`, `WidgetPublishPorts` move to entries/taxonomy/widgets respectively.
   Contributors are typed `PublishContentContributor<XPublishPorts>`.
2. **The bag moves to composition (H, 3 edges).** `tovu-publish-ports.ts` →
   `server/runtime/composition/tovu-publish-ports.ts` defined as
   `TovuPublishPorts = { post: PostPublishPorts["post"]; … }` keyed by `entityType` (the same keys as
   today, incl. `redirect`, `hooks`, `active-theme`, `theme-files`). `content-publish-ports.ts`
   (already there) registers contributors with it: registration requires `TovuPublishPorts`
   to be assignable to each contributor's slice, so a bag missing a slice member fails to compile there.
3. **Engine generic, no default (H).** `type-registry.ts:80,385` drop `= TovuPublishPorts` (the
   generic already exists — judge 2 #3: reuse it). `apply-port.ts:25` → `ports: TPorts`.
   `tool-deps.ts:22-66` and the fallback bag in `tool-registrations.ts:440-451` are product wiring:
   move the concrete `PublishContentToolDeps` fields that index `TovuPublishPorts[...]` and the
   fallback bag builder to `server/runtime/composition/publish-content-tool-deps.ts`; the feature
   keeps a generic `PublishContentToolDeps<TPorts>` with `resolvePorts(): TPorts` (+ the
   `PublishHistoryRecorder` from L13). `repo-handler.ts`, `apply-run.ts`, planner and export code
   take `TPorts` through the existing generic.
4. **Term sync (I, 2 edges).** `entries/publish-content.ts:9`, `post/publish-content.ts:18` import
   `prepareTermSync/readTermIds/withTermIds/TERM_SYNC_PERMISSION` from taxonomy. The taxonomy slice
   gains `termSync: { prepare, read, withIds }` supplied in the bag by composition (taxonomy's
   functions); `TERM_SYNC_PERMISSION` → D `contracts/core/term-sync-permission.ts`.
5. **Tests:** `__tests__/round-trip-harness.ts:27`, `media-video-embed.round-trip.test.ts:37,101`,
   `media/__tests__/verify-published-media.test.ts:6`, `entries/__tests__/unit/publish-content.test.ts:12`,
   `taxonomy/__tests__/publish-content.test.ts:5` import the bag/slices — repoint to the composition
   bag (tests may import composition) or the contributor's own slice.

**Preserve (judge 2 #3):** the exhaustive apply bag, optional export/plan ports
(`Partial<TovuPublishPorts>` at `tool-deps.ts:63` keeps its meaning), one shared registry,
apply-only `hooks`, `redirect`.

**Characterization (named risks):**
- *Apply runs with an incomplete bag* → new `server/runtime/composition/__tests__/tovu-publish-ports.type-test.ts`:
  `// @ts-expect-error` registering the post contributor against a bag lacking `post.forgetRemoved`
  (fails to compile if completeness is lost), and a positive case with the full bag; plus a
  negative case that an **empty** slice type is rejected (judge 2 #3: positive-only can pass).
- Behaviour: `features/publish-content/__tests__/*round-trip*.test.ts`, `apply-run*.test.ts`,
  `push-plan*.test.ts`, contributors' own `publish-content` tests, `server/__tests__/routes/publish-trust-apply-coverage.test.ts`.

**Gates:** shared gate, `LANE=L14`. G2's `ARCH==0` branch applies if this is the last lane merged.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L14.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L14`.

---

### Inventory (TypeScript-AST reverse-import index of tip `2d82735a`, all of `apps/website/src`, prod + tests)

#### Edges
- `content-types/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] contributor types its own slice
- `entries/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] EntryPublishPorts declared in entries/publish-content.ts
- `forms/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `media/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `media/verify-published-media.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `navigation/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `post/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `settings/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `taxonomy/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] TaxonomyPublishPorts declared in taxonomy
- `taxonomy/publish-term-ids.ts` -> `publish-content/tovu-publish-ports.ts` [S] TaxonomyPublishPorts declared in taxonomy
- `theme/active-theme-publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] own slice
- `widgets/publish-content.ts` -> `publish-content/tovu-publish-ports.ts` [S] WidgetPublishPorts declared in widgets
- `publish-content/tovu-publish-ports.ts` -> `media/index.ts` [H] bag moves to server/runtime/composition/tovu-publish-ports.ts
- `publish-content/tovu-publish-ports.ts` -> `post/contracts.ts` [H] same
- `publish-content/tovu-publish-ports.ts` -> `theme/catalog.ts` [H] same
- `entries/publish-content.ts` -> `taxonomy/term-sync.ts` [I] term sync -> TaxonomyPublishPorts.termSync (bag-supplied)
- `post/publish-content.ts` -> `taxonomy/term-sync.ts` [I] same

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

#### G5 suites — exact (every `*.test.ts` that imports a changed source file or a moved symbol's old home; AST index of the tip): 30 files

```
SUITES="
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
"
```
Add the new characterization tests named above to `SUITES`. Barrel-importing suites (`*/index.ts` homes) are large by nature; run them all — G5 is the lane's behaviour net.
