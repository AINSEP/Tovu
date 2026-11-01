import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createSitemapService } from "@jini-ai/cms/seo";
import { createSeoDeps } from "#src/features/seo/index";
import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import express from "express";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated, startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import type { RouteDeps } from "#src/server/routes/types";
import { registerSeoRobotsRoute } from "../robots.js";
import type { SeoRouteDeps } from "#src/server/inbound/admin-http/routes/seo/deps";
import { OriginNotVerifiedError, type OriginRegistryPort, type VerifiedOrigin } from "@jini-ai/http-kit/verified-origin";

/**
 * @file Coverage-gap fill for `registerSeoRobotsRoute` (`routes/site/robots.ts`). The happy path
 * (default settings: no custom rules, sitemap advertised) is already covered by
 * `src/server/__tests__/routes/seo-site-serving.test.ts` and the cacheability measurement suite.
 * This file targets the branches only a NON-default configuration or a failing dependency can
 * reach:
 *  - a rule that carries only `allow` (no `disallow`) and one that carries only `disallow` (no
 *    `allow`) — `RobotsRule.allow`/`.disallow` are both genuinely optional
 *    (`Jini/packages/cms/src/seo/types.ts`), and `validateRobotsRule` (`features/seo/settings.ts`) explicitly
 *    permits omitting either, so `rule.allow ?? []` / `rule.disallow ?? []` are real, reachable
 *    fallbacks, not defensive dead code.
 *  - the fully-empty body (`policy.rules` AND `policy.sitemapUrls` both empty) — reachable by an
 *    admin turning off both the sitemap and every robots rule.
 *  - the route's own `catch` — reachable whenever `buildRobots` (settings read) throws.
 *
 * 2026-09-04 absolute-URL fix: `createRouteDeps()` seeds a verified `dev-capability` origin
 * (`http://localhost:3000`, `app.ts`'s own `originRegistry` wiring — the identical fixture
 * `pages.route.test.ts`'s canonical/og:url absolute-URL tests already rely on) for the single
 * seeded workspace, so the two tests below that use it now assert the ABSOLUTE `Sitemap:` line —
 * this is the real, deliberate behavior change this fix ships, not test drift. The dedicated
 * no-verified-origin test further down proves the disclosed relative-path fallback is unchanged.
 *
 * 315c5ab12: live robots.txt uses the request's serving origin (`seoForRequest`), so a normal request
 * advertises the test server's own origin. The stored/verified-origin fallback (and its relative-path
 * degradation) now applies only when the Host cannot form a URL, so those two tests send a malformed Host.
 */

/** GET with a Host header `fetch` refuses to send; a port above 65535 cannot form a URL. */
function getWithMalformedHost(baseUrl: string, pathname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = http.get(new URL(pathname, baseUrl), { headers: { host: "bad.example:99999" } }, (res) => {
      let body = "";
      res.setEncoding("utf8").on("data", (chunk: string) => { body += chunk; }).on("end", () => resolve(body));
    });
    request.on("error", reject);
  });
}

test("GET /robots.txt: a rule with only `allow` and a rule with only `disallow` each emit just their one directive, and the sitemap is still advertised", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = createRouteDeps();
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
    `User-agent: *\nAllow: /\n\nUser-agent: Googlebot\nDisallow: /private\n\nSitemap: ${baseUrl}/sitemap.xml\n`
  );
});

test("GET /robots.txt: no rules and sitemap disabled -> completely empty body, not even a trailing newline", async (t) => {
  const deps: ReturnType<typeof createRouteDeps> = createRouteDeps();
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
  deps.seoDeps = createSeoDeps({ deps }, {});
  deps.sitemapService = createSitemapService({ deps: deps.seoDeps }, {});
  const app = express();
  registerSeoRobotsRoute(app, deps);
  return app;
}

/** A registry that always throws `OriginNotVerifiedError` — mirrors `pages.route.test.ts`'s own
 *  identical `NoOriginRegistry`, simulating a workspace with no verified origin registered yet, the
 *  disclosed degradation `toAbsoluteUrl` falls back to. */
class NoOriginRegistry implements OriginRegistryPort {
  async canonicalOrigin(): Promise<never> {
    throw new OriginNotVerifiedError({ message: "no verified origin registered for this workspace" });
  }
  async isAllowedRedirectTarget(): Promise<boolean> {
    return false;
  }
  async isAllowedEgressTarget(): Promise<boolean> {
    return false;
  }
}

test("GET /robots.txt: with NO verified origin and a Host that cannot form a URL, the Sitemap URL degrades to the bare relative path (disclosed fallback, 2026-09-04 fix)", async (t) => {
  const app = buildRobotsOnlyApp({ originRegistry: new NoOriginRegistry() });
  const baseUrl = await startTestServer(app, t);

  assert.match(await getWithMalformedHost(baseUrl, "/robots.txt"), /^Sitemap: \/sitemap\.xml\n$/m);
  // A well-formed request still advertises its own serving origin, never the registry state.
  assert.ok((await (await fetch(`${baseUrl}/robots.txt`)).text()).split("\n").includes(`Sitemap: ${baseUrl}/sitemap.xml`));
});

test("GET /robots.txt: with a verified origin and a Host that cannot form a URL, the Sitemap URL falls back to that absolute origin (2026-09-04 fix)", async (t) => {
  const verifiedOrigin: VerifiedOrigin = {
    scheme: "https",
    host: "example.test",
    verifiedAt: "2026-09-04T00:00:00.000Z",
    source: "workspace-setting",
  };
  const app = buildRobotsOnlyApp({
    originRegistry: {
      async canonicalOrigin() {
        return verifiedOrigin;
      },
      async isAllowedRedirectTarget() {
        return false;
      },
      async isAllowedEgressTarget() {
        return false;
      },
    },
  });
  const baseUrl = await startTestServer(app, t);

  assert.match(await getWithMalformedHost(baseUrl, "/robots.txt"), /^Sitemap: https:\/\/example\.test\/sitemap\.xml\n$/m);
  // The verified origin is only the fallback: a normal request uses its serving origin.
  const res = await fetch(`${baseUrl}/robots.txt`);
  assert.equal(res.status, 200);
  assert.ok((await res.text()).split("\n").includes(`Sitemap: ${baseUrl}/sitemap.xml`));
});

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
