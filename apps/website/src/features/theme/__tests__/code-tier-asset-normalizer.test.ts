import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkBuiltThemeConformance } from "../build-conformance.js";
import {
  normalizeBuildOutputDirectory,
  planAssetRelocation,
  rewriteBundlerHtml,
  rewriteCssRelativeUrls,
} from "../code-tier-asset-normalizer.js";
import { TOKEN_STYLESHEET_SENTINEL } from "../static-asset-contract.js";

/**
 * @file Unit coverage for `code-tier-asset-normalizer.ts`'s pure planning/rewriting core, plus one
 * FROZEN-FIXTURE test built from real (not live) Angular build output.
 *
 * ## This is a frozen capture, NOT a live build — read this before trusting what it proves
 *
 * `REAL_ANGULAR_INDEX_HTML` below is not hand-authored fixture markup. It is the verbatim `index.html` a
 * real `ng build` produced — Angular CLI 21.2.21, `@angular/build:application` builder, `outputHashing:
 * "none"`, `optimization.styles.inlineCritical: false` — captured ONE TIME on 2026-08-12 during
 * `ADS-memory/reports/spikes/20260812-angular-code-tier-build-output-verification.md`'s Phase 1
 * verification, and pasted here as a string literal. It is a snapshot, not a subprocess: this test does
 * NOT run `ng build` the way `astro-real-bundler-conformance.test.ts` runs a real `astro build`.
 *
 * **Team-lead decision (2026-08-12, option C of three proposed): stay fixture-based for now rather than
 * add Angular as a devDependency.** Reasoning: Angular is currently SPECULATIVE code-tier support with no
 * reference theme shipping, so a live-build test does not yet earn its cost — measured at ~286MB of
 * `node_modules` (vs. Astro's own ~6.8MB) plus a real `express` major-version divergence (Tovu depends on
 * `^4.21.2`; Angular SSR's own scaffold wants `^5.1.0`). Astro earns its live-build test because Astro
 * ships as a real theme; Angular does not, yet.
 *
 * **What this frozen fixture CANNOT do, stated plainly: it cannot catch Angular changing its own output
 * shape.** If a future Angular version changes how `outputHashing: "none"` names bundles, changes what
 * Beasties (or its successor) does even with `inlineCritical: false`, or emits a subtly different
 * `<link>`/`<script>` tag shape than the one frozen here, this test will keep passing against the OLD,
 * now-stale shape while the real, current `ng build` output silently diverges from it — exactly the kind
 * of drift `astro-real-bundler-conformance.test.ts` exists to catch and this fixture-based test cannot.
 * Do not cite this test as proof "Angular works" beyond CLI 21.2.21's frozen 2026-08-12 output shape.
 *
 * **Revisit trigger:** when Angular ships as a real reference theme (the same bar Astro already cleared),
 * replace this fixture with a live `ng build` subprocess test in the shape of
 * `astro-real-bundler-conformance.test.ts`, and re-measure the devDependency cost above rather than
 * assuming the 2026-08-12 numbers still hold.
 */

const REAL_ANGULAR_INDEX_HTML =
  '<!doctype html>\n' +
  '<html lang="en">\n' +
  "<head>\n" +
  '  <meta charset="utf-8">\n' +
  "  <title>ProbeApp</title>\n" +
  '  <base href="/">\n' +
  '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
  '  <link rel="icon" type="image/x-icon" href="favicon.ico">\n' +
  '<link rel="stylesheet" href="styles.css"></head>\n' +
  "<body>\n" +
  "  <app-root></app-root>\n" +
  '<script src="main.js" type="module"></script></body>\n' +
  "</html>\n";

const REAL_ANGULAR_OUTPUT_FILES = ["index.html", "favicon.ico", "main.js", "styles.css"];

test("planAssetRelocation moves top-level .css to css/ and .js/.mjs to js/, leaving everything else alone", () => {
  const plan = planAssetRelocation({ fileNames: ["index.html", "favicon.ico", "main.js", "styles.css", "polyfills.mjs"] });

  assert.deepEqual(
    [...plan.relocations].sort((a, b) => a.from.localeCompare(b.from)),
    [
      { from: "main.js", to: "js/main.js" },
      { from: "polyfills.mjs", to: "js/polyfills.mjs" },
      { from: "styles.css", to: "css/styles.css" },
    ]
  );
});

test("planAssetRelocation rejects a fileName that is already nested -- flat output is the precondition, not something to silently tolerate", () => {
  assert.throws(() => planAssetRelocation({ fileNames: ["css/already-nested.css"] }), RangeError);
});

