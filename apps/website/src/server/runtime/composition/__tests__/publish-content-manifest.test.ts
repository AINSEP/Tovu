/**
 * @file Task 2 of the publish-content (Publish Content) feature — proves
 * `installFirstPartyPublishContentTypes()` (`../publish-content-manifest.ts`) actually registers the
 * two contributors Task 2 delivers, and that it is idempotent (mirrors
 * `tool-contribution-registry.test.ts`'s identical "calling it twice leaves the registry in the same
 * state as calling it once" check for `installFirstPartyToolContributors`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { installFirstPartyPublishContentTypes } from "../publish-content-manifest.js";
import { listPublishContentContributors, resetPublishContentContributorsForTests } from "#src/features/publish-content/type-registry";

test.beforeEach(() => {
  resetPublishContentContributorsForTests();
});

test("installFirstPartyPublishContentTypes registers exactly post and page", () => {
  installFirstPartyPublishContentTypes();
  assert.deepEqual(
    listPublishContentContributors().map((c) => c.entityType),
    ["post", "page"]
  );
});

test("installFirstPartyPublishContentTypes is idempotent — calling it twice leaves the registry in the same state as calling it once", () => {
  installFirstPartyPublishContentTypes();
  const once = listPublishContentContributors().map((c) => c.entityType);
  installFirstPartyPublishContentTypes();
  const twice = listPublishContentContributors().map((c) => c.entityType);
  assert.deepEqual(twice, once);
});
