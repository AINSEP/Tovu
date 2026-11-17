/**
 * @file The one collector of per-deps background boot work, and the helper that tracks the BYOK tool surface's pass on it.
 * `siteAppBootWorkByDeps` must stay a single module instance: `deps.ts` writes it, `createApp` reads it, and a second copy
 * would let the store close under an export's boot work. Moved verbatim out of `app.ts`.
 */

import type { createAssistantByokModule } from "./modules/assistant-byok.js";
import type { RouteDeps } from "../../routes/types.js";
import type { CreateAppOptions } from "./create-app-options.js";

/** The real composition's mutable collector; RouteDeps exposes the same set as read-only. */
export const siteAppBootWorkByDeps = new WeakMap<RouteDeps, Set<Promise<void>>>();

/** Track the existing tool-surface pass for the app/store lifetime. O(1) time and space. */
export function trackByokBootWork(
  { routeDeps, byokAssistantModule, bootWorkByDeps }: { routeDeps: RouteDeps; byokAssistantModule: ReturnType<typeof createAssistantByokModule>; bootWorkByDeps: typeof siteAppBootWorkByDeps },
  options: CreateAppOptions = {},
): void {
  // Track serving apps too: they share the same store lifetime as export/inspection apps.
  const bootWork = byokAssistantModule.toolSurface.ready;
  const pendingBootWork = bootWorkByDeps.get(routeDeps);
  pendingBootWork?.add(bootWork);
  void bootWork.then(() => pendingBootWork?.delete(bootWork), () => pendingBootWork?.delete(bootWork));
  options.onBootWork?.({ work: byokAssistantModule.toolSurface.ready });
}
