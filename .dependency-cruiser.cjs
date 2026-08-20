/**
 * SPEC-022 REQ-11 — report-only import-boundary baseline (ADR-046 Research Summary's library
 * decision: `dependency-cruiser`, not a custom AST analyzer — Article I Library-First).
 *
 * `severity: "warn"` everywhere, deliberately — REQ-11 is explicit that this is non-blocking in
 * Phase 0 (no CI pipeline exists yet to make it a gate; see implementation-outline.md's "Scope
 * Adjustment Disclosed"). `npm run check:boundaries` runs this and always exits 0 for ordinary
 * rule violations (EC-05: only a genuine tool crash should look different from "zero
 * violations" — dependency-cruiser's own non-zero exit on a tool error already gives us that).
 *
 * `no-deep-imports:<module>` and its two companion rule families (below `HAND_WRITTEN_RULES`) are
 * ADR-009 Decision §1's other half — "a module's public surface is its `index.ts`; boundary lint
 * forbids deep imports" — designed and prototype-verified against committed HEAD in
 * `ADS-memory/reports/architecture/2026-08-13-boundary-lint-plan.md`. Also `severity: "warn"`,
 * for the same REQ-11 reason, AND because 18 of the 30 guarded modules have not had the
 * per-file Category 1/2/3 triage the plan doc's §3.8 gives the other 12 — see that doc before
 * promoting any one of these past `warn`.
 */
