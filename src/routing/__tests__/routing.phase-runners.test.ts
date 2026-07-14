import assert from "node:assert/strict";
import test from "node:test";

import type { RouteResolveContext, RouteResolvePhaseHandler } from "../types";
import {
  registerResolvePhase,
  resetRoutingRegistrationsForTests,
  resolve,
  runPostContentPhase,
  runPreContentPhase,
} from "../routing";

/**
 * @file T011 (C-012, C-013, ADR-PIPE-009 Decision B) — the additive
 * `runPreContentPhase`/`runPostContentPhase` exports that let a caller
 * interleave its own content lookup between the two phases, something
 * `resolve()`'s bundled v0 shape cannot express. `resolve()` itself must
 * remain completely unchanged (its own `routing.test.ts` suite is asserted
 * green, unmodified, by T024 — this file only adds NEW tests).
 */

const ctx: RouteResolveContext = { workspaceId: "workspace-1" };

test("runPreContentPhase returns the same outcome resolve() would for a matching pre_content handler", async () => {
  resetRoutingRegistrationsForTests();
  registerResolvePhase("pre_content", async (path) => {
    if (path === "/retired") return { kind: "redirect", location: "/new-home", statusCode: 301 };
    return null;
  });

  const outcome = await runPreContentPhase("/retired", ctx);

  assert.deepEqual(outcome, { kind: "redirect", location: "/new-home", statusCode: 301 });
});

test("runPreContentPhase returns null when no pre_content handler matches", async () => {
  resetRoutingRegistrationsForTests();
  registerResolvePhase("pre_content", async () => null);

  const outcome = await runPreContentPhase("/anything", ctx);

  assert.equal(outcome, null);
});

test("calling runPreContentPhase alone does NOT also run post_content", async () => {
  resetRoutingRegistrationsForTests();
  let postContentCalled = false;
  registerResolvePhase("pre_content", async () => null);
  const postHandler: RouteResolvePhaseHandler = async () => {
    postContentCalled = true;
    return { kind: "not_found" };
  };
  registerResolvePhase("post_content", postHandler);

  const outcome = await runPreContentPhase("/anything", ctx);

  assert.equal(outcome, null);
  assert.equal(postContentCalled, false, "runPreContentPhase must never run post_content handlers");
});

test("runPostContentPhase returns the same outcome resolve() would for a matching post_content handler", async () => {
  resetRoutingRegistrationsForTests();
  registerResolvePhase("post_content", async (path) => {
    if (path === "/old-slug") return { kind: "redirect", location: "/moved", statusCode: 301 };
    return null;
  });

  const outcome = await runPostContentPhase("/old-slug", ctx);

  assert.deepEqual(outcome, { kind: "redirect", location: "/moved", statusCode: 301 });
});

test("runPostContentPhase returns null when no post_content handler matches", async () => {
  resetRoutingRegistrationsForTests();
  registerResolvePhase("post_content", async () => null);

  const outcome = await runPostContentPhase("/anything", ctx);

  assert.equal(outcome, null);
});

test("runPostContentPhase normalizes the path the same way resolve() does", async () => {
  resetRoutingRegistrationsForTests();
  let seenPath: string | null = null;
  registerResolvePhase("post_content", async (path) => {
    seenPath = path;
    return null;
  });

  await runPostContentPhase("/some/path/?x=1", ctx);

  assert.equal(seenPath, "/some/path");
});

test("the existing routing.test.ts suite's resolve() behavior is unaffected by the new exports", async () => {
  resetRoutingRegistrationsForTests();
  registerResolvePhase("pre_content", async () => null);
  registerResolvePhase("post_content", async (path) => {
    if (path === "/old-slug") return { kind: "redirect", location: "/moved", statusCode: 301 };
    return null;
  });

  const result = await resolve({ input: { path: "/old-slug", ctx } });

  assert.deepEqual(result, {
    matched: true,
    phase: "post_content",
    outcome: { kind: "redirect", location: "/moved", statusCode: 301 },
  });
});
