import assert from "node:assert/strict";
import test from "node:test";
import type { VaultRecord } from "@jini-ai/core/contracts/vault";

import { credentialViewFields, credentialWriteFields } from "../credential-store-fields.js";
import { listDuplicateResourceHandlers, registerDuplicateResourceHandler, resetDuplicateResourceHandlersForTests } from "../duplicate-resource-registry.js";
import { SITE_GUIDE_POINTER } from "../site-guide-pointer.js";
import { isTrashed } from "@jini-ai/core/contracts/site/soft-delete";

/**
 * @file L11 "unmeasured" files — no importing test was found by the lane's scan. These pin their
 * whole contracts: the trash predicate, the credential presence/write shapes, the duplicate-handler
 * registry's replace-by-resource rule, and the site-guide pointer's tool routing.
 */

test("isTrashed is true only for a present, non-null deletedAt stamp", () => {
  assert.equal(isTrashed({ deletedAt: "2026-10-25T00:00:00Z" }), true);
  assert.equal(isTrashed({ deletedAt: "" }), true, "an empty stamp is still a stamp");
  assert.equal(isTrashed({ deletedAt: null }), false);
  assert.equal(isTrashed({ deletedAt: undefined }), false);
  assert.equal(isTrashed({}), false);
});

const record = (overrides: Partial<VaultRecord> = {}) => ({
  id: "v-1", revision: 4, label: "Main", updatedAt: "2026-10-25T00:00:00Z",
  sealed: { keyId: "k", ciphertext: "c", nonce: "n", alg: "aes-256-gcm" }, ...overrides,
}) as unknown as VaultRecord;

test("credential view fields report presence from the sealed envelope and mask only a real last4", () => {
  assert.deepEqual(credentialViewFields({ record: record(), tokenHint: { length: 40, last4: "wxyz" } }),
    { isSet: true, masked: "••••wxyz", tokenHint: { length: 40, last4: "wxyz" }, updatedAt: "2026-10-25T00:00:00Z" });
  assert.deepEqual(credentialViewFields({ record: record({ sealed: null } as never) }), { isSet: false, masked: null, tokenHint: null, updatedAt: "2026-10-25T00:00:00Z" });
  assert.deepEqual(credentialViewFields({ record: record({ sealed: undefined } as never) }).isSet, false);
  assert.deepEqual(credentialViewFields({ record: null }), { isSet: false, masked: null, tokenHint: null, updatedAt: null });
  assert.equal(credentialViewFields({ record: record(), tokenHint: { length: 3, last4: null } as never }).masked, null);
  assert.equal(credentialViewFields({ record: record(), tokenHint: { length: 3, last4: "" } as never }).masked, null);
});

test("credential write fields: a first save seals the key, an omitted key preserves the envelope, an existing row is CAS-bound", () => {
  assert.deepEqual(credentialWriteFields({ existing: null, apiKey: "sk-1" }), { expectedRevision: null, label: "", payload: { apiKey: "sk-1" }, hintToken: "sk-1" });
  assert.deepEqual(credentialWriteFields({ existing: null, apiKey: undefined }), { expectedRevision: null, label: "", payload: null });
  assert.deepEqual(credentialWriteFields({ existing: record(), apiKey: undefined }), { id: "v-1", expectedRevision: 4, label: "Main", payload: undefined });
  assert.deepEqual(credentialWriteFields({ existing: record(), apiKey: "sk-2" }), { id: "v-1", expectedRevision: 4, label: "Main", payload: { apiKey: "sk-2" }, hintToken: "sk-2" });
  assert.equal(Object.hasOwn(credentialWriteFields({ existing: record(), apiKey: undefined }), "hintToken"), false);
});

test("duplicate handlers register in order and a second contributor for one resource replaces the first in place", (t) => {
  t.after(() => resetDuplicateResourceHandlersForTests());
  resetDuplicateResourceHandlersForTests();
  const make = (resource: string, permission: string) => ({ resource, build: () => ({ permission, duplicate: async () => ({}) }) });
  const post = make("post", "a"), page = make("page", "b"), theme = make("theme", "c"), post2 = make("post", "d");
  registerDuplicateResourceHandler(post);
  registerDuplicateResourceHandler(page);
  registerDuplicateResourceHandler(theme);
  registerDuplicateResourceHandler(post2);
  assert.deepEqual(listDuplicateResourceHandlers(), [post2, page, theme]);
  resetDuplicateResourceHandlersForTests();
  assert.deepEqual(listDuplicateResourceHandlers(), []);
});

test("the site-guide pointer routes agents to site_guide through the advertised direct or delegated transport", () => {
  for (const fragment of ['site_guide({"operation":"overview"})', 'site_guide({"operation":"explain","topic":"<topic id from overview>"})',
    'Call site_guide directly if exposed, otherwise use the delegated executor in your tool list.', "Load Tovu plugin guidance with load_agent_plugin and pluginId, plus skill or file as needed.", "never call cards boxes"]) {
    assert.ok(SITE_GUIDE_POINTER.includes(fragment), fragment);
  }
  assert.ok(SITE_GUIDE_POINTER.endsWith(" "), "the pointer is concatenated into a larger prompt and keeps its trailing separator");
});

test("W10–12 site work is saved, attachments are promoted and handback reports verified state", () => {
  for (const rule of ["Save requested site work using the site’s tools.", "Preview a draft by entry ID.", "Use available browser widths for actual visual checks and report those widths.", "A public-route screenshot checks only the page served at that address.", "promote the chat attachment to Media", "Use its saved public reference.", "use empty alt text for decoration", "Preview the draft by entry ID.", "draft, scheduled, published here or verified live", "how to undo it when a matching recorded change exists", "Name unfinished checks and failed items plainly."]) {
    assert.ok(SITE_GUIDE_POINTER.includes(rule), `site handback must state: ${rule}`);
  }
});
