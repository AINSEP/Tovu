import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import type { Express } from "express";

import type { JsonRouteSpec, RouteHostContext } from "@jini-ai/core/contracts/server";
import { FileLockTimeoutError } from "@jini-ai/core/contracts/runtime";
import { ok } from "@jini-ai/core/contracts/server";
import { RouteRefusalError, rejectRoute } from "@jini-ai/core/errors/route-refusal";
import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import { createCleanupPreviewStore } from "@jini-ai/platform/retention";
import { captureRootFor, type CaptureRootLock } from "@jini-ai/integrations/web-screenshot/capture-files";

import { bindCaptureRetention, createCaptureRootFileLock, type CaptureRetentionBinding } from "#src/features/web-screenshot/capture-retention";
import type { OperatorPrincipalRecord } from "#src/server/inbound/admin-http/dev-auth";
import { adminSameOriginWrites, mountAdminJsonRoute, type AdminJsonRoutePortDeps } from "#src/server/inbound/admin-http/admin-json-route-ports";
import type { RouteDeps } from "#src/server/routes/types";
import type { ServerModuleHandle } from "./types.js";

/**
 * @file Screenshot storage composition: the one root-keyed lock the capture writer
 * (`tool-catalog-manifest.ts`) and the owner's manual cleanup both hold, and the two owner-only
 * routes the Storage panel's "Delete screenshots older than…" calls. Nothing here schedules or
 * registers an automatic cleanup; deletion only follows an owner's preview and confirm.
 */

/** The writer fence: the same instance is injected into the capture writer and the cleanup. */
export const captureWriterFence: CaptureRootLock = createCaptureRootFileLock({ withFileLock }, {});

export const SCREENSHOT_CLEANUP_PATHS = {
  preview: "/api/workspaces/:workspaceId/storage/screenshots/preview",
  apply: "/api/workspaces/:workspaceId/storage/screenshots/apply",
} as const;

type Context = OperatorPrincipalRecord | undefined;

/** Required collaborators of {@link mountScreenshotCleanup}. */
export interface MountScreenshotCleanupRequired {
  app: Express;
  /** The site's binding; its `authorizeOwner` refuses anyone but the installation owner. */
  retention: CaptureRetentionBinding<Context>;
  /** The admin mount, its port deps, and the same-origin policy both routes require. */
  adminPorts: { mount: typeof mountAdminJsonRoute; deps: AdminJsonRoutePortDeps; origin: RouteHostContext };
}

/**
 * The engine's plain errors as refusals the panel can tell apart: busy (a capture is being saved),
 * expired (preview again), and a bad request. Anything else is rethrown and redacted as a 500.
 * Matched on the engine's fixed wording because `capture-retention` throws plain `Error`s.
 * @complexity O(1).
 */
export function refusalForCleanupError({ error }: { error: unknown }, _optional: Record<string, never> = {}): never {
  if (error instanceof RouteRefusalError) throw error;
  if (error instanceof FileLockTimeoutError) rejectRoute({ status: 409, code: "BUSY", error: "Screenshots are being saved right now. Try again in a moment." });
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("This preview is out of date")) rejectRoute({ status: 410, code: "PREVIEW_EXPIRED", error: message });
  if (message.startsWith("Choose a time") || message.startsWith("Confirm the screenshot")) rejectRoute({ status: 400, code: "INVALID_INPUT", error: message });
  throw error;
}

type Body = Record<string, unknown> | undefined;
const invalid = (error: string): never => rejectRoute({ status: 400, code: "INVALID_INPUT", error });

