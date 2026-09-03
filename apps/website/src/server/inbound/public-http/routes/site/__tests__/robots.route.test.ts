import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { registerSeoRobotsRoute } from "../robots.js";
import type { SeoRouteDeps } from "#src/server/inbound/admin-http/routes/seo/deps";

/**
 * @file Coverage-gap fill for `registerSeoRobotsRoute` (`routes/site/robots.ts`). The happy path
 * (default settings: no custom rules, sitemap advertised) is already covered by
 * `src/server/__tests__/routes/seo-site-serving.test.ts` and the cacheability measurement suite.
 * This file targets the branches only a NON-default configuration or a failing dependency can
 * reach:
 *  - a rule that carries only `allow` (no `disallow`) and one that carries only `disallow` (no
 *    `allow`) — `RobotsRule.allow`/`.disallow` are both genuinely optional
 *    (`features/seo/types.ts`), and `validateRobotsRule` (`features/seo/settings.ts`) explicitly
 *    permits omitting either, so `rule.allow ?? []` / `rule.disallow ?? []` are real, reachable
 *    fallbacks, not defensive dead code.
 *  - the fully-empty body (`policy.rules` AND `policy.sitemapUrls` both empty) — reachable by an
 *    admin turning off both the sitemap and every robots rule.
 *  - the route's own `catch` — reachable whenever `buildRobots` (settings read) throws.
 */

test("GET /robots.txt: a rule with only `allow` and a rule with only `disallow` each emit just their one directive, and the sitemap is still advertised", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/seo/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      robotsRules: [
        { userAgent: "*", allow: ["/"] },
        { userAgent: "Googlebot", disallow: ["/private"] },
      ],
    }),
  });
  assert.equal(put.status, 200);

  const res = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.equal(
    body,
    "User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /private\n\nSitemap: /sitemap.xml\n"
  );
});

test("GET /robots.txt: no rules and sitemap disabled -> completely empty body, not even a trailing newline", async (t) => {
  const deps: RouteDeps = createRouteDeps();
  const app = createApp(deps);
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const put = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/seo/settings`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ robotsRules: [], sitemapEnabled: false }),
  });
  assert.equal(put.status, 200);

  const res = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
});

function buildRobotsOnlyApp(depsOverrides: Partial<SeoRouteDeps>): express.Express {
  const base = createRouteDeps();
  const deps: SeoRouteDeps = { ...base, ...depsOverrides };
  const app = express();
  registerSeoRobotsRoute(app, deps);
  return app;
}

test("GET /robots.txt: a settings-read failure is caught and reported as a plain-text 500, not an uncaught rejection", async (t) => {
  // Mutate the real repo instance's own `getWorkspaceValue`, rather than spreading it into a
  // plain object -- `InMemorySettingsRepo`'s methods live on its prototype, so a spread would
  // silently drop `findActiveDefinition`/etc. too, and the resulting `TypeError` would reach the
  // route's catch for a different, unintended reason.
  const settingsRepo = createRouteDeps().settingsRepo;
  settingsRepo.getWorkspaceValue = async () => {
    throw new Error("settings store unavailable");
  };
  const app = buildRobotsOnlyApp({ settingsRepo });
  const baseUrl = await startTestServer(app, t);

  const res = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(res.status, 500);
  assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
  assert.equal(await res.text(), "internal error");
});
