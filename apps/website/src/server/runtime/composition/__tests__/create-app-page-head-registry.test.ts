import assert from "node:assert/strict";
import { test } from "node:test";

import { createApp } from "../app.js";
import {
  foldPageHead,
  registerPageHeadContributor,
  resetPageHeadRegistry,
  type HeadElement,
  type PageHeadContext,
  type PageHeadHook,
} from "../../../inbound/public-http/http/site/page-head.js";

/**
 * @file Regression coverage for the live duplicate-JSON-LD bug on `/how-themes-work`
 * (2026-08-31): `page-head.ts`'s `contributors` registry is a process-wide singleton, but
 * `createApp()` is not guaranteed to run only once per process — `app.ts`'s module body used to end
 * with an eager `export const app = createApp();`, which fired (using `createRouteDeps()`'s
 * hermetic, seeded, in-memory deps) the moment anything merely IMPORTED `app.ts`, including
 * `index.ts`'s real boot path immediately before its own explicit `createApp(deps)` call. That eager
 * export was removed on 2026-09-16 (t91 F4.1), so this exact double-import trigger no longer exists
 * — but `createApp()` still runs more than once per process today: every test that calls it, and
 * every `routeDeps.createSiteApp()` the exporter and site-inspection make. Before the fix, neither
 * call cleared the registry, so both calls' `createSeoPageHeadHook` instances stayed registered side
 * by side for the rest of the process: on a live request, the stale call's hook (closed over stale
 * seed-fixture data) folded a second, stale `application/ld+json` block and a stale `description`
 * into the SAME `<head>` as the real hook's correct output.
 *
 * This test exercises the real `createApp()` (not a reimplementation) and asserts the exact
 * invariant that broke: a later `createApp()` call must fully replace an earlier one's page-head
 * registration, never accumulate alongside it. A registered marker hook is the observable proxy
 * for "the registry was reset" — `createRouteDeps()`'s own seed content is identical across calls,
 * so the real SEO hook's output alone can't distinguish one registration from two.
 */

const HOME_CTX: PageHeadContext = {
  workspaceId: "workspace-1",
  route: "home",
  siteTitle: "Test Site",
  canonicalUrl: "/",
};

function markerHook(type: string): PageHeadHook {
  return {
    priority: 100,
    async handle(): Promise<HeadElement[]> {
      return [{ kind: "jsonld", data: { "@type": type }, priority: 900 }];
    },
  };
}

test.beforeEach(() => {
  resetPageHeadRegistry();
});

test("createApp(): a later call replaces an earlier call's page-head registration instead of accumulating alongside it", async () => {
  createApp();
  registerPageHeadContributor(markerHook("MarkerAfterFirstCreateApp"));

  const afterFirstCall = await foldPageHead(HOME_CTX);
  assert.ok(
    afterFirstCall.some((el) => el.kind === "jsonld" && el.data["@type"] === "MarkerAfterFirstCreateApp"),
    "sanity check: the marker registered after the first createApp() call must be visible before the second call"
  );

  createApp();
  const afterSecondCall = await foldPageHead(HOME_CTX);
  const survivingMarker = afterSecondCall.find((el) => el.kind === "jsonld" && el.data["@type"] === "MarkerAfterFirstCreateApp");

  assert.equal(
    survivingMarker,
    undefined,
    "a second createApp() call left the first call's page-head contributor (and anything registered " +
      "after it) still folded into every subsequent request — this is the live duplicate-JSON-LD bug"
  );
});
