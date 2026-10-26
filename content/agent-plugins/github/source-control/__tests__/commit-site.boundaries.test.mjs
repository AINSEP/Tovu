import assert from "node:assert/strict";
import test from "node:test";

import { createSiteCommitter } from "../commit-site.mjs";

// F9 (Stryker L15 re-score: commit-site is 90.7 % with its website suite, not 53.6 %). Kills the real
// survivors: the auth/API headers on EVERY request (AP7), the git-sha pattern per anchor and length
// (AP4), the delete-vs-diverged decision per live answer, the candidate filter, the manifest shape
// clauses one at a time (AP8), the type guards with hostile values (AP3) and the 422-only-on-update rule.

const API = "https://api.github.com/repos/octo/demo";
const HEX40 = "a".repeat(40);
const HEX64 = "b".repeat(64);
const MANIFEST_URL = `${API}/contents/.tovu/managed-files.json?ref=main`;
const json = (status, body) => new Response(JSON.stringify(body), { status });
const manifestOf = (value) => json(200, { content: Buffer.from(JSON.stringify(value)).toString("base64") });
const INPUT = { token: "tok", owner: "octo", repo: "demo", branch: "main", commitMessage: "m", files: [{ path: "index.html", data: "<p>" }] };

/** Routes each request by method + URL; `live` answers the per-path contents reads. */
function kitWith({ manifest, live = {}, ref = json(200, { object: { sha: "parent" } }), refWrite = json(200, {}) } = {}) {
  const calls = [];
  let blob = 0;
  const kit = {
    async fetch(url, init) {
      const method = init.method ?? "GET";
      calls.push({ url, method, headers: init.headers, body: init.body });
      if (url === API) return json(200, { default_branch: "main" });
      if (url.startsWith(`${API}/git/ref/heads/`)) return ref.clone();
      if (url.startsWith(`${API}/git/commits/`)) return json(200, { tree: { sha: "base-tree" } });
      if (url === MANIFEST_URL) return manifest ? manifest.clone() : json(404, {});
      if (url.startsWith(`${API}/contents/`)) {
        const path = decodeURIComponent(url.slice(`${API}/contents/`.length).split("?")[0]);
        return (live[path] ?? json(404, {})).clone();
      }
      if (url === `${API}/git/blobs`) return json(201, { sha: `blob${++blob}` });
      if (url === `${API}/git/trees`) return json(201, { sha: "new-tree" });
      if (url === `${API}/git/commits`) return json(201, { sha: "c1" });
      if (url.startsWith(`${API}/git/refs`)) return refWrite.clone();
      throw new Error(`unexpected ${method} ${url}`);
    },
    redirectGuardInit: (init) => init,
    assertNotRedirected: () => {},
    isRedirectRefusal: () => false,
  };
  return { kit, calls };
}
const liveReads = (calls) => calls.filter((c) => c.method === "GET" && c.url.startsWith(`${API}/contents/`) && c.url !== MANIFEST_URL).map((c) => decodeURIComponent(c.url.slice(`${API}/contents/`.length).split("?")[0]));
const treeBody = (calls) => JSON.parse(calls.find((c) => c.url === `${API}/git/trees`).body);

