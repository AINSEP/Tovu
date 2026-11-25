import assert from "node:assert/strict";
import test from "node:test";
import { AesGcmSecretSealer } from "@jini-ai/platform/secrets";
import { FixedSiteKeyKeyring } from "#src/features/webhooks/keyring.env";
import { composeSiteSavedKeys } from "#src/server/runtime/composition/site-portability";

/** The password AAD bytes are persisted inside every existing share's sealed password, so the host's
 * domain string and the tuple layout must never change: a changed byte makes old exports unrevealable. */
test("the host binding opens a sealed share password with the exact historical AAD bytes", async () => {
  const seen: { sealed?: unknown; aad?: string }[] = [];
  const sealer = { open: async (required: { sealed: unknown }, optional: { aad?: string } = {}) => { seen.push({ sealed: required.sealed, aad: optional.aad }); return "secret-password"; } };
  const keys = composeSiteSavedKeys({ workspaceId: "ws", sealer: sealer as never });
  const sealedPassword = { v: 1 } as never;
  const revealed = await keys.reveal({ sealedPassword, shareId: "share-1", workspaceId: "ws" });
  assert.deepEqual(revealed, { password: "secret-password" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.aad, '["tovu-share-password",1,"ws","share-1"]');
  assert.equal(seen[0]!.sealed, sealedPassword);
});

test("separator characters in ids cannot alias a different identity tuple", async () => {
  const aads: string[] = [];
  const sealer = { open: async (_required: unknown, optional: { aad?: string } = {}) => { aads.push(optional.aad!); return "p"; } };
  const keys = composeSiteSavedKeys({ workspaceId: 'a","b', sealer: sealer as never });
  await keys.reveal({ sealedPassword: {} as never, shareId: "c", workspaceId: 'a","b' });
  assert.equal(aads[0], JSON.stringify(["tovu-share-password", 1, 'a","b', "c"]));
});

/** A password sealed BEFORE the saved-keys code moved into `@jini-ai/devops/backup/site/saved-keys`. The fakes above
 * only record the AAD string they are handed and return a canned password, so they would stay green if the real
 * bytes drifted. This one is authenticated by real AES-256-GCM: a wrong AAD byte fails the GCM tag.
 *
 * Fixture provenance: produced once by the pre-move `apps/website/src/features/site-backup/saved-keys.ts`
 * (`git show origin/integ/merge-21-2026-11-24:apps/website/src/features/site-backup/saved-keys.ts`, the file's
 * own `passwordAad` built the AAD, which `reveal` passes to `sealer.open`). The sealed blob was created with
 * `AesGcmSecretSealer` over `FixedSiteKeyKeyring({ hex: "11".repeat(32) })` (key id `v1`), a fixed 12-byte IV of
 * 0x07 so the literal is reproducible, plaintext `historical-share-password`, and AAD
 * `["tovu-share-password",1,"ws","share-1"]`; the pre-move `createSiteSavedKeys(...).reveal` was then run on it
 * and returned `{ password: "historical-share-password" }` before the blob was copied here. */
const HISTORICAL_SEALED_PASSWORD = { keyId: "v1", ciphertext: "opo1+Yudj5Qkel49Mi/bMQo+QdwdR8FaJleTdKWYA1inipStplTcf6E=", nonce: "BwcHBwcHBwcHBwcH", alg: "aes-256-gcm" } as const;

function realBinding() {
  const sealer = new AesGcmSecretSealer({ keyring: new FixedSiteKeyKeyring({ hex: "11".repeat(32) }) });
  return composeSiteSavedKeys({ workspaceId: "ws", sealer });
}

test("a password sealed by the pre-move implementation still decrypts through the production binding", async () => {
  const revealed = await realBinding().reveal({ sealedPassword: HISTORICAL_SEALED_PASSWORD as never, shareId: "share-1", workspaceId: "ws" });
  assert.deepEqual(revealed, { password: "historical-share-password" });
});

test("the historical blob is bound to its share: another share id fails authentication instead of revealing", async () => {
  await assert.rejects(realBinding().reveal({ sealedPassword: HISTORICAL_SEALED_PASSWORD as never, shareId: "share-2", workspaceId: "ws" }));
});
