/**
 * @file Task 2 of the publish-content (Publish Content) feature —
 * `ADS-memory/reports/2026-09-18-publish-feature-implementation-plan.md` §3/§4 task 2.
 *
 * Registry-mechanics contract tests, modeled directly on
 * `assistant/__tests__/tool-contribution-registry.test.ts`'s own "1. Registry mechanics" section —
 * same shape, same reason: `register*`/`list*`/`reset*ForTests`, replace-by-key on double
 * registration, and (the property that makes this the SAFE registry shape rather than the
 * append-only/read-once one `ToolRegistry`/`phaseRegistry` use — plan §3's own stated trap)
 * `listPublishContentContributors()` must be a FRESH read every call, so a contributor registered
 * after an earlier `list()` call is still seen by a later one.
 *
 * Deliberately does NOT test `contributePostPublish()`/`contributePagePublish()`'s real
 * pack/inspect/precheck/apply behavior — see `../post-publish-content.test.ts` for that. This file
 * only proves the registry itself.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPublishContentCatalog,
  listPublishContentContributors,
  PublishContentCatalogConfigurationError,
  registerPublishContentContributor,
  resetPublishContentContributorsForTests,
  type PublishContentDeps,
  type PublishContentContributor,
  type PublishContentHandler,
} from "../type-registry.js";

/** A trivial contributor for exercising the registry mechanism itself, independent of any real
 *  domain's business logic — mirrors `tool-contribution-registry.test.ts`'s `fakeContributor`. */
function fakeContributor(entityType: string, dependsOn: readonly string[] = []): PublishContentContributor {
  const handler: PublishContentHandler = {
    entityType,
    schemaVersion: 1,
    permission: "content.write",
    dependsOn,
    pack: async function* () {},
    inspect: async () => null,
    precheck: async () => null,
    apply: async () => ({ changeSetId: `fake-${entityType}` }),
  };
  return { entityType, dependsOn, build: () => handler };
}

test.beforeEach(() => {
  resetPublishContentContributorsForTests();
});

// ---------------------------------------------------------------------------
// 1. Registry mechanics — register/list/reset, fresh-read, replace-by-key idempotency
// ---------------------------------------------------------------------------

test("a freshly reset registry has no contributors", () => {
  assert.deepEqual(listPublishContentContributors(), []);
});

test("registerPublishContentContributor appends in call order", () => {
  registerPublishContentContributor(fakeContributor("post"));
  registerPublishContentContributor(fakeContributor("page"));
  assert.deepEqual(listPublishContentContributors().map((c) => c.entityType), ["post", "page"]);
});

test("a contributor registered AFTER the first list() call is seen by a SECOND list() call — fresh read, never cached", () => {
  registerPublishContentContributor(fakeContributor("post"));
  const first = listPublishContentContributors();
  assert.deepEqual(first.map((c) => c.entityType), ["post"]);

  // Registered after `first` was already read out — a SECOND, later call must see it. (Whether
  // `first`'s own array reference also reflects it is deliberately unspecified — like its sibling
  // registries, `listPublishContentContributors()` promises a correct fresh read on every call,
  // not defensive-copy isolation between calls.)
  registerPublishContentContributor(fakeContributor("page"));
  const second = listPublishContentContributors();
  assert.deepEqual(second.map((c) => c.entityType), ["post", "page"]);
});

test("re-registering the same entityType REPLACES the earlier entry in place, not appends", () => {
  registerPublishContentContributor(fakeContributor("post"));
  registerPublishContentContributor(fakeContributor("page"));
  const replacement = fakeContributor("post");
  registerPublishContentContributor(replacement); // replaces "post", position preserved

  const contributors = listPublishContentContributors();
  assert.deepEqual(contributors.map((c) => c.entityType), ["post", "page"], "entityType count/order must not change on replacement");
  assert.equal(contributors[0], replacement, "the replaced entry must be the NEW registration, not the old one");
});

test("resetPublishContentContributorsForTests clears every registration", () => {
  registerPublishContentContributor(fakeContributor("post"));
  registerPublishContentContributor(fakeContributor("page"));
  assert.equal(listPublishContentContributors().length, 2);

  resetPublishContentContributorsForTests();

  assert.deepEqual(listPublishContentContributors(), []);
});

test("buildPublishContentCatalog rejects a dependency on an unregistered type before building handlers", () => {
  let buildCalls = 0;
  const contributor = fakeContributor("post", ["media"]);
  registerPublishContentContributor({ ...contributor, build: (deps) => (buildCalls++, contributor.build(deps)) });

  assert.throws(
    () => buildPublishContentCatalog({} as PublishContentDeps),
    (error: unknown) =>
      error instanceof PublishContentCatalogConfigurationError &&
      error.message === "publish-content type 'post' depends on unregistered type 'media'"
  );
  assert.equal(buildCalls, 0, "invalid ordering must fail before any handler is built");
});

test("buildPublishContentCatalog rejects dependency cycles instead of inventing an apply order", () => {
  registerPublishContentContributor(fakeContributor("a", ["b"]));
  registerPublishContentContributor(fakeContributor("b", ["a"]));

  assert.throws(
    () => buildPublishContentCatalog({} as PublishContentDeps),
    (error: unknown) =>
      error instanceof PublishContentCatalogConfigurationError &&
      error.message === "publish-content dependency cycle among registered types: a, b"
  );
});

test("buildPublishContentCatalog derives deterministic apply order without reordering handlers", () => {
  registerPublishContentContributor(fakeContributor("post", ["media"]));
  registerPublishContentContributor(fakeContributor("media"));

  const catalog = buildPublishContentCatalog({} as PublishContentDeps);

  assert.deepEqual(catalog.applyOrder, ["media", "post"]);
  assert.deepEqual(catalog.handlers.map((handler) => handler.entityType), ["post", "media"]);
});
