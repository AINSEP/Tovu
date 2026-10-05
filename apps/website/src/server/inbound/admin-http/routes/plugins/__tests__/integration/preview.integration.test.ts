import assert from "node:assert/strict";
import test from "node:test";

import { createApp, createRouteDeps } from "#src/server/runtime/composition/app";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";

/**
 * @file `PLUGIN_PREVIEW` (AW-7 Tier 2) through the real hermetic composition root: the compiled-in
 * Content Analyzer is listed, refused while disabled, and — once enabled through the real
 * `PATCH .../plugins/:id` route — previews a draft in a real fresh worker (its code is never imported
 * into this process), returning its declared fields without saving them.
 */

const DOC = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Why it matters" }] },
    { type: "paragraph", content: [{ type: "text", text: "Short posts read fast. This one has two sentences." }] },
  ],
};

test("PLUGIN_PREVIEW: the built-in Content Analyzer analyzes a draft in a worker once enabled, and not before", async (t) => {
  const deps = createRouteDeps();
  const { baseUrl, cookie } = await bootAuthenticated(createApp(deps), t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/plugins`;
  const preview = () =>
    fetch(`${base}/content-analyzer/preview`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ title: "A title that is long enough to pass the check", bodyJson: DOC }),
    });

  const listed = (await (await fetch(base, { headers: { cookie } })).json()) as { plugins: Array<{ id: string; enabled: boolean }> };
  assert.deepEqual(listed.plugins.find((plugin) => plugin.id === "content-analyzer")?.enabled, false);

  const before = await preview();
  assert.equal(before.status, 409);
  assert.equal(((await before.json()) as { code: string }).code, "PLUGIN_NOT_ENABLED");

  const enabled = await fetch(`${base}/content-analyzer`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  assert.equal(enabled.status, 200, await enabled.text());

  const after = await preview();
  const body = (await after.json()) as { pluginId: string; fields: Record<string, unknown> };
  assert.equal(after.status, 200, JSON.stringify(body));
  assert.equal(body.pluginId, "content-analyzer");
  assert.deepEqual(Object.keys(body.fields).sort(), ["readability", "readingTimeMinutes", "report", "score", "summary", "wordCount"]);
  assert.equal(body.fields.wordCount, 9);
  const report = JSON.parse(String(body.fields.report)) as { toc: Array<{ text: string; anchor: string }> };
  assert.deepEqual(report.toc, [{ level: 2, text: "Why it matters", anchor: "why-it-matters" }]);
});