const HAND_WRITTEN_RULES = [
    {
      // Promoted to `error` (2026-08-13 features-post-deep-import-trace.md Job 2): the last 2 real
      // violations (`core/commands/appliers.ts` -> `features/post/index.ts`/`features/settings/
      // index.ts`) were the two concrete post reverters, moved to `features/post/reverters.ts` —
      // adapter code, not core. The `pathNot` test-file exclusion below was a ready-to-apply
      // recommendation from `2026-08-13-boundary-lint-plan.md` §1.3, not yet landed until now: all
      // 21 remaining violations are contract/integration tests instantiating a concrete adapter
      // (`db/sqlite/*`, `db/postgres/db-ops.ts`, or — post Job 2 — the post reverters via
      // `features/post/index.ts`) to exercise a real implementation against its port contract,
      // which the plan doc's own reasoning treats as orthogonal to this rule's production-layering
      // concern (§1.3: "you cannot write a contract test without a concrete implementation").
      name: "core-no-server-or-app-imports",
      severity: "error",
      comment: "src/core/** may not import src/server/**, apps/**, feature modules, or concrete infrastructure adapters.",
      from: { path: "^src/core", pathNot: ".*/__tests__/.*" },
      to: { path: "^(src/server|apps|src/features|src/db)" },
    },
    {
      // Widened `from` (2026-08-19, architecture step 2) from `^src/features` to also cover
      // `assistant`/`widgets`/`export` — the rule's own name says "feature/domain code" but its
      // `from` only ever matched `src/features`, so `src/assistant`, `src/widgets`, and
      // `src/export` (equally domain/feature-shaped code, equally not the composition root) were
      // invisible to it. Widening surfaced 41 previously-unseen edges (9 -> 50) — every single one
      // of them, in both the original 9 and the newly-surfaced 41, turned out to be a TYPE-ONLY
      // edge except 9 (all in `__tests__/`, all a real `import express from "express"` to build a
      // throwaway app/route double for an integration test). `dependencyTypesNot: ["type-only"]`
      // below is the exact fix, and an already-established one: `only-composition-constructs-
      // concrete-adapters` above uses the identical mechanism for the identical reason — a
      // `import type { RouteDeps }`/`import type { Request, Response }` edge cannot construct a
      // concrete Express app or mount a route; it is a dependency-injection PARAMETER TYPE, not the
      // runtime coupling this rule exists to catch (verified per-edge via `depcruise --output-type
      // json`'s own `dependencyTypes` field before adding this, not assumed). The remaining 9
      // `__tests__/`-only value imports get the same `pathNot: ".*/__tests__/.*"` exemption
      // `core-no-server-or-app-imports`/`only-composition-constructs-concrete-adapters`/
      // `site-dir-no-server-express-or-cli-imports` above already use for "a contract/integration
      // test needs the real concrete internals" — each of the 9 is exactly that shape (constructs a
      // real `createRouteDeps()` + a throwaway `express()` stub to exercise real route/tool wiring
      // end-to-end, never shipped). With both exemptions applied, production violations verified at
      // 0 across the widened `from` — promoted to `error` accordingly (2026-08-19 architecture plan
      // step 2 of 3; see `ADS-memory/reports/2026-08-19-architecture-step2-boundary-closure.md`).
      name: "feature-no-express-or-admin-imports",
      severity: "error",
      comment: "Feature/domain code (features/assistant/widgets/export) may not import Express as a runtime VALUE, route handlers, or admin-app code. A type-only edge (DI parameter types like RouteDeps/Request/Response) is exempted, same as only-composition-constructs-concrete-adapters' identical exemption for src/db. __tests__/ integration tests that construct a real Express app to exercise route wiring end-to-end are exempted too, same pattern as the other hand-written rules above.",
      from: { path: "^src/(features|assistant|widgets|export)", pathNot: ".*/__tests__/.*" },
      to: { path: "^(node_modules/express|src/server/routes|apps/admin)", dependencyTypesNot: ["type-only"] },
    },
    {
      name: "only-composition-constructs-concrete-adapters",
      severity: "warn",
      // This rule polices RUNTIME construction of a concrete `src/db` adapter from feature code, not
      // type contracts — `dependencyTypesNot: ["type-only"]` below (same mechanism the
      // `no-deep-value-imports-from-db-sqlite` rule family uses, for the identical reason) excludes
      // `import type` edges, e.g. a feature importing `db/drift`'s `DriftStatus`/`SchemaSnapshot`
      // types for its own port surface. A `type`-only import cannot construct a concrete adapter, so
      // flagging it here was a false positive (`database/adapter.sqlite.ts`, 2026-08-17 — its own
      // header documents that the concrete adapter itself already moved to `db/sqlite/`, leaving only
      // the port + types behind under a name kept for import-path stability).
      comment: "Only bootstrap/composition modules (server/deps.ts, server/app.ts, index.ts) may select production implementations directly.",
      // `repo.*` was the only adapter filename convention when this rule was written. Posts' search
      // index (`features/post/search-index.{sqlite,memory}.ts`) is the same category of file — a
      // concrete storage adapter behind a port — under a different name, because it backs
      // `PostSearchPort` rather than `PostRepoPort`. Exempted by name for the same reason `repo.*`
      // is, not as a loosening: everything else under `src/features` still may not reach `src/db`.
      // `html-document-store.{sqlite,memory}.ts` (Pages' `HtmlDocumentStore` port, 2026-08-17) is the
      // same category again — a real adapter (`html-document-store.sqlite.ts` value-imports the
      // `posts` drizzle table) renamed to carry the `.sqlite.ts` marker rather than special-cased by
      // literal filename, so the exemption keeps meaning what it says: only a file whose OWN name
      // honestly discloses "concrete adapter" is exempt from this rule.
      //
      // `.*/__tests__/.*` (2026-08-17): the remaining 22 warnings this rule produced were all
      // `__tests__/**` files spinning up a real `db/sqlite/content-db.ts`/`db/schema.ts` to exercise
      // a genuine SQLite-backed integration/contract test — precisely what an integration test is
      // for, and the same reasoning `core-no-server-or-app-imports` above already applies via the
      // identical `.*/__tests__/.*` pattern (reused verbatim here rather than a new one, per that
      // rule's own comment: "contract/integration test needs the real concrete internals"). Scoped to
      // the `__tests__/` DIRECTORY segment specifically, not "any filename containing the word
      // test" — a production file named e.g. `*.test-helpers.ts` outside a `__tests__/` directory is
      // still fenced. This is a legitimacy fix, not a loosening: it stops this rule from double-
      // counting known-legitimate integration tests so its remaining signal is real, which is also a
      // precondition for ever promoting it past `warn`.
      from: { path: "^src/features", pathNot: ["^src/features/.*/(repo|search-index|html-document-store)\\.(sqlite|memory)\\.ts$", ".*/__tests__/.*"] },
      to: { path: "^src/db", dependencyTypesNot: ["type-only"] },
    },
    {
      // `from.pathNot: ".*/__tests__/.*"` (2026-08-18, never-investigated-rule triage): the one
      // remaining violation is `read-template.unit.test.ts` importing `server/seed.ts`'s
      // `seededWorkspace`/`seededPosts`/`seededPresentation` — REQ-02's own binding rule is that
      // `readTemplate("starter")`'s seed content is byte-equivalent to server/seed.ts's CURRENT
      // live output, verified by direct deep-equality against the live export rather than a
      // hand-copied fixture "so it can never silently drift" (see the test file's own header).
      // That is a genuine cross-boundary anti-drift check, not a production dependency — INV-06
      // (site-dir stays CLI/Express-agnostic so a future non-CLI host, ADR-011, can reuse it) is
      // about PRODUCTION code; grep confirms this is the ONLY server/cli/express import anywhere
      // under src/site-dir/, and it is confined to __tests__/. Same "contract/integration test
      // needs the real concrete internals" reasoning `core-no-server-or-app-imports` and
      // `only-composition-constructs-concrete-adapters` (both above) already accept via the
      // identical `.*/__tests__/.*` pattern — reused verbatim, not a new exemption shape.
      name: "site-dir-no-server-express-or-cli-imports",
      severity: "warn",
      comment: "SPEC-003 (ADR-PIPE-003) — src/site-dir/** is the install-dir domain and must stay CLI/Express-agnostic (INV-06) so a future non-CLI caller (the desktop host, ADR-011) can reuse it directly.",
      from: { path: "^src/site-dir", pathNot: ".*/__tests__/.*" },
      to: { path: "^(src/server|src/cli|node_modules/express)" },
    },
    {
      name: "cli-no-direct-drizzle-imports",
      severity: "warn",
      comment: "SPEC-003 (ADR-PIPE-003) — src/cli/** dispatches to site-dir/server only; it never touches Drizzle or the schema module directly.",
      from: { path: "^src/cli" },
      to: { path: "^(drizzle-orm|src/db/schema\\.ts)" },
    },
    {
      name: "plugin-loading-internals-confined-to-plugin-runtime",
      severity: "warn",
      comment:
        "SPEC-005 (ADR-005-ARCH Enforcement) — Node's module-customization/loader internals ('node:module' for module.register(), 'node:vm', and the SDK-resolution boot hook) are plugin-loading internals. Only src/features/plugin-runtime/** and the one boot module that registers the resolver (src/server/boot/plugin-sdk-resolver.ts, CIC U-002) may reach them; everything else consumes plugins through plugin-runtime's own exports. Keeps the in-process ESM loader a single auditable surface — ADR-024 Tier-3 (first-party/explicitly-sideloaded code), NOT an isolated sandbox.",
      from: {
        path: "^src",
        // Exempt: plugin-runtime itself; the resolver module and its own certified suite; and
        // src/index.ts, which CIC U-002-B1 REQUIRES to call registerPluginSdkResolver() during
        // boot before any route is reachable — that call site is the constraint, not a breach.
        pathNot:
          "^(src/features/plugin-runtime|src/server/boot/plugin-sdk-resolver\\.ts|src/server/boot/__tests__|src/index\\.ts$)",
      },
      to: { path: "^(node:module|node:vm|src/server/boot/plugin-sdk-resolver\\.ts)$" },
    },
];

