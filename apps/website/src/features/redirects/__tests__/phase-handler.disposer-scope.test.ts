import assert from "node:assert/strict";
import test from "node:test";

import { registerRedirectsPhaseHandlers } from "../phase-handler.js";
import { resetRoutingRegistrationsForTests, runPostContentPhase, runPreContentPhase } from "#src/platform/routing/routing";
import type { RouteResolveContext } from "#src/platform/routing/types";

/**
 * @file t91 F4.2 Part A (2026-09-16): `registerRedirectsPhaseHandlers`'s disposer used to call
 * `unregisterResolvePhaseOwner(REDIRECTS_PHASE_OWNER)`, which is OWNER-WIDE, not scoped to the
 * registration that returned it. A stale composition's disposer, called after a newer composition
 * had already superseded it (boot B, then tear down A), revoked B's live redirects — a silent
 * outage the identity-scoped fix below closes. The disposer now returns the two underlying
 * `registerResolvePhase` disposers, each of which removes exactly the registration it closed over
 * and is a no-op once superseded (`routing.ts`'s own guarantee).
 */

const ctx: RouteResolveContext = { workspaceId: "ws" };

function resolverFor(location: string): { resolve(): Promise<unknown> } {
  return {
    async resolve() {
      return { matched: true, redirectId: "00000000-0000-4000-8000-0000000000aa", location, statusCode: 301 };
    },
  };
}

test.beforeEach(() => resetRoutingRegistrationsForTests());
test.afterEach(() => resetRoutingRegistrationsForTests());

test("a superseded composition's disposer does not revoke the newer composition's redirects", async () => {
  const disposeA = registerRedirectsPhaseHandlers({ resolver: resolverFor("/from-a") as never });
  registerRedirectsPhaseHandlers({ resolver: resolverFor("/from-b") as never });

  disposeA();

  const expected = { kind: "redirect", location: "/from-b", statusCode: 301 };
  assert.deepEqual(
    await runPreContentPhase("/x", ctx),
    expected,
    "the superseded (A) disposer must not revoke B's live registration"
  );
  assert.deepEqual(
    await runPostContentPhase("/x", ctx),
    expected,
    "the superseded (A) disposer must not revoke B's live registration"
  );
});

test("the live composition's disposer still revokes it, idempotently", async () => {
  const disposeB = registerRedirectsPhaseHandlers({ resolver: resolverFor("/from-b") as never });

  disposeB();
  disposeB();

  assert.equal(await runPreContentPhase("/x", ctx), null, "disposing the live registration must revoke it");
  assert.equal(await runPostContentPhase("/x", ctx), null, "disposing the live registration must revoke it");
});
