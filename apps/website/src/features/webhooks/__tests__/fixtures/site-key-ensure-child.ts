import { writeFileSync } from "node:fs";

import { ensureSiteKey } from "../../site-key-ensure.js";

/**
 * @file Cross-process half of the A2 race test (site-key plan §A.2: "a race test with 2 child
 * processes on the same temp HOME and siteKeyId: exactly 1 file, same fingerprint in both").
 *
 * `ensureSiteKey` is synchronous, so there is no way for the parent test to pause it mid-write —
 * the race this proves safe is genuinely between two OS processes both reaching
 * `atomicCreateSiteKeyFile` at roughly the same wall-clock instant, not an artificially staged one.
 * Spawned via `tsx` (see `../integration/site-key-ensure-race.integration.test.ts`), same pattern as
 * `activation-writer-child.ts`.
 *
 * argv: `home siteDir siteKeyId outputFilePath`. Writes `{action, fingerprint}` as JSON to
 * `outputFilePath` — never to stdout, so the parent test's own process output stays clean.
 */

const [home, siteDir, siteKeyId, outputFilePath] = process.argv.slice(2);
if (!home || !siteDir || !siteKeyId || !outputFilePath) {
  process.stderr.write("usage: site-key-ensure-child.ts <home> <siteDir> <siteKeyId> <outputFilePath>\n");
  process.exit(1);
}

const env = { ...process.env };
delete env.TOVU_SITE_KEY;
delete env.TOVU_INTEGRATIONS_ROOT_KEY;
delete env.TOVU_RUNTIME_MODE;

const result = ensureSiteKey({ siteDir, siteKeyId, mode: "local", env, home });
writeFileSync(outputFilePath, JSON.stringify(result), "utf8");
