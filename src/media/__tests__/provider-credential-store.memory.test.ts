import assert from "node:assert/strict";
import test from "node:test";

import type { UUID } from "@jini-ai/cms/core";
import { InMemoryMediaProviderCredentialRepo } from "../provider-credential-store.memory.js";
import type { MediaProviderCredentialRecord } from "../provider-credential-store.js";

/**
 * @file Direct `MediaProviderCredentialRepoPort` contract coverage for
 * `InMemoryMediaProviderCredentialRepo`'s `upsert`/`deleteByProviderIds` primitives.
 *
 * `provider-credential-store.test.ts` covers the higher-level `saveMediaProviderCredentials`
 * service, which deliberately never calls these two methods directly — it round-trips everything
 * through `replaceWorkspace` to close the read-before-write staleness window that test file's own
 * header documents. That leaves `upsert`/`deleteByProviderIds` with no direct test even though
 * they are real, publicly-committed `MediaProviderCredentialRepoPort` methods (the SQLite adapter
 * implements them too) — this suite exercises them on their own, including the port's own
 * documented idempotency invariant ("ids with no row are skipped, not an error").
 */

const WORKSPACE = "workspace-1" as UUID;
const OTHER_WORKSPACE = "workspace-2" as UUID;

function makeRecord(overrides: Partial<MediaProviderCredentialRecord> = {}): MediaProviderCredentialRecord {
  return {
    workspaceId: WORKSPACE,
    providerId: "openai",
    baseUrl: null,
    model: null,
    sealed: null,
    keyTail: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
    ...overrides,
  };
}

test("upsert inserts a row that listByWorkspaceId then returns", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();

  await repo.upsert(makeRecord());

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.providerId, "openai");
});

test("upsert on an existing (workspaceId, providerId) pair replaces the row rather than adding a second one", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();
  await repo.upsert(makeRecord({ baseUrl: "https://api.openai.com/v1" }));

  await repo.upsert(makeRecord({ baseUrl: "https://proxy.example.com/v1" }));

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.baseUrl, "https://proxy.example.com/v1");
});

test("upsert scopes rows by workspace: the same providerId in two workspaces stays two rows", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();
  await repo.upsert(makeRecord({ workspaceId: WORKSPACE, baseUrl: "https://w1.example.com" }));
  await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, baseUrl: "https://w2.example.com" }));

  assert.deepEqual(
    (await repo.listByWorkspaceId(WORKSPACE)).map((r) => r.baseUrl),
    ["https://w1.example.com"]
  );
  assert.deepEqual(
    (await repo.listByWorkspaceId(OTHER_WORKSPACE)).map((r) => r.baseUrl),
    ["https://w2.example.com"]
  );
});

test("deleteByProviderIds removes only the named providers, leaving the rest of the workspace untouched", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();
  await repo.upsert(makeRecord({ providerId: "openai" }));
  await repo.upsert(makeRecord({ providerId: "grok" }));

  await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["openai"] });

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(
    rows.map((r) => r.providerId),
    ["grok"]
  );
});

test("deleteByProviderIds is idempotent: a providerId with no row is skipped, not an error", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();
  await repo.upsert(makeRecord({ providerId: "openai" }));

  // Contract doc comment: "ids with no row are skipped, not an error." Must not throw, and must
  // not touch the row that does exist.
  await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["does-not-exist"] });

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.deepEqual(
    rows.map((r) => r.providerId),
    ["openai"]
  );
});

test("deleteByProviderIds with an empty list is a no-op", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();
  await repo.upsert(makeRecord({ providerId: "openai" }));

  await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: [] });

  const rows = await repo.listByWorkspaceId(WORKSPACE);
  assert.equal(rows.length, 1);
});

test("deleteByProviderIds only deletes within the given workspace, never a same-providerId row in another workspace", async () => {
  const repo = new InMemoryMediaProviderCredentialRepo();
  await repo.upsert(makeRecord({ workspaceId: WORKSPACE, providerId: "openai" }));
  await repo.upsert(makeRecord({ workspaceId: OTHER_WORKSPACE, providerId: "openai" }));

  await repo.deleteByProviderIds({ workspaceId: WORKSPACE, providerIds: ["openai"] });

  assert.deepEqual(await repo.listByWorkspaceId(WORKSPACE), []);
  assert.equal((await repo.listByWorkspaceId(OTHER_WORKSPACE)).length, 1);
});
