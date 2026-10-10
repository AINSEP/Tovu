import assert from "node:assert/strict";
import test from "node:test";

import { registerRedirectsPhaseHandlers } from "#src/features/redirects/phase-handler";
import { resetRoutingRegistrationsForTests, runPostContentPhase, runPreContentPhase } from "#src/platform/routing/adapter";
import { type RouteResolveContext } from '@jini-ai/cms/routing';

/**
 * @file Guard for t91 F4.3's opt-in half: `registerRedirectsPhaseHandlers` must pass
 * `onError: "skip"` on both its `registerResolvePhase` calls, now that `routing.ts`'s default
 * changed to `"fail"`. A redirect lookup failure can only decline to redirect (INV-03), and one
 * broken rule store must not 500 every page on the site — this pins that Redirects keeps that
 * guarantee under the new default rather than losing it silently.
 */

const ctx: RouteResolveContext = { workspaceId: "ws" };

test.beforeEach(() => resetRoutingRegistrationsForTests({}));
test.afterEach(() => resetRoutingRegistrationsForTests({}));

test("a redirects resolver that throws is isolated in both phases — Redirects opts into skip", async () => {
  registerRedirectsPhaseHandlers({
    resolver: {
      async resolve() {
        throw new TypeError("The database connection is not open");
      },
    } as never,
  });

  assert.equal(await runPreContentPhase({ path: "/x", ctx: ctx }), null, "a broken redirects resolver must decline, not 500, pre_content");
  assert.equal(await runPostContentPhase({ path: "/x", ctx: ctx }), null, "a broken redirects resolver must decline, not 500, post_content");
});
