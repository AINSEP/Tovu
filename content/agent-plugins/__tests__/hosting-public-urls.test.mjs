import assert from "node:assert/strict";
import test from "node:test";
import netlify from "../netlify/targets/netlify.mjs";
import github from "../github-pages/targets/github-pages.mjs";
import s3 from "../s3-compatible/targets/s3-compatible.mjs";
import pages from "../cloudflare/targets/cloudflare-pages.mjs";
import workers from "../cloudflare/targets/cloudflare-workers.mjs";
import { fixture, credential, json } from "../cloudflare/lib/__tests__/fixture.mjs";
import { createDeployHostKit } from "../../../apps/website/src/features/deployments/deploy-targets/host-kit.ts";

test("Netlify resolves its existing site through the same site owner used by publishing", async () => {
  const calls = [];
  const kit = { ...createDeployHostKit(), fetch: async (url, init) => { calls.push({ url, init }); return Response.json([{ id: "n1", name: "jini-zoran", ssl_url: "https://actual.netlify.app" }]); } };
  const target = netlify.create({ credential: { token: "synthetic" }, config: {}, kit });
  assert.equal(await target.resolvePublicUrl({ projectName: "zoran" }), "https://actual.netlify.app");
  assert.equal(calls.length, 1);
  assert.equal(new URL(calls[0].url).searchParams.get("name"), "jini-zoran");
});

test("GitHub Pages uses the remote site's custom URL and the platform default for a new Pages site", async () => {
  for (const [status, body, expected] of [[200, { html_url: "https://custom.example/" }, "https://custom.example/"], [404, {}, "https://owner.github.io/repo"]]) {
    const kit = { ...createDeployHostKit(), fetch: async () => Response.json(body, { status }) };
    const target = github.create({ credential: { token: "synthetic" }, config: { owner: "owner", repo: "repo" }, kit });
    assert.equal(await target.resolvePublicUrl({ projectName: "zoran" }), expected);
  }
});

test("S3-compatible resolves the configured public URL without remote effects", async () => {
  const kit = { ...createDeployHostKit(), fetch: async () => assert.fail("resolving S3's configured URL needs no request") };
  const target = s3.create({ credential: { accessKeyId: "key", token: "secret", bucket: "bucket", region: "region", publicUrl: "https://storage.example/site" }, config: {}, kit });
  assert.equal(await target.resolvePublicUrl({ projectName: "zoran" }), "https://storage.example/site");
});

test("Cloudflare hosting variants resolve their own Pages and account-scoped Workers addresses without writes", async () => {
  const f = fixture({ respond: ({ url, init }) => {
    assert.equal(init.method ?? "GET", "GET");
    assert.ok(url.pathname.endsWith("/workers/subdomain"));
    return json({ subdomain: "actual-account" });
  } });
  const context = { credential, config: { resourceName: "remote-name" }, kit: f.kit };
  assert.equal(await pages.create(context).resolvePublicUrl({ projectName: "zoran" }), "https://remote-name.pages.dev");
  assert.equal(await workers.create(context).resolvePublicUrl({ projectName: "zoran" }), "https://remote-name.actual-account.workers.dev");
  assert.equal(f.calls.length, 1);
});
