import { bootstrapStore } from "../features/plugins/store/store-plugin";
import type { BootModule } from "./boot-lifecycle";
import type { NewsletterRouteDeps } from "./routes/admin/newsletter/deps";

/**
 * @file ADR-046 Phase 3 (SPEC-031) — composes the boot modules `index.ts` runs through
 * `runBootLifecycle()` (ADR-046 Phase 2). Pulled out of `index.ts` so this composition logic is
 * unit-testable (`index.ts` itself is deliberately never imported by a test — see that file's own
 * header note on why boot-only logic lives there). `index.ts` becomes a thin wrapper: build deps,
 * call `buildBootModules`, run the lifecycle, `listen()`.
 */

const noop = async (): Promise<void> => {};

export interface BuildBootModulesOptions {
  useMemory: boolean;
  defaultContentDbPath: () => string;
}

/**
 * `settings`/`seo` are CRITICAL: their promises have no `.catch()` anywhere in their chain (an
 * unhandled-rejection risk before ADR-046 Phase 2), so a failure here must abort boot cleanly.
 * `newsletter`/`comments`/`store-plugin` are OPTIONAL, matching their pre-existing log-and-continue
 * behavior. `store-plugin` is omitted entirely in memory mode — it was never invoked there before
 * either.
 */
export function buildBootModules(deps: NewsletterRouteDeps, options: BuildBootModulesOptions): BootModule[] {
  const modules: BootModule[] = [
    { name: "settings", owner: "features/settings", criticality: "critical", prepare: () => deps.settingsReady, start: noop, stop: noop },
    { name: "seo", owner: "seo", criticality: "critical", prepare: () => deps.seoReady, start: noop, stop: noop },
    { name: "newsletter", owner: "newsletter", criticality: "optional", prepare: () => deps.newsletterReady, start: noop, stop: noop },
    { name: "comments", owner: "comments", criticality: "optional", prepare: () => deps.commentsReady, start: noop, stop: noop },
  ];
  if (!options.useMemory) {
    modules.push({
      name: "store-plugin",
      owner: "features/plugins/store",
      criticality: "optional",
      prepare: async () => {
        deps.store = await bootstrapStore(options.defaultContentDbPath());
      },
      start: noop,
      stop: noop,
    });
  }
  return modules;
}