// ---------------------------------------------------------------------------------------------
// no-deep-imports:<module> — ADR-009 Decision §1. Generated, not hand-written, because it's the
// same three-rule shape repeated once per guarded module (30 modules × 3 rules = 90 rules) — see
// ADS-memory/reports/architecture/2026-08-13-boundary-lint-plan.md §3 for the full design
// reasoning. Every exemption below is sourced from that document's evidence, not invented here.
// ---------------------------------------------------------------------------------------------

// Only modules with a committed `index.ts` are guarded — a module without a door has no door to
// bypass. `src/index.ts`, `src/core/index.ts`, `src/features/index.ts` are excluded on purpose:
// they're pure re-export aggregators (verified by reading them), not domain modules with private
// internals of their own — guarding them would make a legitimate deep-but-nested door (e.g.
// `features/post/index.ts`, reached via `from "../../features/post"`) look like a violation of
// the umbrella. `widgets` and `features/recovery` are excluded too, deliberately: both have real,
// large internals and no `index.ts`, and the plan doc's source trace
// (`2026-08-13-api-surface-trace-B.md`) read every file in both and found no barrel to bypass
// would be real narrowing — adding one and redirecting importers would relabel the same
// commitment under one path, the exact anti-goal the plan doc's own dispatch ruled out.
const GUARDED_MODULES = [
  "analytics",
  "assistant",
  "comments",
  "core/commands",
  "core/events",
  "features/commerce",
  "features/content-types",
  "features/deployments",
  "features/entries",
  "features/pages",
  "features/post",
  "features/presentation",
  "features/settings",
  "features/taxonomy",
  "features/theme",
  "features/workspace",
  "forms",
  "headless",
  "http",
  "mail",
  "media",
  "members",
  "navigation",
  "newsletter",
  "origin",
  "redirects",
  "routing",
  "seo",
  "site-dir",
  // Renamed from "integrations" (2026-08-17) — the folder is `src/webhooks/` now. The rule name
  // is derived from this string, so leaving the old value here would have silently retired the
  // module's ~88 no-deep-imports warnings without a single one being fixed.
  "webhooks",
  "widgets/resolvers",
];

