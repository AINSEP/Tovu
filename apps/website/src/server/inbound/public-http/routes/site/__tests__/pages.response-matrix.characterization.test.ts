/**
 * @file Characterization pins for `routes/site/pages.ts` (size design 04, step 0a). They hold the
 * public page router's observable behaviour still while the file is split into `pages/`:
 *
 * - the route table (five `GET` routes, in registration order);
 * - a response matrix over real HTTP: status, `Cache-Control`, `Vary`, `Location`, `Content-Type`,
 *   `Set-Cookie` names, the report-only policy header and a body hash, one row per request;
 * - the listing state shared by the two rewrite routes and the page handlers (`/page/<n>`,
 *   `/_more/<key>/<after>`), including the path redirect rules are matched against;
 * - the static-tier finisher's effect order (`finishStaticTierDocument`).
 *
 * The expected values live in `__fixtures__/pages.response-matrix.golden.json`. Regenerate with
 * `UPDATE_PAGES_MATRIX_GOLDEN=1` only for an intended behaviour change, and review the diff.
 * Form attempt ids are random per response: they are replaced before hashing and asserted separately.
 * The test server's own origin (random port) is replaced the same way.
 */
import "../../../../../../platform/site-dir/__tests__/helpers/isolated-catalog-home.js";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import test, { type TestContext } from "node:test";

import { REPORT_ONLY_HEADER } from "#src/contracts/core/public-page-security-headers";
import { InMemoryMemberSessionRepo, type MemberSessionRecord } from "#src/features/members/index";
import { InMemoryPostRepo, type PostRecord } from "#src/features/post/index";
import { ROOT_SLUG } from "#src/features/post/post";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { registerResolvePhase } from "#src/platform/routing/adapter";
import { startTestServer } from "#src/server/__tests__/helpers/http-test-server";
import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { finishStaticTierDocument, registerSiteRoutes } from "../pages.js";

type Deps = ReturnType<typeof createRouteDeps>;

const GOLDEN_URL = new URL("./__fixtures__/pages.response-matrix.golden.json", import.meta.url);
const UPDATE = process.env.UPDATE_PAGES_MATRIX_GOLDEN === "1";
const WORKSPACE_ID = createRouteDeps().workspaceId;
const RAW_MEMBER_TOKEN = "pages-matrix-raw-member-session-token";
const PLUGIN_HOSTS = { script: ["https://script.matrix.example"], frame: ["https://frame.matrix.example"], connect: ["https://connect.matrix.example"] };

const PAGED = `<div class="grid" data-embed-config='{"type":"post-previews","limit":24,"paged":true}'>No posts yet.</div>`;
const SEE_MORE = `<div class="grid" data-jini-see-more data-embed-config='{"type":"post-previews","limit":12}'>fallback card</div>`;
const FORM = `<form data-form-slug="contact" method="post" action="/api/site/forms/contact"><input name="email"></form>`;

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

function page(body: string): string {
  return `<html><head><title>Matrix</title></head><body>${body}</body></html>`;
}

function theme(): DiscoveredTheme {
  return {
    manifest: { id: "matrix-theme", name: "Matrix Theme", version: "1.0.0", tier: "static", engine: 1, templates: ["listing.html"], publishedPages: ["blog", "about", "pricing", "more", "contact"] },
    dir: "/nonexistent/matrix-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: page(`<div data-embed-config='{"type":"partial","id":"nav"}'></div><main>home</main>${PAGED}<a href="https://off-site.example/x">off-site</a>`),
      blog: page(PAGED),
      more: page(SEE_MORE),
      about: page("<main>about</main>"),
      pricing: page("<main>theme pricing</main>"),
      contact: page(`<main>contact</main>${FORM}${FORM.replace("contact", "second")}`),
      listing: page(`<main><div data-embed-config='{"type":"content"}'></div></main>${PAGED}`),
    },
    partials: { nav: `<nav data-embed-config='{"type":"menu","id":"matrix-nav"}'>nav fallback</nav>` },
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  };
}