function previewSpec({ retention }: { retention: MountScreenshotCleanupRequired["retention"] }): Omit<JsonRouteSpec<{ before: number }, unknown, AdminJsonRoutePortDeps, OperatorPrincipalRecord>, "ports"> {
  return {
    method: "post", path: SCREENSHOT_CLEANUP_PATHS.preview, requireSameOrigin: true,
    parse: (raw) => {
      const before = (raw.body as Body)?.before;
      return ok({ value: { before: typeof before === "number" && Number.isFinite(before) ? before : invalid("Choose the date to delete screenshots before.") } });
    },
    handle: async ({ input, context }) => ok({ value: await retention.preview({ context, before: input.before }, {}).catch((error: unknown) => refusalForCleanupError({ error })) }),
  };
}

function applySpec({ retention }: { retention: MountScreenshotCleanupRequired["retention"] }): Omit<JsonRouteSpec<{ previewToken: string }, unknown, AdminJsonRoutePortDeps, OperatorPrincipalRecord>, "ports"> {
  return {
    method: "post", path: SCREENSHOT_CLEANUP_PATHS.apply, requireSameOrigin: true,
    parse: (raw) => {
      const body = raw.body as Body;
      if (body?.confirm !== true) invalid("Confirm the screenshot preview first.");
      return ok({ value: { previewToken: typeof body?.previewToken === "string" ? body.previewToken : invalid("Preview the screenshots to delete first.") } });
    },
    handle: async ({ input, context }) => ok({ value: await retention.apply({ context, previewToken: input.previewToken, confirm: true }, {}).catch((error: unknown) => refusalForCleanupError({ error })) }),
  };
}

/**
 * Mounts `POST …/storage/screenshots/preview` and `…/apply` behind the admin ports, both same-origin.
 * Apply needs `confirm: true` and a preview token the same owner received for this site's captures.
 * @complexity O(1) setup; per request as the binding.
 */
export function mountScreenshotCleanup({ app, retention, adminPorts }: MountScreenshotCleanupRequired, _optional: Record<string, never> = {}): void {
  adminPorts.mount({ app, spec: previewSpec({ retention }), deps: adminPorts.deps, origin: adminPorts.origin });
  adminPorts.mount({ app, spec: applySpec({ retention }), deps: adminPorts.deps, origin: adminPorts.origin });
}

/** Owner-only: the session principal must be the installation owner. */
export function screenshotOwnerFrom({ ownerPrincipalId }: { ownerPrincipalId: () => Promise<string> }, _optional: Record<string, never> = {}) {
  return async ({ context }: { context: Context }) => {
    if (!context?.id || context.id !== await ownerPrincipalId()) rejectRoute({ status: 403, code: "OWNER_ONLY", error: "Only the site owner can delete screenshots." });
    return { principal: context.id };
  };
}

/** The `screenshot-storage` server module over the booted site's captures folder. */
export function createScreenshotStorageModule(deps: RouteDeps, _optional: Record<string, never> = {}): ServerModuleHandle {
  return {
    name: "screenshot-storage",
    registerRoutes: ({ app }, _options = {}) => {
      const previewStore = createCleanupPreviewStore({ randomToken: ({ bytes }) => randomBytes(bytes).toString("base64url"), mono: () => performance.now() });
      // Bound on first use, not at registration: `siteBinding` is read only when a request needs the
      // captures root, as the capture writer does (`tool-catalog-manifest.ts`).
      let bound: CaptureRetentionBinding<Context> | undefined;
      const binding = () => bound ??= bindCaptureRetention<Context>({
        siteDir: deps.siteBinding.dir, captureRootFor, writerFence: captureWriterFence, fs, clock: () => Date.now(), previewStore,
        authorizeOwner: screenshotOwnerFrom({ ownerPrincipalId: async () => deps.ownerPrincipalId }),
      }, {});
      const retention: CaptureRetentionBinding<Context> = { preview: (required) => binding().preview(required, {}), apply: (required) => binding().apply(required, {}) };
      mountScreenshotCleanup({ app, retention, adminPorts: { mount: mountAdminJsonRoute, deps: { workspaceId: deps.workspaceId, authorize: deps.authorize }, origin: adminSameOriginWrites } });
    },
  };
}
