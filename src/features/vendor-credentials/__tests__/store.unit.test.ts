import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../../integrations/keyring.memory";
import type { KeyringPort } from "../../../integrations/ports";
import { extractGitHubLogin } from "../../deployments/static-publish/index";
import { InMemoryVendorCredentialSetRepo } from "../repo.memory";
import {
  createVendorCredential,
  deleteVendorCredential,
  describeCredential,
  healAccountLabel,
  listVendorCredentials,
  resolveDefaultForVendor,
  resolveForVendor,
  updateVendorCredential,
  VendorCredentialDuplicateLabelError,
  VendorCredentialNotFoundError,
  VendorCredentialSecretStoreUnconfiguredError,
  VendorCredentialValidationError,
  type VendorCredentialWriteDeps,
} from "../store";

/** Always fails — simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without touching real env state.
 *  Same double `publish-credentials/__tests__/store.unit.test.ts` uses for the identical class of
 *  problem on the predecessor table. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no root key: TOVU_INTEGRATIONS_ROOT_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no root key");
  }
}

/**
 * @file `store.ts` — mirrors `publish-credentials/__tests__/store.unit.test.ts`'s own shape and
 * intent (never-decrypting read model, AAD-bound resolve, duplicate-label rejection, the isDefault
 * group invariant across create/update/delete) widened to all seven vendors, plus the two things
 * genuinely new on this table: `tokenTail` derivation and the vendor-change default-promotion path.
 */

const WORKSPACE = "ws-1";
const NOW = "2026-08-16T00:00:00.000Z";

function makeDeps(overrides: Partial<VendorCredentialWriteDeps> = {}): VendorCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemoryVendorCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `cred-${(counter += 1)}` },
    // A fetchFn that never resolves anything real by default — tests that care about the github
    // probe override this explicitly; every other vendor never calls it at all (see `probeAccountLabel`).
    fetchFn: (async () => {
      throw new Error("fetchFn should not be called for this vendor");
    }) as unknown as typeof fetch,
    // Injected rather than a module-scope import, matching `store.ts`'s own deps shape after the
    // 2026-08-17 architecture SCC cut (see that file's header) — the real production function, passed
    // in exactly as `server/routes/admin/system/vendor-credentials.ts` does, just from a test.
    extractGitHubLogin,
    ...overrides,
  };
}

test("createVendorCredential seals the connection and returns a summary with NO secret material", async () => {
  const deps = makeDeps();
  const summary = await createVendorCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Personal PAT",
    connection: { vendorId: "github", token: "ghp_secret_value_WXYZ" },
  });

  assert.equal(summary.vendorId, "github");
  assert.equal(summary.label, "Personal PAT");
  assert.equal(summary.configured, true);
  assert.equal(summary.tokenTail, "WXYZ");
  assert.equal(JSON.stringify(summary).includes("ghp_secret_value_WXYZ"), false);
});

test("every vendor's connection shape validates and round-trips through create -> resolveForVendor", async () => {
  const cases: Array<{ label: string; connection: Parameters<typeof createVendorCredential>[1]["connection"] }> = [
    { label: "github", connection: { vendorId: "github", token: "ghp_TOKEN1111" } },
    { label: "gitlab", connection: { vendorId: "gitlab", token: "glpat-TOKEN2222" } },
    { label: "bitbucket", connection: { vendorId: "bitbucket", token: "bb_TOKEN3333", username: "octocat" } },
    { label: "vercel", connection: { vendorId: "vercel", token: "vercel_TOKEN4444", teamId: "team_1" } },
    { label: "netlify", connection: { vendorId: "netlify", token: "netlify_TOKEN5555" } },
    { label: "cloudflare", connection: { vendorId: "cloudflare", token: "cf_TOKEN6666", accountId: "acct_1" } },
    {
      label: "s3-compatible",
      connection: { vendorId: "s3-compatible", region: "us-east-1", bucket: "b", accessKeyId: "AKIA1", secretAccessKey: "secretKEY7777", publicUrl: "https://x" },
    },
  ];

  for (const { label, connection } of cases) {
    const deps = makeDeps();
    const created = await createVendorCredential(deps, { workspaceId: WORKSPACE, label, connection });
    const resolved = await resolveForVendor(deps, { workspaceId: WORKSPACE, id: created.id });
    assert.deepEqual(resolved?.connection, connection, `${label} connection must round-trip byte-for-byte`);
  }
});

