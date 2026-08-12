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
      name: "core-no-server-or-app-imports",
      severity: "warn",
      comment: "src/core/** may not import src/server/**, apps/**, feature modules, or concrete infrastructure adapters.",
      from: { path: "^src/core" },
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
      comment: "Only bootstrap/composition modules (server/deps.ts, server/app.ts, index.ts) may select production implementations directly.",
      // `repo.*` was the only adapter filename convention when this rule was written. Posts' search
      // index (`features/post/search-index.{sqlite,memory}.ts`) is the same category of file — a
      // concrete storage adapter behind a port — under a different name, because it backs
      // `PostSearchPort` rather than `PostRepoPort`. Exempted by name for the same reason `repo.*`
      // is, not as a loosening: everything else under `src/features` still may not reach `src/db`.
      from: { path: "^src/features", pathNot: "^src/features/.*/(repo|search-index)\\.(sqlite|memory)\\.ts$" },
      to: { path: "^src/db" },
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
  "integrations",
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
const TOOL_REGISTRATION_SEAM_FROM = "^src/assistant/tool-registrations\\.ts$";
const TOOL_REGISTRATION_SEAM_TO = "(^|/)(tool-registrations|agent-tools)\\.ts$";
const TOOL_REGISTRATION_TEST_FROM = "^src/assistant/__tests__/tool-registrations\\..+\\.test\\.ts$";

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
};

function noDeepImportRules(mod) {
  const modPath = `^src/${mod}`;
  const internals = `^src/${mod}/(?!index\\.ts$).+`;
  const extraToExempt = EXTRA_TO_EXEMPT[mod] ?? [];

  return [
    {
      name: `no-deep-imports:${mod}`,
      severity: "warn", // pending promotion decision — see plan doc §5
      comment: `ADR-009 Decision §1 — ${mod}'s public surface is its index.ts; nothing outside the module (or db/sqlite reaching for a value rather than a type, or the tool-registration seam reaching anything other than tool-registrations.ts/agent-tools.ts) may import its internals directly.`,
      from: { path: "^src", pathNot: [modPath, DB_SQLITE, ...COMPOSITION_ROOTS, TOOL_REGISTRATION_SEAM_FROM, TOOL_REGISTRATION_TEST_FROM] },
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
