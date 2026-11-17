/**
 * @file The assistant half of `createApp`'s registrations: the BYOK module (built once, its boot pass tracked), the admin assistant
 * and chats modules, settings/execution tabs, the BYOK routes and the AG-UI canary. `internalRouter` and the boot-work collector are
 * handed in by `createApp`. Registration order is behaviour. Moved verbatim out of `app.ts`.
 */

import { createAssistantModule } from "../modules/assistant.js";
import { createAssistantChatsModule } from "../modules/assistant-chats.js";
import { createAssistantSettingsModule } from "../modules/assistant-settings.js";
import { createAssistantExecutionModule } from "../modules/assistant-execution.js";
import { createAssistantByokModule } from "../modules/assistant-byok.js";
import { createAssistantAgUiModule } from "../modules/assistant-ag-ui.js";
import type { CreateAppOptions } from "../create-app-options.js";
import { mountRoutes } from "./module-handles.js";
import { trackByokBootWork } from "../site-app-boot-work.js";
import type { Router } from "express";
import type { siteAppBootWorkByDeps } from "../site-app-boot-work.js";
import type { MountInput } from "./module-handles.js";

/** Builds the BYOK assistant module once, tracks its boot pass, and mounts the admin/BYOK assistant surfaces and the daemon-facing router, in registration order. */
export function mountAssistant({ app, routeDeps, internalRouter, bootWorkByDeps }: MountInput & { internalRouter: Router; bootWorkByDeps: typeof siteAppBootWorkByDeps },
  options: Pick<CreateAppOptions, "assistantToolSurface" | "activateAssistantFederation" | "recoverAssistantChatRuns" | "onBootWork"> = {}): void {
  // Built ONCE, by calling `createAssistantByokModule` here (rather than at its original position
  // below) so its returned `.toolSurface` can be handed to `createAssistantModule` immediately after
  // — never folded into `routeDeps` (that bag already carries 53 back-edges into this file, a
  // tracked architectural metric; see `npm run check:architecture`). Deliberately NOT
  // `createByokToolSurface(routeDeps)` called directly here: that would add a new edge from this
  // file straight to `byok-tool-surface.ts`, and measuring with `check:architecture` showed that one
  // edge alone regresses the "core size" metric (it flips ~17 files into the core classification,
  // both fan-in and fan-out above the graph median) — this file already transitively reaches that
  // module THROUGH `createAssistantByokModule`, so reading the value off its return object is free.
  // See `AssistantByokModuleHandle`'s own doc for the full trace.
  const byokAssistantModule = createAssistantByokModule({ routeDeps }, { toolSurface: options.assistantToolSurface });
  trackByokBootWork({ routeDeps, byokAssistantModule, bootWorkByDeps }, options);
  // Through the handle, not a direct import, for the same zero-new-edge reason as `toolSurface` above.
  byokAssistantModule.registerToolExecRoutes({ router: internalRouter });

  // Export/inspection apps keep federation cold; only serving composition binds process listeners.
  if (options.activateAssistantFederation) byokAssistantModule.activateServerFederation({ router: internalRouter }, {});

  // `TOVU_ADMIN_ASSISTANT=off` — a real disable: the four admin-assistant route modules below are
  // never mounted, matching ADR-054's visitor-assistant posture (no endpoint, not a hidden widget).
  // `createAssistantSettingsModule`/`createAssistantExecutionModule` stay mounted unconditionally —
  // the first is the PUBLIC assistant's master switch (a different product), and the second is the
  // settings tab that would have to render the off state. See `admin-assistant-enabled.ts`.
  //
  // Reads `routeDeps.adminAssistantEnabled` (computed once in `createRouteDeps()`/`createSiteRouteDeps()`)
  // rather than calling `isAdminAssistantEnabled()` again here — see `routes/types.ts`'s
  // `adminAssistantEnabled` field doc: the admin SPA's `GET .../assistant/settings` response threads
  // the SAME field, so a second, separate read here could never end up disagreeing with what that
  // response reports.
  const adminAssistantEnabled = routeDeps.adminAssistantEnabled;

  // ADR-049: the admin assistant's tool-execution/run surface, composed from the published
  // `@jini-ai/core` + `@jini-ai/daemon` + `@jini-ai/node-host` kernel — see `src/assistant/`.
  if (adminAssistantEnabled) {
    mountRoutes(app, createAssistantModule(routeDeps, byokAssistantModule.toolSurface.surfaceExchanges));

    // Durable transcripts for that same assistant, in `content.db` rather than the daemon. Separate
    // module because nothing here is proxied: run execution belongs to the daemon (that is where run
    // state lives), while history belongs to Tovu's own database, where backups, snapshots, and
    // workspace scoping already work. The daemon can restart or be replaced without touching it.
    mountRoutes(app, createAssistantChatsModule(routeDeps, {
      recoverInterrupted: options.recoverAssistantChatRuns,
      onBootWork: options.onBootWork,
    }));
  }

  // The AI Assistant admin section's 2 settings routes (GET/PUT the public assistant's master
  // switch). Registered next to `createAssistantModule` for readability only — the two modules share
  // no dependencies and no path prefix (see `modules/assistant-settings.ts`'s header), and both sit
  // inside the `/api/admin` session gate, so this position is not load-bearing.
  mountRoutes(app, createAssistantSettingsModule(routeDeps));
  // The same admin section's "Execution mode" tab — Local CLI detection + BYOK connection
  // test/model discovery. Separate module from the settings pair above for the reason
  // `modules/assistant-execution.ts`'s header gives (stateless egress probes, not settings CRUD).
  mountRoutes(app, createAssistantExecutionModule(routeDeps));
  // 2026-08-04: the admin dock's "API · BYOK" execution mode — a second, provider-direct run path
  // alongside `createAssistantModule`'s daemon proxy above. Composes its own registry/executor over
  // the SAME `buildAssistantToolRegistrations` catalog the daemon uses (see `modules/assistant-byok.ts`'s
  // header for the full trace and disclosed gaps). Reuses this SAME `routeDeps` — the whole reason
  // this can be a second, independent composition rather than a daemon-process change. Routes only —
  // the module itself (and its `toolSurface`) was already built above, so
  // `createAssistantModule`'s redemption proxy shares the exact same confirmation store.
  if (adminAssistantEnabled) {
    mountRoutes(app, byokAssistantModule);

    // ADR-059 (2026-08-18): the admin assistant's AG-UI canary transport — additive, flagged,
    // deletable. Wraps the SAME daemon-backed run lifecycle `createAssistantModule` above proxies
    // (via `assistant-daemon-client.ts`'s shared `fetchAgentDaemon`, extracted from that module this
    // same dispatch), translating its wire frames into real AG-UI SSE events. Does not touch, and is
    // not touched by, either existing execution path. See `modules/assistant-ag-ui.ts`'s header.
    mountRoutes(app, createAssistantAgUiModule(routeDeps));
  }
}
