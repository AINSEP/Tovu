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
      from: { path: "^src/features", pathNot: "^src/features/.*/repo\\.(sqlite|memory)\\.ts$" },
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
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.json" },
  },
};
