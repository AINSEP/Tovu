# Module dependency cycles — diagnosis and fix plan

- **Date:** 2026-09-18
- **Author:** Software Architect (Direct), read-only dispatch `arch-cycles-diagnosis`
- **Gate:** `npm run check:architecture` — currently **FAILED** (3 hard-constraint regressions)
- **Evidence:** one `depcruise` run of `apps/website/src` (`--ts-pre-compilation-deps`, same flags the gate uses), replayed through the gate's own `moduleOf()` / `isTypeOnlyDependency()` / Tarjan logic. The 7 pairs and the SCC of 39 reproduce exactly.

---

## 0. Headline

**Four of the five `platform` cycles are one pattern, and the pattern is one file.**

`apps/website/src/platform/db/sqlite/sealed-credential-descriptors.sqlite.ts` is a registry of sealed-column descriptors that imports the **AAD builder** of eight different feature/assistant modules. It alone creates `assistant <-> platform`, `features/custom-credentials <-> platform`, `features/deployments <-> platform` and `features/source-control <-> platform`, and it is the reason the largest SCC is 39 instead of 9.

Every one of those eight imported files is a **pure leaf with zero runtime dependencies** — a 25-to-66-line function that concatenates a string. Measured transitive runtime reachability from each: `0`. So the cycles carry no actual runtime coupling; they are a *file-location* defect. The AAD builders are platform-layer crypto-binding helpers that happen to be filed under the feature that owns the credential. Two of the thirteen descriptors already do it the right way — `platform/connectors/composio-config-aad.ts` and `platform/connectors/connector-credential-aad.ts` already live in `platform`.

The other three cycles are three unrelated one-line imports.

| # | Fix | Cycles after | Largest SCC after |
|---|---|---|---|
| — | current tree | 7 | 39 |
| 1 | move the 8 AAD builders out of `features`/`assistant` | **3** | **9** |
| 2 | + drop `platform/routing/routing.ts` → `features/post` | **2** | 9 |
| 3 | + drop `assistant/tool-registrations.ts` → `server/…/site-switcher-enabled.ts` | **1** | **2** |
| 4 | + the already-scheduled `features/post/publish-content.ts` move | **0** | **0** |

