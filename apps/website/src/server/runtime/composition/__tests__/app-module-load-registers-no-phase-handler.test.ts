import assert from "node:assert/strict";
import { test } from "node:test";

import { registerRedirectsPhaseHandlers } from "#src/features/redirects/phase-handler";
import { runPostContentPhase, runPreContentPhase } from "#src/platform/routing/routing";
import type { RouteResolveContext } from "#src/platform/routing/types";

/**
 * @file Regression coverage for t91 F4.1 (2026-09-16): `composition/app.ts` used to end with an
 * eager `export const app = createApp();`, which ran a full hermetic composition — including its
 * own in-memory redirects registration — the moment anything merely IMPORTED the module, not just
 * when something called `createApp()` itself. This test's whole point is that loading `app.ts`
 * this way must register nothing that could supersede a live registration.
 *
 * Updated 2026-09-16 (t91 F4.1-A fix): `deps.ts` no longer reaches `app.ts` lazily. It now
 * statically `import`s `createApp` from `./app.js` (alongside `exportSite`, both placed as the
 * LAST two imports in `deps.ts` specifically so every other module in its import graph finishes
 * loading first) — so `app.ts` loads the moment any process imports `deps.ts` at all, which every
 * CLI command does, not only on a process's first `routeDeps.createSiteApp()` call. The property
 * this test proves is unchanged by that fix — a fresh process's first touch of `app.ts` must not
 * clobber a live registration, whenever that touch happens — only WHEN the touch happens moved
 * earlier (module-load time, not first-call time).
 *
 * This file imports ONLY the redirects feature and the routing phase runners — nothing that
 * statically reaches `composition/app.ts` — so the dynamic `import()` below is this test's first
 * and only load of that module, reproducing a fresh process's first touch of `app.ts` regardless
 * of whether that touch comes from `deps.ts`'s static import or (pre-fix) a lazy `require`.
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
