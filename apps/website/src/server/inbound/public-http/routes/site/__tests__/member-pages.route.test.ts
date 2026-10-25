import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryMemberSessionRepo } from "#src/features/members/index";
import { MEMBER_SESSION_COOKIE } from "../../members/complete-sign-in.js";
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

const memberToken = "member-page-session";
const memberCookie = `${MEMBER_SESSION_COOKIE}=${memberToken}`;

/** Exercise the real session validator without a write-service or database fixture. */
function authenticatedDeps() {
  const deps = createRouteDeps();
  deps.memberSessionRepo = new InMemoryMemberSessionRepo([{
    id: "session-1", workspaceId: deps.workspaceId, memberId: "member-1",
    tokenHash: createHash("sha256").update(memberToken).digest("hex"),
    createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z",
  }]);
  return deps;
}

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
    const { server, baseUrl } = await startServer({ ...authenticatedDeps(), themes: [theme], postRepo: new InMemoryPostRepo([]) });
    t.after(() => closeServer(server));
    for (const [route, entry] of Object.entries(MEMBER_PAGES)) {
      const res = await fetch(`${baseUrl}${route}`, {
        headers: route === "/account" ? { cookie: memberCookie } : {}, redirect: "manual",
      });
      assert.equal(res.status, 200, route);
      const html = await res.text();
      assert.ok(html.includes(entry.body), `${route}: the page body reaches the theme's content slot`);
      assert.equal(html.match(/<script data-tovu-member-auth>/g)?.length, 1, `${route}: the member script is injected once`);
      assert.match(html, /<\/footer>[\s\S]*<script data-tovu-member-auth>/, `${route}: wrapped in the theme's own chrome`);
    }
  });
}

test("signed-out GET /account redirects to sign-in with a fixed local return path, before rendering", async (t) => {
  const { server, baseUrl } = await startServer({ themes: [] });
  t.after(() => closeServer(server));
  for (const requestPath of ["/account", "/account/", "/account?redirect=https%3A%2F%2Fevil.example", "/account?next=%2F%2Fevil.example"]) {
    const res = await fetch(`${baseUrl}${requestPath}`, { redirect: "manual" });
    assert.equal(res.status, 303, requestPath);
    assert.equal(res.headers.get("location"), "/signin#redirect=%2Faccount");
    assert.match(res.headers.get("cache-control")!, /private.*no-store/);
    const signin = new URL(res.headers.get("location")!, baseUrl);
    assert.equal(signin.origin, baseUrl);
    assert.equal(new URLSearchParams(signin.hash.slice(1)).get("redirect"), "/account");
  }
});

test("unknown, expired and revoked member sessions cannot render /account", async (t) => {
  const deps = authenticatedDeps();
  const session = (await deps.memberSessionRepo.listByMember({ workspaceId: deps.workspaceId, memberId: "member-1" }))[0]!;
  const { server, baseUrl } = await startServer({ ...deps, themes: [starter] });
  t.after(() => closeServer(server));
  for (const cookie of [`${MEMBER_SESSION_COOKIE}=forged`, "tovu_session=admin-only"]) {
    const res = await fetch(`${baseUrl}/account`, { headers: { cookie }, redirect: "manual" });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/signin#redirect=%2Faccount");
  }
  for (const invalid of [{ ...session, expiresAt: "2000-01-01T00:00:00.000Z" },
    { ...session, revokedAt: "2026-01-02T00:00:00.000Z" }]) {
    await deps.memberSessionRepo.save(invalid);
    const res = await fetch(`${baseUrl}/account`, { headers: { cookie: memberCookie }, redirect: "manual" });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/signin#redirect=%2Faccount");
  }
});

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
