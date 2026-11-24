import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import { createCommerceSiteTestApp as createApp } from "./commerce-site-app.js";
import type { CommerceSiteTestDeps } from "./commerce-site-app.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createRouteDeps } from "#src/server/runtime/composition/app";
import { MEMBER_SESSION_COOKIE } from "../../../http/members.js";
import { CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE, CACHE_CONTROL_PUBLIC_PAGE } from "../pages/request-policy.js";
import type { SiteProduct } from "#src/server/inbound/public-http/http/site/render-context";

/**
 * @file B230 — `/products` and `/products/:id` must finish their HTML through the same public-page
 * finalizer as every other page (`sendPublicPage`): plugin head injection, plugin widget partials,
 * form attempt tokens/results and the member sign-in script. Before the fix both handlers only ran
 * `markOffSiteLinksOpenInNewTab`, so a plugin's declared `<head>` markup never reached a storefront page.
 * Also pins the owner-accepted Cache-Control: shared-cacheable for an anonymous visitor, never-store
 * once the request carries a member session (the shared per-visitor policy).
 */

const PLUGIN_HEAD = `<meta name="b230-plugin-head" content="present">`;
const product: SiteProduct = { id: "prod-1", slug: "classic-boxy-tee", title: "Classic Boxy Tee", price: 3500, stock: 5 } as SiteProduct;

async function startServer() {
  const overrides: Partial<CommerceSiteTestDeps> = {
    commerceCatalog: { listProducts: async () => [product], findProduct: async ({ idOrSlug }) => (idOrSlug === product.id ? product : null) },
    // Only the two methods the finalizer calls; the real session type carries more.
    pluginExportRender: { headHtml: () => PLUGIN_HEAD, declaredHosts: () => undefined } as unknown as CommerceSiteTestDeps["pluginExportRender"],
  };
  const server = createServer(createApp({ ...createRouteDeps(), ...overrides } as CommerceSiteTestDeps));
  server.listen(0);
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

for (const path of ["/products", "/products/prod-1"]) {
  test(`GET ${path} finalizes through the public-page finalizer (plugin head) with the public Cache-Control`, async (t) => {
    const { server, baseUrl } = await startServer();
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Classic Boxy Tee/);
    assert.ok(html.includes(PLUGIN_HEAD), `${path} must carry the plugin's declared head markup`);
    assert.equal(res.headers.get("cache-control"), CACHE_CONTROL_PUBLIC_PAGE);
  });

  test(`GET ${path} with a member session is never shared-cached`, async (t) => {
    const { server, baseUrl } = await startServer();
    t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
    const res = await fetch(`${baseUrl}${path}`, { headers: { cookie: `${MEMBER_SESSION_COOKIE}=s1` } });
    assert.equal(res.status, 200);
    assert.ok((await res.text()).includes(PLUGIN_HEAD));
    assert.equal(res.headers.get("cache-control"), CACHE_CONTROL_PRIVATE_MEMBER_RESPONSE);
  });
}
