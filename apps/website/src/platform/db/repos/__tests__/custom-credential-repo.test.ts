import assert from "node:assert/strict";
import test from "node:test";
import { ensureVaultRepoFixture } from "./vault-repo.fixture.js";

import { createCustomCredential, updateCustomCredential, describeCredential, resolveCustomCredentialByLabel, isUniqueLabelViolation } from "#src/features/custom-credentials/store";
import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { CustomCredentialSetRecord } from "#src/features/custom-credentials/types";
import { seedWorkspaces } from "#src/platform/db/kernel/__tests__/content-seeds";
import { describeEachDialect } from "#src/platform/db/kernel/__tests__/dialect-matrix";
import { SqlCustomCredentialSetRepo } from "../custom-credential-repo.js";

/** Existing characterization suite now exercises Jini's vault-backed facade on both dialects.
 * The step is activated on disposable fixtures only; production migration registration is untouched.
 */

const WORKSPACE = "workspace-1";
const OTHER_WORKSPACE = "workspace-2";
const NOW = "2026-08-21T00:00:00.000Z";
const LATER = "2026-08-21T01:00:00.000Z";

function makeRecord(overrides: Partial<CustomCredentialSetRecord> = {}): CustomCredentialSetRecord {
  return {
    workspaceId: WORKSPACE,
    id: "cred-1",
    label: "name.com",
    category: "hosting",
    baseUrl: "https://api.name.com",
    // `[]`, never omitted — `CustomCredentialSetRecord.additionalHosts`'s own contract is "empty,
    // never null/undefined" (types.ts), so a fixture that skips this field is not a valid record.
    additionalHosts: [],
    sealed: { keyId: "k1", ciphertext: "Y2lwaGVy", nonce: "bm9uY2U=", alg: "aes-256-gcm" },
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describeEachDialect(
  "CustomCredentialSetRepoPort",
  { tables: ["workspaces"], make: (kernel) => ({ kernel, repo: new SqlCustomCredentialSetRepo(kernel) }) },
  (make) => {
    async function makeRepo() {
      const { kernel, repo } = make();
      await ensureVaultRepoFixture({ kernel });
      await seedWorkspaces(kernel, [WORKSPACE, OTHER_WORKSPACE]);
      return repo;
    }

    test("findById returns null when no row exists", async () => {
      assert.equal(await (await makeRepo()).findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
    });

    test("vault persistence retains safe hints, origin restrictions and username clears through the public store", async () => {
      const repo = await makeRepo();
      const keyring = new InMemoryKeyring();
      const sealer = new AesGcmSecretSealer(keyring);
      const deps = { repo, keyring, sealer, clock: { nowMs: () => Date.parse(NOW) }, idGen: { newId: () => "public-store" } };
      const created = await createCustomCredential(deps, { workspaceId: WORKSPACE, label: "original", category: "hosting",
        baseUrl: "https://api.name.com/v1", additionalHosts: ["https://other.example.com/path"],
        connection: { token: "real-custom-token-1234", username: "operator" } });
      const before = await repo.findById({ workspaceId: WORKSPACE, id: created.id });
      const metadataOnly = { ...deps, sealer: {
        open: async (): Promise<never> => { throw new Error("must not open"); },
        seal: async (): Promise<never> => { throw new Error("must not seal"); },
      } };
      const updated = await updateCustomCredential(metadataOnly, { workspaceId: WORKSPACE, id: created.id,
        label: "renamed", username: null, connection: { token: "" } });
      assert.deepEqual(updated.tokenHint, { length: 22, last4: "1234" });
      assert.deepEqual(await describeCredential(metadataOnly, { workspaceId: WORKSPACE, id: created.id }), updated);
      assert.deepEqual((await repo.findById({ workspaceId: WORKSPACE, id: created.id }))?.sealed, before?.sealed);
      const resolved = await resolveCustomCredentialByLabel(deps, { workspaceId: WORKSPACE, label: "renamed" });
      assert.deepEqual(resolved?.connection, { token: "real-custom-token-1234" });
      assert.deepEqual(resolved?.additionalHosts, ["https://other.example.com"]);
      assert.equal(resolved?.baseUrl, "https://api.name.com/v1");
    });

    test("insert then findById round-trips a record exactly", async () => {
      const repo = await makeRepo();
      const record = makeRecord();

      await repo.insert(record);

      assert.deepEqual(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), record);
    });

    test("insert then findById round-trips a non-empty additionalHosts array", async () => {
      const repo = await makeRepo();
      const record = makeRecord({ additionalHosts: ["https://api.machines.dev", "https://fly.io"] });

      await repo.insert(record);

      assert.deepEqual((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.additionalHosts, [
        "https://api.machines.dev",
        "https://fly.io",
      ]);
    });

    test("insert then findById round-trips an empty additionalHosts array back to []", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ additionalHosts: [] }));

      assert.deepEqual((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.additionalHosts, []);
    });

    test("insert then findById round-trips a saved username", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ username: "deploy-bot" }));

      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.username, "deploy-bot");
    });

    test("insert then findById omits `username` entirely (not `undefined`, not `\"\"`) when none was saved", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord());

      const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.equal(found && "username" in found, false);
    });

    test("insert rejects a duplicate label within the same workspace (raw UNIQUE violation, not swallowed)", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "name.com" }));

      await assert.rejects(
        () => repo.insert(makeRecord({ id: "cred-2", label: "name.com" })),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match((err as Error).message, /UNIQUE constraint failed|violates unique constraint/);
          assert.ok(isUniqueLabelViolation(err), "the store must recognise the violation to translate it");
          return true;
        }
      );
    });

    test("the same label is allowed again in a DIFFERENT workspace", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ workspaceId: WORKSPACE, id: "cred-1", label: "name.com" }));

      await repo.insert(makeRecord({ workspaceId: OTHER_WORKSPACE, id: "cred-2", label: "name.com" }));

      assert.equal((await repo.findById({ workspaceId: OTHER_WORKSPACE, id: "cred-2" }))?.label, "name.com");
    });

    test("update replaces every field of the targeted row", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ username: "old-user", additionalHosts: ["https://old.example"] }));

      await repo.update(
        makeRecord({
          label: "name.com-renamed",
          category: "ops",
          baseUrl: "https://api2.name.com",
          additionalHosts: ["https://new.example"],
          sealed: { keyId: "k2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" },
          updatedAt: LATER,
        })
      );

      const found = await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.equal(found?.label, "name.com-renamed");
      assert.equal(found?.category, "ops");
      assert.equal(found?.baseUrl, "https://api2.name.com");
      assert.deepEqual(found?.sealed, { keyId: "k2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" });
      assert.equal(found?.updatedAt, LATER);
      assert.deepEqual(found, makeRecord({
        label: "name.com-renamed", category: "ops", baseUrl: "https://api2.name.com",
        additionalHosts: ["https://new.example"],
        sealed: { keyId: "k2", ciphertext: "bmV3", nonce: "bm9uY2Uy", alg: "aes-256-gcm" },
        updatedAt: LATER,
      }));
      await repo.update(makeRecord({ additionalHosts: [], updatedAt: LATER }));
      assert.deepEqual(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), makeRecord({ updatedAt: LATER }));
    });

    test("update never crosses a workspace boundary", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ workspaceId: WORKSPACE, id: "cred-1", label: "mine" }));

      // Same id, but scoped to a workspace that never inserted it -- must not touch the real row.
      await repo.update(makeRecord({ workspaceId: OTHER_WORKSPACE, id: "cred-1", label: "should-not-apply" }));

      assert.equal((await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }))?.label, "mine");
    });

    test("listByWorkspace returns every row for a workspace, scoped away from another workspace's rows", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1", label: "a" }));
      await repo.insert(makeRecord({ id: "cred-2", label: "b" }));
      await repo.insert(makeRecord({ workspaceId: OTHER_WORKSPACE, id: "cred-3", label: "theirs" }));

      const rows = await repo.listByWorkspace({ workspaceId: WORKSPACE });

      assert.deepEqual(
        rows.map((r) => r.id).sort(),
        ["cred-1", "cred-2"]
      );
    });

    test("delete removes exactly the targeted row and is a silent no-op when it doesn't exist", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ id: "cred-1" }));
      await repo.insert(makeRecord({ id: "cred-2", label: "other" }));

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.deepEqual(
        (await repo.listByWorkspace({ workspaceId: WORKSPACE })).map((r) => r.id),
        ["cred-2"]
      );

      // idempotent no-op on a row that's already gone
      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });
      assert.deepEqual(
        (await repo.listByWorkspace({ workspaceId: WORKSPACE })).map((r) => r.id),
        ["cred-2"]
      );
    });

    test("delete never crosses a workspace boundary", async () => {
      const repo = await makeRepo();
      await repo.insert(makeRecord({ workspaceId: WORKSPACE, id: "cred-1", label: "mine" }));
      await repo.insert(makeRecord({ workspaceId: OTHER_WORKSPACE, id: "cred-1", label: "theirs" }));

      await repo.delete({ workspaceId: WORKSPACE, id: "cred-1" });

      assert.equal(await repo.findById({ workspaceId: WORKSPACE, id: "cred-1" }), null);
      assert.ok(await repo.findById({ workspaceId: OTHER_WORKSPACE, id: "cred-1" }), "the other workspace's row must survive");
    });
  }
);
