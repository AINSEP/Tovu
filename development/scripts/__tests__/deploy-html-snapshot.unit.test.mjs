/** P2 deploy guard (adopted 2026-10-12): inline fixtures only; no network. */
import assert from "node:assert/strict";
import test from "node:test";
import { compareSnapshots, inspectHtml, selectPaths, snapshot } from "../deploy-html-snapshot.mjs";

test("counts exact opening tags, including SVG, and measures UTF-8 bytes", () => {
  const html = '<SVG><svg/></SVG><SCRIPT src="app.js"></SCRIPT><button>é</button>' +
    '<video></video><IMG src="a"><a href="/">link</a><article></article><image/>';
  assert.deepEqual(inspectHtml({ html, status: 200 }), {
    status: 200,
    bytes: Buffer.byteLength(html),
    counts: { svg: 2, script: 1, button: 1, video: 1, img: 1, a: 1 },
  });
});

test("ignores comments, raw text, escaped markup, and tags inside quoted attributes", () => {
  const html = `<!-- <svg><script><img> --><script>const example = '<svg><img>';</script>
    <style>/* <video> */</style><textarea><button></textarea><title><a></title>
    <button title="<img> and >">&lt;svg&gt;</button><a data-example='<svg>'>link</a>`;
  assert.deepEqual(inspectHtml({ html, status: 200 }).counts,
    { svg: 0, script: 1, button: 1, video: 0, img: 0, a: 1 });
});

/** Build a fixture with stable byte length so each tag rule is isolated. */
function fixture({ counts = {}, bytes = 100, status = 200, path = "/" } = {}) {
  return { pages: { [path]: { status, bytes,
    counts: { svg: 0, script: 0, button: 0, video: 0, img: 0, a: 0, ...counts } } } };
}

for (const tag of ["svg", "script", "video", "img"]) {
  test(`${tag}: detects disappearance and drops strictly greater than 50%`, () => {
    const before = fixture({ counts: { [tag]: 4 } });
    assert.deepEqual(compareSnapshots({ before, after: fixture({ counts: { [tag]: 2 } }) }), []);
    assert.deepEqual(compareSnapshots({ before, after: fixture({ counts: { [tag]: 1 } }) }),
      [{ page: "/", metric: tag, before: 4, after: 1 }]);
    assert.equal(compareSnapshots({ before: fixture({ counts: { [tag]: 1 } }),
      after: fixture() })[0].metric, tag);
  });
}

test("byte drops are strictly greater than 20%, and growth/zero baselines pass", () => {
  const before = fixture();
  assert.deepEqual(compareSnapshots({ before, after: fixture({ bytes: 80 }) }), []);
  assert.deepEqual(compareSnapshots({ before, after: fixture({ bytes: 79 }) }),
    [{ page: "/", metric: "bytes", before: 100, after: 79 }]);
  assert.deepEqual(compareSnapshots({ before: fixture({ bytes: 0 }), after: fixture() }), []);
});

test("button and anchor drops are recorded but do not trigger the guard", () => {
  assert.deepEqual(compareSnapshots({ before: fixture({ counts: { button: 10, a: 10 } }),
    after: fixture() }), []);
});

test("a previously 200 page fails on HTTP errors or transport failures", () => {
  for (const status of [301, 404, 500, 0]) {
    assert.deepEqual(compareSnapshots({ before: fixture(), after: fixture({ status }) }),
      [{ page: "/", metric: "status", before: 200, after: status }]);
  }
  assert.deepEqual(compareSnapshots({ before: fixture({ status: 503 }), after: fixture() }), []);
});

test("pages missing from the after snapshot are skipped (sitemap order varies)", () => {
  assert.deepEqual(compareSnapshots({ before: fixture({ path: "/blog-post" }), after: fixture() }), []);
});

test("reports regressions on every page independently of object order or added pages", () => {
  const before = { pages: { ...fixture().pages,
    ...fixture({ path: "/docs", counts: { script: 2 } }).pages } };
  const after = { pages: { ...fixture({ path: "/new" }).pages,
    ...fixture({ path: "/docs", counts: { script: 0 } }).pages,
    ...fixture({ bytes: 79 }).pages } };
  assert.deepEqual(compareSnapshots({ before, after }), [
    { page: "/", metric: "bytes", before: 100, after: 79 },
    { page: "/docs", metric: "script", before: 2, after: 0 },
  ]);
});

test("inline HTML snapshots detect the sanitizer stripping icons, scripts, and media", () => {
  const before = { pages: { "/": inspectHtml({ status: 200,
    html: '<svg></svg><script src="app.js"></script><video></video><img src="a">'.padEnd(200) }) } };
  const after = { pages: { "/": inspectHtml({ status: 200,
    html: '<button>Continue</button>'.padEnd(200) }) } };
  assert.deepEqual(compareSnapshots({ before, after }).map(({ metric }) => metric),
    ["svg", "script", "video", "img"]);
});

test("sitemap paths preserve order, deduplicate, stay same-origin, and cap at ten extras", () => {
  const sitemap = '<urlset><url><loc>https://tovu.dev/docs</loc></url>' +
    '<url><loc>https://elsewhere.test/skip</loc></url><url><loc>javascript:alert(1)</loc></url>' +
    '<url><loc>https://tovu.dev/first?a=1&amp;b=2</loc></url>' +
    '<url><loc>https://tovu.dev/first?a=1&amp;b=2#duplicate</loc></url>' +
    Array.from({ length: 12 }, (_, i) => `<url><loc>https://tovu.dev/page-${i}</loc></url>`).join("") +
    '</urlset>';
  assert.deepEqual(selectPaths({ baseUrl: "https://tovu.dev", sitemap }),
    ["/", "/terms-of-service", "/privacy-policy", "/docs", "/first?a=1&b=2",
      ...Array.from({ length: 9 }, (_, i) => `/page-${i}`)]);
  assert.equal(selectPaths({ baseUrl: "https://tovu.dev", sitemap: "" }).length, 4);
});

test("snapshot preserves failed pages and falls back to fixed paths when sitemap fetch fails", async () => {
  const requests = [];
  const warnings = [];
  const result = await snapshot({ baseUrl: "https://tovu.dev" }, {
    fetchImpl: async (url, options) => {
      requests.push(url.pathname);
      assert.ok(options.signal instanceof AbortSignal);
      if (url.pathname === "/sitemap.xml" || url.pathname === "/docs") {
        throw new TypeError("offline fixture");
      }
      return new Response('<svg></svg>', { status: 200 });
    },
    logger: { log() {}, warn(message) { warnings.push(message); } },
  });
  assert.deepEqual(requests, ["/sitemap.xml", "/", "/terms-of-service", "/privacy-policy", "/docs"]);
  assert.equal(warnings.length, 1);
  assert.equal(result.pages["/"].counts.svg, 1);
  assert.deepEqual(result.pages["/docs"], {
    ...inspectHtml({ html: "", status: 0 }), error: "offline fixture",
  });
});

test("snapshot keeps same-origin double-slash paths on the checked host", async () => {
  const requests = [];
  await snapshot({ baseUrl: "https://tovu.dev" }, {
    fetchImpl: async (url) => {
      requests.push(url.href);
      const html = url.pathname === "/sitemap.xml"
        ? '<urlset><url><loc>https://tovu.dev//elsewhere.test/path</loc></url></urlset>'
        : '<img src="a">';
      return new Response(html, { status: 200 });
    },
    logger: { log() {}, warn() {} },
  });
  assert.ok(requests.every((url) => new URL(url).origin === "https://tovu.dev"));
  assert.ok(requests.includes("https://tovu.dev//elsewhere.test/path"));
});
