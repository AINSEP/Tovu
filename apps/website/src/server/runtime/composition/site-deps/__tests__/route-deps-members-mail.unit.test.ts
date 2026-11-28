import assert from "node:assert/strict";
import test from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { routeDepsMailFormsNewsletter } from "../route-deps-members-mail.js";

/**
 * @file `routeDepsMailFormsNewsletter`'s `formCollectionProviders`: the Forms collection registry is
 * read late, through the getter the composition root hands in, so the routes see the registry the
 * getter returns when they ask, not one captured when the route deps were assembled.
 */

type Required = Parameters<typeof routeDepsMailFormsNewsletter>[0];
type Registry = ReturnType<Required["formCollectionProviders"]>;

test("formCollectionProviders asks the injected getter at call time and returns the registry it gives then", async t => {
  const kernel = contentKernel({ store: openContentDb(":memory:") });
  t.after(() => kernel.close());
  const registries = [{ marker: "registry-a" }, { marker: "registry-b" }] as unknown as Registry[];
  let reads = 0;
  const deps = routeDepsMailFormsNewsletter({
    kernel, clock: { nowMs: () => 0, nowIso: () => "2031-02-03T04:05:06.000Z" }, newsletterKeyring: {}, trash: {}, formSubmissionRepo: {},
    formCollectionProviders: () => registries[reads++],
  } as unknown as Required);
  assert.equal(reads, 0, "assembling the route deps reads no registry");
  const read = deps.formCollectionProviders;
  assert.notEqual(read, undefined, "the Forms routes receive a registry getter");
  assert.equal(read!(), registries[0]);
  assert.equal(read!(), registries[1]);
  assert.equal(reads, 2);
});