// Composition roots select concrete implementations directly by design — the same set
// "only-composition-constructs-concrete-adapters" above already names ("Only bootstrap/
// composition modules ... may select production implementations directly"). `cli/commands/
// {serve,init,introspect}.ts` are a second, independent composition root for the CLI process,
// same role as `server`'s two files for the HTTP process (confirmed: `cli/commands/serve.ts`'s
// own docblock names this explicitly; see plan doc §3 / trace-A's site-dir section).
// `export.ts` joined 2026-08-18 (no-deep-imports:site-dir triage) — it is architecturally
// identical to `serve.ts`: both call `createSqliteRouteDeps` (`server/deps.ts`) and reach
// `site-dir/boot-site-dir.ts`'s `bootSiteDir` + `site-dir/resolve-install-dir-target.ts`'s
// `resolveInstallDirTarget` directly to assemble the same boot composition, minus the
// `app.listen` half (the exporter crawls the app instead of serving it).
const COMPOSITION_ROOTS = [
  "^src/index\\.ts$",
  "^src/server/deps\\.ts$",
  "^src/server/app\\.ts$",
  "^src/cli/commands/(serve|init|introspect|export)\\.ts$",
];

// db/sqlite adapters implement other modules' port interfaces by definition (ports-and-adapters).
// They legitimately need the port TYPE from wherever it's declared, even when that declaration
// isn't exported through the module's general-purpose barrel — but never a runtime VALUE, which
// would be reaching for behavior instead of a contract. Confirmed both independently and by
// `2026-08-13-api-surface-trace-assistant.md` §3.2: "the textbook-correct hexagonal direction:
// the consumer of a port defines its shape; the adapter imports that shape to implement it."
const DB_SQLITE = "^src/db/sqlite";

// CODEBASE-WIDE SEAM: every domain module's own tool-registrations.ts/agent-tools.ts is a second,
// deliberate public surface. `assistant/tool-registrations.ts` imports ALL 22 domains this way
// (confirmed by reading it directly), and `features/taxonomy/index.ts`'s own header names it
// explicitly: "tool-registrations.ts ... is the seam assistant/tool-registrations.ts reaches
// uniformly across domains." All three 2026-08-13 trace reports confirm the same for their own
// modules. Production registrar: restricted to the seam files only. Its own contract tests
// (`assistant/__tests__/tool-registrations.*.test.ts`) get full access to their target module —
// the same "contract/integration test needs the real concrete internals" pattern the hand-written
// rules above already accept, evidenced by `tool-registrations.comments.test.ts` reaching
// `comments/{hooks,repo.memory,settings,types,write-service}.ts` to build realistic fixtures.
// 2026-08-17: the Stage 2 registry rollout MOVED this seam's caller. Domains no longer sit in
// `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array (which is now empty save two
// env-gated demo stubs); each domain instead calls `registerToolContributor` itself, and
// `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()` imports all 25
// `contribute<Domain>Tools` functions at boot. That made the production registrar a second seam
// caller. It was not added here at the time, so all 25 conversions came through an UNREGISTERED
// door: 19 violations (18 `warn`, plus 1 `error` for `features/post`, the one module promoted in
// `PROMOTED_NO_DEEP_IMPORTS`). Registered narrowly here rather than by adding the file to
// `COMPOSITION_ROOTS` — a composition-root entry grants blanket access to every module's
// internals, whereas the seam entry is re-policed by
// `no-non-seam-deep-imports-from-tool-registration-caller` below and so still allows ONLY the
// seam files. Same reasoning as `TOOL_REGISTRATION_TEST_FROM_EXTRA`'s name list: bless what was
// reviewed, not a broader shape that would quietly bless more.
const TOOL_REGISTRATION_SEAM_FROM =
  "^src/(assistant/tool-registrations|server/tool-catalog-manifest)\\.ts$";
