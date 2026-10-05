import assert from "node:assert/strict";
import test from "node:test";

import { drainBootReadiness, type BootReadiness } from "./helpers/unrun-site-boot.js";

/**
 * @file `drainBootReadiness` must hold teardown until every boot promise has settled. It used to skip
 * `pluginRuntimeReady`, so a site closed before its plugins attached could race the attach's writes.
 */

const READINESS_KEYS = [
  "identityReady",
  "settingsReady",
  "seoReady",
  "commentsReady",
  "commentsSettingsReady",
  "executionSettingsReady",
  "settingsUiTabsReady",
  "analyticsSettingsReady",
  "siteTitleReady",
  "pluginRuntimeReady",
] as const satisfies readonly (keyof BootReadiness)[];

for (const held of READINESS_KEYS) {
  test(`drainBootReadiness waits for ${held}`, async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => (release = resolve));
    const readiness = Object.fromEntries(READINESS_KEYS.map((key) => [key, key === held ? pending : Promise.resolve()])) as BootReadiness;

    let drained = false;
    const draining = drainBootReadiness(readiness).then(() => (drained = true));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(drained, false, `drained before ${held} settled`);

    release();
    await draining;
    assert.equal(drained, true);
  });
}