(Each row measured by removing exactly those edges from the real graph and re-running the gate's Tarjan pass.)

---

## 1. The seven pairs, edge by edge

Runtime/value-only graph, as the gate computes it. `import type`-only edges are already excluded, so every edge below is a real value edge that survives `tsc`.

### 1.1 `assistant <-> platform` — 2 up, 3 back

```
assistant  -> platform   assistant/external-mcp-oauth.ts      => platform/oauth/index.ts
assistant  -> platform   assistant/site/client-directives.ts  => platform/routing/index.ts
platform -> assistant    platform/db/sqlite/sealed-credential-descriptors.sqlite.ts => assistant/execution-credential-aad.ts
platform -> assistant    platform/db/sqlite/sealed-credential-descriptors.sqlite.ts => assistant/external-mcp-aad.ts
platform -> assistant    platform/db/sqlite/sealed-credential-descriptors.sqlite.ts => assistant/site-credential-aad.ts
```

The two `assistant -> platform` edges are correct-direction (consumer → lower layer). **All three back-edges are the descriptor file.**

### 1.2 `features/custom-credentials <-> platform` — 3 up, 1 back

```
features/custom-credentials -> platform   credentialed-request.ts   => platform/http/index.ts
features/custom-credentials -> platform   tool-registrations.ts     => platform/http/index.ts
features/custom-credentials -> platform   github-write-files.ts     => platform/http/index.ts
platform -> features/custom-credentials   platform/db/sqlite/sealed-credential-descriptors.sqlite.ts => features/custom-credentials/aad.ts
```

**One back-edge. The descriptor file.**

### 1.3 `features/deployments <-> platform` — 6 up, 1 back

```
features/deployments -> platform   deploy-config{,-fly,-railway,-render}.ts => platform/site-dir/index.ts   (4 edges)
features/deployments -> platform   repo.sqlite.ts                           => platform/db/schema.ts
features/deployments -> platform   static-publish/adapter.ts                => platform/export/export-failure-summary.ts
platform -> features/deployments   platform/db/sqlite/sealed-credential-descriptors.sqlite.ts => features/deployments/publish-credentials/index.ts
```

**One back-edge. The descriptor file** — and this one is doubly wrong: it imports the sub-feature's *barrel* (`publish-credentials/index.ts`, reachability 5) when the symbol it wants, `buildPublishCredentialAad`, is re-exported from `publish-credentials/aad.ts` (reachability 0).

### 1.4 `features/source-control <-> platform` — 1 up, 1 back

```
features/source-control -> platform   commit-site.ts => platform/export/index.ts
platform -> features/source-control   platform/db/sqlite/sealed-credential-descriptors.sqlite.ts => features/source-control/aad.ts
```

**One back-edge. The descriptor file.**

### 1.5 `features/post <-> platform` — 4 up, 1 back (a *different* pattern)

```
features/post -> platform   repo.sqlite.ts          => platform/db/schema.ts
features/post -> platform   repo.sqlite.ts          => platform/db/sqlite/repo-helpers.ts
features/post -> platform   search-index.memory.ts  => platform/db/sqlite/content-db.ts
features/post -> platform   tool-registrations.ts   => platform/routing/index.ts
platform -> features/post   platform/routing/routing.ts => features/post/index.ts
```

Not the descriptor. `platform/routing/routing.ts:22` is:

```ts
import { isTrashed, type PostRecord } from "../../features/post/index.js";
```

The only **value** in that import is `isTrashed`, used once, at `routing.ts:155`. Its definition (`features/post/post.ts:389`) is three lines:

```ts
export function isTrashed(post: Pick<PostRecord, "deletedAt">): boolean {
  return post.deletedAt !== undefined && post.deletedAt !== null;
}
```

The `PostRecord` type edge is type-only and does not count. So a platform-layer URL resolver is entangled with a feature module over a null check. The file's own header names the deeper issue honestly: *"Only `post` is a real implemented content type today, so `entryRef` resolution goes through `PostRepoPort` directly."* That is a real design debt, but it is **not** what makes this a cycle — the type edge is free, the predicate is not.

### 1.6 `assistant <-> server` — 1 up, 36 back

```
assistant -> server   assistant/tool-registrations.ts:206 => server/runtime/composition/site-switcher-enabled.ts
server -> assistant   36 edges, 31 of them to assistant/index.ts (routes, composition modules, daemon supervisor)
```

The 36 `server -> assistant` edges are **correct**: `server` is the composition root, it is supposed to reach into `assistant`. The single defect is the other way:

```ts
// assistant/tool-registrations.ts:206
import { isSiteSwitcherEnabled as REAL_IS_SITE_SWITCHER_ENABLED }
  from "../server/runtime/composition/site-switcher-enabled.js";
```

`isSiteSwitcherEnabled` is a four-line reader of `process.env.TOVU_ENABLE_SITE_SWITCHER`, with zero dependencies. It is misfiled in the composition root.

**This one edge is also the entire `back-edges into composition root: 0 → 1` regression** — the gate's own `--list` names exactly this file as the sole target. Deleting it fixes two ratcheted metrics at once.

### 1.7 `features/post <-> features/publish-content` — 1 up, 1 back

```
features/post           -> features/publish-content   features/post/publish-content.ts => features/publish-content/content-hash.ts
features/publish-content -> features/post             features/publish-content/apply-loop.ts => features/post/post.ts
```

Already scheduled — see §4.

---

## 2. One pattern or five? — **four are one, the fifth is its own**

The evidence, stated plainly:

- **One file produces four of the five.** `platform/db/sqlite/sealed-credential-descriptors.sqlite.ts` holds **8 of the 9** `platform` → feature runtime back-edges that exist anywhere in the tree.
- **The reason is a single recurring one:** the sealed-credential inventory must reproduce each store's AAD *byte for byte* to open a sealed row, and its header states the rule — *"the same AAD builder (imported, never restated)"*. That rule is correct. What is wrong is that the builders live in the feature. The inventory is a platform-layer, cross-cutting reader; it must know all thirteen AAD shapes by construction. A lower layer that must know N things about N features is telling you those N things belong in the lower layer.
- **The builders cost nothing to move.** All eight are leaf files (transitive runtime reachability `0`). Six import only `type { UUID }` from `@jini-ai/cms/core`; two additionally import a local `types.ts` **type-only**. There is no runtime graph under them to drag along.
- **Two are already in the right place.** `platform/connectors/composio-config-aad.ts` and `platform/connectors/connector-credential-aad.ts` — same role, same shape, in `platform`, no cycle.
- **Each builder has exactly two production importers**: its own feature's `*-store.ts`, and the descriptor. (Three also re-export it from the feature's `index.ts`.) A move touches 2–3 call sites apiece.

