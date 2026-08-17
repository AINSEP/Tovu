import assert from "node:assert/strict";
import test from "node:test";

import { buildVendorCredentialAad } from "../aad";

/** @file `buildVendorCredentialAad` — the ONE format this table's rows are ever sealed/opened
 *  under, so this test locks the format's determinism and its sensitivity to each of its three
 *  scoping inputs (a change to any one must produce a different string, or that dimension would not
 *  actually be bound into the AAD). Mirrors `publish-credentials/__tests__/aad.unit.test.ts`'s own
 *  shape, `providerId` swapped for `vendorId`. */

test("is deterministic — the same inputs always produce the same string", () => {
  const input = { workspaceId: "ws-1", vendorId: "github" as const, id: "cred-1" };
  assert.equal(buildVendorCredentialAad(input), buildVendorCredentialAad(input));
});

test("differs when workspaceId differs", () => {
  const a = buildVendorCredentialAad({ workspaceId: "ws-1", vendorId: "github", id: "cred-1" });
  const b = buildVendorCredentialAad({ workspaceId: "ws-2", vendorId: "github", id: "cred-1" });
  assert.notEqual(a, b);
});

test("differs when vendorId differs", () => {
  const a = buildVendorCredentialAad({ workspaceId: "ws-1", vendorId: "github", id: "cred-1" });
  const b = buildVendorCredentialAad({ workspaceId: "ws-1", vendorId: "gitlab", id: "cred-1" });
  assert.notEqual(a, b);
});

test("differs when id differs", () => {
  const a = buildVendorCredentialAad({ workspaceId: "ws-1", vendorId: "github", id: "cred-1" });
  const b = buildVendorCredentialAad({ workspaceId: "ws-1", vendorId: "github", id: "cred-2" });
  assert.notEqual(a, b);
});

test("differs from the OLD publish-credential-set AAD format for the same inputs — the whole point of a fresh v1, not a v2", () => {
  // Deliberately inlined rather than importing `buildPublishCredentialAad`: this test's only job is
  // to prove the STRING FORMAT itself changed, independent of whether the old function's own format
  // ever changes later.
  const oldStyle = `publish-credential-set:v1:ws-1:github-pages:cred-1`;
  const newStyle = buildVendorCredentialAad({ workspaceId: "ws-1", vendorId: "github", id: "cred-1" });
  assert.notEqual(oldStyle, newStyle);
});
