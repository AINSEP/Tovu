import { createMediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";

/** The one media access-evidence store for this server process. The public media-rendition route reads it
 *  and every content-write owner (post repos, entry repos, trash service) invalidates it, so they must all
 *  hold THIS instance; the engine keeps no shared state of its own. */
export const mediaAccessEvidence = createMediaAccessEvidence();