**Two more cycles are latent inside the same file**, not yet firing only because their modules happen to have no runtime edge into `platform` today:

```
platform/db/sqlite/sealed-credential-descriptors.sqlite.ts => features/media/aad.ts
platform/db/sqlite/sealed-credential-descriptors.sqlite.ts => features/vendor-credentials/aad.ts
```

`features/media` and `features/vendor-credentials` are each **one value import away** from becoming cycles 8 and 9. Fixing the pattern retires those too. Do not fix only the four that currently fire.

**`features/post <-> platform` is a separate pattern** — `platform/routing` resolving a content type. Same *shape* of defect (a lower layer importing a 3-line predicate from a feature), different cause, different fix location. Counting it with the other four would be wrong.

---

## 3. Fix plan, ordered by value-for-risk

### Fix 1 — move the AAD builders to a lower layer. *Pure move.* Retires 4 cycles, 2 latent ones, SCC 39 → 9.

Move these eight files (or their exported builder functions) out of the feature tree:

| from | export |
|---|---|
| `assistant/execution-credential-aad.ts` | `buildExecutionCredentialAad` |
| `assistant/external-mcp-aad.ts` | `buildExternalMcpEnvAad`, `buildExternalMcpOAuthAad`, `EXTERNAL_MCP_AAD_VERSION` |
| `assistant/site-credential-aad.ts` | `buildSiteAssistantCredentialAad` |
| `features/custom-credentials/aad.ts` | `buildCustomCredentialAad` |
| `features/source-control/aad.ts` | `buildSourceControlCredentialAad` |
| `features/media/aad.ts` | `buildMediaProviderCredentialAad` |
| `features/vendor-credentials/aad.ts` | `buildVendorCredentialAad` |
| `features/deployments/publish-credentials/aad.ts` | `buildPublishCredentialAad` |

