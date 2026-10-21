import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryKeyring } from "../keyring.memory.js";

test("InMemoryKeyring reports the default v1 key id and a caller-chosen key id", async () => {
  assert.deepEqual(await new InMemoryKeyring().activeKey(), { keyId: "v1" });
  assert.deepEqual(await new InMemoryKeyring("v7").activeKey(), { keyId: "v7" });
});

test("InMemoryKeyring derives deterministic 32-byte signing secrets that vary by subscription and version", async () => {
  const keyring = new InMemoryKeyring();
  const input = { workspaceId: "ws-1", subscriptionId: "sub-1", version: 1 };
  const first = await keyring.deriveSigningSecret(input);

  assert.equal(first.byteLength, 32);
  assert.deepEqual(await keyring.deriveSigningSecret(input), first);
  assert.notDeepEqual(await keyring.deriveSigningSecret({ ...input, version: 2 }), first);
  assert.notDeepEqual(await keyring.deriveSigningSecret({ ...input, subscriptionId: "sub-2" }), first);
});

test("InMemoryKeyring purpose derivation is stable per instance, separated by purpose/info, and isolated across instances", async () => {
  const keyring = new InMemoryKeyring();
  const input = { workspaceId: "ws-1", purpose: "secrets-vault", info: "row-1" };
  const first = await keyring.derive(input);

  assert.ok(first.byteLength > 0);
  assert.deepEqual(await keyring.derive(input), first);
  assert.notDeepEqual(await keyring.derive({ ...input, purpose: "other" }), first);
  assert.notDeepEqual(await keyring.derive({ ...input, info: "row-2" }), first);
  assert.notDeepEqual(await new InMemoryKeyring().derive(input), first);
});