// `publish-agent-tools.ts` is `static-publish`'s tool-registration seam under a non-conforming
// name — the `-` before `agent-tools` defeats the `(^|/)` anchor, so it needs naming explicitly.
// Exempted by name for the same reason `search-index.*` is in
// `only-composition-constructs-concrete-adapters` above: same category of file, different
// filename convention. Not a loosening — everything else in the module stays fenced.
const TOOL_REGISTRATION_SEAM_TO =
  "(^|/)(tool-registrations|agent-tools|publish-agent-tools)\\.ts$";
const TOOL_REGISTRATION_TEST_FROM = "^src/assistant/__tests__/tool-registrations\\..+\\.test\\.ts$";

// Three more assistant test files do the identical job as the naming-convention match above (build
// fixtures against a domain's real tool-registrations.ts/agent-tools.ts seam rather than a synthetic
// stand-in) but don't follow the `tool-registrations.<module>.test.ts` name —
// `2026-08-13-features-post-deep-import-trace.md` Job 1 Category 3 verified each individually:
// `byok-provider-turn.test.ts` is the regression test for the 2026-08-04 Gemini BYOK schema bug and
// needs `features/post/agent-tools.ts`'s real recursive schema, not a fixture; the two
// `mcp-ui-tool-calls-route.*.test.ts` files are route integration tests needing `buildPostRegistrations`
// wired for real. Listed by name rather than folded into `TOOL_REGISTRATION_TEST_FROM`'s regex:
// broadening that regex to match any `assistant/__tests__/*.test.ts` would also stop enforcing the
// naming discipline for every future assistant test file, not just these three already-audited ones —
// a name list that only blesses what was actually reviewed is more honest than a regex that would
// quietly bless more than intended.
// `tool-contribution-registry.test.ts` (2026-08-18 no-deep-imports:comments triage) is the same
// shape again: it imports `commentsAgentToolCatalog` from `comments/agent-tools.ts` and dynamically
// imports `contributeCommentsTools` from `comments/tool-registrations.ts` to verify one domain's
// real registration output end-to-end (the rest of the file drives all 25 domains generically via
// `installFirstPartyToolContributors()`, which is not itself a deep import of any one module).
const TOOL_REGISTRATION_TEST_FROM_EXTRA = [
  "^src/assistant/__tests__/byok-provider-turn\\.test\\.ts$",
  "^src/assistant/__tests__/mcp-ui-tool-calls-route\\.integration\\.test\\.ts$",
  "^src/assistant/__tests__/mcp-ui-tool-calls-route\\.content-search\\.integration\\.test\\.ts$",
  "^src/assistant/__tests__/tool-contribution-registry\\.test\\.ts$",
];

