import "../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createApp, createRouteDeps } from "../../runtime/composition/app.js";
import { dispatchHttpRequest } from "../helpers/in-process-http.js";

// Every public discovery surface must choose the serving authority together, even when
// the stored identity belongs to another installation. Exercise the real Express routes.
for (const host of ["deployed.example:8080", "127.0.0.1:4567"]) {
  test(`all SEO artifacts use request origin http://${host}`, async () => {
    const deps = createRouteDeps();
    deps.themes = [];
    deps.originRegistry.canonicalOrigin = async () => ({ scheme: "https", host: "stored.example", source: "workspace-setting", verifiedAt: "2026-10-31T00:00:00Z" });
    const app = createApp(deps, { themeIdOverride: "none" });
    const origin = `http://${host}`;
    for (const [url, expected] of [
      ["/sitemap.xml", `<loc>${origin}/how-themes-work</loc>`],
      ["/robots.txt", `Sitemap: ${origin}/sitemap.xml`],
      ["/", `rel="canonical" href="${origin}/"`],
      ["/feed.xml", `<link>${origin}/`],
      ["/llms.txt", `](${origin}/how-themes-work)`],
    ]) {
      const response = await dispatchHttpRequest({ app, method: "GET", url: url!, headers: { host } });
      assert.equal(response.status, 200, url);
      assert.ok(response.body.includes(expected!), `${url} must use ${origin}`);
      assert.ok(!response.body.includes("stored.example"), `${url} must not use the stored origin`);
    }
  });
}