test("every request carries the bearer token, the GitHub media type and the pinned API version; writes declare JSON", async () => {
  const { kit, calls } = kitWith({ manifest: manifestOf({ version: 2, files: [{ path: "old.html", sha: HEX40 }] }), live: { "old.html": json(200, { sha: HEX40 }) } });
  assert.equal((await createSiteCommitter(kit)(INPUT)).ok, true);
  assert.ok(calls.length >= 9);
  for (const call of calls) {
    const expected = { Authorization: "Bearer tok", Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2026-03-10", ...(call.method === "GET" ? {} : { "Content-Type": "application/json" }) };
    assert.deepEqual(call.headers, expected, `${call.method} ${call.url}`);
  }
});

test("a recorded sha must be exactly 40 or 64 hex chars (case-insensitive); anything else is never verified or deleted", async () => {
  const files = [
    ["ok40", HEX40], ["ok64", HEX64], ["okUpper", "A".repeat(40)],
    ["len39", "a".repeat(39)], ["len41", "a".repeat(41)], ["len63", "b".repeat(63)], ["len65", "b".repeat(65)],
    ["prefix", `x${HEX40}`], ["suffix", `${HEX40}x`], ["nonhex", "g".repeat(40)], ["nonhex64", "z".repeat(64)], ["one", "a"],
  ].map(([path, sha]) => ({ path, sha }));
  const live = Object.fromEntries(files.map(({ path, sha }) => [path, json(200, { sha })]));
  const { kit, calls } = kitWith({ manifest: manifestOf({ version: 2, files }), live });
  const result = await createSiteCommitter(kit)(INPUT);
  assert.deepEqual(liveReads(calls), ["ok40", "ok64", "okUpper"]);
  assert.equal(result.filesDeleted, 3);
  assert.deepEqual(result.divergedPaths, ["len39", "len41", "len63", "len65", "prefix", "suffix", "nonhex", "nonhex64", "one"]);
});

test("delete only when the live sha equals the recorded one; absent is skipped; every unverifiable answer keeps the path", async () => {
  const files = ["same", "changed", "absent", "error500", "error500sha", "notjson", "nosha"].map((path) => ({ path, sha: HEX40 }));
  const live = {
    same: json(200, { sha: HEX40 }), changed: json(200, { sha: HEX64 }), absent: json(404, {}),
    error500: json(500, {}), error500sha: json(500, { sha: HEX40 }), notjson: new Response("<html>", { status: 200 }), nosha: json(200, { sha: null }),
  };
  const { kit, calls } = kitWith({ manifest: manifestOf({ version: 2, files }), live });
  const result = await createSiteCommitter(kit)(INPUT);
  assert.equal(result.filesDeleted, 1);
  assert.deepEqual(result.divergedPaths, ["changed", "error500", "error500sha", "notjson", "nosha"]);
  // Exactly: the current file, the one deletion, then the manifest; no stray entries.
  assert.deepEqual(treeBody(calls), {
    base_tree: "base-tree",
    tree: [
      { path: "index.html", mode: "100644", type: "blob", sha: "blob1" },
      { path: "same", mode: "100644", type: "blob", sha: null },
      { path: ".tovu/managed-files.json", mode: "100644", type: "blob", sha: "blob2" },
    ],
  });
});

test("a path in this export, or the manifest's own path, is never a deletion candidate", async () => {
  const files = [{ path: "index.html", sha: HEX40 }, { path: ".tovu/managed-files.json", sha: HEX40 }];
  const live = { "index.html": json(200, { sha: HEX40 }), ".tovu/managed-files.json": json(200, { sha: HEX40 }) };
  const { kit, calls } = kitWith({ manifest: manifestOf({ version: 2, files }), live });
  const result = await createSiteCommitter(kit)(INPUT);
  assert.deepEqual(liveReads(calls), []);
  assert.deepEqual([result.filesDeleted, result.divergedPaths], [0, []]);
});

test("manifest shape clauses one at a time: v2 needs files[], v1 needs version 1 AND string paths", async () => {
  const refused = "GitHub managed-manifest content did not match a recognized shape — cannot confirm which paths this adapter previously owned.";
  for (const value of [{ version: 3, paths: ["a"] }, { version: 3, files: [] }, { version: 2, paths: ["a"] }, { version: 1, files: [] }, { version: 1, paths: ["a", 1] }, { version: 2, files: [null] }, { version: 2, files: [{ path: 7 }] }, null]) {
    const { kit } = kitWith({ manifest: manifestOf(value) });
    assert.deepEqual(await createSiteCommitter(kit)(INPUT), { ok: false, code: "provider-error", message: refused }, JSON.stringify(value));
  }
  // A v1 manifest is read as paths only (no shas), even when it also carries a v2-looking files[].
  const { kit, calls } = kitWith({ manifest: manifestOf({ version: 1, paths: ["old"], files: [{ path: "old", sha: HEX40 }] }), live: { old: json(200, { sha: HEX40 }) } });
  const result = await createSiteCommitter(kit)(INPUT);
  assert.deepEqual(liveReads(calls), []);
  assert.deepEqual(result.divergedPaths, ["old"]);
});

test("hostile response shapes are refused with the specific message, never a TypeError", async () => {
  const cases = [
    [{ ref: json(200, { object: null }) }, "GitHub branch lookup response did not include a sha"],
    [{ ref: json(200, { object: { sha: 5 } }) }, "GitHub branch lookup response did not include a sha"],
    [{ manifest: json(200, { content: 5 }) }, "GitHub managed-manifest response did not include file content — cannot confirm which paths this adapter previously owned."],
  ];
  for (const [options, message] of cases) {
    const { kit } = kitWith(options);
    assert.deepEqual(await createSiteCommitter(kit)(INPUT), { ok: false, code: "provider-error", message }, message);
  }
});

test("a new branch: no base_tree, no parents, ref CREATED; a 422 on create is a provider error, not 'diverged'", async () => {
  const created = kitWith({ ref: json(404, {}) });
  const result = await createSiteCommitter(created.kit)({ ...INPUT, branch: "fresh" });
  assert.equal(result.ok, true);
  assert.equal(result.branchCreated, true);
  assert.equal("base_tree" in treeBody(created.calls), false);
  assert.deepEqual(JSON.parse(created.calls.find((c) => c.url === `${API}/git/commits`).body).parents, []);
  const refCall = created.calls.find((c) => c.url.startsWith(`${API}/git/refs`));
  assert.deepEqual([refCall.method, refCall.url, JSON.parse(refCall.body)], ["POST", `${API}/git/refs`, { ref: "refs/heads/fresh", sha: "c1" }]);

  const refused = kitWith({ ref: json(404, {}), refWrite: json(422, { message: "Reference already exists" }) });
  assert.deepEqual(await createSiteCommitter(refused.kit)({ ...INPUT, branch: "fresh" }), { ok: false, code: "provider-error", message: "Reference already exists" });
});

test("an update: 422 is 'diverged'; any other failure (500) is a provider error", async () => {
  const moved = kitWith({ refWrite: json(422, {}) });
  assert.equal((await createSiteCommitter(moved.kit)(INPUT)).code, "diverged");
  const refCall = moved.calls.find((c) => c.url.startsWith(`${API}/git/refs`));
  assert.deepEqual([refCall.method, refCall.url, JSON.parse(refCall.body)], ["PATCH", `${API}/git/refs/heads/main`, { sha: "c1" }]);
  const broken = kitWith({ refWrite: json(500, {}) });
  assert.deepEqual(await createSiteCommitter(broken.kit)(INPUT), { ok: false, code: "provider-error", message: "GitHub branch update failed (500)." });
});
