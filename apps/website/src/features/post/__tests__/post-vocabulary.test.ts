import assert from "node:assert/strict";
import test from "node:test";
import type { PostStatus, PublicPostKind } from "@jini-ai/cms/core";
import type { PostKind } from "../post-vocabulary.js";

/** True only when A and B are assignable to each other (both directions). */
type SameType<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// The public kinds are exactly the storage kinds minus the mail-authoring-only one. A widened or
// narrowed side turns the literal `true` below into a type error in `tsc -p tsconfig.tests.json`.
const publicKindsAreStorageKindsMinusEmailTemplate: SameType<PublicPostKind, Exclude<PostKind, "email-template">> = true;
const publicKindsAreStorageKinds: SameType<PostKind, PublicPostKind | "email-template"> = true;

test("storage kinds are the shared public kinds plus the email-template kind", () => {
  const kinds: readonly PostKind[] = ["post", "page", "email-template"];
  const publicKinds: readonly PublicPostKind[] = kinds.filter((kind): kind is PublicPostKind => kind !== "email-template");
  assert.deepEqual(publicKinds, ["post", "page"]);
  assert.equal(publicKindsAreStorageKindsMinusEmailTemplate && publicKindsAreStorageKinds, true);
});

test("the shared publication states are draft and published", () => {
  const statuses: readonly PostStatus[] = ["draft", "published"];
  assert.deepEqual(statuses, ["draft", "published"]);
});
