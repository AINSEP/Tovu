import { createConsoleLogger } from "@jini-ai/core/primitives";
/** Tovu binding for @jini-ai/cms/routing. One instance preserves the existing process-wide
 * registration lifecycle; the current publication gate remains the sole visibility owner. */
import { createRouting } from '@jini-ai/cms/routing';
import { currentIso, isLiveAt } from "#src/contracts/core/scheduled-publish";

const consoleLogger = createConsoleLogger({ prefix: "" });

const routing = createRouting({ ports: {
  isLive: ({ post }) => isLiveAt({ record: post, nowIso: currentIso() }),
  reportPhaseError: ({ message, error }) => {
    // preserve routing's existing operator-facing fault channel.
    consoleLogger.error({ message }, { error });
  },
} });

export const { entryPublicPath, getNamedRoute, getSlugChangeCapture, isActive, postPublicPath, registerNamedRoute, registerResolvePhase, registerSlugChangeCapture, resolve, runPostContentPhase, runPreContentPhase, unregisterResolvePhaseOwner, urlFor, resetRoutingRegistrationsForTests } = routing;
export { RouteResolutionError } from '@jini-ai/cms/routing';
export type * from '@jini-ai/cms/routing';
