import assert from "node:assert/strict";
import test from "node:test";

import { VaultError } from "@jini-ai/platform/secrets/credential-sets";
import { authorizeDestinationVaultContext } from "../destination-store.js";

/**
 * @file The sealed destination's vault access check, one clause at a time (L7 Stryker: every
 * `false`/`&&` mutant of this guard survived). Each refusal breaks ONLY one clause of the valid
 * context and must be the vault's `context` refusal, not some other error.
 */

const VALID = { workspaceId: "ws-1", kind: "database-destination", ownerKey: "tovu", principalId: null } as const;

test("the site-wide Tovu database-destination context is allowed", async () => {
  assert.equal(await authorizeDestinationVaultContext({ context: VALID }), undefined);
});

for (const [label, context] of [
  ["another vault kind", { ...VALID, kind: "publish-credential" }],
  ["another owner key", { ...VALID, ownerKey: "plugin:evil" }],
  ["a per-principal context", { ...VALID, principalId: "user-1" }],
  ["an empty-string principal (not null)", { ...VALID, principalId: "" }],
] as const) {
  test(`${label} is refused with the vault 'context' code`, async () => {
    await assert.rejects(authorizeDestinationVaultContext({ context }), (error: unknown) => {
      assert.ok(error instanceof VaultError);
      assert.equal(error.code, "context");
      return true;
    });
  });
}
