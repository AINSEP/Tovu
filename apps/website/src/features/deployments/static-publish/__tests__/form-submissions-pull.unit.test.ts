import assert from "node:assert/strict";
import test from "node:test";

import type { DeployHostKit, FormDestinationPage, RemoteFormSubmission } from "#src/features/deployments/deploy-targets/types";
import { formDestinationKey, pullFromFormDestination } from "../form-submissions-pull.js";

/** @file Page loop, acknowledge-only-committed and key redaction for the generic form destination pull. */

const KEY = "k".repeat(43);
const destination = { url: "https://site.example/", secret: KEY };
const kit = {} as DeployHostKit;
const item = (seq: number): RemoteFormSubmission => ({ seq, id: `r${seq}`, formSlug: "waitlist", answers: {}, submittedAt: "2026-10-19T10:00:00.000Z", ip: null });

function host(pages: FormDestinationPage[]) {
  const calls: { after?: number; limit?: number }[] = [];
  const acks: string[][] = [];
  return { calls, acks, module: {
    pullFormSubmissions: async (_required: unknown, optional?: { after?: number; limit?: number }) => { calls.push(optional ?? {}); return pages.shift() ?? { items: [], nextAfter: 0, hasMore: false }; },
    acknowledgeFormSubmissions: async ({ ids }: { ids: readonly string[] }) => { acks.push([...ids]); return { acknowledged: ids.length }; },
  } };
}

test("pages are imported in order and only committed ids are acknowledged, once each", async () => {
  const h = host([{ items: [item(1), item(2)], nextAfter: 2, hasMore: true }, { items: [item(3)], nextAfter: 3, hasMore: false }]);
  const seen: string[] = [];
  const result = await pullFromFormDestination({ module: h.module, targetId: "host-a", destination, kit, importPage: async ({ items, destinationKey }) => {
    seen.push(destinationKey);
    return { committedIds: items.filter((row) => row.seq !== 2).flatMap((row) => [row.id, row.id]) };
  } }, { pageSize: 2 });
  assert.deepEqual(h.calls, [{ after: 0, limit: 2 }, { after: 2, limit: 2 }]);
  assert.deepEqual(h.acks, [["r1"], ["r3"]], "r2 was not committed, so it stays pending at the host");
  assert.deepEqual(seen, ["host-a:https://site.example", "host-a:https://site.example"]);
  assert.deepEqual({ ...result, pages: result.pages.length }, { destinationKey: "host-a:https://site.example", pulled: 3, acknowledged: 2, hasMore: false, pages: 2 });
});

test("an empty first page ends the pull; a page with nothing committed sends no acknowledgement", async () => {
  const empty = host([]);
  assert.deepEqual(await pullFromFormDestination({ module: empty.module, targetId: "t", destination, kit, importPage: async () => ({ committedIds: [] }) }),
    { destinationKey: "t:https://site.example", pulled: 0, acknowledged: 0, hasMore: false, pages: [] });
  const skipped = host([{ items: [item(1)], nextAfter: 1, hasMore: false }]);
  await pullFromFormDestination({ module: skipped.module, targetId: "t", destination, kit, importPage: async () => ({ committedIds: [] }) });
  assert.deepEqual(skipped.acks, []);
});

test("the page cap stops the loop and reports that more rows are waiting", async () => {
  const h = host([{ items: [item(1)], nextAfter: 1, hasMore: true }, { items: [item(2)], nextAfter: 2, hasMore: true }]);
  const result = await pullFromFormDestination({ module: h.module, targetId: "t", destination, kit, importPage: async ({ items }) => ({ committedIds: items.map((row) => row.id) }) }, { maxPages: 1 });
  assert.equal(result.hasMore, true);
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], { after: 0, limit: 50 }, "default page size");
});

test("a target without the form methods is refused with the next step", async () => {
  await assert.rejects(pullFromFormDestination({ module: {}, targetId: "pages-like", destination, kit, importPage: async () => ({ committedIds: [] }) }),
    /hosting target pages-like cannot return form submissions\. Publish the site to a target that receives forms/);
});

test("host and import failures name the address and never the key", async () => {
  const h = host([]);
  h.module.pullFormSubmissions = async () => { throw new Error(`401 for Bearer ${KEY}`); };
  await assert.rejects(pullFromFormDestination({ module: h.module, targetId: "t", destination, kit, importPage: async () => ({ committedIds: [] }) }), (error: Error) => {
    assert.equal(error.message.includes(KEY), false);
    assert.match(error.message, /^pulling form submissions from https:\/\/site\.example stopped: 401 for Bearer \[redacted\]\. Rows not yet acknowledged stay at the host/);
    return true;
  });
  const failing = host([{ items: [item(1)], nextAfter: 1, hasMore: false }]);
  await assert.rejects(pullFromFormDestination({ module: failing.module, targetId: "t", destination, kit, importPage: async () => { throw "store offline"; } }), /stopped: store offline\./);
  assert.deepEqual(failing.acks, []);
});

test("destination keys use the origin only", () => {
  assert.equal(formDestinationKey({ targetId: "t", url: "https://Site.Example:443/a?b" }), "t:https://site.example");
});