test("planAssetRelocation relocates a .js.map/.css.map sourcemap into the SAME directory as its bundle", () => {
  const plan = planAssetRelocation({ fileNames: ["main.js", "main.js.map", "polyfills.mjs.map", "styles.css", "styles.css.map"] });

  assert.deepEqual(
    [...plan.relocations].sort((a, b) => a.from.localeCompare(b.from)),
    [
      { from: "main.js", to: "js/main.js" },
      { from: "main.js.map", to: "js/main.js.map" },
      { from: "polyfills.mjs.map", to: "js/polyfills.mjs.map" },
      { from: "styles.css", to: "css/styles.css" },
      { from: "styles.css.map", to: "css/styles.css.map" },
    ]
  );
});

test("rewriteBundlerHtml replaces the plain build-output stylesheet tag with the EXACT sentinel constant, not a hand-reconstructed copy", () => {
  const plan = planAssetRelocation({ fileNames: ["styles.css"] });
  const html = '<head><link rel="stylesheet" href="styles.css"></head>';

  const rewritten = rewriteBundlerHtml({ html, plan, primaryStylesheetFile: "styles.css" });

  assert.equal(rewritten, `<head>${TOKEN_STYLESHEET_SENTINEL}</head>`);
});

test("rewriteBundlerHtml rewrites a script src to the ../js/ form while preserving other attributes on the tag", () => {
  const plan = planAssetRelocation({ fileNames: ["styles.css", "main.js"] });
  const html = '<link rel="stylesheet" href="styles.css"><script src="main.js" type="module"></script>';

  const rewritten = rewriteBundlerHtml({ html, plan, primaryStylesheetFile: "styles.css" });

  assert.ok(rewritten.includes('<script src="../js/main.js" type="module"></script>'), rewritten);
});

test("rewriteBundlerHtml anchors on the FULL attribute value -- 'main.js' does not falsely match inside 'vendor-main.js'", () => {
  const plan = planAssetRelocation({ fileNames: ["styles.css", "main.js"] });
  const html = '<link rel="stylesheet" href="styles.css"><script src="vendor-main.js"></script><script src="main.js"></script>';

  const rewritten = rewriteBundlerHtml({ html, plan, primaryStylesheetFile: "styles.css" });

  assert.ok(rewritten.includes('src="vendor-main.js"'), "unrelated similarly-named file must be left untouched");
  assert.ok(rewritten.includes('src="../js/main.js"'), "the exact-match file must still be rewritten");
});

test("rewriteBundlerHtml throws when primaryStylesheetFile is not among the plan's relocated CSS files", () => {
  const plan = planAssetRelocation({ fileNames: ["main.js"] }); // no CSS at all
  assert.throws(
    () => rewriteBundlerHtml({ html: "<html></html>", plan, primaryStylesheetFile: "styles.css" }),
    /not among the plan's relocated CSS files/
  );
});

test("rewriteBundlerHtml throws loudly, not silently, when the plain tag shape is missing (e.g. Beasties left enabled)", () => {
  const plan = planAssetRelocation({ fileNames: ["styles.css"] });
  // Beasties' critical-CSS inlining shape (see this module's file header, finding 4) -- not the plain tag.
  const html =
    '<style>body{margin:0}</style><link rel="stylesheet" href="styles.css" media="print" onload="this.media=\'all\'">';

  assert.throws(
    () => rewriteBundlerHtml({ html, plan, primaryStylesheetFile: "styles.css" }),
    /expected the plain build-output tag/
  );
});

test("rewriteCssRelativeUrls prepends ../ to a bare relative url() reference", () => {
  assert.equal(rewriteCssRelativeUrls("body{background:url(favicon.ico)}"), "body{background:url(../favicon.ico)}");
});

test("rewriteCssRelativeUrls prepends ../ to an already-../-prefixed url(), preserving quotes", () => {
  assert.equal(
    rewriteCssRelativeUrls("@font-face{src:url('../fonts/x.woff2')}"),
    "@font-face{src:url('../../fonts/x.woff2')}"
  );
  assert.equal(rewriteCssRelativeUrls('div{background:url("media/logo.png")}'), 'div{background:url("../media/logo.png")}');
});

test("rewriteCssRelativeUrls leaves scheme, root-relative, protocol-relative, fragment, and empty urls untouched", () => {
  const untouchedCases = [
    "url(data:image/png;base64,AAAA)",
    "url(https://cdn.example.com/x.png)",
    "url(/root-relative.png)",
    "url(//cdn.example.com/x.png)",
    "url(#gradient-fragment)",
    "url()",
  ];
  for (const css of untouchedCases) {
    assert.equal(rewriteCssRelativeUrls(css), css, css);
  }
});

