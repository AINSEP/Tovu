/** The factory only, never an instance: the site composition root builds exactly ONE access-evidence store per
 *  server process and threads that same instance to the public media-rendition route (the reader) and to every
 *  content-write owner (post repos, entry repos, trash service) that invalidates it. A module-level instance here
 *  would let a second composition, or a test, silently share or split that state; the engine keeps none of its own. */
export { createMediaAccessEvidence, type MediaAccessEvidence } from "@jini-ai/cms/media/site/access-evidence";
