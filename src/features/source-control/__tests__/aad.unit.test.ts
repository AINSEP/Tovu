import assert from "node:assert/strict";
import test from "node:test";

import { buildSourceControlCredentialAad } from "../aad";

/** @file `buildSourceControlCredentialAad` — the ONE format this table's rows are ever sealed/opened
 *  under, mirroring `publish-credentials/__tests__/aad.unit.test.ts` exactly: locks the format's
 *  determinism and its sensitivity to each of its three scoping inputs (a change to any one must
 *  produce a different string, or that dimension would not actually be bound into the AAD). */

test("is deterministic — the same inputs always produce the same string", () => {
  const input = { workspaceId: "ws-1", providerId: "github" as const, id: "cred-1" };
  assert.equal(buildSourceControlCredentialAad(input), buildSourceControlCredentialAad(input));
});

test("differs when workspaceId differs", () => {
  const a = buildSourceControlCredentialAad({ workspaceId: "ws-1", providerId: "github", id: "cred-1" });
  const b = buildSourceControlCredentialAad({ workspaceId: "ws-2", providerId: "github", id: "cred-1" });
  assert.notEqual(a, b);
});

test("differs when providerId differs", () => {
  const a = buildSourceControlCredentialAad({ workspaceId: "ws-1", providerId: "github", id: "cred-1" });
  const b = buildSourceControlCredentialAad({ workspaceId: "ws-1", providerId: "gitlab", id: "cred-1" });
  assert.notEqual(a, b);
});

test("differs when id differs", () => {
  const a = buildSourceControlCredentialAad({ workspaceId: "ws-1", providerId: "github", id: "cred-1" });
  const b = buildSourceControlCredentialAad({ workspaceId: "ws-1", providerId: "github", id: "cred-2" });
  assert.notEqual(a, b);
});

test("uses the versioned source-control-credential-set:v1 format, not the sibling publish-credential-set format", () => {
  // The two sealed-secret tables in this codebase (`publish_credential_sets`,
  // `source_control_credential_sets`) share the same AES-GCM sealer/keyring instances app-wide, so
  // their AAD PREFIXES must differ — otherwise a row from one table could pass this format check
  // for the other. This pins the exact string, not just "is non-empty".
  const aad = buildSourceControlCredentialAad({ workspaceId: "ws-1", providerId: "github", id: "cred-1" });
  assert.equal(aad, "source-control-credential-set:v1:ws-1:github:cred-1");
});
