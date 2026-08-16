import assert from "node:assert/strict";
import test from "node:test";

import { buildPublishCredentialAad } from "../aad";

/** @file `buildPublishCredentialAad` — the ONE format this table's rows are ever sealed/opened
 *  under, so this test locks the format's determinism and its sensitivity to each of its three
 *  scoping inputs (a change to any one must produce a different string, or that dimension would not
 *  actually be bound into the AAD). */

test("is deterministic — the same inputs always produce the same string", () => {
  const input = { workspaceId: "ws-1", providerId: "vercel" as const, id: "cred-1" };
  assert.equal(buildPublishCredentialAad(input), buildPublishCredentialAad(input));
});

test("differs when workspaceId differs", () => {
  const a = buildPublishCredentialAad({ workspaceId: "ws-1", providerId: "vercel", id: "cred-1" });
  const b = buildPublishCredentialAad({ workspaceId: "ws-2", providerId: "vercel", id: "cred-1" });
  assert.notEqual(a, b);
});

test("differs when providerId differs", () => {
  const a = buildPublishCredentialAad({ workspaceId: "ws-1", providerId: "vercel", id: "cred-1" });
  const b = buildPublishCredentialAad({ workspaceId: "ws-1", providerId: "netlify", id: "cred-1" });
  assert.notEqual(a, b);
});

test("differs when id differs", () => {
  const a = buildPublishCredentialAad({ workspaceId: "ws-1", providerId: "vercel", id: "cred-1" });
  const b = buildPublishCredentialAad({ workspaceId: "ws-1", providerId: "vercel", id: "cred-2" });
  assert.notEqual(a, b);
});