test("end-to-end: normalizing a REAL Angular build's index.html produces output the actual conformance gate accepts cleanly", () => {
  const plan = planAssetRelocation({ fileNames: REAL_ANGULAR_OUTPUT_FILES });
  const normalized = rewriteBundlerHtml({ html: REAL_ANGULAR_INDEX_HTML, plan, primaryStylesheetFile: "styles.css" });

  // Exactly one sentinel occurrence, and the script tag correctly relocated.
  assert.equal(normalized.split(TOKEN_STYLESHEET_SENTINEL).length - 1, 1);
  assert.ok(normalized.includes('<script src="../js/main.js" type="module">'));

  // Feed the normalized page through the REAL, imported checkBuiltThemeConformance -- not a
  // reimplementation. checkArtifactHashes reads real bytes off disk via themeDir, which this
  // pure-function test does not provide, so this scopes its assertion to the two rules a page's raw
  // HTML can actually be checked against without a real on-disk tree (stylesheet-sentinel, asset-path) --
  // matching how `astro-real-bundler-conformance.test.ts` reasons about the same two rules.
  const issues = checkBuiltThemeConformance({
    themeId: "angular-probe",
    themeDir: "/nonexistent-for-this-html-only-check",
    pages: { index: normalized },
    partials: {},
    artifactHashes: {},
  });

  const relevantIssues = issues.filter((issue) => issue.rule === "stylesheet-sentinel" || issue.rule === "asset-path");
  assert.deepEqual(relevantIssues, []);
});

