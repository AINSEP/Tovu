/**
 * @file Task 2 of the content-transport (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §3/§4 task 2.
 *
 * Registry-mechanics contract tests, modeled directly on
 * `assistant/__tests__/tool-contribution-registry.test.ts`'s own "1. Registry mechanics" section —
 * same shape, same reason: `register*`/`list*`/`reset*ForTests`, replace-by-key on double
 * registration, and (the property that makes this the SAFE registry shape rather than the
 * append-only/read-once one `ToolRegistry`/`phaseRegistry` use — plan §3's own stated trap)
 * `listContentTransportContributors()` must be a FRESH read every call, so a contributor registered
 * after an earlier `list()` call is still seen by a later one.
 *
 * Deliberately does NOT test `contributePostTransport()`/`contributePageTransport()`'s real
 * pack/inspect/precheck/apply behavior — see `../post-content-transport.test.ts` for that. This file
 * only proves the registry itself.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  listContentTransportContributors,
  registerContentTransportContributor,
  resetContentTransportContributorsForTests,
  type ContentTransportContributor,
  type ContentTransportHandler,
} from "../type-registry.js";

/** A trivial contributor for exercising the registry mechanism itself, independent of any real
 *  domain's business logic — mirrors `tool-contribution-registry.test.ts`'s `fakeContributor`. */
function fakeContributor(entityType: string): ContentTransportContributor {
  const handler: ContentTransportHandler = {
    entityType,
    permission: "content.write",
    dependsOn: [],
    pack: async function* () {},
    inspect: async () => null,
    precheck: async () => null,
    apply: async () => ({ changeSetId: `fake-${entityType}` }),
  };
  return { entityType, dependsOn: [], build: () => handler };
}

test.beforeEach(() => {
  resetContentTransportContributorsForTests();
});

// ---------------------------------------------------------------------------
// 1. Registry mechanics — register/list/reset, fresh-read, replace-by-key idempotency
// ---------------------------------------------------------------------------

test("a freshly reset registry has no contributors", () => {
  assert.deepEqual(listContentTransportContributors(), []);
});

test("registerContentTransportContributor appends in call order", () => {
  registerContentTransportContributor(fakeContributor("post"));
  registerContentTransportContributor(fakeContributor("page"));
  assert.deepEqual(listContentTransportContributors().map((c) => c.entityType), ["post", "page"]);
});

test("a contributor registered AFTER the first list() call is seen by a SECOND list() call — fresh read, never cached", () => {
  registerContentTransportContributor(fakeContributor("post"));
  const first = listContentTransportContributors();
  assert.deepEqual(first.map((c) => c.entityType), ["post"]);

  // Registered after `first` was already read out — a SECOND, later call must see it. (Whether
  // `first`'s own array reference also reflects it is deliberately unspecified — like its sibling
  // registries, `listContentTransportContributors()` promises a correct fresh read on every call,
  // not defensive-copy isolation between calls.)
  registerContentTransportContributor(fakeContributor("page"));
  const second = listContentTransportContributors();
  assert.deepEqual(second.map((c) => c.entityType), ["post", "page"]);
});

test("re-registering the same entityType REPLACES the earlier entry in place, not appends", () => {
  registerContentTransportContributor(fakeContributor("post"));
  registerContentTransportContributor(fakeContributor("page"));
  const replacement = fakeContributor("post");
  registerContentTransportContributor(replacement); // replaces "post", position preserved

  const contributors = listContentTransportContributors();
  assert.deepEqual(contributors.map((c) => c.entityType), ["post", "page"], "entityType count/order must not change on replacement");
  assert.equal(contributors[0], replacement, "the replaced entry must be the NEW registration, not the old one");
});

test("resetContentTransportContributorsForTests clears every registration", () => {
  registerContentTransportContributor(fakeContributor("post"));
  registerContentTransportContributor(fakeContributor("page"));
  assert.equal(listContentTransportContributors().length, 2);

  resetContentTransportContributorsForTests();

  assert.deepEqual(listContentTransportContributors(), []);
});
