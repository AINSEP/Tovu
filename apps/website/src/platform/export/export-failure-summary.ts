/**
 * @file The one shared "did this export fail" check, in a module with NO runtime dependencies.
 *
 * `firstExportFailure` is a pure function over an already-built {@link ExportReport} — it reads
 * `.length` and the first element of two arrays and returns a plain object. It lived in
 * `site-exporter.ts` until 2026-09-05, which meant every caller that wanted only this check had to
 * load the whole exporter: `express`, `node:http`, `#src/contracts/core/index` and
 * `#src/features/theme/index`, and through the last of those the theme/post/db graph
 * (better-sqlite3, drizzle, handlebars, liquidjs) — 65 modules to run ten lines of array reads.
 *
 * That cost is why `features/deployments/static-publish/adapter.ts` resolved this function with a
 * call-time `require("#src/platform/export/index")` instead of an import: its own eager graph is 7
 * modules, and it is reached from `assistant/tool-registrations.ts`, so a static import of the
 * barrel would have grown that graph nearly tenfold at boot. Under `tsx` a `require()` of a
 * first-party `.ts` module is served by tsx's CJS hook, which transpiles the module and everything
 * it imports a SECOND time in CommonJS format; with `--experimental-test-coverage` active both
 * images report under the same `SF:` path and merge into a corrupted lcov block. Measured
 * 2026-09-05: that single call site produced 45 contaminated first-party blocks, 28 SEVERE
 * (`ADS-memory/reports/2026-09-05-coverage-dual-instantiation-routes-W-and-A.md`, "Route A").
 *
 * Splitting the function out removes the reason the `require()` existed rather than trading the
 * corruption for a boot cost. `site-exporter.ts` re-exports both symbols, so the barrel's public
 * surface — and `__tests__/index.test.ts`'s assertion that the barrel's `firstExportFailure` is
 * identical to `site-exporter.ts`'s — is unchanged.
 *
 * KEEP THIS MODULE RUNTIME-LEAF. Its only dependency is an `import type`, which TypeScript erases,
 * so importing it pulls in exactly one file. A runtime `import` added here would be inherited by
 * every consumer that chose this module precisely to avoid one.
 */
import type { ExportReport } from "./site-exporter.js";

/**
 * Named-field summary of the FIRST failure across BOTH `report.routes.failed` and
 * `report.assets.failed`, in that order. `identifier` normalizes the two collections' disagreeing
 * field name (`FailedRoute.path` vs `FailedAsset.url`) to one name callers can interpolate without
 * a branch. See {@link firstExportFailure}'s own doc for why a caller must check both collections.
 */
export interface ExportFailureSummary {
  /** Which collection the first failure came from. */
  kind: "route" | "asset";
  /** `FailedRoute.path` for a route, `FailedAsset.url` for an asset. */
  identifier: string;
  reason: string;
  /** Total failures in `kind`'s own collection — NOT combined with the other collection's count —
   *  enough for a caller's "N failed" message without re-deriving it from the report. */
  count: number;
}

/**
 * Returns the first failure in `report` (routes checked before assets), or `undefined` when
 * neither collection has one. The one shared "does this export block publishing" check, so every
 * caller of `exportSite` treats a failed asset exactly like a failed route — both are missing
 * bytes a published/committed site would otherwise silently ship without (HIGH audit finding,
 * 2026-08-19 Codex sol bug/architecture audit: `static-publish/adapter.ts`'s `publishStaticSite`
 * and `source-control/commit-site.ts`'s `commitSiteToSourceControl` used to check only
 * `routes.failed`, so a page could export fine while its own stylesheet or hero image 404s, and
 * publishing/committing would still report success).
 *
 * @complexity O(1) — reads only `.length` and the first array element of each collection.
 */
export function firstExportFailure(report: ExportReport): ExportFailureSummary | undefined {
  if (report.routes.failed.length > 0) {
    const first = report.routes.failed[0]!;
    return { kind: "route", identifier: first.path, reason: first.reason, count: report.routes.failed.length };
  }
  if (report.assets.failed.length > 0) {
    const first = report.assets.failed[0]!;
    return { kind: "asset", identifier: first.url, reason: first.reason, count: report.assets.failed.length };
  }
  return undefined;
}
