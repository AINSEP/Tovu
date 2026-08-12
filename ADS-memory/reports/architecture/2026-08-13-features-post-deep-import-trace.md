# `features/post` Deep-Import Trace + `core/commands/appliers.ts` Adjudication — 2026-08-13

**Status:** PROPOSAL ONLY — no production source touched. Every finding below is verified against
the actual import lines (`grep -n`), the actual barrel (`src/features/post/index.ts`), and the
actual `.dependency-cruiser.cjs` rule text — not inferred from file names or prior reports.
**Mandate:** Job 1 — triage `features/post`'s 25 `no-deep-imports:features/post` violations, the
next module in `2026-08-13-boundary-lint-plan.md` §5 item 4's queue. Job 2 — adjudicate whether
`core/commands/appliers.ts`'s `features/post`/`features/settings` coupling is structurally required.
**Method:** `npx depcruise --config .dependency-cruiser.cjs --output-type json src`, run directly
against the working tree (verified first via `git status --short | grep 'src/\|\.dependency-cruiser'`
that no in-flight edit from the three other concurrent agents touches `features/post`, `seo`,
`routing`, `core/commands`, `features/settings`, or the dependency-cruiser config — safe to read
live rather than isolate in a worktree). Every "what's imported" cell was checked against the real
import statement, not assumed from the target filename.

---

## Executive summary

