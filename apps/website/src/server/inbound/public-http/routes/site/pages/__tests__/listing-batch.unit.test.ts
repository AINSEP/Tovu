import assert from "node:assert/strict";
import test from "node:test";
import type { Request } from "express";

import { listingState } from "@jini-ai/cms/public-http/routes/site/pages/listing/listing-state";
import type { DeclaredScript } from "@jini-ai/core/contracts/site/cookie-consent";
import { portFake } from "#src/server/__tests__/helpers/port-fake";
import type { RouteDeps } from "#src/server/routes/types";
import { withListingBatch } from "../listing/listing-batch.js";

/** Header reader answering only the static-export marker, as the static publisher sends it. */
function headerReader(staticExport: boolean, _options = {}): Request["header"] {
  return ((name: string) => (staticExport && name.toLowerCase() === "x-tovu-static-export" ? "1" : undefined)) as Request["header"];
}

/** Route deps with a recording plugin-export runtime and a comments provider the static branch must drop. */
function routeDeps(_options = {}) {
  const renderModes: string[] = [];
  const session = { session: "plugin-export-session" };
  const commentsProviders = {};
  const deps = portFake<RouteDeps>({
    seoDeps: {},
    pluginExports: { forRender: ({ mode }: { mode: string }) => { renderModes.push(mode); return session; } },
    commentsProviders,
  });
  return { deps, renderModes, session, commentsProviders };
}

test("withListingBatch: a string commentCursor query is carried to the render as the comments cursor", () => {
  const { deps } = routeDeps();
  const req = portFake<Request>({ query: { commentCursor: "c-2026-11-20" }, header: headerReader(false) });
  assert.equal(withListingBatch({ deps, req }).commentsCursor, "c-2026-11-20");
});

test("withListingBatch: a repeated (array) or absent commentCursor yields no comments cursor", () => {
  const { deps } = routeDeps();
  const repeated = portFake<Request>({ query: { commentCursor: ["a", "b"] }, header: headerReader(false) });
  const absent = portFake<Request>({ query: {}, header: headerReader(false) });
  assert.equal(withListingBatch({ deps, req: repeated }).commentsCursor, undefined);
  assert.equal(withListingBatch({ deps, req: absent }).commentsCursor, undefined);
});

test("withListingBatch: a live request opens a live plugin-export session and keeps the comments surface", () => {
  const { deps, renderModes, session, commentsProviders } = routeDeps();
  const result = withListingBatch({ deps, req: portFake<Request>({ query: {}, header: headerReader(false) }) });
  assert.deepEqual(renderModes, ["live"]);
  assert.equal(result.pluginExportRender, session);
  assert.equal(result.commentsProviders, commentsProviders);
});

test("withListingBatch: a static-export request opens a static session and ships no comments providers", () => {
  const { deps, renderModes, session } = routeDeps();
  const result = withListingBatch({ deps, req: portFake<Request>({ query: { commentCursor: "c-1" }, header: headerReader(true) }) });
  assert.deepEqual(renderModes, ["static"]);
  assert.equal(result.pluginExportRender, session);
  assert.equal(result.commentsProviders, undefined);
  assert.equal(result.commentsCursor, "c-1");
});

test("withListingBatch: the see-more batch and page number recorded for this request are carried down", () => {
  const { deps } = routeDeps();
  const req = portFake<Request>({ query: {}, header: headerReader(false) });
  const listingBatch = { pagePath: "/blog", key: 3, after: 12 };
  listingState.recordListingBatchRequest({ req, listingBatch });
  listingState.recordListingPageRequest({ req, listingPage: { pagePath: "/blog", page: 4 }, requestPath: "/blog/page/4" });
  const result = withListingBatch({ deps, req });
  assert.equal(result.listingBatch, listingBatch);
  assert.equal(result.listingPage, 4);
  // A different request carries neither.
  const other = withListingBatch({ deps, req: portFake<Request>({ query: {}, header: headerReader(false) }) });
  assert.equal(other.listingBatch, undefined);
  assert.equal(other.listingPage, undefined);
});

test("withListingBatch: consent document assets append scripts declared during the render", async () => {
  const { deps } = routeDeps();
  const calls: { scripts: readonly DeclaredScript[]; static?: true }[] = [];
  const siteConsentAssets = async (args: { scripts: readonly DeclaredScript[]; static?: true }) => { calls.push(args); return { head: "<h>", body: "<b>" }; };
  const req = portFake<Request>({ query: {}, header: headerReader(false), res: { locals: { siteConsentAssets } } });
  const result = withListingBatch({ deps, req });
  assert.ok(result.declaredScripts, "the render collects declared scripts");
  result.declaredScripts.push({ src: "/plugin/widget.js", consent: ["analytics"] });
  const assets = await result.documentAssets?.({ scripts: [{ src: "/theme/site.js" }], static: true });
  assert.deepEqual(assets, { head: "<h>", body: "<b>" });
  assert.deepEqual(calls, [{ scripts: [{ src: "/theme/site.js" }, { src: "/plugin/widget.js", consent: ["analytics"] }], static: true }]);
});

test("withListingBatch: without consent assets on the response there is no document-assets hook", () => {
  const { deps } = routeDeps();
  assert.equal(withListingBatch({ deps, req: portFake<Request>({ query: {}, header: headerReader(false) }) }).documentAssets, undefined);
});
