import assert from "node:assert/strict";
import test from "node:test";

import { openLoopbackSiteServer } from "../published-page.js";

/**
 * @file `openLoopbackSiteServer`'s theme override: `web_screenshot_page`'s `themeId` reaches the
 * site app factory as `createSiteApp({ themeId })`, and only then. A factory that IGNORED its
 * argument would still type-check, so this pins the call itself.
 */

function recordingDeps() {
  const calls: unknown[][] = [];
  return {
    calls,
    deps: { createSiteApp: (...args: unknown[]) => { calls.push(args); return (_req: unknown, res: { end(): void }) => res.end(); } },
  };
}

test("with a themeId, the site app is built with that render override", async () => {
  const { calls, deps } = recordingDeps();
  const site = await openLoopbackSiteServer({ deps }, { themeId: "luvira-copy" });
  await site.close();
  assert.deepEqual(calls, [[{ themeId: "luvira-copy" }]]);
});

test("without one, the site app is built with no override (the active theme)", async () => {
  const { calls, deps } = recordingDeps();
  const site = await openLoopbackSiteServer({ deps });
  await site.close();
  assert.deepEqual(calls, [[{}]]);
});