function post(overrides: Partial<PostRecord>): PostRecord {
  return {
    workspaceId: WORKSPACE_ID,
    id: "p-x",
    slug: "post-x",
    title: "Post X",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishAt: "2025-06-01T00:00:00.000Z",
    version: 1,
    ...overrides,
  } as PostRecord;
}

/** 30 published posts, newest first, plus a members-only post, an html Page and a Page overriding a theme page. */
function rows(): PostRecord[] {
  const listed = Array.from({ length: 30 }, (_, i) => post({ id: `p-${i}`, slug: `post-${i}`, title: `Post ${i}`, publishAt: new Date(Date.UTC(2026, 0, 1) - i * 86_400_000).toISOString() }));
  return [
    ...listed,
    post({ id: "p-gated", slug: "members-only", title: "Members Only", memberAccessJson: JSON.stringify({ visibility: "members" }) } as Partial<PostRecord>),
    post({ id: "p-html", slug: "html-page", title: "Html Page", kind: "page", bodyFormat: "html", bodyHtml: `<p>html body</p>${FORM}` }),
    post({ id: "p-pricing", slug: "pricing", title: "Pricing Override", kind: "page", bodyFormat: "html", bodyHtml: "<p>authored pricing</p>" }),
  ];
}

function memberSession(): MemberSessionRecord {
  return { id: "matrix-session", workspaceId: WORKSPACE_ID, memberId: "matrix-member", tokenHash: createHash("sha256").update(RAW_MEMBER_TOKEN).digest("hex"), createdAt: "2026-01-01T00:00:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z" };
}

function siteDeps(overrides: Partial<Deps> = {}, extraRows: PostRecord[] = []): Deps {
  return {
    ...createRouteDeps(),
    themes: [theme()],
    postRepo: new InMemoryPostRepo({}, { initialRows: [...rows(), ...extraRows] }),
    memberSessionRepo: new InMemoryMemberSessionRepo({}, { initialRows: [memberSession()] }),
    ...overrides,
  };
}

/** Redirect rules for the matrix; returns the paths the `pre_content` phase was asked about. */
function redirects(t: TestContext): string[] {
  const seen: string[] = [];
  t.after(registerResolvePhase({ phase: "pre_content", resolver: async (path) => {
    seen.push(path);
    if (path === "/old") return { kind: "redirect", location: "/about", statusCode: 301 };
    if (path === "/docs/old") return { kind: "redirect", location: "/blog", statusCode: 302 };
    return null;
  } }));
  return seen;
}