- **Job 1 is good news, and it is not "test noise."** 20 of 25 violations (80%) are pure **wrong-door**
  bugs: `src/features/post/index.ts` already re-exports `PostRecord`, `PostRepoPort`, `PostKind`,
  `createPost`, `updatePost`, `InMemoryPostRepo`, and `InMemoryPostSearchIndex` — every symbol these
  20 importers reach past the barrel for is already sitting on the other side of an open door. This
  resolves the open question `2026-08-13-boundary-lint-plan.md` §3.8 flagged and explicitly declined
  to guess at ("This may well turn out to be exactly the kind of thing the rule should catch... or it
  may be a `widgets`-shaped case... I don't know, and did not guess") — checked directly against
  `index.ts`, it is neither: a real door exists and 20 of 25 importers simply aren't using it.
- 2 violations are genuine **Category 2 — missing from the barrel**: `BeforeSaveHookPort` (used by
  `server/routes/types.ts`) and `CONTENT_POST_DELETE_TOOL_ID` (used by one test to avoid a hardcoded
  string literal). Both are single-symbol, zero-risk barrel additions.
- 3 violations are **Category 3 — legitimate, but the existing tool-registration-seam exemption in
  `.dependency-cruiser.cjs` is written too narrowly to recognize them.** All three are
  `assistant/__tests__/*.test.ts` files reaching a domain's `tool-registrations.ts`/`agent-tools.ts`
  seam file — functionally identical to the already-accepted `tool-registrations.<module>.test.ts`
  contract-test pattern the config's own `TOOL_REGISTRATION_TEST_FROM` constant blesses — but named
  differently, so the regex doesn't match them.
- **`features/post` could plausibly reach 0 faster than any of the previously-traced modules** —
  there is no design question anywhere in the 25; every fix is either a mechanical redirect, a
  one-line barrel export, or a regex broadening that has direct precedent in the same file.
- **Job 2: the `core/commands/appliers.ts` coupling is NOT structurally required.** The generic
  registry mechanism (`EntityReverter`, `RevertRegistry`, `createRevertRegistry()`) has zero
  dependency on `features/post`/`features/settings` today. Only the two concrete reverter
  implementations need `features/post` knowledge, and the composition root
  (`server/deps.ts`/`server/app.ts`) that would need to absorb them already exists, already
  constructs `postRepo`/`settingsRepo`, and already feeds a deps bag to the one route
  (`server/routes/admin/change-sets/revert.ts`) that currently builds the registry itself. The
  `features/settings` half of the coupling costs nothing to remove today because it is **unused at
  runtime** — verified: `SettingsRepoPort` is declared on `ReverterDeps` but never read inside either
  reverter's body, forward-reserved for a `presentation-settings` reverter that does not exist yet
  (checked `features/presentation/` directly — no reverter file, no `version` field on the record;
  the file's own comment describing this as deferred is accurate). Recommend the inversion over a
  documented exception, consistent with this repo's standing "prefer swappable ports/adapters... do
  not bypass dependency inversion for speed" rule — see §2 for the concrete cost.

---

## Job 1 — `features/post`'s 25 `no-deep-imports` violations

Confirmed live: **25 violations, all under the single `no-deep-imports:features/post` rule** — the
two companion rule variants (`no-deep-value-imports-from-db-sqlite:features/post` and
`no-non-seam-deep-imports-from-tool-registration-caller:features/post`) contribute zero. The
barrel, `src/features/post/index.ts`, re-exports: `classifyStatusTransition`, `createPost`,
`deletePost`, `isTrashed`, `getAdminPostById`, `getAdminPostByIdOrSlug`, `getPublishedPostBySlug`,
`findPublishedPostById`, `listAdminPages`, `listAdminPosts`, `listPublishedPosts`, `updatePost`,
plus constants/errors, plus `type PostRecord`/`PostRepoPort`/`PostBodyFormat`/`PostKind`/`PostStatus`
(from `post.ts`); the search contract (from `search.ts`); and, notably — **unlike every other traced
module** — the concrete adapters themselves: `InMemoryPostRepo`, `SqlitePostRepo`,
`InMemoryPostSearchIndex`, `SqlitePostSearchIndex`. This last point is why so many of the 25 turn
out to be Category 1 even where the target is `repo.memory.ts`: in every other traced module,
`repo.memory.ts`/`repo.sqlite.ts` imports are Category 3 (composition-root adapter selection,
correctly ungated), but `features/post`'s barrel already puts those same classes behind its own
front door, so bypassing it here is a real wrong-door case, not the systemic pattern.

### Target: `post.ts` (16 edges)

| Importer | Line | What's imported | Category | Verdict |
|---|---|---|---|---|
| `src/routing/ports.ts` | 18 | `PostRepoPort` (type) | **1** | Barrel exports it. Redirect `../features/post/post` → `../features/post`. |
| `src/routing/routing.ts` | 22 | `PostRecord` (type) | **1** | Same. |
| `src/seo/seo.ts` | 2 | `PostKind`, `PostRecord`, `PostRepoPort` (type) | **1** | All three exported. Redirect `../features/post/post` → `../features/post`. |
| `src/seo/sitemap.ts` | 2 | `PostRepoPort` (type) | **1** | Redirect. |
| `src/seo/types.ts` | 23 | `PostRecord` (type) | **1** | Redirect. |
| `src/seo/write-service.ts` | 2 | `PostRepoPort` (type) | **1** | Redirect. |
| `src/seo/__tests__/page-head-contributor.test.ts` | 4–5 | `InMemoryPostRepo` (already via barrel, line 4) + `PostRecord` (type, deep, line 5) | **1** | Line 4 already uses the door; line 5 doesn't for no evidenced reason. Merge into one `import { InMemoryPostRepo, type PostRecord } from "../../features/post";`. |
| `src/seo/__tests__/seo.analyze.test.ts` | 4–5 | same shape | **1** | Same fix. |
| `src/seo/__tests__/seo.test.ts` | 4–5 | same shape | **1** | Same fix. |
| `src/seo/__tests__/sitemap-cache.test.ts` | 4–5 | same shape | **1** | Same fix. |
| `src/seo/__tests__/sitemap-invalidation.integration.test.ts` | 5–6 | `InMemoryPostRepo`, `updatePost` (via barrel, line 5) + `PostRecord` (deep, line 6) | **1** | Same fix. |
| `src/seo/__tests__/sitemap.test.ts` | 4–5 | same shape | **1** | Same fix. |
| `src/seo/__tests__/write-service.test.ts` | 5–6 | same shape | **1** | Same fix. |
| `src/features/pages/__tests__/metadata-edit-preserves-html.test.ts` | 5 | `createPost`, `updatePost` (value) | **1** | Both exported. Redirect `../../post/post` → `../../post`. |
| `src/features/pages/__tests__/tool-registrations.test.ts` | 5 | `createPost` (value) | **1** | Redirect. |
| `src/server/routes/types.ts` | 19 | `BeforeSaveHookPort` (type) | **2 — missing API** | Defined in `post.ts:133`, **not** re-exported by `index.ts`. Genuinely needed for route deps typing (`RouteDeps`'s hook wiring). One-line barrel addition: `export type { BeforeSaveHookPort } from "./post";`. |

**Category tally:** 15 → Category 1; 1 → Category 2.

### Target: `repo.memory.ts` (4 edges)

| Importer | Line | What's imported | Category | Verdict |
|---|---|---|---|---|
| `src/assistant/__tests__/mcp-ui-tool-calls-route.content-search.integration.test.ts` | 11 | `InMemoryPostRepo` | **1** | Barrel exports it. Redirect `#src/features/post/repo.memory` → `#src/features/post`. |
| `src/assistant/__tests__/mcp-ui-tool-calls-route.integration.test.ts` | 11 | `InMemoryPostRepo` | **1** | Same. |
| `src/features/pages/__tests__/metadata-edit-preserves-html.test.ts` | 6 | `InMemoryPostRepo` | **1** | Same file already gets `createPost`/`updatePost` from the barrel above — merge into the same import statement. |
| `src/features/pages/__tests__/tool-registrations.test.ts` | 4 | `InMemoryPostRepo` | **1** | Same — merge with the `createPost` import from this file's other violation. |

**Category tally:** 4 → Category 1.

### Target: `search-index.memory.ts` (1 edge)

| Importer | Line | What's imported | Category | Verdict |
|---|---|---|---|---|
| `src/assistant/__tests__/mcp-ui-tool-calls-route.content-search.integration.test.ts` | 12 | `InMemoryPostSearchIndex` | **1** | Barrel exports it. Redirect. |

### Target: `tool-registrations.ts` (2 edges)

| Importer | Line | What's imported | Category | Verdict |
|---|---|---|---|---|
| `src/assistant/__tests__/mcp-ui-tool-calls-route.content-search.integration.test.ts` | 13 | `buildPostRegistrations` (value) | **3 — legitimate, exemption too narrow** | This is an MCP UI tool-calls route **integration test** building realistic fixtures against the real registration function — the identical need `2026-08-13-boundary-lint-plan.md` §3.5 already documents and blesses for `tool-registrations.comments.test.ts`. The config's `TOOL_REGISTRATION_TEST_FROM = "^src/assistant/__tests__/tool-registrations\\..+\\.test\\.ts$"` only matches files literally named `tool-registrations.<module>.test.ts`; this file does the same job under a different name. |
| `src/assistant/__tests__/mcp-ui-tool-calls-route.integration.test.ts` | 12 | `buildPostRegistrations` (value) | **3** | Same shape, same file pair (the `.content-search.` variant above is its sibling). |

### Target: `agent-tools.ts` (1 edge)

| Importer | Line | What's imported | Category | Verdict |
|---|---|---|---|---|
| `src/assistant/__tests__/byok-provider-turn.test.ts` | 8 | `postAgentToolCatalog` (value) | **3 — legitimate, exemption too narrow** | Regression test for the 2026-08-04 Gemini BYOK schema bug (`additionalProperties`/`const`/`oneOf`/nullable-array-type/numeric-enum sanitization). It needs `features/post/agent-tools.ts`'s real `TIPTAP_DOC_SCHEMA` specifically because that schema is one of the two real-world shapes (the other is `redirects/agent-tools.ts`'s numeric `enum`, also deep-imported by this same file, line 7) that triggered the original failure — a synthetic fixture wouldn't prove the fix against the actual recursive `$ref`/`$defs` tree. Same class of gap as `tool-registrations.ts` above: `TOOL_REGISTRATION_SEAM_TO` already covers `agent-tools.ts` by name, but `TOOL_REGISTRATION_TEST_FROM`'s naming convention doesn't recognize this file as a seam-contract test. |

### Target: `delete-confirmation-ui.ts` (1 edge)

| Importer | Line | What's imported | Category | Verdict |
|---|---|---|---|---|
| `src/server/__tests__/assistant-byok-routes.test.ts` | 12 | `CONTENT_POST_DELETE_TOOL_ID` (value) | **2 — missing API** | Used at lines 650/699 to build the real HTTP request body (`toolName: CONTENT_POST_DELETE_TOOL_ID`) instead of a hardcoded `"content_post_delete"` string literal — legitimate anti-drift test discipline (if the constant's value ever changes, the test breaks loudly instead of silently testing against a stale literal). Not exported by `index.ts` today; `delete-confirmation-ui.ts` has exactly one other consumer, `tool-registrations.ts` (same module, not a violation). Cheapest fix: `export { CONTENT_POST_DELETE_TOOL_ID } from "./delete-confirmation-ui";` from the barrel — a single, narrow, well-known constant, same shape as `forms/forms.ts`'s `ATTRIBUTE_NAME_PATTERN` precedent (`2026-08-13-api-surface-trace-A.md`, Category 3, "single, precise, single-purpose reuse") except here the consumer is outside the module so barreling (not a named exemption) is the right call. |

**Category tally, all 25:** Category 1 (wrong door) = **20**; Category 2 (missing from barrel) = **2**;
Category 3 (legitimate, exemption regex too narrow) = **3**.

### Proposed fixes (not applied — production source untouched per this report's mandate)

1. **Category 1 (20 edges, 15 files):** import-specifier redirects only. Every symbol was checked
   1:1 against `index.ts`'s real export list — no behavior change, no new barrel surface. Several
   files (the 7 `seo/__tests__/*`, both `features/pages/__tests__/*`) already partially use the
   barrel and only need their second, deep-going import line merged into the existing one.
2. **Category 2 (2 edges, 2 symbols):** add `export type { BeforeSaveHookPort } from "./post";` and
   `export { CONTENT_POST_DELETE_TOOL_ID } from "./delete-confirmation-ui";` to
   `src/features/post/index.ts`, then redirect the two importers.
3. **Category 3 (3 edges, 3 test files):** broaden `TOOL_REGISTRATION_TEST_FROM` in
   `.dependency-cruiser.cjs`. The `to`-side restriction (`TOOL_REGISTRATION_SEAM_TO`, already scoped
   to literal `tool-registrations.ts`/`agent-tools.ts` filenames) is what actually bounds the risk —
   the `from`-side naming convention is an accident of which file happened to get traced first, not a
   deliberate narrower policy. Concretely: either widen the regex to
   `^src/assistant/__tests__/.+\.test\.ts$` (any assistant test, since the `to` side already confines
   what it can reach) or, more conservatively, add the three files by literal name the same way
   `EXTRA_TO_EXEMPT` already does per-module. This is a config change, not a source change, and it is
   the same category of fix `2026-08-13-boundary-lint-plan.md` §3.6 already made once for
   `mcp-federation`'s test (`supabase-mcp-plugin.test.ts`) when the prototype run found the same kind
   of naming-convention gap.

### Promotion: could `no-deep-imports:features/post` go from `warn` to `error`?

**Not yet, but it is unusually close.** Unlike `assistant` (68 violations, six-section barrel still
landing) or the still-open `core/commands/appliers.ts` question in Job 2, none of `features/post`'s
25 violations require a design decision — every one resolves to a mechanical fix already fully
specified above. What has to land first:
- The 20 Category-1 redirects (zero risk, could be batched as one PR).
- The 2 Category-2 barrel exports (zero risk, one-line additions each).
- The Category-3 config broadening (zero risk to production code; slightly widens what future
  `assistant/__tests__/*.test.ts` files may reach, bounded by the existing `to`-side restriction).

Once those land, re-running the prototype/real rule against the new HEAD should show 0, at which
point `features/post` joins `comments`/`features/entries`/`features/taxonomy`/`newsletter`/`forms`/
`site-dir` as safe to promote — with the same caveat every one of those carries: promotion is a
config-file change (`severity: "warn"` → `"error"` on this one rule), decided per-module, not
something this report does unilaterally.

---

## Job 2 — `core/commands/appliers.ts` and ADR-018

### What ADR-018 actually says

`ADS-memory/reports/pipeline/001-admin-command-gateway/adr.md` (Status: ACCEPTED) specifies the
command gateway + inverse-applier registry design. The load-bearing lines for this question:

- **Module boundary diagram** (line 180): `appliers.ts` is scoped as "**(NEW)** inverse-applier
  registry: register/resolve by `(entityType, operation)` **+ post & presentation appliers**" — the
  ADR's own file-map already bundles the generic registry mechanism and the concrete per-entity
  appliers into one file. It does not separately specify a composition root for the concrete
  appliers.
- **Enforcement** (line 213): "`core/commands/*` must not import Express or any DB/adapter — depends
  only on `core/ports`." This is the constraint the current file violates.
- **API/Event Contract Summary** (line 203): describes the registry as two generic functions
  (`registerInverseApplier`, `resolveInverseApplier`) plus "Appliers: `post/update`,
  `presentation-settings/update`" — described as a capability the registry ships *with*, not
  necessarily *inside the same file as* the generic mechanism.

So the ADR is genuinely ambiguous on file placement (bundle vs. split) but **unambiguous that
`core/commands/*` must not depend on features** — the two clauses are already in tension in the
document as written, and the current code resolved that tension by keeping Enforcement's constraint
unmet, not by revisiting the module boundary diagram's bundling.

### What's actually in `appliers.ts` today, and what each piece needs

Read the full file (`src/core/commands/appliers.ts`, 220 lines). Four pieces:

1. **`EntityReverter`, `RevertRegistry`, `registryKey()`, `createRevertRegistry()`** — fully generic.
   Zero reference to `features/post` or `features/settings` anywhere in these ~20 lines.
2. **`ReverterDeps`** (the deps bag every reverter receives) — types `postRepo: PostRepoPort` and
   `settingsRepo: SettingsRepoPort`, both imported from the feature modules. `settingsRepo` is
   declared but **never read** in the file — confirmed by reading both reverter bodies in full; the
   file's own comment (lines 25–31) says it's forward-reserved for a `presentation-settings` reverter
   that doesn't exist yet. Verified this claim rather than trusting it (per this repo's own "verify
   claims in code comments" standing finding): `features/presentation/` has no reverter file and no
   `version` field on its record (`grep` for `version` in that module returns nothing) — the comment
   is accurate, not stale.
3. **`postUpdateReverter`, `postDeleteReverter`** (~120 lines) — concrete adapters implementing
   `EntityReverter`. These genuinely need `PostRecord`, `PostStatus`, `classifyStatusTransition` —
   real domain knowledge (SPEC-005 BR-08's "never re-fire the plugin hook on revert" invariant,
   `PostRecord.deletedAt` soft-delete shape) that belongs to `features/post`, not to core.
4. **`defaultRevertRegistry()`** — wires pieces 3 into an instance of piece 1.

**Who actually calls what:** `core/commands/revert.ts` (the executor) imports **only the types**
`RevertRegistry`/`ReverterDeps` from `./appliers` — it never touches `features/post` and requires no
change under any fix. The only production caller of `defaultRevertRegistry()` is
`src/server/routes/admin/change-sets/revert.ts:22`, which calls it once at route-registration time
and separately reads `deps.postRepo`/`deps.settingsRepo` (lines 55–56) off the app's existing
`RouteDeps` bag to build `reverterDeps`. That `RouteDeps` bag is already constructed in
`server/deps.ts` (SQLite path) and `server/app.ts` (in-memory path) — both are already-blessed
composition roots (`COMPOSITION_ROOTS` in `.dependency-cruiser.cjs`) that already instantiate
`postRepo`/`settingsRepo` concretely and already assemble everything else a route needs. Blast
radius beyond `appliers.ts` itself: exactly 2 test files
(`core/commands/__tests__/post-delete-reverter.test.ts`,
`core/commands/__tests__/integration/revert-plugin-ext.integration.test.ts`) import the concrete
reverters/`defaultRevertRegistry` today — both already counted as accepted test-file violations in
`core-no-server-or-app-imports`'s own §1.3 recommendation to exclude test files.

### Verdict: structurally required, or an artifact an inversion would remove?

**An artifact. The inversion is available and cheap — this is not a case for a documented
exception.**

- The part of `appliers.ts` that is genuinely "core" (the registry mechanism) has no coupling at all
  today; it's the two concrete reverters that carry it, and they are adapter code by definition —
  the same "consumer of a port defines its shape; the adapter imports that shape to implement it"
  direction `2026-08-13-boundary-lint-plan.md` §3.4 already names as textbook-correct for
  `db/sqlite`'s reverse case (there, a `db/sqlite` adapter reaches up for a port type; here, a
  `features/post` adapter would reach up for the same `EntityReverter` port type — same direction,
  same justification).
- The `features/settings` half of the coupling costs **nothing** to remove today, because nothing
  in this file currently uses it — it's a forward-declared field for a reverter that hasn't been
  built.
- The composition root this inversion needs isn't hypothetical or newly invented — `server/deps.ts`
  and `server/app.ts` already do exactly this job for `postRepo`/`settingsRepo` themselves. Adding
  one more field (a pre-registered `RevertRegistry`, or simply exposing `postUpdateReverter`/
  `postDeleteReverter` for the route to register itself) to the same `RouteDeps` bag those two files
  already build is the same shape as everything else already there, not a new pattern being
  introduced for this one case.

**Concrete cost of the inversion** (~4–5 files, no behavior change):
1. Move `postUpdateReverter`, `postDeleteReverter`, and their private restore logic (~120 lines) from
   `core/commands/appliers.ts` into a new `src/features/post/reverters.ts`, importing
   `EntityReverter`/`ReverterDeps` **types** from `core/commands` — the correct inward-pointing
   direction (features depending on core types is normal and already how every feature module
   consumes `@jini-ai/cms/core`; no rule forbids it). `classifyStatusTransition` becomes a same-module
   import once the reverters live in `features/post`.
2. `appliers.ts` keeps only `EntityReverter`, `RevertRegistry`, `createRevertRegistry()`. To get it to
   **zero** cross-feature imports (not just zero concrete-reverter imports), `ReverterDeps` needs to
   move too, since its `postRepo`/`settingsRepo` fields are typed with `PostRepoPort`/
   `SettingsRepoPort` from the feature modules — even type-only, `core-no-server-or-app-imports` has
   no type-only carve-out (unlike the `no-deep-imports` family's `db/sqlite` exemption), so a
   type-only `ReverterDeps` left behind in `appliers.ts` would still trip it. Two honest options,
   genuinely a design call rather than a mechanical one:
   - **(a)** Move `ReverterDeps` alongside the reverters into `features/post` (or a small new
     `core/commands`-adjacent home outside `core/commands` itself) — simplest, but `revert.ts`
     (core) currently references `ReverterDeps` by name in its own `RevertChangeSetDeps` interface,
     so that reference would itself become a features-import unless `revert.ts` is changed to accept
     a generically-typed deps bag instead.
   - **(b)** Keep `ReverterDeps` in `core/commands` but generalize its shape (e.g.
     `Record<string, unknown>`, with each concrete reverter casting internally) — preserves
     `revert.ts`'s current zero-features-import status without moving the interface, at the cost of
     losing compile-time checking on what a reverter's deps actually contain.
3. Add the registered instance to `RouteDeps`, built once in `server/deps.ts` + `server/app.ts`
   (already-blessed composition roots), replacing `server/routes/admin/change-sets/revert.ts:22`'s
   own `defaultRevertRegistry()` call with a read off `deps`.
4. Redirect the 2 test files' imports to the new location.

None of this requires inventing a new abstraction, a new composition root, or a new architectural
concept — every piece the inversion needs (the port/adapter direction, the composition-root deps
bag) already exists in the codebase for other entities. This is squarely what this repo's standing
rule means by "prefer swappable ports/adapters over provider-coupled implementations in core... do
not bypass dependency inversion for speed" — the speed shortcut here was bundling the adapter into
the port's own file, and undoing that is a move, not a redesign.

**Recommendation:** do not grant `core/commands/appliers.ts` a documented exception. The coupling is
removable at low, well-scoped cost, with the target location for the wiring already established by
the existing composition-root pattern. Until the inversion lands, `core-no-server-or-app-imports`
should stay `warn` (agrees with `2026-08-13-boundary-lint-plan.md` §2's existing recommendation) —
promoting it now would either turn CI red on this one finding or force an unreviewed, rushed
exception into the config, which is exactly the "tuned until it passes" pattern this session's own
prior work has flagged twice already. The design choice between sub-options (a) and (b) above for
`ReverterDeps` is the one piece of this that isn't purely mechanical and is worth a deliberate
owner/Architect call rather than a unilateral pick — everything else in the inversion has no
remaining open question.

---

## What's next (not started, for whoever picks this up)

1. Land the Job 1 fixes (20 redirects + 2 barrel exports + 1 config-regex broadening) and re-run
   `no-deep-imports:features/post` against the new HEAD to confirm 0, then promote that one rule to
   `error`.
2. Get an owner/Architect decision on `ReverterDeps`'s destination (option a vs. b above), then
   execute the `appliers.ts` → `features/post/reverters.ts` + `server/deps.ts`/`server/app.ts`
   inversion. This resolves `core-no-server-or-app-imports`'s last 2 real violations, at which point
   that rule can promote to `error` too (all 22 remaining violations on it are already-accepted test
   files per `2026-08-13-boundary-lint-plan.md` §1.3).
3. Neither fix is blocked on the other — Job 1 and Job 2's fixes touch disjoint files and could land
   as two independent PRs in either order.