// Per-module extra exceptions beyond the generic carve-outs above, each sourced directly from the
// already-reviewed 2026-08-13 API-surface trace reports rather than re-derived. Modules not in
// this map either have no exceptions beyond the generic ones (comments, entries — their trace
// found nothing else needed) or haven't been traced yet (everything outside the 9 modules the
// three trace reports cover — see plan doc §3.8/§5 for the list and next steps).
const EXTRA_TO_EXEMPT = {
  // trace-assistant §3.2 confirms mcp-federation/{config,presets}.ts by name as a deliberate
  // plugin-registration seam ("a first-party plugin module registering itself against a public
  // registry ... correct today and needs no fix"). ports.ts/trust.ts are reached the same way by
  // the plugin's own test (not counted in the trace's edge metric, which excludes test files).
  // adapter.stdio.ts, adapter.memory.ts, registrations.ts, bootstrap.ts stay guarded — nothing
  // outside assistant reaches them today.
  assistant: ["^src/assistant/mcp-federation/(config|presets|ports|trust)\\.ts$"],
  // trace-B §2: features/taxonomy/index.ts's own header names gated-hooks.ts as deliberately
  // excluded ("composes core/gated-mutations, a kernel that has not been extracted, so it is
  // composition over a host-owned module") — reached by a non-composition-root route handler.
  "features/taxonomy": ["^src/features/taxonomy/gated-hooks\\.ts$"],
  // trace-A's forms section (F-1): exposes only ports.ts/errors.ts/types.ts through the new
  // index.ts, deliberately leaving these Category-3 single-purpose files reached directly by
  // their one dedicated caller — barreling them would be "inventing a dispatcher nobody asked
  // for" (the trace's own words).
  forms: [
    "^src/forms/forms\\.ts$",
    "^src/forms/notify-subscriber\\.ts$",
    "^src/forms/submit-service\\.ts$",
    "^src/forms/write-service\\.ts$",
  ],
  // trace-A's newsletter section (N-1): exposes only errors.ts/ports.ts through the new index.ts,
  // deliberately leaving these 7 Category-3 files — each already funneled through a scoped local
  // composition file (server/routes/admin/newsletter/deps.ts, type-only) or reached by one
  // dedicated route handler per function, the same "fragmented HTTP route handler" shape as
  // forms' write-service.ts above.
  newsletter: [
    "^src/newsletter/campaign-write-service\\.ts$",
    "^src/newsletter/confirmation\\.ts$",
    "^src/newsletter/hooks\\.ts$",
    "^src/newsletter/lists\\.ts$",
    "^src/newsletter/send-pipeline\\.ts$",
    "^src/newsletter/subscriptions\\.ts$",
    "^src/newsletter/unsubscribe\\.ts$",
  ],
  // 2026-08-17 no-deep-imports:features/deployments triage: `static-publish/` and
  // `publish-credentials/` are genuine nested modules — each has its own directory, its own
  // `index.ts`, and its own ADR-009 §1 "Public surface for the X sub-feature" header, one level
  // below `features/deployments/index.ts`. The `noDeepImportRules` generator only special-cases
  // the TOP-level `src/${mod}/index.ts` (no first-class concept of a nested guarded sub-module),
  // so every external reach into either sub-barrel's `index.ts` was flagged as a deep import even
  // though it is already going through that sub-feature's own curated door. Re-exporting both
  // sub-barrels' content through the parent `index.ts` instead was tried and reverted — it moved
  // propagation cost (all-import) 11.56% -> 15.36%, because every OTHER consumer of the parent
  // barrel (e.g. anyone reaching only `DeploymentsReadRepoPort`) would have inherited both
  // sub-features' entire transitive graph too. Only each sub-barrel's own `index.ts` is exempted —
  // every other file inside `static-publish/`/`publish-credentials/` (types.ts, adapter.ts,
  // store.ts, verify.ts, etc.) stays guarded; this does not loosen access to those.
  //
  // `publish-agent-tools.ts` is exempted too, for a related but distinct reason: it is this
  // module's own tool-registration seam file (`TOOL_REGISTRATION_SEAM_TO` below already names it
  // by pattern), and it imports `RouteDeps` from `server/routes/types.ts` — routing it through the
  // top `index.ts` barrel measured propagation cost (all-import) at 15%+ (vs. an 11.56% baseline)
  // because every barrel consumer would inherit that god-type's entire reachable set. Its two real
  // external consumers today (`server/__tests__/routes/publish-site-route.test.ts`, `assistant/
  // __tests__/mcp-ui-tool-calls-route.static-publish.integration.test.ts`) build the real
  // registrations directly to verify route wiring end-to-end, the same shape every other domain's
  // tool-registrations/agent-tools seam already gets reached by its own contract tests.
  "features/deployments": [
    "^src/features/deployments/(static-publish|publish-credentials)/index\\.ts$",
    "^src/features/deployments/publish-agent-tools\\.ts$",
  ],
};