const ATTEMPT_INPUT = /(<input type="hidden" name="[^"]*" value=")([0-9a-f]{8}-[0-9a-f-]{27})(")/g;

interface Row {
  status: number;
  cacheControl: string | null;
  vary: string | null;
  location: string | null;
  contentType: string | null;
  setCookieNames: string[];
  reportOnlySha1: string | null;
  attemptIds: number;
  bodyBytes: number;
  bodySha1: string;
}

async function capture(baseUrl: string, path: string, headers: Record<string, string> = {}): Promise<{ row: Row; body: string; attemptIds: string[]; reportOnly: string | null }> {
  const res = await fetch(`${baseUrl}${path}`, { redirect: "manual", headers });
  const body = await res.text();
  const attemptIds = Array.from(body.matchAll(ATTEMPT_INPUT), (match) => match[2] ?? "");
  // The test server's port is random and reaches the body through absolute URLs (canonical, feed).
  const stable = body.replace(ATTEMPT_INPUT, "$1<attempt>$3").replaceAll(baseUrl, "http://site.test");
  const reportOnly = res.headers.get(REPORT_ONLY_HEADER);
  const row: Row = {
    status: res.status,
    cacheControl: res.headers.get("cache-control"),
    vary: res.headers.get("vary"),
    location: res.headers.get("location"),
    contentType: res.headers.get("content-type"),
    setCookieNames: res.headers.getSetCookie().map((cookie) => cookie.split("=")[0] ?? "").sort(),
    reportOnlySha1: reportOnly === null ? null : sha1(reportOnly),
    attemptIds: attemptIds.length,
    bodyBytes: Buffer.byteLength(stable),
    bodySha1: sha1(stable),
  };
  return { row, body, attemptIds, reportOnly };
}

const golden: Record<string, unknown> = UPDATE ? {} : JSON.parse(readFileSync(GOLDEN_URL, "utf8")) as Record<string, unknown>;
const produced: Record<string, unknown> = {};

function pin(name: string, actual: unknown): void {
  produced[name] = actual;
  if (UPDATE) return;
  assert.deepEqual(actual, golden[name], `pin "${name}" changed`);
}

test.after(() => {
  if (UPDATE) writeFileSync(GOLDEN_URL, `${JSON.stringify(produced, null, 2)}\n`);
});

const COOKIE_MEMBER = { cookie: `tovu_member_session=${RAW_MEMBER_TOKEN}` };
const COOKIE_FLASH = { cookie: `tovu_form_flash=${encodeURIComponent(JSON.stringify({ slug: "contact", values: { email: "visitor@matrix.example" } }))}` };
const STATIC_EXPORT = { "x-tovu-static-export": "1" };

const STATIC_SITE_REQUESTS: ReadonlyArray<readonly [string, string, Record<string, string>?]> = [
  ["home: static theme index", "/"],
  ["home: static export", "/", STATIC_EXPORT],
  ["home: member cookie", "/", COOKIE_MEMBER],
  ["home: flash cookie", "/", COOKIE_FLASH],
  ["slug: post", "/post-0"],
  ["slug: html page", "/html-page"],
  ["slug: marketing page", "/about"],
  ["slug: marketing page, static export", "/about", STATIC_EXPORT],
  ["slug: marketing page with forms", "/contact"],
  ["slug: marketing page with forms, static export", "/contact", STATIC_EXPORT],
  ["slug: marketing page with forms, flash + result", "/contact?form=contact&form_status=validation", COOKIE_FLASH],
  ["slug: marketing override", "/pricing"],
  ["slug: missing", "/no-such-page"],
  ["slug: redirect hit", "/old"],
  ["slug: member-gated, anonymous", "/members-only"],
  ["slug: member-gated, member", "/members-only", COOKIE_MEMBER],
  ["nested: redirect hit", "/docs/old"],
  ["nested: no rule", "/docs/none"],
  ["nested: rejected target", "/docs/..%2f..%2fold"],
  ["paged: /blog", "/blog"],
  ["paged: /blog/page/2", "/blog/page/2"],
  ["paged: /blog/page/999", "/blog/page/999"],
  ["paged: /page/2 (home)", "/page/2"],
  ["paged: /about/page/2 (no listing)", "/about/page/2"],
  ["more: /more", "/more"],
  ["more: html batch", "/more/_more/1/12"],
  ["more: json batch", "/more/_more/1/12.json"],
  ["more: unknown key", "/more/_more/7/12"],
  ["more: page without listing", "/about/_more/1/12"],
];

test("response matrix: static theme site", async (t) => {
  const seen = redirects(t);
  const baseUrl = await startTestServer(createApp(siteDeps()), t);
  for (const [name, path, headers] of STATIC_SITE_REQUESTS) {
    seen.length = 0;
    const { row } = await capture(baseUrl, path, headers);
    pin(name, { ...row, redirectLookups: [...seen] });
  }
});

test("response matrix: content home, default theme, no themes installed", async (t) => {
  const home = post({ id: "p-home", slug: ROOT_SLUG, title: "Content Home", kind: "page", bodyFormat: "html", bodyHtml: "<p>content home</p>" });
  const contentHome = await startTestServer(createApp(siteDeps({}, [home])), t);
  pin("home: content home", (await capture(contentHome, "/")).row);

  const defaults = await startTestServer(createApp({ ...createRouteDeps(), postRepo: new InMemoryPostRepo({}, { initialRows: rows() }) }), t);
  pin("default theme: home", (await capture(defaults, "/")).row);
  pin("default theme: post", (await capture(defaults, "/post-0")).row);
  pin("default theme: missing", (await capture(defaults, "/no-such-page")).row);

  const noThemes = await startTestServer(createApp(siteDeps({ themes: [] })), t);
  pin("no themes: home", (await capture(noThemes, "/")).row);
  pin("no themes: slug", (await capture(noThemes, "/post-0")).row);
});

test("listing responses: the JSON batch has its content type and page shape", async (t) => {
  const baseUrl = await startTestServer(createApp(siteDeps()), t);
  const res = await fetch(`${baseUrl}/more/_more/1/12.json`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  const body = await res.json() as { items: Array<Record<string, unknown>>; nextCursor: number | null };
  assert.equal(body.items.length, 12);
  assert.equal(body.nextCursor, 24);
  assert.deepEqual(Object.keys(body.items[0] ?? {}).sort(), ["cover", "date", "dateLabel", "href", "terms", "title"]);
  assert.equal(body.items[0]?.href, "/post-12");
  pin("more: json batch body", body);

  const html = await fetch(`${baseUrl}/more/_more/1/12`);
  assert.match(html.headers.get("content-type") ?? "", /^text\/html/);
});

test("rewrites run before the page handlers: /page/<n> renders page n and redirect rules see the requested path", async (t) => {
  const seen = redirects(t);
  const baseUrl = await startTestServer(createApp(siteDeps()), t);

  const home = await capture(baseUrl, "/page/2");
  assert.equal(home.row.status, 200);
  assert.match(home.body, /rel="prev" href="\/"/);
  assert.match(home.body, /href="\/post-24"/);
  assert.deepEqual(seen, ["/page/2"]);

  seen.length = 0;
  const blog = await capture(baseUrl, "/blog/page/2");
  assert.equal(blog.row.status, 200);
  assert.match(blog.body, /rel="prev" href="\/blog"/);
  assert.deepEqual(seen, ["/blog/page/2"]);

  seen.length = 0;
  const batch = await capture(baseUrl, "/more/_more/1/12");
  assert.equal(batch.row.status, 200);
  assert.match(batch.body, /href="\/post-12"/);
  assert.match(batch.body, /data-jini-listing-batch="1"/);
  assert.doesNotMatch(batch.body, /href="\/post-0"/);
});

test("form attempt ids: one per form, different per request, none under the static-export marker", async (t) => {
  const baseUrl = await startTestServer(createApp(siteDeps()), t);
  const first = await capture(baseUrl, "/contact");
  const second = await capture(baseUrl, "/contact");
  assert.equal(first.attemptIds.length, 2);
  assert.equal(new Set([...first.attemptIds, ...second.attemptIds]).size, 4);
  assert.equal(first.row.bodySha1, second.row.bodySha1);
  assert.equal((await capture(baseUrl, "/contact", STATIC_EXPORT)).attemptIds.length, 0);
});

test("security header: plugin-export hosts are added to the page's report-only policy", async (t) => {
  const base = createRouteDeps();
  const exports = base.pluginExports;
  assert.ok(exports);
  const pluginExports: Deps["pluginExports"] = {
    ...exports,
    forRender: (required, options) => {
      const session = exports.forRender(required, options);
      return { ...session, headHtml: () => `<meta name="matrix-plugin-export" content="1">`, declaredHosts: () => PLUGIN_HOSTS };
    },
  };
  const plain = await startTestServer(createApp(siteDeps()), t);
  const withHosts = await startTestServer(createApp(siteDeps({ pluginExports })), t);

  const before = await capture(plain, "/about");
  const after = await capture(withHosts, "/about");
  assert.ok(before.reportOnly, "the public page sends a report-only policy");
  assert.ok(after.reportOnly);
  for (const host of [...PLUGIN_HOSTS.script, ...PLUGIN_HOSTS.frame, ...PLUGIN_HOSTS.connect]) {
    assert.ok(!before.reportOnly.includes(host), `${host} is not in the policy without plugin exports`);
    assert.ok(after.reportOnly.includes(host), `${host} is in the policy with plugin exports`);
  }
  assert.match(after.body, /<meta name="matrix-plugin-export" content="1">/);
  pin("plugin-export hosts: policy", after.reportOnly);
  pin("plugin-export hosts: row", after.row);
});

test("route table: five GET routes in registration order", () => {
  const routes: string[] = [];
  const app = { get: (path: string | RegExp, ...handlers: unknown[]) => { routes.push(`${typeof path === "string" ? path : path.toString()} (${handlers.length})`); } };
  registerSiteRoutes({ app: app as never, deps: createRouteDeps() }, {});
  pin("route table", routes);
  assert.equal(routes.length, 5);
});

/** Wraps every repository in `deps` so each call is logged as `<dep>.<method>`. */
function recordCalls(deps: Deps, log: string[]): Deps {
  const wrapped: Record<string, unknown> = { ...deps };
  for (const [name, value] of Object.entries(deps)) {
    if (!name.endsWith("Repo") || typeof value !== "object" || value === null) continue;
    wrapped[name] = new Proxy(value, {
      get(target, key) {
        const member = Reflect.get(target, key, target) as unknown;
        if (typeof member !== "function" || typeof key !== "string") return member;
        return (...args: unknown[]) => { log.push(`${name}.${key}`); return (member as (...a: unknown[]) => unknown).apply(target, args); };
      },
    });
  }
  return wrapped as unknown as Deps;
}

test("static-tier finisher: partials, embeds, menus, previews, collections, render, assets — assets once, last", async () => {
  const log: string[] = [];
  const deps = recordCalls(siteDeps(), log);
  const documentAssets: Deps["documentAssets"] = async () => { log.push("documentAssets"); return { head: `<meta name="matrix-assets" content="1">`, body: "" } as never; };
  const html = page([
    `<div data-embed-config='{"type":"partial","id":"nav"}'></div>`,
    `<div data-embed-config='{"type":"content","slug":"html-page"}'></div>`,
    `<nav data-embed-config='{"type":"menu","id":"body-menu"}'>body menu fallback</nav>`,
    `<div class="grid" data-embed-config='{"type":"post-previews","limit":2}'>previews fallback</div>`,
    `<div data-embed-config='{"type":"collection","typeKey":"faq","fields":["answer"]}'>collection fallback</div>`,
  ].join(""));

  const out = await finishStaticTierDocument({ ...deps, documentAssets }, { theme: theme(), pageId: "about", html, currentPath: "/about", staticMenus: {}, postPreviewsAccess: undefined });
  const access = await import("#src/features/members/access-resolver");
  const resolver = access.createMemberAccessResolver({ deps });
  log.length = 0;
  const gated = await finishStaticTierDocument({ ...deps, documentAssets }, { theme: theme(), pageId: "about", html, currentPath: "/about", staticMenus: {}, postPreviewsAccess: { resolver, context: { kind: "anonymous" } as never } });

  assert.equal(log.filter((entry) => entry === "documentAssets").length, 1);
  assert.equal(log.at(-1), "documentAssets");
  const firstOf = (prefix: string): number => log.findIndex((entry) => entry.startsWith(prefix));
  const order = [firstOf("postRepo.findBySlug"), firstOf("menuRepo."), firstOf("postRepo.list"), firstOf("contentTypeRepo."), log.indexOf("documentAssets")];
  assert.ok(order.every((index) => index >= 0), `every stage reached its repository: ${JSON.stringify(log)}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b), `embeds, menus, previews, collections, assets in order: ${JSON.stringify(log)}`);
  assert.match(gated, /nav fallback/);
  assert.match(gated, /<meta name="matrix-assets" content="1">/);
  pin("static finisher: calls", log);
  pin("static finisher: output without previews access", sha1(out));
  pin("static finisher: output", sha1(gated.replace(ATTEMPT_INPUT, "$1<attempt>$3")));
});
