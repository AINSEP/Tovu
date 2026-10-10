/** Tovu binding for @jini-ai/cms/routing. One instance preserves the existing process-wide
 * registration lifecycle; the current publication gate remains the sole visibility owner. */
import { createRouting } from '@jini-ai/cms/routing';
import { currentIso, isLiveAt } from "#src/contracts/core/scheduled-publish";

const routing = createRouting({ ports: {
  isLive: ({ post }) => isLiveAt(post, currentIso()),
  reportPhaseError: ({ message, error }) => {
    // eslint-disable-next-line no-console -- preserve routing's existing operator-facing fault channel.
    console.error(message, error);
  },
} });

export const { entryPublicPath, getNamedRoute, getSlugChangeCapture, isActive, postPublicPath, registerNamedRoute, registerResolvePhase, registerSlugChangeCapture, resolve, runPostContentPhase, runPreContentPhase, unregisterResolvePhaseOwner, urlFor, resetRoutingRegistrationsForTests } = routing;
export { RouteResolutionError } from '@jini-ai/cms/routing';
export type * from '@jini-ai/cms/routing';
