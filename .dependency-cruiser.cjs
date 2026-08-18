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
      name: "feature-no-express-or-admin-imports",
      severity: "warn",
      comment: "Feature/domain code may not import Express, route handlers, or admin-app code.",
      from: { path: "^src/features" },
      to: { path: "^(node_modules/express|src/server/routes|apps/admin)" },
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
      name: "site-dir-no-server-express-or-cli-imports",
      severity: "warn",
      comment: "SPEC-003 (ADR-PIPE-003) — src/site-dir/** is the install-dir domain and must stay CLI/Express-agnostic (INV-06) so a future non-CLI caller (the desktop host, ADR-011) can reuse it directly.",
      from: { path: "^src/site-dir" },
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
const COMPOSITION_ROOTS = [
  "^src/index\\.ts$",
  "^src/server/deps\\.ts$",
  "^src/server/app\\.ts$",
  "^src/cli/commands/(serve|init|introspect)\\.ts$",
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
const TOOL_REGISTRATION_TEST_FROM_EXTRA = [
  "^src/assistant/__tests__/byok-provider-turn\\.test\\.ts$",
  "^src/assistant/__tests__/mcp-ui-tool-calls-route\\.integration\\.test\\.ts$",
  "^src/assistant/__tests__/mcp-ui-tool-calls-route\\.content-search\\.integration\\.test\\.ts$",
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
      name: `no-deep-value-imports-from-db-sqlite:${mod}`,
      severity: "warn",
      comment: `db/sqlite adapters may deep-import ${mod}'s port TYPES (the contract they implement) but never a runtime value.`,
      from: { path: DB_SQLITE },
      to: { path: internals, pathNot: extraToExempt, dependencyTypesNot: ["type-only"] },
    },
    {
      // The tool-registration-seam caller is excluded from the main rule above (so it isn't
      // double-flagged), but that exclusion must not become a blanket pass into the rest of the
      // module — this rule re-polices it, allowing ONLY tool-registrations.ts/agent-tools.ts.
      name: `no-non-seam-deep-imports-from-tool-registration-caller:${mod}`,
      severity: "warn",
      comment: `assistant/tool-registrations.ts (and its own tests) may reach ${mod}'s tool-registrations.ts/agent-tools.ts seam, but nothing else in ${mod}.`,
      from: { path: TOOL_REGISTRATION_SEAM_FROM },
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
