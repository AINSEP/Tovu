import assert from "node:assert/strict";
import test from "node:test";

import express, { type Express } from "express";

import {
  DEFAULT_MAX_BODY_BYTES,
  fetchPublishedPage,
  MAX_MAX_BODY_BYTES,
  MAX_PATH_LENGTH,
  PublishedPagePathError,
  readBoundedBody,
  resolveSameOriginPath,
  toCookieShapes,
} from "../published-page.js";

/**
 * @file `fetch_published_page`'s same-origin restriction and response projection.
 *
 * The path validator is tested directly (it is the whole SSRF story and deserves per-rule
 * assertions), and the fetch is tested against a REAL Express app booted through the same
 * `createSiteApp` seam the production path uses — so "the origin is one this process minted" is
 * exercised rather than asserted.
 */

const BASE = "http://127.0.0.1:53142";

/** A stand-in for the site app: enough real routes to observe status, headers, cookies and bodies. */
function makeFakeSiteApp(): Express {
  const app = express();
  app.get("/", (_req, res) => {
    res.setHeader("content-security-policy", "default-src 'self'");
    res.setHeader("set-cookie", ["sid=SUPER_SECRET_SESSION_VALUE; Path=/; HttpOnly; SameSite=Lax", "ab=1; Path=/"]);
    res.status(200).type("html").send("<!doctype html><html><body>home</body></html>");
  });
  app.get("/big", (_req, res) => {
    res.status(200).type("text/plain").send("z".repeat(50_000));
  });
  app.get("/echo", (req, res) => {
    res.status(200).type("text/plain").send(`query=${String(req.query.q ?? "")}`);
  });
  app.get("/old", (_req, res) => {
    res.redirect(301, "/new");
  });
  app.get("/api/admin/v1/secret", (_req, res) => {
    res.status(200).json({ leaked: "ADMIN_API_CANARY" });
  });
  app.use((_req, res) => {
    res.status(404).type("html").send("<h1>not found</h1>");
  });
  return app;
}

const DEPS = { createSiteApp: () => makeFakeSiteApp() };

// ---------------------------------------------------------------------------
// resolveSameOriginPath — one assertion per rule, because each rule closes a different hole.
// ---------------------------------------------------------------------------

test("resolveSameOriginPath: accepts ordinary root-relative site paths", () => {
  assert.equal(resolveSameOriginPath("/", BASE), "/");
  assert.equal(resolveSameOriginPath("/about", BASE), "/about");
  assert.equal(resolveSameOriginPath("/blog/hello?page=2", BASE), "/blog/hello?page=2");
  assert.equal(resolveSameOriginPath("/robots.txt", BASE), "/robots.txt");
});

test("resolveSameOriginPath: refuses an absolute URL, whatever the scheme", () => {
  for (const candidate of [
    "http://evil.example/x",
    "https://evil.example/x",
    "HTTP://evil.example/x",
    "file:///etc/passwd",
    "gopher://127.0.0.1:11211/",
    "http://169.254.169.254/latest/meta-data/",
  ]) {
    assert.throws(() => resolveSameOriginPath(candidate, BASE), PublishedPagePathError, `should refuse '${candidate}'`);
  }
});