test("s3-compatible's tokenTail comes from secretAccessKey, not accessKeyId — the field this vendor has no bare token for", async () => {
  const deps = makeDeps();
  const summary = await createVendorCredential(deps, {
    workspaceId: WORKSPACE,
    label: "R2 bucket",
    connection: {
      vendorId: "s3-compatible",
      region: "auto",
      bucket: "my-bucket",
      accessKeyId: "AKIAENDSWRONG",
      secretAccessKey: "supersecretENDSRIGHT",
      publicUrl: "https://cdn.example.com",
    },
  });
  assert.equal(summary.tokenTail, "IGHT");
});

test("s3-compatible without region/bucket/accessKeyId/secretAccessKey/publicUrl is rejected — no token fallback exists for this vendor", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createVendorCredential(deps, { workspaceId: WORKSPACE, label: "bad", connection: { vendorId: "s3-compatible", region: "us-east-1" } }),
    VendorCredentialValidationError
  );
});

test("bitbucket without username is rejected — the pair, not the token alone, is what authenticates", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createVendorCredential(deps, { workspaceId: WORKSPACE, label: "bad", connection: { vendorId: "bitbucket", token: "t" } }),
    VendorCredentialValidationError
  );
});

test("cloudflare without accountId is rejected — HARD required, no account-scope-free API surface", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createVendorCredential(deps, { workspaceId: WORKSPACE, label: "bad", connection: { vendorId: "cloudflare", token: "t" } }),
    VendorCredentialValidationError
  );
});

test("an unknown vendorId is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createVendorCredential(deps, { workspaceId: WORKSPACE, label: "bad", connection: { vendorId: "aws", token: "t" } }),
    VendorCredentialValidationError
  );
});

test("a blank label is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createVendorCredential(deps, { workspaceId: WORKSPACE, label: "   ", connection: { vendorId: "github", token: "t" } }),
    VendorCredentialValidationError
  );
});

test("describeCredential/listVendorCredentials never touch the sealer — a broken sealer does not fail them", async () => {
  const deps = makeDeps();
  await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "L1", connection: { vendorId: "vercel", token: "vercel_token" } });

  const brokenRead = { repo: deps.repo };
  const list = await listVendorCredentials(brokenRead, { workspaceId: WORKSPACE });
  assert.equal(list.length, 1);
  const one = await describeCredential(brokenRead, { workspaceId: WORKSPACE, id: list[0]!.id });
  assert.equal(one?.label, "L1");
});

test("resolveForVendor/resolveDefaultForVendor throw a typed SecretStoreUnconfiguredError, never a raw one, when the keyring is broken", async () => {
  const repo = new InMemoryVendorCredentialSetRepo();
  const workingDeps = makeDeps({ repo });
  const created = await createVendorCredential(workingDeps, { workspaceId: WORKSPACE, label: "L1", connection: { vendorId: "gitlab", token: "t" } });

  const brokenKeyring = new BrokenKeyring();
  const brokenResolveDeps = { repo, sealer: new AesGcmSecretSealer(brokenKeyring) };
  await assert.rejects(() => resolveForVendor(brokenResolveDeps, { workspaceId: WORKSPACE, id: created.id }), VendorCredentialSecretStoreUnconfiguredError);
  await assert.rejects(
    () => resolveDefaultForVendor(brokenResolveDeps, { workspaceId: WORKSPACE, vendorId: "gitlab" }),
    VendorCredentialSecretStoreUnconfiguredError
  );
});

test("a row's ciphertext does not open under a DIFFERENT credential set's own derived AAD", async () => {
  const repo = new InMemoryVendorCredentialSetRepo();
  const deps = makeDeps({ repo });
  const a = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "A", connection: { vendorId: "github", token: "token-a" } });
  const b = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "B", connection: { vendorId: "gitlab", token: "token-b" } });

  const rowA = await repo.findById({ workspaceId: WORKSPACE, id: a.id });
  const rowB = await repo.findById({ workspaceId: WORKSPACE, id: b.id });
  // Splice A's own ciphertext into B's row, keeping B's own identity (id, vendorId, label) intact —
  // this must fail to open, proving the AAD is genuinely bound to the specific row's own
  // (workspaceId, vendorId, id), not just "some row in this workspace".
  await repo.update({ ...rowB!, sealed: rowA!.sealed });
  await assert.rejects(() => resolveForVendor(deps, { workspaceId: WORKSPACE, id: b.id }), VendorCredentialSecretStoreUnconfiguredError);
});

