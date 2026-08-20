import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { PostRecord } from "#src/features/post/index";
import { InMemoryPostRepo, PostNotFoundError } from "#src/features/post/index";
import { InMemoryPresentationSettingsRepo } from "#src/features/presentation/index";
import type { DiscoveredTheme } from "#src/features/theme/index";
import { createApp, createRouteDeps } from "../../../app.js";

/**
 * @file Regression coverage for the "brand-new workspace, no seeded content" 500 on the public
 * site routes (`registerSiteRoutes`, `pages.ts`) — real HTTP requests via `createApp`, with
 * in-memory repos overridden to reproduce a workspace that has a row in `workspaces` but NO
 * `presentation_settings` row yet (a freshly created workspace via SPEC-044's `CREATE_WORKSPACE`
 * admin route, or a `content.db` mid-seed) and no published posts.
 *
 * `getPresentationSettings` (`@jini-ai/cms/presentation`) throws `PresentationSettingsNotFoundError`
 * when `findByWorkspaceId` returns no row — both `pages.ts` route handlers previously let that
 * escape their own `Promise.all` uncaught, so it fell into a blind catch-all (a literal empty
 * `catch {}` on `GET /` and an untyped `catch (err)` fallback on `GET /:slug`) that turned it into
 * a bare 500, indistinguishable from a genuine server fault.
 */