test("resolveSameOriginPath: refuses a protocol-relative path — the classic same-origin bypass", () => {
  assert.throws(() => resolveSameOriginPath("//evil.example/x", BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath("//169.254.169.254/", BASE), PublishedPagePathError);
});

test("resolveSameOriginPath: refuses a backslash, which URL parsers treat as a slash", () => {
  assert.throws(() => resolveSameOriginPath("/\\evil.example/x", BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath("\\\\evil.example/x", BASE), PublishedPagePathError);
});

test("resolveSameOriginPath: refuses control characters, including CR/LF request splitting", () => {
  const cr = String.fromCharCode(13);
  const lf = String.fromCharCode(10);
  const nul = String.fromCharCode(0);
  assert.throws(() => resolveSameOriginPath(`/ok${cr}${lf}X-Injected: 1`, BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath(`/ok${nul}`, BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath(`/ok${String.fromCharCode(127)}`, BASE), PublishedPagePathError);
});

test("resolveSameOriginPath: refuses traversal, raw and percent-encoded", () => {
  assert.throws(() => resolveSameOriginPath("/a/../../etc/passwd", BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath("/a/%2e%2e/%2e%2e/etc/passwd", BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath("/a/%2E%2E/b", BASE), PublishedPagePathError);
});

test("resolveSameOriginPath: refuses a malformed percent-encoding rather than silently repairing it", () => {
  assert.throws(() => resolveSameOriginPath("/a/%zz", BASE), PublishedPagePathError);
});

test("resolveSameOriginPath: refuses the authenticated API surface", () => {
  assert.throws(() => resolveSameOriginPath("/api/admin/v1/workspaces/x/settings", BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath("/API/admin/v1/x", BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath("/%61pi/admin/v1/x", BASE), PublishedPagePathError);
});

test("resolveSameOriginPath: refuses empty, non-string and oversized paths", () => {
  assert.throws(() => resolveSameOriginPath("", BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath(undefined, BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath(42, BASE), PublishedPagePathError);
  assert.throws(() => resolveSameOriginPath(`/${"a".repeat(MAX_PATH_LENGTH)}`, BASE), PublishedPagePathError);
});

test("resolveSameOriginPath: a rejection names the rule so a model can fix the input in one turn", () => {
  assert.throws(
    () => resolveSameOriginPath("https://evil.example/x", BASE),
    (err: unknown) => err instanceof PublishedPagePathError && err.message.includes("must start with '/'"),
  );
  assert.throws(
    () => resolveSameOriginPath("//evil.example/x", BASE),
    (err: unknown) => err instanceof PublishedPagePathError && err.message.includes("different host"),
  );
});

// ---------------------------------------------------------------------------
// toCookieShapes / readBoundedBody
// ---------------------------------------------------------------------------

test("toCookieShapes: keeps the cookie name and attributes and drops the value", () => {
  const headers = new Headers();
  headers.append("set-cookie", "sid=SUPER_SECRET_SESSION_VALUE; Path=/; HttpOnly; SameSite=Lax");
  headers.append("set-cookie", "consent=; Max-Age=0");

  const shapes = toCookieShapes(headers);
  assert.deepEqual(shapes, [
    { name: "sid", attributes: ["Path=/", "HttpOnly", "SameSite=Lax"] },
    { name: "consent", attributes: ["Max-Age=0"] },
  ]);
  assert.ok(!JSON.stringify(shapes).includes("SUPER_SECRET_SESSION_VALUE"));
});

test("readBoundedBody: stops at the cap and reports it, rather than buffering the whole response", async () => {
  const response = new Response("y".repeat(10_000));
  const read = await readBoundedBody(response, 100);
  assert.equal(read.bodyBytes, 100);
  assert.equal(read.body.length, 100);
  assert.equal(read.truncated, true);
});

test("readBoundedBody: a response under the cap is returned whole and not flagged", async () => {
  const read = await readBoundedBody(new Response("hello"), 100);
  assert.deepEqual(read, { body: "hello", bodyBytes: 5, truncated: false });
});

// ---------------------------------------------------------------------------
// fetchPublishedPage — against a real booted app
// ---------------------------------------------------------------------------

test("fetchPublishedPage: returns the live status, headers and body of a real route", async () => {
  const result = await fetchPublishedPage(DEPS, { path: "/" });

  assert.equal(result.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.path, "/");
  assert.match(result.body, /home/);
  assert.equal(result.headers["content-security-policy"], "default-src 'self'");
  assert.match(result.headers["content-type"] ?? "", /text\/html/);
  assert.equal(result.truncated, false);
  assert.ok(result.bodyBytes > 0);
});

test("fetchPublishedPage: reports cookie SHAPES and never a cookie value, in headers or anywhere else", async () => {
  const result = await fetchPublishedPage(DEPS, { path: "/" });

  assert.deepEqual(
    result.cookies.map((cookie) => cookie.name).sort(),
    ["ab", "sid"],
  );
  const sid = result.cookies.find((cookie) => cookie.name === "sid");
  assert.deepEqual(sid?.attributes, ["Path=/", "HttpOnly", "SameSite=Lax"]);
  assert.equal(result.headers["set-cookie"], undefined, "set-cookie must not survive in the raw header map");
  assert.ok(
    !JSON.stringify(result).includes("SUPER_SECRET_SESSION_VALUE"),
    "a cookie VALUE must never appear anywhere in the result",
  );
});

test("fetchPublishedPage: preserves the query string through validation", async () => {
  const result = await fetchPublishedPage(DEPS, { path: "/echo?q=hello" });
  assert.equal(result.path, "/echo?q=hello");
  assert.equal(result.body, "query=hello");
});

test("fetchPublishedPage: a 404 is a RESULT, not a thrown error", async () => {
  const result = await fetchPublishedPage(DEPS, { path: "/nope" });
  assert.equal(result.status, 404);
  assert.equal(result.ok, false);
  assert.match(result.body, /not found/);
});

test("fetchPublishedPage: a redirect is reported, never followed", async () => {
  const result = await fetchPublishedPage(DEPS, { path: "/old" });
  assert.equal(result.status, 301);
  assert.equal(result.ok, false);
  assert.equal(result.headers["location"], "/new");
});

test("fetchPublishedPage: caps the body at maxBytes and flags the truncation", async () => {
  const result = await fetchPublishedPage(DEPS, { path: "/big" }, { maxBytes: 1_000 });
  assert.equal(result.bodyBytes, 1_000);
  assert.equal(result.truncated, true);

  const defaulted = await fetchPublishedPage(DEPS, { path: "/big" });
  assert.equal(defaulted.bodyBytes, 50_000);
  assert.ok(defaulted.bodyBytes < DEFAULT_MAX_BODY_BYTES);
  assert.equal(defaulted.truncated, false);
});

test("fetchPublishedPage: maxBytes is clamped to the hard maximum and defaulted for nonsense", async () => {
  const huge = await fetchPublishedPage(DEPS, { path: "/big" }, { maxBytes: MAX_MAX_BODY_BYTES * 10 });
  assert.equal(huge.bodyBytes, 50_000);

  const negative = await fetchPublishedPage(DEPS, { path: "/big" }, { maxBytes: -1 });
  assert.equal(negative.bodyBytes, 50_000);
});

test("fetchPublishedPage: refuses an off-site path and never issues the request", async () => {
  const attempted: string[] = [];
  const spyDeps = {
    createSiteApp: () => {
      const app = express();
      app.use((req, _res, next) => {
        attempted.push(req.url);
        next();
      });
      app.use((_req, res) => res.status(200).send("ok"));
      return app;
    },
  };

  for (const candidate of ["https://evil.example/x", "//evil.example/x", "/a/../../etc/passwd", "/api/admin/v1/x"]) {
    await assert.rejects(() => fetchPublishedPage(spyDeps, { path: candidate }), PublishedPagePathError);
  }
  assert.deepEqual(attempted, [], "a refused path must never reach the app");
});

test("fetchPublishedPage: the /api guard holds even though the admin API is mounted on the same app", async () => {
  await assert.rejects(
    () => fetchPublishedPage(DEPS, { path: "/api/admin/v1/secret" }),
    (err: unknown) =>
      err instanceof PublishedPagePathError &&
      err.message ===
        "path must not target '/api' — that is the authenticated admin/API surface, not a published page.",
  );
});

test("fetchPublishedPage: the same guard covers /admin, the admin SPA mounted on that same app", async () => {
  // Widened from `/api/` only when `platform/routing/reserved-paths.ts` became the single copy of
  // this rule (`redirects` needs the identical answer for a stored redirect target). `/admin` is
  // `app.use("/admin", express.static(...))` in `admin-static.ts` — as much "not a published page"
  // as the API is.
  for (const path of ["/admin", "/admin/settings", "/%61dmin", "/ADMIN/settings"]) {
    await assert.rejects(
      () => fetchPublishedPage(DEPS, { path }),
      (err: unknown) =>
        err instanceof PublishedPagePathError &&
        err.message ===
          "path must not target '/admin' — that is the authenticated admin/API surface, not a published page.",
      `expected '${path}' to be refused`,
    );
  }
});

test("fetchPublishedPage: a published page whose slug merely starts with 'admin' still fetches", async () => {
  const ok = await fetchPublishedPage(DEPS, { path: "/administer-survey" });
  assert.equal(typeof ok.status, "number");
});

test("fetchPublishedPage: tears the ephemeral server down on both the success and the rejection path", async () => {
  // A leaked listening socket would keep this process (and any `node:test` run) alive. Booting many
  // times in a row is the cheapest observable proof that each one really closed: a leak shows up as
  // exhausted handles or a hanging test run, not as a wrong assertion.
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const ok = await fetchPublishedPage(DEPS, { path: "/" });
    assert.equal(ok.status, 200);
    await assert.rejects(() => fetchPublishedPage(DEPS, { path: "//evil.example" }), PublishedPagePathError);
  }
});
