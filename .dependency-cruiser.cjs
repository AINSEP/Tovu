/**
 * SPEC-022 REQ-11 — report-only import-boundary baseline (ADR-046 Research Summary's library
 * decision: `dependency-cruiser`, not a custom AST analyzer — Article I Library-First).
 *
 * `severity: "warn"` everywhere, deliberately — REQ-11 is explicit that this is non-blocking in
 * Phase 0 (no CI pipeline exists yet to make it a gate; see implementation-outline.md's "Scope
 * Adjustment Disclosed"). `npm run check:boundaries` runs this and always exits 0 for ordinary
 * rule violations (EC-05: only a genuine tool crash should look different from "zero
 * violations" — dependency-cruiser's own non-zero exit on a tool error already gives us that).
 */
module.exports = {
  forbidden: [
    {
      name: "core-no-server-or-app-imports",
      severity: "warn",
      comment: "src/core/** may not import src/server/**, apps/**, feature modules, or concrete infrastructure adapters.",
      from: { path: "^src/core" },
      to: { path: "^(src/server|apps|src/features|src/infra)" },
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
      // is, not as a loosening: everything else under `src/features` still may not reach `src/infra`.
      from: { path: "^src/features", pathNot: "^src/features/.*/(repo|search-index)\\.(sqlite|memory)\\.ts$" },
      to: { path: "^src/infra" },
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
      comment: "SPEC-003 (ADR-PIPE-003) — src/cli/** dispatches to site-dir/server only; it never touches Drizzle or infra/db directly.",
      from: { path: "^src/cli" },
      to: { path: "^(drizzle-orm|src/infra/db)" },
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
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
