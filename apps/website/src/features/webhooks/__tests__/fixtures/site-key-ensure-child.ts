import { existsSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

import { ensureSiteKey } from "../../site-key-ensure.js";
import { findSiteKeyDependentData } from "#src/platform/site-dir/site-key-dependent-data";

/**
 * @file Cross-process half of the A2 race test (site-key plan §A.2: "a race test with 2 child
 * processes on the same temp HOME and siteKeyId: exactly 1 file, same fingerprint in both").
 *
 * The injected data scan is awaited after key absence has been observed. A ready file and
 * parent-controlled release file hold both processes at that point before either can publish.
 *
 * argv: `home siteDir siteKeyId outputFilePath releaseFilePath`. Writes `{action, fingerprint}` as JSON to
 * `outputFilePath` — never to stdout, so the parent test's own process output stays clean.
 */

const [home, siteDir, siteKeyId, outputFilePath, releaseFilePath] = process.argv.slice(2);
if (!home || !siteDir || !siteKeyId || !outputFilePath || !releaseFilePath) {
  process.stderr.write("usage: site-key-ensure-child.ts <home> <siteDir> <siteKeyId> <outputFilePath> <releaseFilePath>\n");
  process.exit(1);
}

const env = { ...process.env };
delete env.TOVU_SITE_KEY;
delete env.TOVU_INTEGRATIONS_ROOT_KEY;
delete env.TOVU_RUNTIME_MODE;

const result = await ensureSiteKey({ siteDir, siteKeyId, mode: "local", env, home,
  findSiteKeyDependentData: async (dir) => {
    const hasData = await findSiteKeyDependentData(dir);
    writeFileSync(`${outputFilePath}.ready`, "ready");
    const deadline = Date.now() + 20_000;
    while (!existsSync(releaseFilePath)) {
      if (Date.now() > deadline) throw new Error("parent did not release site-key race barrier");
      await delay(10);
    }
    return hasData;
  },
});
writeFileSync(outputFilePath, JSON.stringify(result), "utf8");
