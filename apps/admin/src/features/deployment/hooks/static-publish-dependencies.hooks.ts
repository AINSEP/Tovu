import { api, type AdminPublishRunSnapshot, type AdminStaticPublishPreview } from "../../../lib/api";
import type { StaticPublishPort } from "./static-publish-port.hooks";

/** The live implementation, as a module-level singleton — matches
 *  `static-export-dependencies.hooks.ts`'s `defaultStaticExportPort`. */
export const defaultStaticPublishPort: StaticPublishPort = {
  getPublishPreview: (config) => api.getPublishPreview(config),
  triggerPublish: (input) => api.triggerPublish(input),
  getPublishStatus: () => api.getPublishStatus(),
};

/** An in-memory {@link StaticPublishPort} for tests. Each of the three calls defaults to a neutral,
 *  overridable stub — unlike `createFakeStaticExportPort`'s single shared seed, this port has no one
 *  value that naturally serves all three (a preview and a run snapshot are unrelated shapes), so a
 *  test supplies exactly the ones it exercises. */
export function createFakeStaticPublishPort(
  overrides: {
    getPublishPreview?: StaticPublishPort["getPublishPreview"];
    triggerPublish?: StaticPublishPort["triggerPublish"];
    getPublishStatus?: () => Promise<AdminPublishRunSnapshot>;
  } = {}
): StaticPublishPort {
  const idlePreview: AdminStaticPublishPreview = {
    target: "vercel",
    valid: false,
    validationError: null,
    basePath: null,
    credentialsConfigured: false,
    credentialGuidance: null,
    willInjectNojekyll: false,
  };
  const idleRun: AdminPublishRunSnapshot = { status: "idle", startedAtIso: null, finishedAtIso: null, target: null };
  return {
    getPublishPreview: overrides.getPublishPreview ?? (() => Promise.resolve(idlePreview)),
    triggerPublish: overrides.triggerPublish ?? (() => Promise.resolve({ ...idleRun, status: "running" })),
    getPublishStatus: overrides.getPublishStatus ?? (() => Promise.resolve(idleRun)),
  };
}
