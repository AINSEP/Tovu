/**
 * @file The two hoisted `ServerModuleHandle` guards `createApp` and its mounts share. Moved verbatim out of `app.ts`.
 */

import type { Express } from "express";
import type { ByokToolSurfaceDeps } from "#src/assistant/index";
import type { NewsletterRouteDeps } from "../../../inbound/admin-http/routes/newsletter/deps.js";
import type { registerThemePreviewRefresh } from "../../../inbound/public-http/middleware/theme-preview-refresh.js";
import type { ServerModuleHandle } from "../modules/types.js";

/** The preview-revision predicate `mountCoreContent` produces and `mountPublicSite` consumes. */
export type PreviewRevisionCheck = ReturnType<typeof registerThemePreviewRefresh>;

/** What every mount takes: the Express app it registers on and the composed deps. */
export type MountInput = { app: Express; routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps };

/**
 * 2026-08-20 (complexity pass) — `createApp` mounts ~30 `ServerModuleHandle`s below, each via the
 * identical `mod.registerRoutes?.(app)` guard (`registerRoutes` is optional per
 * `modules/types.ts`'s `ServerModuleHandle` doc: a module may own only subscriptions, only routes,
 * or both). ESLint's `complexity` rule counts every `?.` as its own branch, so 30 inlined copies of
 * the SAME guard cost `createApp` 30 points of complexity for zero actual decision-making — the
 * guard never varies. Hoisting it here means the branch is counted once, in this 2-line function,
 * instead of once per call site.
 */
export function mountRoutes({ app, mod }: { app: Express; mod: ServerModuleHandle }, _optional: Record<string, never> = {}): void {
  mod.registerRoutes?.({ app });
}

/** Same hoisted-guard rationale as {@link mountRoutes}, for the `start?.()` half of
 * `ServerModuleHandle` (a module's optional subscriptions/workers, started once at boot). */
export function startModule(mod: ServerModuleHandle): void {
  mod.start?.();
}
