/**
 * @file The options `createApp` accepts. Kept apart from `app.ts` so the boot helpers and route mounts that take a
 * subset of them (`Pick<CreateAppOptions, ...>`) do not import `app.ts`, which imports them (an import cycle).
 */

import type { Express } from "express";
import type { AdminSignInPort } from "#src/server/inbound/admin-http/dev-auth";
import type { createAssistantByokModule } from "./modules/assistant-byok.js";
import type { ErrorReporter } from "@jini-ai/core/errors/reporter";
import type { RoutineToolHost } from "#src/features/routines/routine-tool-registrations";
import type { HumanConfirmSurfaceDeps } from "#src/contracts/core/human-confirm";

/** Optional {@link createApp} hooks. */
export interface CreateAppOptions {
  /** Serving process only. Uses the same listener/daemon/store stop as signals, with a sleep code. */
  stopForIdle?: (input: { exitCode: number }) => void;
  /** Only createServingApp activates process-owned federation listeners and capability recovery. */
  activateAssistantFederation?: true;
  /** Hermetic integration seam; production uses the module's single default surface. */
  assistantToolSurface?: ReturnType<typeof createAssistantByokModule>["toolSurface"];
  /** Serving boot only; exporter/eager apps do not own recovery of assistant turns. */
  recoverAssistantChatRuns?: boolean;
  /** Serving boot only: the routines boot barrier, so chat repair leaves turns the routine lease owner still owns (P3-T2.T). */
  assistantRoutineBoot?: { isLeaseOwner: () => boolean; whenInterrupted: () => Promise<void> };
  /**
   * Receives each background pass `createApp` starts and returns before it finishes — today the BYOK
   * tool surface's installed-extension pass, which reads the plugin catalog and plugin activations
   * from the store. Whoever closes the store soon after composing an app awaits these first, so the
   * close does not land under those reads. Never rejects (the pass is fail-open).
   */
  onBootWork?: ({ work }: { work: Promise<void> }, optional?: Record<string, never>) => void;
  /** Serving boot only: hears every owner/admin sign-in (the automatic form pull). Exporter and eager
   *  apps never pass it, so signing in to them pulls nothing. */
  onAdminSignIn?: AdminSignInPort;
  /**
   * Render the site's pages through this theme id instead of the stored active one, for every request
   * this app serves. Only `RouteDeps.createSiteApp({ themeId })` sets it, for a throwaway loopback app
   * (`web_screenshot_page` seeing an unactivated theme copy); the serving app never has it, and no
   * header, query or cookie can set it. The caller checks the theme exists — the render itself still
   * falls back like it does for a bad stored id.
   */
  themeIdOverride?: string;
  /** Internal local-render audit only; no HTTP input can set this option. */
  consentAudit?: true;
  /** The dev-only CORS policy `createApp` installs on its express app; defaults to the admin-dev-server allow-list in
   *  `inbound/shared/dev-cors.ts`. A host or test hands in its own so the middleware never hard-codes one. */
  applyDevCors?: (app: Express) => void;
  /** The site's error reporter when the host already built one (a daemon scope, a test). Otherwise
   *  `createApp` builds one per site composition over `routeDeps.tracker` and `routeDeps.clock`. */
  errorReporter?: ErrorReporter;
  /** Serving boot only: mounts the routine routes' slot (P3-T1a.T) at its place among the admin assistant
   *  routes. Exporter and eager apps never pass it, so they expose no routine endpoint at all. */
  mountAssistantRoutines?: (required: { app: Express }, optional?: Record<string, never>) => void;
  /** Serving boot only (P3-T4.T): the bound routine commands behind the four routine tools. Absent, no routine tool exists. */
  routines?: RoutineToolHost;
  /** The host-root `ROUTINES_RELEASE_ENABLED`; the routine tools need it on as well as `routines`. */
  routinesReleaseEnabled?: boolean;
  /** Serving boot only (P3-T3.T): human-confirm's receipt port for tracked routine runs. */
  routineApprovalReceiptsFor?: HumanConfirmSurfaceDeps["approvalReceiptsFor"];
}
