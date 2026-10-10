import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

/** Exercise real TS theme workers after their parent closes fd 0, as a detached host can. */
test("both theme engines render and enforce their allowlists with the parent's stdin closed", () => {
  const script = `
    import assert from "node:assert/strict";
    import { closeSync } from "node:fs";
    import { renderInWorkerSandbox } from ${JSON.stringify(new URL("../worker-sandbox.ts", import.meta.url).href)};
    closeSync(0);
    const ctx = {
      siteTitle: "Detached fixture", route: "home", posts: [], products: [], themeName: "test",
      widgetRegions: {}, widgetInlineResolved: new Map(), mediaTransformVersions: new Map(),
      mediaAssetMetadata: new Map(), assignedTerms: [],
    };
    for (const [worker, label, disallowed, expected] of [
      ["liquid-worker", "Liquid", '{% include "leak" %}', /disallowed Liquid usage.*disallowed tag "include"/],
      ["handlebars-worker", "Handlebars", "{{> leak}}", /disallowed Handlebars usage.*disallowed partial "leak"/],
    ]) {
      assert.equal(await renderInWorkerSandbox(worker, label, { source: "<h1>{{site.title}}</h1>", ctx }), "<h1>Detached fixture</h1>");
      await assert.rejects(renderInWorkerSandbox(worker, label, { source: disallowed, ctx }), expected);
    }
    console.log("closed stdin: both renders and allowlists verified");
  `;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /closed stdin: both renders and allowlists verified/);
});