**Where:** alongside the two that already work — a `platform/crypto/aad/` (or `platform/connectors/`-adjacent) home, one file per credential family. `contracts/core/` is the other defensible home and is the *strictly* safest one (`contracts` has **zero** outgoing cross-module edges — it is the repo's only true kernel), but `platform` is sufficient here: every consumer is either `platform` itself or a feature, and feature → platform is the allowed direction.

**Watch the two type imports.** `source-control/aad.ts` takes `SourceControlProviderId` and `vendor-credentials/aad.ts` takes `VendorId`, both from their feature's `types.ts`. Move those two id unions down with the builders (they are string-literal unions, not feature logic) or the moved file re-acquires an upward type edge. It would be type-only and would not re-form the runtime cycle, but it would leave the layering dishonest.

**Also narrow one import while you are in there:** the descriptor should import `buildPublishCredentialAad` from `publish-credentials/aad.ts`, not from `publish-credentials/index.ts`. That barrel drags 5 extra files in at runtime for one string function.

**Risk:** minimal, but not zero, and the reason is security, not structure. An AAD is authenticated data bound into the ciphertext; **if a builder's output string changes by one byte, every sealed row it protects becomes unopenable.** A move must preserve the exact emitted string. Keep each function body byte-identical, do not "tidy" it, and run the sealed-credential descriptor/inventory suite plus each `*-store.ts` open-path test before and after. This is a rename-and-reimport, nothing more.

### Fix 2 — `assistant/tool-registrations.ts` → `site-switcher-enabled.ts`. *Pure move.* Retires 1 cycle, SCC 9 → 2, and the back-edges-into-composition-root regression.

`isSiteSwitcherEnabled` reads one env var and has no dependencies. Move `server/runtime/composition/site-switcher-enabled.ts` to `platform/` (it sits beside the deployment-capability flags it is a sibling of) and update its two importers. **Highest ratio of metrics-fixed to lines-touched in the whole list**: it is the only edge in the tree that shows up in two different failing metrics.

Delete the back-edge; do not add an injection seam. `routeDeps.isSiteSwitcherEnabled` is already the injection point (`tool-registrations.ts:686` reads `routeDeps.isSiteSwitcherEnabled ?? REAL_…`) — the import exists only to supply the default. Moving the file is cheaper and clearer than making the field required.

### Fix 3 — `platform/routing/routing.ts` → `features/post`. *Interface extraction (small).* Retires 1 cycle.

Move `isTrashed` (and nothing else) to `contracts/core/`, next to the other cross-cutting content predicates, and have `features/post/post.ts` re-export it so its 6 existing callers (`features/seo/seo.ts`, `features/seo/sitemap.ts`, the post tests, `contracts/core/commands/__tests__/post-delete-reverter.test.ts`) are unaffected. `routing.ts` then imports the predicate from `contracts`, and its remaining `PostRecord` edge stays type-only, which the gate already ignores.

Do **not** inline the predicate into `routing.ts` — `routing.ts:108-118`'s own header explains that this module exists so the soft-delete/root-slug rules have *one* implementation. Duplicating it buys a green metric at the cost of the invariant the file was written to protect.

The larger question — whether `platform/routing` should know about content types at all — is real but separable. It is a `PostRepoPort`-shaped design debt, it is documented in `routing.ts:12-14`, and it is a genuine redesign. It is not on the critical path to a green gate. Park it.

### Fix 4 — `features/post <-> features/publish-content`. Already scheduled. See §4.

### Not to do

- **Do not add indirection to break the platform cycles.** A registry, a DI seam, or an "AAD provider port" would preserve the file locations and hide the defect behind a layer of ceremony. The files are leaves; move them.
- **Do not `--update` the baseline to clear the cycles.** The gate's own header calls module cycles a hard constraint for the right reason, and `--update` on a cycle regression launders it permanently.

---

## 4. `features/post <-> features/publish-content` — confirmation, and a warning

**Confirmed: moving `features/post/publish-content.ts` into `features/publish-content/adapters/` fully retires the cycle, with no residual edge.** That file is the *only* source of `features/post -> features/publish-content` edges anywhere in the tree — verified across the all-import graph, not just the runtime one:

```
[RUN]  features/post -> features/publish-content   features/post/publish-content.ts => features/publish-content/content-hash.ts
[type] features/post -> features/publish-content   features/post/publish-content.ts => features/publish-content/type-registry.ts
```

After the move `features/post` imports `features/publish-content` zero times. The surviving `features/publish-content -> features/post` edges (`apply-loop.ts => post/post.ts`, `type-registry.ts => post/post.ts`) are the correct direction and stay.

**Optional cleanup, not required for the cycle:** `apply-loop.ts:3` imports `PostConflictError` and `PostNotFoundError` from `features/post` so `classifyApplyRowFailure` can downgrade a row. That file's own header (lines 69-76) already records that the generic mechanism, `PublishContentApplyRowError`, superseded the special case and that `post`'s two classes were only kept as a named legacy branch. Having the moved `adapters/post.ts` wrap those two in `PublishContentApplyRowError` would let the generic apply loop stop naming a content type. Nice to have; changes no metric.

### ⚠️ The **media** adapter move, done the same way, creates a NEW cycle

`features/media/publish-content.ts` is not the only `features/media -> features/publish-content` edge:

```
[RUN] features/media/publish-content.ts      => features/publish-content/{apply-errors,blob-staging,content-hash}.ts
[RUN] features/media/import-media-entity.ts  => features/publish-content/blob-staging.ts      <-- the problem
```

Today `features/media <-> features/publish-content` is not a cycle only because the return edge (`type-registry.ts => features/media/index.ts`) is **type-only**. Once the adapter moves *into* `features/publish-content`, it will import `features/media` at runtime (`computeBlobStorageKey` from `media/index.ts`) — and `import-media-entity.ts` will still be pointing back. Simulated on the real graph:

```
move both adapters, import-media-entity.ts STAYS  ->  7 pairs   (post↔publish-content gone, media↔publish-content NEW)
move both adapters + import-media-entity.ts       ->  6 pairs   (correct)
```

**The move trades one cycle for another unless `features/media/import-media-entity.ts` moves with the adapter.** It should: its only production importer is `features/media/publish-content.ts` itself (everything else that references it is a test in `features/media/__tests__/`), and its own imports are `publish-content/blob-staging` plus type-only `media/index.ts` — i.e. it is publish-content logic that was filed under media for the same reason the AAD builders were.

**No other feature needs this treatment.** `features/post` and `features/media` are the only two with a `publish-content.ts` adapter (`find features -name "publish-content*.ts"`, verified against a positive control).

---

## 5. `deepImportsBypassingIndex` = 650 (now 848) — **no, these cycles do not ride in on deep imports**

**Enforcing public-index imports would have prevented zero of the seven cycles.** Measured, not argued:

- Of the **62** cycle-forming runtime edges, **31 go through the target module's own `index.ts`** and form a cycle anyway.
- The whole of `assistant <-> server` is index-clean: 31 of the 36 `server -> assistant` edges import `assistant/index.ts` exactly as intended.
- `features/post <-> platform`'s back-edge, `platform/routing/routing.ts => features/post/index.ts`, is a textbook public-index import. It is still a cycle.

A cycle is a module-level fact. Which file inside the target you land on does not change whether the edge exists.

**Worse: enforcing index imports on the platform back-edges would have made the coupling significantly heavier.** Runtime transitive reachability of each current deep target vs. the module index the rule would force it through:

| current target | reach | forced index target | reach |
|---|---:|---|---:|
| `assistant/execution-credential-aad.ts` | **0** | `assistant/index.ts` | **109** |
| `assistant/external-mcp-aad.ts` | **0** | `assistant/index.ts` | **109** |
| `assistant/site-credential-aad.ts` | **0** | `assistant/index.ts` | **109** |
| `features/deployments/publish-credentials/index.ts` | 5 | `features/deployments/index.ts` | **58** |
| `features/post/post.ts` | **0** | `features/post/index.ts` | 19 |
| `features/source-control/aad.ts` | **0** | `features/source-control/index.ts` | 14 |
| `features/custom-credentials/aad.ts` | **0** | `features/custom-credentials/index.ts` | 9 |
| `features/media/aad.ts` | **0** | `features/media/index.ts` | 6 |
| `features/vendor-credentials/aad.ts` | **0** | `features/vendor-credentials/index.ts` | 5 |

The deep imports here are doing the **right** thing: reaching a zero-dependency leaf instead of pulling a 109-file barrel. The defect is where the leaf *lives*, not how it is addressed.

**Conclusion:** `deepImportsBypassingIndex` is a real hygiene signal about barrel discipline. It is not a cycle-prevention lever, and a campaign to route the 848 edges through `index.ts` would raise propagation cost — the gate's own baseline comment already records a measured mutation showing exactly that (`propagationCostPct` 11.62% → 24.38% when all deep imports are routed through indexes). Do not couple the two efforts.

---

## 6. When the gate can be made blocking

### 6.1 The baseline is stale, and by more than the brief assumed

`development/scripts/check-architecture.baseline.json` was last written by **`5435b87c7`, 2026-09-05** (*"regenerate baseline for accumulated drift since Aug 20"*). **1516 commits have landed since** — not 515. The tree it describes no longer exists:

| | baseline (2026-09-05) | now | delta |
|---|---:|---:|---|
| files | 974 | 1127 | +153 (+15.7%) |
| modules | 45 | 51 | +6 |

The six new modules are `features/{content-duplication, fs-files, media-import, publish-content, sites, supabase-connect}`.

**What that does and does not excuse.** It does not excuse the cycles: `moduleCycles` is a count of a structural property, and 7 mutual pairs would be 7 on a tree of any size. It *does* partly explain the two other regressions, which are size-sensitive.

### 6.2 Current state of every ratcheted metric

| metric | tier | baseline → now | verdict |
|---|---|---|---|
| module cycles / SCC | **HARD — blocks** | 0 → 7, SCC 0 → 39 | real coupling; fix in code |
| back-edges into composition root | **HARD — blocks** | 0 → 1 | real; one import (Fix 2) |
| module API surface (files exposed) | **HARD — blocks** | 231 → 308 (+77) | mostly growth, partly drift — see below |
| propagation cost (runtime-only) | ratchet — warns | 2.05 → 2.30 | non-blocking |
| bidirectional hub count | ratchet — warns | 152 → 199 | non-blocking |
| propagation cost (all-import) | ratchet — warns | 13.17 → 12.56 | **improved** |

Note the brief listed two blocking regressions; there are **three**. `module API surface` is in `HARD_CONSTRAINT_METRICS` (it was promoted there on 2026-08-19 after catching a real defect) and it fails the build today independently of the cycles.

### 6.3 Order to green

1. **Fix 1** (AAD builders) → cycles 7 → 3, SCC 39 → 9, and two latent cycles closed.
2. **Fix 2** (`site-switcher-enabled`) → cycles → 2, SCC → 2, **and `back-edges into composition root` back to 0**.
3. **Fix 3** (`isTrashed`) → cycles → 1.
4. **Fix 4** (scheduled adapter move, *including* `import-media-entity.ts`) → **cycles 0, SCC 0**.

After those four: `module cycles / SCC` green, `back-edges into composition root` green. **`module API surface` still fails at 308 vs 231.**

### 6.4 The remaining blocker, and the honest options

The cycle fixes are **net-neutral** on `moduleApiSurfaceFiles`: moving a leaf from `features/x` to `platform` moves it from one module's exposed set to another's. Nothing about the plan above closes the +77.

Attribution of the +77, as far as the baseline permits (it stores only the total, no per-module breakdown):

- **22 files** are the five new modules that expose anything at all: `publish-content` 14, `fs-files` 4, `content-duplication` 2, `media-import` 1, `supabase-connect` 1. (`features/sites` exposes 0 — clean index discipline, worth copying.)
- **~55 files** are existing modules widening. That is genuine hygiene drift, not arithmetic.

Two defensible paths, in preference order:

- **Preferred — fix the cycles first, then re-baseline once, then flip blocking on.** Land Fixes 1–4, confirm `moduleCycles` is `{0, 0, []}` and `backEdgesIntoServer` is `0` *in the gate's own output*, then run `--update` in a commit whose message says plainly that it re-baselines size-driven metrics only and names the cycle-fix commits as the reason the structural ones are already green. Re-freezing the hub medians at the same time is correct and overdue — the frozen medians in the current baseline were computed on a 974-file tree.
  **Sequencing matters:** `--update` before the cycles are fixed permanently launders 7 cycles and an SCC of 39 into the baseline, and the gate has no way to tell that apart from an intentional widening later.
- **Alternative — a separate deep-import/barrel pass** to bring the surface down toward 231 on merit. Not recommended as a precondition for blocking: §5 shows that routing deep imports through `index.ts` *raises* propagation cost, so this pass has to be done by narrowing exports, not by redirecting importers, and that is weeks of work for a hygiene metric the gate's own header already describes as "a signal worth fixing, not a reason to break the build" for an unpublished tree.

**After the re-baseline, no metric would still be regressed against the ratchet** — the two warn-tier ones (`propagation cost (runtime-only)` 2.30, `bidirectional hub count` 199) never blocked, and `--update` re-freezes them at the current tree's values. The gate can be made blocking at that point.

### 6.5 One standing recommendation

Nothing in the gate or in `.dependency-cruiser.mjs` forbids `platform/**` from importing `features/**`. The four-cycle pattern in §2 took three weeks and 1516 commits to surface, and it surfaced only because someone ran the gate by hand. A `no-platform-to-features` rule in `.dependency-cruiser.mjs` (which runs per-edge, on every diff, in `check:boundaries`) would have failed the sealed-descriptor commit on the day it landed. That is Code Inspection's enforcement surface, not this gate's — but declaring the rule is architecture work, and it should be declared once the eight builders have moved and the rule can be turned on clean.

---

## Appendix — reproduction

```
npx depcruise apps/website/src --no-config --ts-pre-compilation-deps \
  --ts-config tsconfig.json --do-not-follow node_modules --output-type json
```

then replay `check-architecture.ts`'s `moduleOf()`, `isTypeOnlyDependency()` and `stronglyConnectedComponents()` over the result. Cross-checked against `npm run check:architecture -- --list` (exit 1, 7 pairs, SCC 39) on 2026-09-18.