test("normalizeBuildOutputDirectory physically moves css/js files on disk and rewrites the page file in place", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-normalizer-fs-"));
  fs.writeFileSync(path.join(root, "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(root, "main.js"), "console.log(1)", "utf8");
  fs.writeFileSync(path.join(root, "favicon.ico"), "not-a-real-icon", "utf8");
  fs.writeFileSync(
    path.join(root, "index.html"),
    '<head><link rel="stylesheet" href="styles.css"></head><body><script src="main.js" type="module"></script></body>',
    "utf8"
  );

  const result = normalizeBuildOutputDirectory({
    outputDir: root,
    pageFileNames: ["index.html"],
    primaryStylesheetFile: "styles.css",
  });

  assert.deepEqual(result.rewrittenPageFiles, ["index.html"]);
  assert.deepEqual(
    [...result.plan.relocations].sort((a, b) => a.from.localeCompare(b.from)),
    [
      { from: "main.js", to: "js/main.js" },
      { from: "styles.css", to: "css/styles.css" },
    ]
  );

  // The files really moved -- gone from the root, present at their relocated path with unchanged bytes.
  assert.ok(!fs.existsSync(path.join(root, "styles.css")));
  assert.ok(!fs.existsSync(path.join(root, "main.js")));
  assert.equal(fs.readFileSync(path.join(root, "css", "styles.css"), "utf8"), "body{margin:0}");
  assert.equal(fs.readFileSync(path.join(root, "js", "main.js"), "utf8"), "console.log(1)");
  // Untouched: not a relocation target.
  assert.ok(fs.existsSync(path.join(root, "favicon.ico")));

  // The page file was rewritten in place on disk to the exact sentinel plus the relocated script src.
  const rewrittenIndex = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.ok(rewrittenIndex.includes(TOKEN_STYLESHEET_SENTINEL));
  assert.ok(rewrittenIndex.includes('<script src="../js/main.js" type="module"></script>'));
});

test("normalizeBuildOutputDirectory does not treat a same-named subdirectory as a file to relocate", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-normalizer-fs-dir-"));
  fs.mkdirSync(path.join(root, "media.js")); // pathological: a DIRECTORY whose name ends in .js
  fs.writeFileSync(path.join(root, "media.js", "inner.txt"), "leave me alone", "utf8");
  fs.writeFileSync(path.join(root, "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(root, "index.html"), '<link rel="stylesheet" href="styles.css">', "utf8");

  const result = normalizeBuildOutputDirectory({
    outputDir: root,
    pageFileNames: ["index.html"],
    primaryStylesheetFile: "styles.css",
  });

  assert.deepEqual(result.plan.relocations, [{ from: "styles.css", to: "css/styles.css" }]);
  // The directory was never handed to planAssetRelocation, so it was never a candidate to move at all.
  assert.ok(fs.existsSync(path.join(root, "media.js", "inner.txt")));
});

test("normalizeBuildOutputDirectory rewrites a relocated CSS file's own url() references to compensate for the directory shift", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-normalizer-fs-cssurl-"));
  fs.writeFileSync(
    path.join(root, "styles.css"),
    "body{background:url(favicon.ico)} @font-face{src:url(../fonts/x.woff2)} .cdn{background:url(https://cdn.example.com/x.png)}",
    "utf8"
  );
  fs.writeFileSync(path.join(root, "index.html"), '<link rel="stylesheet" href="styles.css">', "utf8");

  normalizeBuildOutputDirectory({ outputDir: root, pageFileNames: ["index.html"], primaryStylesheetFile: "styles.css" });

  const relocatedCss = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");
  assert.ok(relocatedCss.includes("url(../favicon.ico)"), relocatedCss);
  assert.ok(relocatedCss.includes("url(../../fonts/x.woff2)"), relocatedCss);
  // Absolute URL is scheme-prefixed -- unaffected by the directory shift, left exactly as the build emitted it.
  assert.ok(relocatedCss.includes("url(https://cdn.example.com/x.png)"), relocatedCss);
});

test("normalizeBuildOutputDirectory relocates a bundle's .js.map/.css.map alongside it, preserving the sourceMappingURL reference", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-normalizer-fs-sourcemap-"));
  fs.writeFileSync(path.join(root, "main.js"), "console.log(1);\n//# sourceMappingURL=main.js.map", "utf8");
  fs.writeFileSync(path.join(root, "main.js.map"), '{"version":3,"file":"main.js"}', "utf8");
  fs.writeFileSync(path.join(root, "styles.css"), "body{margin:0}\n/*# sourceMappingURL=styles.css.map */", "utf8");
  fs.writeFileSync(path.join(root, "styles.css.map"), '{"version":3,"file":"styles.css"}', "utf8");
  fs.writeFileSync(
    path.join(root, "index.html"),
    '<link rel="stylesheet" href="styles.css"><script src="main.js" type="module"></script>',
    "utf8"
  );

  const result = normalizeBuildOutputDirectory({
    outputDir: root,
    pageFileNames: ["index.html"],
    primaryStylesheetFile: "styles.css",
  });

  assert.deepEqual(
    [...result.plan.relocations].sort((a, b) => a.from.localeCompare(b.from)),
    [
      { from: "main.js", to: "js/main.js" },
      { from: "main.js.map", to: "js/main.js.map" },
      { from: "styles.css", to: "css/styles.css" },
      { from: "styles.css.map", to: "css/styles.css.map" },
    ]
  );

  // Both halves of each bundle/map pair really moved, to the SAME directory as each other.
  assert.ok(fs.existsSync(path.join(root, "js", "main.js")));
  assert.ok(fs.existsSync(path.join(root, "js", "main.js.map")));
  assert.ok(fs.existsSync(path.join(root, "css", "styles.css")));
  assert.ok(fs.existsSync(path.join(root, "css", "styles.css.map")));
  assert.ok(!fs.existsSync(path.join(root, "main.js.map")), "must not still be at the old location");
  assert.ok(!fs.existsSync(path.join(root, "styles.css.map")), "must not still be at the old location");

  // The bundle's own sourceMappingURL comment is untouched text -- because the map moved into the SAME
  // directory as the bundle, the bare relative filename it already names still resolves correctly with
  // no rewrite needed (the fix this test pins is relocation coverage, not comment rewriting).
  const relocatedJs = fs.readFileSync(path.join(root, "js", "main.js"), "utf8");
  assert.ok(relocatedJs.includes("//# sourceMappingURL=main.js.map"));
  const relocatedCssWithMap = fs.readFileSync(path.join(root, "css", "styles.css"), "utf8");
  assert.ok(relocatedCssWithMap.includes("/*# sourceMappingURL=styles.css.map */"));
});

test("normalizeBuildOutputDirectory deletes index.csr.html -- Tovu's serving model has no client-side router to fall back to", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-normalizer-fs-csr-"));
  fs.writeFileSync(path.join(root, "styles.css"), "body{margin:0}", "utf8");
  fs.writeFileSync(path.join(root, "index.html"), '<link rel="stylesheet" href="styles.css">', "utf8");
  fs.writeFileSync(path.join(root, "index.csr.html"), "<html><body>csr fallback shell</body></html>", "utf8");

  const result = normalizeBuildOutputDirectory({
    outputDir: root,
    pageFileNames: ["index.html"],
    primaryStylesheetFile: "styles.css",
  });

  assert.deepEqual(result.discardedFiles, ["index.csr.html"]);
  assert.ok(!fs.existsSync(path.join(root, "index.csr.html")));
  // Its presence must not have leaked into the relocation plan either -- it was excluded before planning.
  assert.deepEqual(result.plan.relocations, [{ from: "styles.css", to: "css/styles.css" }]);
});