test("createVendorCredential: first row for a vendor auto-defaults; a second row does not steal it", async () => {
  const deps = makeDeps();
  const first = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "first", connection: { vendorId: "github", token: "t1" } });
  assert.equal(first.isDefault, true);

  const second = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "second", connection: { vendorId: "github", token: "t2" } });
  assert.equal(second.isDefault, false);
  assert.equal((await describeCredential(deps, { workspaceId: WORKSPACE, id: first.id }))?.isDefault, true);
});

test("a duplicate (workspaceId, vendorId, label) is rejected and never creates a second row", async () => {
  const deps = makeDeps();
  await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "dup", connection: { vendorId: "github", token: "t1" } });
  await assert.rejects(
    () => createVendorCredential(deps, { workspaceId: WORKSPACE, label: "dup", connection: { vendorId: "github", token: "t2" } }),
    VendorCredentialDuplicateLabelError
  );
  assert.equal((await listVendorCredentials(deps, { workspaceId: WORKSPACE })).length, 1);
});

test("the SAME label is allowed across two DIFFERENT vendors — uniqueness is per (workspace, vendor, label)", async () => {
  const deps = makeDeps();
  await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { vendorId: "github", token: "t1" } });
  const gitlabRow = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { vendorId: "gitlab", token: "t2" } });
  assert.equal(gitlabRow.label, "default");
});

test("updateVendorCredential with connection OMITTED leaves the stored secret and tokenTail untouched (label-only rename)", async () => {
  const deps = makeDeps();
  const created = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "old", connection: { vendorId: "gitlab", token: "unchanged1234" } });
  const updated = await updateVendorCredential(deps, { workspaceId: WORKSPACE, id: created.id, label: "new" });
  assert.equal(updated.label, "new");
  assert.equal(updated.tokenTail, "1234");
  const resolved = await resolveForVendor(deps, { workspaceId: WORKSPACE, id: created.id });
  assert.deepEqual(resolved?.connection, { vendorId: "gitlab", token: "unchanged1234" });
});

test("updateVendorCredential with a NEW connection re-seals, re-derives tokenTail, and resets accountLabel", async () => {
  const deps = makeDeps({ fetchFn: (async () => ({ ok: false })) as unknown as typeof fetch });
  const created = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "L", connection: { vendorId: "gitlab", token: "firstTOKENaaaa" } });
  const updated = await updateVendorCredential(deps, { workspaceId: WORKSPACE, id: created.id, connection: { vendorId: "gitlab", token: "secondTOKENbbbb" } });
  assert.equal(updated.tokenTail, "bbbb");
  const resolved = await resolveForVendor(deps, { workspaceId: WORKSPACE, id: created.id });
  assert.deepEqual(resolved?.connection, { vendorId: "gitlab", token: "secondTOKENbbbb" });
});

test("updateVendorCredential on a non-existent id throws VendorCredentialNotFoundError", async () => {
  const deps = makeDeps();
  await assert.rejects(() => updateVendorCredential(deps, { workspaceId: WORKSPACE, id: "no-such-id" }), VendorCredentialNotFoundError);
});

test("changing a row's vendor via update: the row auto-defaults into its new (empty) group, and the OLD group promotes its next-most-recently-updated remaining row", async () => {
  const deps = makeDeps();
  const movingRow = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "moving", connection: { vendorId: "github", token: "t1" } });
  assert.equal(movingRow.isDefault, true, "sole row in a fresh group auto-defaults");

  const stayingRow = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "staying", connection: { vendorId: "github", token: "t2" } });
  assert.equal(stayingRow.isDefault, false);

  // Move the DEFAULT row to a brand-new vendor group.
  const moved = await updateVendorCredential(deps, { workspaceId: WORKSPACE, id: movingRow.id, connection: { vendorId: "netlify", token: "t3" } });
  assert.equal(moved.vendorId, "netlify");
  assert.equal(moved.isDefault, true, "a solo row moved onto an empty group becomes its default, same as a fresh create");

  // The OLD (github) group must now have a default again — the row that stayed behind.
  const promoted = await describeCredential(deps, { workspaceId: WORKSPACE, id: stayingRow.id });
  assert.equal(promoted?.isDefault, true, "the old group must not be left with rows but no default");
});