// Modules whose `no-deep-imports:<mod>` rule has had its full per-file Category 1/2/3 triage done
// (every violation resolved to a mechanical redirect, a barrel export, or a named config exemption —
// no open design question) and re-verified at 0 violations are promoted from `warn` to `error` here.
// Promotion is per-module and applies only to the primary `no-deep-imports` rule; the two companion
// rule families (`no-deep-value-imports-from-db-sqlite`, `no-non-seam-deep-imports-from-tool-
// registration-caller`) stay `warn` until they get the same triage.
const PROMOTED_NO_DEEP_IMPORTS = new Set([
  // 2026-08-13-features-post-deep-import-trace.md — 25 violations (20 wrong-door redirects, 2
  // barrel additions, 3 tool-registration-seam exemptions), re-verified at 0 after the fix.
  "features/post",
  // 2026-08-17 no-deep-imports:features/deployments triage — 19 violations (2 EXTRA_TO_EXEMPT
  // registrations covering 3 files — static-publish/index.ts, publish-credentials/index.ts,
  // publish-agent-tools.ts, all pre-existing legitimate doors the rule generator had no way to
  // recognize — plus 2 barrel additions to index.ts and 2 redirects up to the publish-credentials
  // sub-barrel), re-verified at 0 after the fix.
  "features/deployments",
  // 2026-08-17 long-tail sweep (12-module dispatch) — each driven to 0 and re-verified:
  //  - origin: 5 wrong-door redirects (newsletter/{unsubscribe,launch-gate,confirmation}.ts).
  //  - features/theme: 1 wrong-door redirect + 1 barrel addition (theme-files.ts's Explore-screen
  //    file read/write surface, no self-cycle risk, no exclusion note).
  //  - features/commerce: 1 wrong-door redirect + 1 barrel addition (storefront.ts's read-model
  //    mapper, matching the barrel's own `export *` pattern).
  //  - seo: 1 wrong-door redirect (put-entry.ts's invalidateSitemapCache).
  //  - routing: 1 wrong-door redirect (seo.ts's RouteResolverDeps type).
  //  - members: 1 wrong-door redirect (server-modules.unit.test.ts's ConsoleMailerAdapter).
  "origin",
  "features/theme",
  "features/commerce",
  "seo",
  "routing",
  "members",
  // 2026-08-18 cheap-tail sweep (session 16 handoff's "Next Steps" item 1) — each driven to 0 and
  // re-verified:
  //  - widgets/resolvers: 3 wrong-door redirects, all onto a new barrel addition (the three real
  //    v1 resolver factories — createRecentEntriesResolver/createMenuResolver/
  //    createContactFormResolver — each reached only by its own dedicated unit/integration test).
  //  - media: 2 wrong-door redirects (CORE_PUBLIC_TRANSFORM_NAME, already re-exported from
  //    index.ts via bootstrap.ts).
  //  - comments: 2 warnings resolved by adding tool-contribution-registry.test.ts to
  //    TOOL_REGISTRATION_TEST_FROM_EXTRA (same shape as the three test files already there — a
  //    contract test building fixtures against a domain's real tool-registrations.ts/agent-tools.ts
  //    seam), not a barrel change.
  //  - site-dir: 2 warnings resolved by adding cli/commands/export.ts to COMPOSITION_ROOTS — it is
  //    architecturally identical to serve.ts (same bootSiteDir/resolveInstallDirTarget reach). Its
  //    no-deep-value-imports-from-db-sqlite:site-dir companion warning (1, schema-guard.ts) is
  //    untouched by this promotion — companion rules stay warn until their own triage.
  "widgets/resolvers",
  "media",
  "comments",
  "site-dir",
]);

