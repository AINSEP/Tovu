import { createApp, createRouteDeps } from "./server/app";
import { createSqliteRouteDeps, defaultContentDbPath } from "./server/deps";
import { bootstrapStore } from "./features/plugins/store/store-plugin";
import { CAPABILITY_INVENTORY } from "./server/capability-inventory";
import { runProductionReadinessGate } from "./server/production-readiness-gate";
import { resolveRuntimeMode } from "./server/runtime-mode";
import { runBootLifecycle } from "./server/boot-lifecycle";
import type { BootModule } from "./server/boot-lifecycle";
import { setReadinessSnapshot } from "./server/readiness-state";
import type { NewsletterRouteDeps } from "./server/routes/admin/newsletter/deps";

/**
 * @file Process entrypoint.
 *
 * Starts the HTTP server for the local runtime.
 *
 * Storage: SQLite content.db by default (persists across restarts). Set
 * `TOVU_DB=memory` for an ephemeral in-memory store (re-seeded every boot).
 * Override the db location with `TOVU_CONTENT_DB=/path/to/content.db`.
 *
 * SPIKE: on the SQLite runtime, the sample Tier-3 store plugin is activated at boot — it declares
 * its own table through the never-brick dataModule seam, seeds products, and surfaces them at /store.
 */
const port = Number(process.env.PORT ?? 3000);
const useMemory = process.env.TOVU_DB === "memory";

/**
 * SPEC-022 REQ-03/W-001 — must run and pass before any composition/route-registration work
 * starts. Deliberately placed here (the actual process entrypoint), not inside `deps.ts`'s
 * `createSqliteRouteDeps()` / `app.ts`'s `createApp()`: both of those are synchronous functions
 * called from hundreds of existing hermetic tests, and forcing them async (or awaiting a gate
 * before they can return) would be a wide, risky, untested signature change to every one of
 * those call sites — INV-06 forbids exactly that kind of collateral behavior change. `index.ts`
 * is the one real top-level boot path (never imported by a test), so it is the safe place to
 * enforce "never bind the listening socket" without touching any tested surface.
 *
 * `envSnapshot`'s three checks are a disclosed, best-effort implementation, not exhaustively
 * specified by SPEC-022 (no test exercises the real heuristics, only injected fixture values):
 * - `hasDevSecretPlaceholder`: true when `ANALYTICS_ROOT_KEY_SEED` is unset, since
 *   `registerAnalyticsIngestRoute`'s wiring in `app.ts` falls back to the literal dev placeholder
 *   `"dev-only-insecure-seed"` whenever that env var is absent.
 * - `hasLocalhostEgressAllowance`: not yet detectable here — `deps.ts` seeds a hardcoded
 *   `localhost`/`example.com` origin+egress-allowlist unconditionally, with no env-var escape
 *   hatch, so this check cannot yet distinguish a real deploy from a dev one. Flagged as a real
 *   gap for whoever scopes the origin-seed-becomes-configurable follow-up; not fixed here.
 * - `hasAlwaysOnAnalyticsStub`: false as of ADR-046 Phase 1's analytics slice (2026-07-16) —
 *   `deps.ts`'s `createSqliteRouteDeps()` now unconditionally wires the durable `SqliteBufferSink`,
 *   mirroring the "analytics" capability-inventory entry's `hasDurableAdapter: true`.
 */
async function runBootGateOrExit(): Promise<void> {
  const mode = resolveRuntimeMode();
  if (mode !== "production") return;

  const result = await runProductionReadinessGate({
    mode,
    inventory: CAPABILITY_INVENTORY,
    envSnapshot: {
      hasDevSecretPlaceholder: !process.env.ANALYTICS_ROOT_KEY_SEED,
      hasLocalhostEgressAllowance: false,
      hasAlwaysOnAnalyticsStub: false,
    },
  });

  if (!result.ok) {
    for (const failure of result.failures) {
      console.error(`[production-readiness-gate] ${failure.code}: ${failure.message}`);
    }
    console.error("Refusing to boot in production mode — see failures above.");
    process.exit(1);
  }
}

const noop = async (): Promise<void> => {};

/**
 * ADR-046 Phase 2 (SPEC-030 REQ-06) — the 4 concrete boot modules. `settings`/`seo` are CRITICAL:
 * their promises already exist with no `.catch()` anywhere in their chain (an unhandled-rejection
 * risk before this change), so a failure here must abort boot cleanly, not crash the process with
 * an unhandled rejection or silently continue serving traffic against half-seeded state.
 * `newsletter`/`store-plugin` are OPTIONAL, matching their pre-existing log-and-continue behavior
 * (`deps.ts`'s `newsletterReady` chain already self-swallows via `.catch()`; the store plugin was
 * already wrapped in try/catch here). `store-plugin` is omitted entirely in memory mode — it was
 * never invoked there before this change either.
 */
function buildBootModules(deps: NewsletterRouteDeps): BootModule[] {
  const modules: BootModule[] = [
    { name: "settings", owner: "features/settings", criticality: "critical", prepare: () => deps.settingsReady, start: noop, stop: noop },
    { name: "seo", owner: "seo", criticality: "critical", prepare: () => deps.seoReady, start: noop, stop: noop },
    { name: "newsletter", owner: "newsletter", criticality: "optional", prepare: () => deps.newsletterReady, start: noop, stop: noop },
  ];
  if (!useMemory) {
    modules.push({
      name: "store-plugin",
      owner: "features/plugins/store",
      criticality: "optional",
      prepare: async () => {
        deps.store = await bootstrapStore(defaultContentDbPath());
      },
      start: noop,
      stop: noop,
    });
  }
  return modules;
}

async function main(): Promise<void> {
  await runBootGateOrExit();

  const deps = useMemory ? createRouteDeps() : createSqliteRouteDeps();

  const bootResult = await runBootLifecycle(buildBootModules(deps));
  setReadinessSnapshot(bootResult);
  if (!bootResult.ok) {
    for (const module of bootResult.modules) {
      if (module.criticality === "critical" && module.lifecycle.status !== "ready") {
        console.error(`[boot-lifecycle] critical module "${module.name}" (${module.owner}) is ${module.lifecycle.status}: ${module.lifecycle.reasonCode}`);
      }
    }
    console.error("Refusing to boot — a critical module failed. See failures above.");
    process.exit(1);
  }

  const app = createApp(deps);
  app.listen(port, () => {
    const store = useMemory ? "in-memory" : `sqlite (${defaultContentDbPath()})`;
    console.log(`tovu server running on http://localhost:${port} — store: ${store}`);
  });
}

void main();