async function startServer(overrides: Partial<ReturnType<typeof createRouteDeps>>) {
  const deps = { ...createRouteDeps(), ...overrides };
  const server = createServer(createApp(deps));
  server.listen(0);
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

function closeServer(server: ReturnType<typeof createServer>) {
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

test("GET /welcome: a missing presentation-settings row — not the empty post list — is what must not 500", async (t) => {
  // Both arms below share the identical "no posts seeded yet" condition (WORKSPACE_ID has zero
  // rows in postRepo either way), so the ONLY variable that differs between them is whether the
  // workspace's `presentation_settings` row exists. If both arms 404 the same way, the fix is
  // proven attributable to the missing-settings case specifically — not to some other shared
  // setup detail (an empty post list alone is already known-safe: `getPublishedPostBySlug`
  // throwing `PostNotFoundError` for an unseeded slug is the pre-existing, correct 404 path this
  // file's outer catch already handles).
  //
  // This also rules out the other candidate causes of a bare 500 the brief calls out: a genuinely
  // missing workspace (impossible here — `deps.workspaceId` is always the hardcoded boot-time id,
  // and both arms use the real, present `seededWorkspace` row via `postRepo`/`presentationRepo`
  // only, never `workspaceRepo`), an auth failure (these are public, unauthenticated routes), and
  // a DB connection error (everything here is an in-memory fake — no real DB is touched at all).

  // Baseline arm: presentation settings ARE seeded; no posts. Known-good today.
  const baseline = await startServer({
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(baseline.server));
  const baselineRes = await fetch(`${baseline.baseUrl}/welcome`);
  assert.equal(
    baselineRes.status,
    404,
    "control: settings present + no posts must already 404 (proves the empty post list alone is not the fault)"
  );

  // Treatment arm: remove ONLY the presentation-settings row — the brand-new/unseeded-workspace
  // condition — keeping the empty post list identical to the baseline.
  const treatment = await startServer({
    presentationRepo: new InMemoryPresentationSettingsRepo([]),
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(treatment.server));
  const treatmentRes = await fetch(`${treatment.baseUrl}/welcome`);
  assert.equal(
    treatmentRes.status,
    404,
    "a brand-new workspace with no presentation-settings row must 404 the same as any other unseeded slug, not 500"
  );
});

test("GET /: a brand-new workspace with no presentation-settings row renders the empty-state home page instead of 500ing", async (t) => {
  const { server, baseUrl } = await startServer({
    presentationRepo: new InMemoryPresentationSettingsRepo([]),
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(baseUrl);
  assert.equal(res.status, 200, "home route must render the default-theme empty state, not 500, when settings aren't seeded yet");
});

test("GET / 500s with 'No themes installed' when resolveActiveTheme finds none", async (t) => {
  const { server, baseUrl } = await startServer({ themes: [] });
  t.after(() => closeServer(server));

  const res = await fetch(baseUrl);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

test("GET /:slug 500s with 'No themes installed' when resolveActiveTheme finds none", async (t) => {
  const { server, baseUrl } = await startServer({ themes: [] });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/anything`);
  assert.equal(res.status, 500);
  assert.match(await res.text(), /No themes installed/);
});

/** `/:slug`'s `String(req.params.slug ?? "")` is unreachable through any real HTTP request —
 *  `:slug` is a required route segment, so Express's own router can never dispatch to this
 *  handler with it `undefined`. Reaching into the router stack and calling the registered
 *  handler directly with a hand-built `req` genuinely executes the fallback (same technique
 *  `products.route.test.ts` uses for its own identical `?? ""` param guard). */
interface ExpressHandlerLayer {
  route?: { path: string; stack: { handle: (req: unknown, res: unknown, next: unknown) => unknown }[] };
}
interface ExpressAppWithRouter {
  _router: { stack: ExpressHandlerLayer[] };
}

function extractSlugHandler(app: ReturnType<typeof createApp>): (req: unknown, res: unknown, next: unknown) => unknown {
  const stack = (app as unknown as ExpressAppWithRouter)._router.stack;
  const layer = stack.find((l) => l.route?.path === "/:slug");
  if (!layer?.route) throw new Error(`route '/:slug' was not found in the router stack`);
  return layer.route.stack[0].handle;
}

test("GET /:slug -- `req.params.slug ?? \"\"` fallback, forced via a direct handler call with slug omitted -- falls through to next(), not a crash", async () => {
  const app = createApp(createRouteDeps());
  const handler = extractSlugHandler(app);
  let nextCalled = false;
  const res = {
    status() {
      return res;
    },
    type() {
      return res;
    },
    send() {
      return res;
    },
  };

  await handler({ params: {} }, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, "an empty-string slug fails the `[a-z0-9-]+` match, so this must fall through via next(), never respond itself");
});

test("GET /:slug -- slug === \"admin\", forced via a direct handler call -- falls through to next(), not a crash", async () => {
  // A real GET /admin never reaches this handler at all in the composed app (an earlier-mounted
  // admin route already claims it) -- this direct-handler-call technique is the only way to
  // exercise `slug === "admin"` specifically, the same reasoning the params-omitted test above
  // already established for this same OR-chain's first arm.
  const app = createApp(createRouteDeps());
  const handler = extractSlugHandler(app);
  let nextCalled = false;
  const res = {
    status() {
      return res;
    },
    type() {
      return res;
    },
    send() {
      return res;
    },
  };

  await handler({ params: { slug: "admin" } }, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true, "the literal slug \"admin\" must fall through via next(), never render as a site page");
});

test("GET /api -- a real request, not a direct handler call -- reaches Express's own default 404 (no handler ever responds), proving next() really was called for slug === \"api\"", async (t) => {
  const { server, baseUrl } = await startServer({});
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/api`);
  assert.equal(res.status, 404);
  const body = await res.text();
  assert.match(body, /Cannot GET \/api/, "Express's own bare 404 (not pages.ts's themed/bare 404) proves no handler, including pages.ts's own catch-all, ever claimed this request");
});

test("GET /index: a static theme's own index page is never treated as a marketing page at the /index URL -- it falls through to the ordinary (and here, missing) post lookup", async (t) => {
  const theme = staticThemeWithThemed404();
  const { server, baseUrl } = await startServer({
    themes: [theme],
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/index`);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.ok(
    html.includes("Themed not found"),
    "must fall through to the ordinary 404 path (themed, since this fixture has one) -- NOT theme.pages.index's own 'home' content, which isMarketingPageSlug's `slug !== \"index\"` check exists specifically to prevent"
  );
});

function staticThemeWithThemed404(): DiscoveredTheme {
  return {
    manifest: {
      id: "static-404-test-theme",
      name: "Static 404 Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
    },
    dir: "/nonexistent/404-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      "404": "<html><body><main>Themed not found</main></body></html>",
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("GET /:slug: a static theme's own pages/404.html renders instead of the bare fallback 404", async (t) => {
  const { server, baseUrl } = await startServer({
    themes: [staticThemeWithThemed404()],
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/does-not-exist-anywhere`);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.ok(html.includes("Themed not found"), "the theme's own 404 page content must render, not the bare <h1>404</h1> fallback");
});

/** A post repo whose `findById` always misses regardless of what `findBySlug`/`list` return —
 *  models the only way `buildExtraHead`'s own `urlFor({ target: { kind: "entryRef", ... } })`
 *  call can fail for a post that was JUST resolved successfully by `getPublishedPostBySlug`:
 *  `resolveEntryRefTarget` (`routing.ts`) re-fetches by id rather than reusing the already-loaded
 *  record, so a repo that disagrees with itself between the two lookups is the only real trigger
 *  for this fallback outside of an actual data race. */
class UnresolvableCanonicalPostRepo extends InMemoryPostRepo {
  async findById(): Promise<PostRecord | null> {
    return null;
  }
}

test("GET /:slug (post route): buildExtraHead's canonical falls back to /<slug> when urlFor can't resolve the post's own entryRef", async (t) => {
  const deps = createRouteDeps();
  const post: PostRecord = {
    id: "post-broken-canonical",
    workspaceId: deps.workspaceId,
    title: "Broken canonical post",
    slug: "broken-canonical",
    bodyJson: { type: "doc", content: [] },
    bodyFormat: "doc",
    bodyHtml: null,
    status: "published",
    kind: "post",
    updatedAt: "2026-08-17T00:00:00.000Z",
    version: 1,
  } as unknown as PostRecord;

  const { server, baseUrl } = await startServer({
    postRepo: new UnresolvableCanonicalPostRepo([post]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/broken-canonical`);
  assert.equal(res.status, 200, "the page must still render even though its own canonical URL couldn't be resolved");
});

/** A post repo whose `list` throws `PostNotFoundError` outright — not a realistic failure for a
 *  real adapter, but the only way to make the route's own `Promise.all([resolveActiveThemeId,
 *  listPublishedPosts, isPublicAssistantEnabled])` reject with exactly that error type BEFORE
 *  `theme = resolveActiveTheme(...)` ever runs, so `handlePostNotFoundOnSlugRoute`'s own `theme &&
 *  theme.manifest.tier === "static" ...` guard receives `theme === null` — every other test in this
 *  file that reaches that guard does so only after a successful theme resolution, so this is the
 *  only way to exercise the guard's own null-theme short-circuit specifically. */
class ThrowsPostNotFoundOnListPostRepo extends InMemoryPostRepo {
  async list(): Promise<PostRecord[]> {
    throw new PostNotFoundError("simulated: listPublishedPosts failed before theme resolution");
  }
}

test("GET /:slug: a PostNotFoundError thrown before theme resolution completes still 404s through the bare fallback (theme is null in the catch block)", async (t) => {
  const { server, baseUrl } = await startServer({
    postRepo: new ThrowsPostNotFoundOnListPostRepo([]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/anything`);
  assert.equal(res.status, 404);
  const html = await res.text();
  assert.ok(html.includes("404 — page not found"), "with theme null, handlePostNotFoundOnSlugRoute must fall straight to the bare fallback, never dereference theme.manifest");
});

/** `resolveMarketingPageOrOverride`'s `if (!staticHtml)` (pages.ts) checks FALSY, not merely
 *  `=== null` — so it is NOT provably dead the way the two `renderStaticPage(...) ?? ""` fallbacks
 *  in `renderViaTemplate` are (those only ever guard against `null`, per that function's own
 *  `?? ""` operator). `theme.pages[slug]` being a literal empty string is a real, if unusual,
 *  authoring state (an empty `.html` file on disk) that `isMarketingPageSlug`'s own
 *  `theme.pages[slug] !== undefined` guarantee does NOT rule out — `"" !== undefined` is true. This
 *  is the one real way to force `renderStaticPage({ theme, pageId: slug, menus })` (called with no
 *  `htmlOverride`, so `source = theme.pages[slug]`) to return a falsy, non-null string. */
function staticThemeWithEmptyPage(): DiscoveredTheme {
  return {
    manifest: {
      id: "static-empty-page-test-theme",
      name: "Static Empty Page Test Theme",
      version: "1.0.0",
      tier: "static",
      engine: 1,
      templates: [],
    },
    dir: "/nonexistent/empty-page-test-theme",
    tokens: {},
    tokensLight: {},
    templates: {},
    liquidTemplates: {},
    handlebarsTemplates: {},
    pages: {
      index: "<html><body><main>home</main></body></html>",
      "empty-page": "",
    },
    partials: {},
    css: "",
    source: "site",
    status: "valid",
    errors: [],
  } as unknown as DiscoveredTheme;
}

test("GET /empty-page: a static theme page whose own file is a literal empty string falls through to the ordinary post lookup (and 404s), rather than rendering as an empty 200", async (t) => {
  const { server, baseUrl } = await startServer({
    themes: [staticThemeWithEmptyPage()],
    postRepo: new InMemoryPostRepo([]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(`${baseUrl}/empty-page`);
  assert.equal(
    res.status,
    404,
    "renderStaticPage's falsy (empty-string) return must be treated as `{ kind: \"fallthrough\" }`, same as a genuinely missing page -- not silently sent as a 200"
  );
});

/** A post repo whose `list` throws a genuine, unexpected `Error` (not `PostNotFoundError`) --
 *  models the `GET /` route's own bare `catch {}` (no binding, no discrimination -- every
 *  exception funnels to the same generic 500), the one branch of that handler no test in this
 *  file has ever forced. Mirrors `products.route.test.ts`'s identical "GET /products 500s with a
 *  generic 'Site error'" test for its own route. */
class ThrowsUnexpectedErrorOnListPostRepo extends InMemoryPostRepo {
  async list(): Promise<PostRecord[]> {
    throw new Error("boom");
  }
}

test("GET / 500s with a generic 'Site error' when an unexpected exception is thrown", async (t) => {
  const { server, baseUrl } = await startServer({
    postRepo: new ThrowsUnexpectedErrorOnListPostRepo([]),
  });
  t.after(() => closeServer(server));

  const res = await fetch(baseUrl);
  assert.equal(res.status, 500);
  assert.equal(await res.text(), "<h1>Site error</h1>", "the exact bare fallback body, not merely a 500 status");
});
