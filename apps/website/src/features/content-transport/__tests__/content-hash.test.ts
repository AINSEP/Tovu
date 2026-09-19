/**
 * @file Task 1 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §4, task 1.
 *
 * `contentHash()` is the property the whole feature's safety case rests on (plan §5, risk #1/#2/#3):
 * it is what lets an importer tell "this row is untouched since we last synced" from "someone edited
 * it on the live site" WITHOUT relying on `version` (which differs across two independently-running
 * databases even when the content is identical) or `updatedAt` (same problem, plus clock skew).
 *
 * Covers exactly the three properties the task table calls for:
 *  1. same content, different `version`/`updatedAt` (as if read from two different DBs) → equal hash
 *  2. changing any real content field → different hash
 *  3. a pinned snapshot of the algorithm's literal output, so a future change to the algorithm
 *     itself is a conscious `CONTENT_HASH_VERSION` bump, not a silent drift.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { CONTENT_HASH_VERSION, canonicalize, contentHash } from "../content-hash.js";

/** A representative "post-shaped" state — deliberately includes every field kind `canonicalize`
 *  has to handle: the always-excluded identity/bookkeeping fields, a nested JSON document
 *  (`bodyJson`, TipTap-shaped), a `null` field, and an absent (`undefined`) optional field. */
function fixtureState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    workspaceId: "22222222-2222-2222-2222-222222222222",
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
    title: "Hello World",
    slug: "hello-world",
    bodyJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hi" }] }] },
    status: "draft",
    kind: "post",
    bodyFormat: "doc",
    bodyHtml: null,
    ext: undefined,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Identity/bookkeeping fields never affect the hash
// ---------------------------------------------------------------------------

test("same content on two databases with different version/updatedAt (and different id/workspaceId) hashes equal", () => {
  const onDbA = fixtureState({
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    workspaceId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    version: 1,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const onDbB = fixtureState({
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    workspaceId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
    version: 47,
    updatedAt: "2026-09-18T12:34:56.000Z",
  });

  assert.equal(contentHash("post", onDbA), contentHash("post", onDbB));
});

test("an autosaveJson field (per-editor standing draft) never affects the hash even when present", () => {
  const withoutAutosave = fixtureState();
  const withAutosave = fixtureState({ autosaveJson: JSON.stringify({ bodyJson: { type: "doc", content: [] } }) });

  assert.equal(contentHash("post", withoutAutosave), contentHash("post", withAutosave));
});

// ---------------------------------------------------------------------------
// 2. Any real content field changes the hash
// ---------------------------------------------------------------------------

const CONTENT_FIELD_CHANGES: ReadonlyArray<{ field: string; changed: unknown }> = [
  { field: "title", changed: "Different Title" },
  { field: "slug", changed: "different-slug" },
  { field: "bodyJson", changed: { type: "doc", content: [] } },
  { field: "status", changed: "published" },
  { field: "kind", changed: "page" },
  { field: "bodyFormat", changed: "html" },
  { field: "bodyHtml", changed: "<p>hi</p>" },
  { field: "seoExtJson", changed: '{"metaTitle":"x"}' },
  { field: "ext", changed: { somePlugin: { flag: true } } },
  { field: "deletedAt", changed: "2026-02-01T00:00:00.000Z" },
  { field: "templateChoice", changed: "blog-post.html" },
  { field: "overridesThemePage", changed: true },
  { field: "memberAccessJson", changed: '{"visibility":"members"}' },
];

for (const { field, changed } of CONTENT_FIELD_CHANGES) {
  test(`changing '${field}' changes the hash`, () => {
    const baseline = fixtureState();
    const mutated = fixtureState({ [field]: changed });
    assert.notEqual(
      contentHash("post", baseline),
      contentHash("post", mutated),
      `expected changing '${field}' to change the content hash`
    );
  });
}

test("changing entityType alone (same state) changes the hash — the discriminator is part of the hashed identity", () => {
  const state = fixtureState();
  assert.notEqual(contentHash("post", state), contentHash("page", state));
});

// ---------------------------------------------------------------------------
// 3. Canonicalization contract: stable key order, no whitespace, explicit null for absent
// ---------------------------------------------------------------------------

test("canonicalize produces stable key order regardless of input property order", () => {
  const a = canonicalize("post", { b: 1, a: 2, c: 3 });
  const b = canonicalize("post", { c: 3, a: 2, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"entityType":"post","state":{"a":2,"b":1,"c":3}}');
});

test("canonicalize emits no whitespace", () => {
  const out = canonicalize("post", { a: 1 });
  assert.equal(/\s/.test(out), false);
});

test("canonicalize writes an explicit null for an undefined field rather than dropping the key", () => {
  const out = canonicalize("post", { a: undefined });
  assert.equal(out, '{"entityType":"post","state":{"a":null}}');
});

test("canonicalize sorts keys and nulls-out undefined recursively inside nested objects", () => {
  const out = canonicalize("post", { outer: { b: 1, a: undefined } });
  assert.equal(out, '{"entityType":"post","state":{"outer":{"a":null,"b":1}}}');
});

test("canonicalize excludes id, workspaceId, version, updatedAt, and autosaveJson", () => {
  const out = canonicalize("post", {
    id: "x",
    workspaceId: "y",
    version: 99,
    updatedAt: "z",
    autosaveJson: "w",
    title: "kept",
  });
  assert.equal(out, '{"entityType":"post","state":{"title":"kept"}}');
});

// ---------------------------------------------------------------------------
// 4. Snapshot pin — a change to the algorithm itself must be a deliberate version bump
// ---------------------------------------------------------------------------

test("CONTENT_HASH_VERSION is pinned at 1", () => {
  assert.equal(CONTENT_HASH_VERSION, 1);
});

test("contentHash output is pinned for a fixed fixture — a change here means the algorithm changed and CONTENT_HASH_VERSION must bump", () => {
  const pinned = fixtureState({
    id: "11111111-1111-1111-1111-111111111111",
    workspaceId: "22222222-2222-2222-2222-222222222222",
    version: 3,
    updatedAt: "2026-05-01T00:00:00.000Z",
  });
  assert.equal(contentHash("post", pinned), "b0eac00a251d3a8b6973e539141998515aecfc13a8fee165c3d572070b612309");
});
