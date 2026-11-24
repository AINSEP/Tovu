import assert from "node:assert/strict";
import test from "node:test";
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
