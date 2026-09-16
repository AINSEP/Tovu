import assert from "node:assert/strict";
import { test } from "node:test";

import { registerRedirectsPhaseHandlers } from "#src/features/redirects/phase-handler";
import { runPostContentPhase, runPreContentPhase } from "#src/platform/routing/routing";
import type { RouteResolveContext } from "#src/platform/routing/types";

/**
 * @file Regression coverage for t91 F4.1 (2026-09-16): `composition/app.ts` used to end with an
 * eager `export const app = createApp();`, which ran a full hermetic composition — including its
 * own in-memory redirects registration — the moment anything merely IMPORTED the module, not just
 * when something called `createApp()` itself. `deps.ts`'s `createSiteAppLazily` does exactly that
 * import (via a lazy `require("./app.js")`) the first time a process that has not yet loaded
 * `app.ts` calls `routeDeps.createSiteApp()` — the exporter and site-inspection both do — so a
 * live SQLite-backed redirects registration got silently replaced by the throwaway in-memory one.
 *
 * This file imports ONLY the redirects feature and the routing phase runners — nothing that
 * statically reaches `composition/app.ts` — so the dynamic `import()` below is this test's first
 * and only load of that module, reproducing exactly what a lazy `require("./app.js")` sees.
 */

const CTX: RouteResolveContext = { workspaceId: "00000000-0000-4000-8000-000000000001" };

test("loading composition/app.ts registers nothing: a live Redirects registration survives the module's first load", async () => {
  const realResolver = {
    async resolve() {
      return {
        matched: true,
        redirectId: "00000000-0000-4000-8000-0000000000aa",
        location: "/real-target",
        statusCode: 301,
      };
    },
  };
  registerRedirectsPhaseHandlers({ resolver: realResolver as never });

  const expected = { kind: "redirect", location: "/real-target", statusCode: 301 };
  assert.deepEqual(await runPreContentPhase("/old", CTX), expected);

  await import("#src/server/runtime/composition/app");

  assert.deepEqual(
    await runPreContentPhase("/old", CTX),
    expected,
    "loading app.ts must not replace the live Redirects registration"
  );
  assert.deepEqual(
    await runPostContentPhase("/old", CTX),
    expected,
    "loading app.ts must not replace the live Redirects registration"
  );
});
