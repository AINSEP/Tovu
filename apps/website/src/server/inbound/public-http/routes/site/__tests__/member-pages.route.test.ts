import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo } from "#src/features/post/index";
import { loadTheme } from "#src/features/theme/index";
import { createSeoPostPort } from "#src/features/seo/index";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import type { RouteDeps } from "#src/server/routes/types";
import { MEMBER_PAGES, memberPagePost, registerMemberPageRoutes } from "../member-pages.js";

/**
 * @file Core's member sign-in pages (`member-pages.ts`) served through `serveVirtualPage`
 * (`pages.ts`): real HTTP via `createApp` with the shipped tovu-starter / basic-2 themes, the
 * header "Sign in" hook (`data-member-nav`, tovu-starter's nav partial) and the member script
 * `finalizePublicPageHtml` injects on live pages but not on static exports.
 */

const starter = loadTheme({ themeDir: path.resolve("content/themes/static/tovu-starter"), id: "tovu-starter", source: "built-in" });
const basic2 = loadTheme({ themeDir: path.resolve("content/themes/static/basic-2"), id: "basic-2", source: "built-in" });

async function startServer(overrides: Partial<ReturnType<typeof createRouteDeps>>) {
  const deps = { ...createRouteDeps(), ...overrides };
  deps.seoDeps = { ...deps.seoDeps, postRepo: createSeoPostPort({ postRepo: deps.postRepo }, {}) };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  return { server, baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

test("memberPagePost: a published html Page per member path, titled like its own heading", () => {
  for (const [route, entry] of Object.entries(MEMBER_PAGES)) {
    const post = memberPagePost({ path: route, workspaceId: "ws-1" })!;
    assert.equal(post.workspaceId, "ws-1");
    assert.equal(post.slug, route.slice(1));
    assert.equal(post.status, "published");
    assert.equal(post.kind, "page");
    assert.equal(post.bodyFormat, "html");
    assert.equal(post.bodyHtml, entry.body);
    assert.ok(entry.body.includes(`<h1>${entry.title}</h1>`), `${route}: the heading and the page title come from one source`);
    assert.doesNotMatch(entry.body, /<section data-member-view="[^"]+">/, `${route}: every view starts hidden until the script picks one`);
  }
  assert.equal(new Set(Object.values(MEMBER_PAGES).map((p) => p.id)).size, Object.keys(MEMBER_PAGES).length, "ids are distinct");
  assert.equal(memberPagePost({ path: "/nope", workspaceId: "ws-1" }), undefined);
});

test("login provider slots ship empty and hidden: core names no provider, the script fills them", () => {
  const signin = MEMBER_PAGES["/signin"]!.body, account = MEMBER_PAGES["/account"]!.body;
  assert.match(signin, /<div class="member-providers" data-member-providers hidden><div class="member-provider-list" data-member-provider-list><\/div>/);
  assert.match(signin, /<p class="member-note member-oidc-error" data-member-oidc-error role="alert" tabindex="-1" hidden><\/p>/);
  assert.match(signin, /<section data-member-view="oidc-code" hidden>[\s\S]*autocomplete="one-time-code"/);
  assert.match(account, /<div class="member-identities" data-member-identities hidden>[\s\S]*<ul class="member-identity-list" data-member-identity-list><\/ul>/);
  assert.match(account, /signs you out on your other devices/, "the connect tip says other devices are signed out");
  for (const body of [signin, account]) assert.doesNotMatch(body, /google/i);
});

for (const theme of [starter, basic2]) {
  test(`GET each member page renders in the ${theme.manifest.id} theme with the member script`, async (t) => {
    assert.equal(theme.status, "valid", JSON.stringify(theme.errors));
    const { server, baseUrl } = await startServer({ themes: [theme], postRepo: new InMemoryPostRepo([]) });
    t.after(() => closeServer(server));
    for (const [route, entry] of Object.entries(MEMBER_PAGES)) {
      const res = await fetch(`${baseUrl}${route}`);
      assert.equal(res.status, 200, route);
      const html = await res.text();
      assert.ok(html.includes(entry.body), `${route}: the page body reaches the theme's content slot`);
      assert.equal(html.match(/<script data-tovu-member-auth>/g)?.length, 1, `${route}: the member script is injected once`);
      assert.match(html, /<\/footer>[\s\S]*<script data-tovu-member-auth>/, `${route}: wrapped in the theme's own chrome`);
    }
  });
}

test("the tovu-starter header carries the member Sign in hook on every public page", async (t) => {
  const { server, baseUrl } = await startServer({ themes: [starter], postRepo: new InMemoryPostRepo([]) });
  t.after(() => closeServer(server));
  const html = await (await fetch(baseUrl)).text();
  assert.match(html, /<a href="\/signin" class="[^"]*\bnav-signin\b[^"]*" data-member-nav\b/);
  assert.equal(html.match(/<script data-tovu-member-auth>/g)?.length, 1, "the home page wires the header link too");
});

test("/signin wins over an authored Page with the same slug", async (t) => {
  const base = createRouteDeps();
  const authored = { id: "authored-signin", workspaceId: base.workspaceId, title: "Old mock", slug: "signin", bodyJson: {},
    bodyFormat: "html", bodyHtml: "<p>AUTHORED_SIGNIN_MOCK</p>", status: "published", kind: "page",
    updatedAt: "2026-10-24T00:00:00.000Z", version: 1 } as unknown as PostRecord;
  const { server, baseUrl } = await startServer({ themes: [starter], postRepo: new InMemoryPostRepo([authored]) });
  t.after(() => closeServer(server));
  const html = await (await fetch(`${baseUrl}/signin`)).text();
  assert.ok(html.includes('data-member-page="signin"'));
  assert.ok(!html.includes("AUTHORED_SIGNIN_MOCK"));
});

test("a static export keeps the theme's plain Sign in link: no member script", async (t) => {
  const { server, baseUrl } = await startServer({ themes: [starter], postRepo: new InMemoryPostRepo([]) });
  t.after(() => closeServer(server));
  const html = await (await fetch(baseUrl, { headers: { "x-tovu-static-export": "1" } })).text();
  assert.ok(html.includes("data-member-nav"), "the link itself is the theme's and stays");
  assert.ok(!html.includes("data-tovu-member-auth"));
});

test("GET /signin with no themes installed answers like any other page", async (t) => {
  const { server, baseUrl } = await startServer({ themes: [] });
  t.after(() => closeServer(server));
  const res = await fetch(`${baseUrl}/signin`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

/** The handler's 404 and render-failure arms are unreachable over HTTP with a working app, so call
 *  the registered handler directly (same technique as `pages.route.test.ts`'s `?? ""` guard). */
function captureHandler(deps: Partial<RouteDeps>) {
  let handler: ((req: unknown, res: unknown) => Promise<void>) | undefined;
  registerMemberPageRoutes({ get: ((_paths: string[], fn: typeof handler) => { handler = fn; }) as never }, deps as RouteDeps);
  const sent: { status?: number; body?: string; ended?: boolean } = {};
  const res = {
    status(code: number) { sent.status = code; return res; },
    type() { return res; },
    send(body: string) { sent.body = body; return res; },
    end() { sent.ended = true; return res; },
  };
  return { run: (reqPath: string) => handler!({ path: reqPath }, res), sent };
}

test("registerMemberPageRoutes: an unknown path 404s and a render failure answers 500 instead of hanging", async (t) => {
  const unknown = captureHandler({ workspaceId: "ws-1" });
  await unknown.run("/not-a-member-page");
  assert.deepEqual(unknown.sent, { status: 404, ended: true });

  const errors: unknown[] = [];
  t.mock.method(console, "error", (...args: unknown[]) => { errors.push(args); });
  const broken = captureHandler({ workspaceId: "ws-1" });
  await broken.run("/signin/");
  assert.equal(broken.sent.status, 500, "a trailing slash still resolves the page, then the broken deps fail the render");
  assert.equal(broken.sent.body, "<h1>Site error</h1>");
  assert.equal(errors.length, 1);
});
