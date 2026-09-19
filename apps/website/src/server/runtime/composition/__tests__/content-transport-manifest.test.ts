/**
 * @file Task 2 of the content-transport (Publish Content) feature — proves
 * `installFirstPartyTransportTypes()` (`../content-transport-manifest.ts`) actually registers the
 * two contributors Task 2 delivers, and that it is idempotent (mirrors
 * `tool-contribution-registry.test.ts`'s identical "calling it twice leaves the registry in the same
 * state as calling it once" check for `installFirstPartyToolContributors`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import { installFirstPartyTransportTypes } from "../content-transport-manifest.js";
import { listContentTransportContributors, resetContentTransportContributorsForTests } from "#src/features/content-transport/type-registry";

test.beforeEach(() => {
  resetContentTransportContributorsForTests();
});

test("installFirstPartyTransportTypes registers exactly post and page", () => {
  installFirstPartyTransportTypes();
  assert.deepEqual(
    listContentTransportContributors().map((c) => c.entityType),
    ["post", "page"]
  );
});

test("installFirstPartyTransportTypes is idempotent — calling it twice leaves the registry in the same state as calling it once", () => {
  installFirstPartyTransportTypes();
  const once = listContentTransportContributors().map((c) => c.entityType);
  installFirstPartyTransportTypes();
  const twice = listContentTransportContributors().map((c) => c.entityType);
  assert.deepEqual(twice, once);
});
