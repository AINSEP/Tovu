import assert from "node:assert/strict";
import test from "node:test";
import type { VaultRecord } from "@jini-ai/platform/secrets/credential-sets";

import { credentialViewFields, credentialWriteFields } from "../credential-store-fields.js";
import { listDuplicateResourceHandlers, registerDuplicateResourceHandler, resetDuplicateResourceHandlersForTests } from "../duplicate-resource-registry.js";
import { SITE_GUIDE_POINTER } from "../site-guide-pointer.js";
import { isTrashed } from "../../contracts/core/soft-delete.js";

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

test("the site-guide pointer routes agents to site_guide directly and through the delegated read-only proxy", () => {
  for (const fragment of ['site_guide({"operation":"overview"})', 'site_guide({"operation":"explain","topic":"<topic id from overview>"})',
    'execute_readonly_delegated_tool with toolId "site_guide"', "search_tools", "never call cards boxes"]) {
    assert.ok(SITE_GUIDE_POINTER.includes(fragment), fragment);
  }
  assert.ok(SITE_GUIDE_POINTER.endsWith(" "), "the pointer is concatenated into a larger prompt and keeps its trailing separator");
});