test("createVendorCredential probes and populates accountLabel for github; every other vendor stays null with no request made", async () => {
  const fetchFn = (async (url: string) => {
    assert.equal(url, "https://api.github.com/user");
    return { ok: true, json: async () => ({ login: "octocat" }) } as unknown as Response;
  }) as unknown as typeof fetch;

  const githubDeps = makeDeps({ fetchFn });
  const githubSummary = await createVendorCredential(githubDeps, { workspaceId: WORKSPACE, label: "gh", connection: { vendorId: "github", token: "t" } });
  assert.equal(githubSummary.accountLabel, "octocat");

  const neverCalledFetch = (async () => {
    throw new Error("must not be called for a non-github vendor");
  }) as unknown as typeof fetch;
  const gitlabDeps = makeDeps({ fetchFn: neverCalledFetch });
  const gitlabSummary = await createVendorCredential(gitlabDeps, { workspaceId: WORKSPACE, label: "gl", connection: { vendorId: "gitlab", token: "t" } });
  assert.equal(gitlabSummary.accountLabel, null);
});

test("createVendorCredential/updateVendorCredential call deps.extractGitHubLogin — the injected function, not a hardcoded import", async () => {
  // A stub whose output is deliberately DIFFERENT from the real `extractGitHubLogin` (which reads
  // `body.login`) — it reads a field the real extractor never touches. If `probeAccountLabel` ever
  // regressed back to a hardcoded module-scope import of the real function (the 2026-08-17 SCC-cut
  // bug this test guards against — see `store.ts`'s header), this stub would never be consulted and
  // `accountLabel` below would come back `null` (the real extractor finds no `login` field on this
  // body shape) instead of the stub's own sentinel value.
  const fetchFn = (async () => ({ ok: true, json: async () => ({ notLogin: "should-be-ignored-by-real-extractor" }) }) as unknown as Response) as unknown as typeof fetch;
  const stubExtractGitHubLogin = (body: unknown): string | undefined => {
    const value = (body as { notLogin?: unknown }).notLogin;
    return typeof value === "string" ? `stub:${value}` : undefined;
  };

  const deps = makeDeps({ fetchFn, extractGitHubLogin: stubExtractGitHubLogin });
  const created = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "gh", connection: { vendorId: "github", token: "t" } });
  assert.equal(created.accountLabel, "stub:should-be-ignored-by-real-extractor", "createVendorCredential must call deps.extractGitHubLogin, not a hardcoded import");

  const updated = await updateVendorCredential(deps, { workspaceId: WORKSPACE, id: created.id, connection: { vendorId: "github", token: "t2" } });
  assert.equal(updated.accountLabel, "stub:should-be-ignored-by-real-extractor", "updateVendorCredential must call deps.extractGitHubLogin, not a hardcoded import");
});

test("createVendorCredential leaves accountLabel null when the github probe fails or times out — never fails the save", async () => {
  const rejectedFetch = (async () => {
    throw new Error("network down");
  }) as unknown as typeof fetch;
  const deps = makeDeps({ fetchFn: rejectedFetch });
  const summary = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "gh", connection: { vendorId: "github", token: "t" } });
  assert.equal(summary.accountLabel, null);
});

test("deleteVendorCredential is idempotent and promotes the group's most-recently-updated remaining row", async () => {
  const deps = makeDeps();
  const a = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "a", connection: { vendorId: "github", token: "t1" } });
  const b = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "b", connection: { vendorId: "github", token: "t2" } });
  assert.equal(a.isDefault, true);

  await deleteVendorCredential(deps, { workspaceId: WORKSPACE, id: a.id });
  assert.equal((await describeCredential(deps, { workspaceId: WORKSPACE, id: b.id }))?.isDefault, true);

  // Idempotent: deleting an already-gone id is a no-op, not an error.
  await deleteVendorCredential(deps, { workspaceId: WORKSPACE, id: a.id });
});

test("healAccountLabel is a targeted write — never disturbs sealed, isDefault, or updatedAt", async () => {
  const deps = makeDeps();
  const created = await createVendorCredential(deps, { workspaceId: WORKSPACE, label: "gh", connection: { vendorId: "github", token: "t" } });
  await healAccountLabel(deps, { workspaceId: WORKSPACE, id: created.id, accountLabel: "healed-login" });
  const after = await describeCredential(deps, { workspaceId: WORKSPACE, id: created.id });
  assert.equal(after?.accountLabel, "healed-login");
  assert.equal(after?.isDefault, created.isDefault);
  assert.equal(after?.updatedAt, created.updatedAt);
});
