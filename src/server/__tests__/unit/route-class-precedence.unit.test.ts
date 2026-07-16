import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../../app";

/**
 * @file ADR-046 Phase 3 (SPEC-034) — structural route-class precedence check.
 *
 * `app.ts`'s own comments have long asserted "`/:slug` remains last by rule" at each public route
 * registration site — a claim previously enforced only by human diligence re-reading those
 * comments before adding a new route. This test makes the claim executable: it introspects
 * Express's own router stack (`app._router.stack`, Express 4's real, if internal/untyped,
 * ordered list of registered layers) after a full `createApp()` build and asserts the site
 * catch-all (`GET /:slug`, `routes/site/pages.ts`) is the LAST registered route layer — i.e. no
 * other route, of any method or path shape, was registered after it. A future route added below
 * the catch-all by mistake fails this test immediately instead of silently 404ing/shadowing.
 *
 * Deliberately NOT a full `fixed-public`/`parameterized-public`/`catch-all` classification system
 * (ADR-046 Phase 3's larger, not-yet-built idea) — this is the minimum structural assertion the
 * ADR itself calls out: "the site catch-all route is registered after every other route."
 */

interface ExpressRouteLayer {
  route?: { path: string; methods: Record<string, boolean> };
}

interface ExpressAppWithRouter {
  _router: { stack: ExpressRouteLayer[] };
}

function routeLayers(app: ReturnType<typeof createApp>): { path: string; methods: string[] }[] {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  return stack
    .filter((layer): layer is Required<ExpressRouteLayer> => Boolean(layer.route))
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods).filter((m) => layer.route.methods[m]),
    }));
}

test("the site catch-all (GET /:slug) is registered after every other route", () => {
  const app = createApp();
  const layers = routeLayers(app);

  assert.ok(layers.length > 50, `expected a large number of registered routes, saw ${layers.length}`);

  const catchAllIndex = layers.findIndex((l) => l.path === "/:slug" && l.methods.includes("get"));
  assert.notEqual(catchAllIndex, -1, "GET /:slug (site catch-all) was not found in the router stack");
  assert.equal(
    catchAllIndex,
    layers.length - 1,
    `GET /:slug must be the LAST registered route; found ${layers.length - catchAllIndex - 1} route(s) registered after it: ` +
      JSON.stringify(layers.slice(catchAllIndex + 1))
  );
});

test("no other route in the app shares the literal path '/:slug'", () => {
  const app = createApp();
  const layers = routeLayers(app);
  const slugRoutes = layers.filter((l) => l.path === "/:slug");
  assert.equal(slugRoutes.length, 1, "expected exactly one GET /:slug registration (the site catch-all)");
});
