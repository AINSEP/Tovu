/**
 * @file The product's half of publish-candidate discovery: which deploy-config key names a
 * deployment's public origin. Constants only and import-free, because the Fly overlay's plain-node
 * `.mjs` test loads this file by relative path.
 */

/** The deploy-config key naming a deployment's public origin. Already this repo's own convention
 *  for exactly that (`features/origin/configured-origin.ts`); reusing it means a site that has ever
 *  been deployed needs no new setting to be connectable.
 *
 *  Matched against the COMMITTED deploy config, deliberately never `process.env.TOVU_PUBLIC_URL`: on
 *  the machine doing the connecting that names THIS install (usually `localhost`), not the site
 *  being published to. */
const PUBLIC_URL_KEY = "TOVU_PUBLIC_URL";

/** The key handed to the neutral candidate scan as `publicOriginKey`. The scan matches
 *  `TOVU_PUBLIC_URL = "https://…"` / `TOVU_PUBLIC_URL: https://…` / `TOVU_PUBLIC_URL=https://…`
 *  across TOML, YAML and JSON alike, which is why one expression covers every deploy-config file. */
export const PUBLISH_CANDIDATE_ORIGIN_KEY = PUBLIC_URL_KEY;