function noDeepImportRules(mod) {
  const modPath = `^src/${mod}`;
  const internals = `^src/${mod}/(?!index\\.ts$).+`;
  const extraToExempt = EXTRA_TO_EXEMPT[mod] ?? [];

  return [
    {
      name: `no-deep-imports:${mod}`,
      severity: PROMOTED_NO_DEEP_IMPORTS.has(mod) ? "error" : "warn", // see plan doc §5 for the promotion criteria
      comment: `ADR-009 Decision §1 — ${mod}'s public surface is its index.ts; nothing outside the module (or db/sqlite reaching for a value rather than a type, or the tool-registration seam reaching anything other than tool-registrations.ts/agent-tools.ts) may import its internals directly.`,
      from: {
        path: "^src",
        pathNot: [
          modPath,
          DB_SQLITE,
          ...COMPOSITION_ROOTS,
          TOOL_REGISTRATION_SEAM_FROM,
          TOOL_REGISTRATION_TEST_FROM,
          ...TOOL_REGISTRATION_TEST_FROM_EXTRA,
        ],
      },
      to: { path: internals, pathNot: extraToExempt },
    },
    {
      // `from.pathNot: ".*/__tests__/.*"` (2026-08-18, never-investigated-rule triage): the
      // remaining 3 violations across all 30 modules were all `db/sqlite/__tests__/*.sqlite.
      // {test,integration.test}.ts` files, not production adapters — `webhook-{subscription,
      // delivery}-repo.sqlite.test.ts` each run one shared `runContractSuite` against BOTH the
      // real `Sqlite*Repo` adapter under test AND `webhooks/repo.memory.ts`'s in-memory reference
      // implementation, to prove both satisfy the same port contract identically (the value import
      // is the reference fake, needed to construct it — not a port type);
      // `database-introspection-adapter.sqlite.integration.test.ts` calls `site-dir/schema-guard.
      // ts`'s real `runtimeSchemaVersion()` to cross-check the adapter's own introspection against
      // an independently-computed runtime schema identity. Same "contract/integration test needs
      // the real concrete internals" reasoning `core-no-server-or-app-imports` and
      // `only-composition-constructs-concrete-adapters` (both above) already accept via the
      // identical `.*/__tests__/.*` pattern — reused verbatim, not a new exemption shape. This
      // rule's own comment ("db/sqlite ADAPTERS ... never a runtime value") was always about
      // production adapter code; a test exercising two implementations against one contract suite
      // was never the concern it was written to police.
      name: `no-deep-value-imports-from-db-sqlite:${mod}`,
      severity: "warn",
      comment: `db/sqlite adapters may deep-import ${mod}'s port TYPES (the contract they implement) but never a runtime value.`,
      from: { path: DB_SQLITE, pathNot: ".*/__tests__/.*" },
      to: { path: internals, pathNot: extraToExempt, dependencyTypesNot: ["type-only"] },
    },
    {
      // The tool-registration-seam caller is excluded from the main rule above (so it isn't
      // double-flagged), but that exclusion must not become a blanket pass into the rest of the
      // module — this rule re-polices it, allowing ONLY tool-registrations.ts/agent-tools.ts.
      //
      // `from.pathNot: modPath` (2026-08-18, never-investigated-rule triage): when mod is
      // "assistant" itself, `TOOL_REGISTRATION_SEAM_FROM` matches `assistant/tool-registrations.ts`
      // — a file that LIVES INSIDE the module this instantiation is policing. Without the
      // exclusion, the rule flagged that file's own ordinary intra-module imports (its sibling
      // `tool-contribution-registry.ts`'s `listToolContributors`, and the two env-gated
      // `demo-{a2ui,choices}-tool.ts` stubs) as if they were an external seam-caller reaching in —
      // there is no such caller/callee boundary when both files are the same module's own
      // internals; every other generated rule already exempts a module's own path from checks
      // against itself (see `noDeepImportRules`'s primary rule's `pathNot: [modPath, ...]` above),
      // this one just missed it because its `from` is a fixed pattern instead of derived from
      // `mod`. Verified: `assistant`'s `EXTRA_TO_EXEMPT` entry (mcp-federation) and every other
      // guarded module are unaffected — `modPath` for any mod other than "assistant" cannot match
      // `src/assistant/tool-registrations.ts` or `src/server/tool-catalog-manifest.ts`.
      name: `no-non-seam-deep-imports-from-tool-registration-caller:${mod}`,
      severity: "warn",
      comment: `assistant/tool-registrations.ts (and its own tests) may reach ${mod}'s tool-registrations.ts/agent-tools.ts seam, but nothing else in ${mod}.`,
      from: { path: TOOL_REGISTRATION_SEAM_FROM, pathNot: modPath },
      to: { path: internals, pathNot: [TOOL_REGISTRATION_SEAM_TO, ...extraToExempt] },
    },
  ];
}

module.exports = {
  forbidden: [...HAND_WRITTEN_RULES, ...GUARDED_MODULES.flatMap(noDeepImportRules)],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
