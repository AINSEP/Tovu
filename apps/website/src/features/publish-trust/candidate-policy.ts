/** The deploy-config key naming a deployment's public origin. Already this repo's own convention
 *  for exactly that (`features/origin/configured-origin.ts`); reusing it means a site that has ever
 *  been deployed needs no new setting to be connectable. */
const PUBLIC_URL_KEY = "TOVU_PUBLIC_URL";


/**
 * Deliberately NOT `process.env.TOVU_PUBLIC_URL`: on the machine doing the connecting that names
 * THIS install (usually `localhost`), not the site being published to. The committed config is the
 * one place that names the deployed site, and every install that has ever been deployed has it.
 *
 */
export const PUBLISH_CANDIDATE_ORIGIN_KEY = PUBLIC_URL_KEY;
