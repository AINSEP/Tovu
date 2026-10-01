import assert from "node:assert/strict";
import test from "node:test";

import { RedirectPhaseHandlerResolver, registerRedirectsPhaseHandlers } from "../phase-handler.js";
import { redirectMatcher } from "../matcher.js";
import { InMemoryRedirectRepo } from "../repo.memory.js";
import { createVerifiedOrigin, InMemoryOriginSettingRepo, OriginRegistry } from "#src/features/origin/index";
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

test("registered phases forward the request context and reserve pre-content for override rules", async () => {
  const at = "2026-09-01T00:00:00.000Z";
  const repo = new InMemoryRedirectRepo([false, true].map((override) => ({
    id: `rule-${override}`, workspaceId: "ws", matchType: "exact" as const,
    fromPattern: override ? "/override" : "/ordinary", toTarget: "/destination",
    statusCode: 302 as const, status: "active" as const, override, priority: 0,
    source: "manual" as const, createdByPrincipal: "owner", createdAt: at, updatedAt: at, version: 1,
  })));
  const real = new RedirectPhaseHandlerResolver({ repo, matcher: redirectMatcher,
    originRegistry: new OriginRegistry({ repo: new InMemoryOriginSettingRepo([{
      workspaceId: "ws", origin: createVerifiedOrigin({ scheme: "https", host: "trusted.example", verifiedAt: at, source: "workspace-setting" }),
      redirectAllowlist: [],
    }]) }),
  });
  const requests: Parameters<typeof real.resolve>[0][] = [];
  registerRedirectsPhaseHandlers({ resolver: { resolve: async (request) => {
    requests.push(request);
    return real.resolve(request);
  } } });
  const redirect = { kind: "redirect", location: "/destination", statusCode: 302 };
  assert.equal(await runPreContentPhase("/ordinary", ctx), null);
  assert.deepEqual(await runPostContentPhase("/ordinary", ctx), redirect);
  assert.deepEqual(await runPreContentPhase("/override", ctx), redirect);
  assert.deepEqual(await runPostContentPhase("/override", ctx), redirect);
  assert.equal(await runPostContentPhase("/ordinary", { workspaceId: "other-ws" }), null);
  assert.deepEqual(requests, [
    { workspaceId: "ws", path: "/ordinary", phase: "pre_content" },
    { workspaceId: "ws", path: "/ordinary", phase: "post_content" },
    { workspaceId: "ws", path: "/override", phase: "pre_content" },
    { workspaceId: "ws", path: "/override", phase: "post_content" },
    { workspaceId: "other-ws", path: "/ordinary", phase: "post_content" },
  ]);
});
