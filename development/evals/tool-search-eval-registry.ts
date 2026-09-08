/**
 * @file Shared "build the real tool catalog" step for `development/evals/tool-search-*` suites.
 *
 * WHY THIS EXISTS (2026-09-08): every suite in this directory used to compose the registry as
 * `buildAssistantToolRegistrations(fakeRouteDeps())` alone, which was the whole composition root on
 * 2026-08-05. It stopped being so on 2026-08-17, when `server/runtime/composition/tool-catalog-
 * manifest.ts`'s `installFirstPartyToolContributors()` became a second, required call — 23 of the
 * catalog's domains now arrive only through it (see `tool-registrations.ts`'s own header). A suite
 * that skips it silently builds a 9-tool registry (the handful of domains still statically wired
 * into `DOMAIN_SLICES`) instead of the ~170-tool real catalog, and scores near-zero on every case —
 * with no error, no warning, just a quietly wrong number. Nine `*.eval.ts` suites plus three
 * non-`.eval.ts` scoring/export/capture scripts had exactly this bug; see
 * `ADS-memory/reports/2026-09-08-eval-harness-zero-scores.md` for the full audit.
 *
 * `tool-search-parent-tool-read.eval.ts` and `tool-search-quality.eval.ts` already called
 * `installFirstPartyToolContributors()` correctly before this file existed and are NOT migrated to
 * this helper — the fix here follows their own established shape, it does not replace it.
 *
 * This module centralizes exactly the part that was missing (install + build + register) plus a
 * loud-failure guard, so a future suite that copies this helper cannot reintroduce the silent-9-tool
 * failure mode: a catalog smaller than {@link MIN_EXPECTED_TOOL_COUNT} throws instead of scoring.
 */
import { createToolRegistry, type ToolRegistration, type ToolRegistry } from "@jini-ai/core";
import {
  buildAssistantToolRegistrations,
  type AssistantSurfaceDeps,
} from "../../apps/website/src/assistant/tool-registrations.js";
import { installFirstPartyToolContributors } from "../../apps/website/src/server/runtime/composition/tool-catalog-manifest.js";
import type { RouteDeps } from "../../apps/website/src/server/routes/types.js";

/**
 * Floor for the real catalog size, used only to catch the "contributors never installed" failure
 * mode loudly. Set well below the live count (~170 as of 2026-09-08, and growing) but far above the
 * 9-tool catalog `DOMAIN_SLICES` alone produces — any regression that silently drops most contributed
 * domains should also trip this, not just a full omission.
 */
export const MIN_EXPECTED_TOOL_COUNT = 100;

/**
 * The `RouteDeps` shape every suite in this directory has hand-rolled identically (verified byte-
 * identical across all nine broken suites before extraction) — a permissive fake sufficient to build
 * registrations without touching a real database. Suites that need additional fields can still build
 * their own and pass it to {@link buildEvalToolRegistry} directly; this export is a convenience, not
 * a required seam.
 */
export function fakeEvalRouteDeps(): RouteDeps {
  const deps = {
    workspaceId: "ws-eval",
    clock: { nowIso: () => "2026-08-05T00:00:00.000Z" },
    idGen: { newId: () => "id-1" },
    authorize: async () => ({ allowed: true, reason: "matched" }),
    contentTypeRepo: {
      save: async () => {},
      appendRevision: async () => {},
      findByKey: async () => null,
      listByWorkspace: async () => [],
      transaction: async <T>(fn: () => Promise<T>) => fn(),
    },
    contentTypeIndexProvisioner: {
      provisionIndexesForNewContentType: async () => {},
      applyFieldIndexTransitions: async () => {},
      tearDownAllIndexesForContentType: async () => {},
    },
    outbox: { enqueue: async () => {} },
  };
  return deps as unknown as RouteDeps;
}

/**
 * Builds the real, fully-wired tool registry the shipped composition roots build — the one and only
 * seam this file exists to fix. Installs first-party contributors, builds every domain's
 * registrations, registers them, then asserts the result is not suspiciously small before handing it
 * back, so a suite that (re-)introduces the missing-install bug fails at run time instead of quietly
 * scoring near-zero.
 *
 * @param routeDeps - Route deps to build registrations against; pass {@link fakeEvalRouteDeps}'s
 * result unless the suite needs a different fake.
 * @param surfaces - Forwarded to `buildAssistantToolRegistrations`; defaults the same way it does.
 * @param options - Forwarded to `buildAssistantToolRegistrations` (e.g. `includeContentReadCollapse`).
 * @returns The populated `ToolRegistry`.
 * @throws {Error} If the resulting catalog has fewer than {@link MIN_EXPECTED_TOOL_COUNT} tools.
 * @complexity O(t) in the total wired-tool count.
 */
export function buildEvalToolRegistry(
  routeDeps: RouteDeps,
  surfaces?: AssistantSurfaceDeps,
  options?: { readonly includeContentReadCollapse?: boolean },
): ToolRegistry {
  installFirstPartyToolContributors();
  const registry = createToolRegistry();
  const registrations: readonly ToolRegistration[] = buildAssistantToolRegistrations(routeDeps, surfaces, options);
  for (const registration of registrations) registry.register(registration);

  const size = registry.list().length;
  if (size < MIN_EXPECTED_TOOL_COUNT) {
    throw new Error(
      `tool-search eval registry only has ${size} tools (expected >= ${MIN_EXPECTED_TOOL_COUNT}). ` +
        `This almost always means installFirstPartyToolContributors() did not run or a contributor ` +
        `threw before registering — check for an import error or an exception swallowed upstream. ` +
        `Scoring against an undersized catalog silently produces near-zero results; refusing to run.`,
    );
  }
  return registry;
}
