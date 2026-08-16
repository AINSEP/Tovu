import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../../../integrations/keyring.memory";
import { InMemoryPublishCredentialSetRepo } from "../repo.memory";
import {
  createPublishCredential,
  deletePublishCredential,
  describeCredential,
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialValidationError,
  resolveDefaultForPublish,
  resolveForPublish,
  updatePublishCredential,
  type PublishCredentialWriteDeps,
} from "../store";

/**
 * @file `store.ts` — the two-strictly-separated-operations contract this whole feature is built
 * around: `describeCredential`/`listPublishCredentials` never decrypt (proven by a sealer that throws
 * on `open()`, still succeeding), `resolveForPublish` is the only function that does. Plus the
 * validate-then-write CRUD, the AAD binding (a row's ciphertext must not open under a DIFFERENT
 * credential set's own derived AAD — the adversarial case this module exists to prevent), and
 * duplicate-label rejection (the aggregate/cross-record behavior the `(workspace_id, provider_id,
 * label)` UNIQUE index encodes).
 */

const WORKSPACE = "ws-1";
const OTHER_WORKSPACE = "ws-2";
const NOW = "2026-08-15T00:00:00.000Z";

function makeDeps(overrides: Partial<PublishCredentialWriteDeps> = {}): PublishCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemoryPublishCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `cred-${(counter += 1)}` },
    ...overrides,
  };
}

test("createPublishCredential seals the connection and returns a summary with NO secret material", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Main repo",
    connection: { providerId: "github-pages", token: "ghp_secret_value" },
  });

  assert.equal(summary.providerId, "github-pages");
  assert.equal(summary.label, "Main repo");
  assert.equal(summary.configured, true);
  assert.equal(summary.createdAt, NOW);
  // The summary type has no field capable of carrying a secret, but assert defensively that no key
  // ever leaked onto the object anyway (e.g. via an accidental spread of the record).
  assert.equal(JSON.stringify(summary).includes("ghp_secret_value"), false);
});

test("describeCredential/listPublishCredentials never touch the sealer — a broken sealer does not fail them", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Main repo",
    connection: { providerId: "vercel", token: "vercel_token" },
  });

  const brokenSealerRepoDeps = { repo: deps.repo }; // deliberately no sealer/keyring at all
  const list = await listPublishCredentials(brokenSealerRepoDeps, { workspaceId: WORKSPACE });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.label, "Main repo");

  const one = await describeCredential(brokenSealerRepoDeps, { workspaceId: WORKSPACE, id: list[0]!.id });
  assert.equal(one?.providerId, "vercel");
});

test("resolveForPublish decrypts the exact connection that was sealed", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Main repo",
    connection: { providerId: "cloudflare-pages", token: "cf_token", accountId: "acct-1", projectName: "my-site" },
  });

  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: summary.id });
  assert.deepEqual(resolved?.connection, { providerId: "cloudflare-pages", token: "cf_token", accountId: "acct-1", projectName: "my-site" });
});

test("resolveForPublish returns null for a non-existent id — not an error", async () => {
  const deps = makeDeps();
  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: "no-such-id" });
  assert.equal(resolved, null);
});

test("AAD binding: a credential set's ciphertext does not open under a DIFFERENT credential set's derived AAD (adversarial cross-row transplant)", async () => {
  const deps = makeDeps();
  const first = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "One",
    connection: { providerId: "vercel", token: "token-a" },
  });
  await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Two",
    connection: { providerId: "vercel", token: "token-b" },
  });

  // Simulate an attacker who swaps row "Two"'s ciphertext fields onto row "One"'s id/label — the AAD
  // (bound to the row's OWN id) must reject this even though the AES key is shared app-wide.
  const rowOne = await deps.repo.findById({ workspaceId: WORKSPACE, id: first.id });
  const rowTwo = await deps.repo.findById({ workspaceId: WORKSPACE, id: (await deps.repo.listByWorkspace({ workspaceId: WORKSPACE }))[1]!.id });
  const tampered = { ...rowOne!, sealed: rowTwo!.sealed };
  await deps.repo.update(tampered);

  await assert.rejects(() => resolveForPublish(deps, { workspaceId: WORKSPACE, id: first.id }));
});

test("createPublishCredential rejects a second credential with the same (workspace, provider, label)", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Main repo", connection: { providerId: "vercel", token: "token-a" } });

  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Main repo", connection: { providerId: "vercel", token: "token-b" } }),
    PublishCredentialDuplicateLabelError
  );
});

test("the SAME label is allowed for a DIFFERENT provider (uniqueness is per-provider, not workspace-wide)", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Main", connection: { providerId: "vercel", token: "token-a" } });
  const second = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Main",
    connection: { providerId: "netlify", token: "token-b" },
  });
  assert.equal(second.label, "Main");
});

test("the SAME (provider, label) is allowed in a DIFFERENT workspace (uniqueness is per-workspace)", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Main", connection: { providerId: "vercel", token: "token-a" } });
  const other = await createPublishCredential(deps, {
    workspaceId: OTHER_WORKSPACE,
    label: "Main",
    connection: { providerId: "vercel", token: "token-b" },
  });
  assert.equal(other.label, "Main");
});

test("createPublishCredential accepts github-pages with a bare token — owner/repo are publish-target fields, not credential fields", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "github-pages", token: "t" } });
  assert.equal(summary.providerId, "github-pages");

  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: summary.id });
  assert.deepEqual(resolved?.connection, { providerId: "github-pages", token: "t" });
});

test("createPublishCredential rejects github-pages with a blank token", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "github-pages", token: "" } }),
    PublishCredentialValidationError
  );
});

test("createPublishCredential rejects cloudflare-pages with no accountId (hard required)", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "cloudflare-pages", token: "t" } }),
    PublishCredentialValidationError
  );
});

test("createPublishCredential rejects an unrecognized providerId", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "aws-amplify", token: "t" } }),
    PublishCredentialValidationError
  );
});

test("createPublishCredential rejects a blank label", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "   ", connection: { providerId: "vercel", token: "t" } }),
    PublishCredentialValidationError
  );
});

test("updatePublishCredential with connection OMITTED keeps the stored secret untouched, only changes the label", async () => {
  const deps = makeDeps();
  const created = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Old label",
    connection: { providerId: "vercel", token: "stays-the-same" },
  });

  const updated = await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: created.id, label: "New label" });
  assert.equal(updated.label, "New label");

  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: created.id });
  assert.equal(resolved?.connection.token, "stays-the-same");
});

test("updatePublishCredential with a NEW connection reseals under a fresh ciphertext, not a re-wrap", async () => {
  const deps = makeDeps();
  const created = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Label",
    connection: { providerId: "vercel", token: "old-token" },
  });
  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });

  await updatePublishCredential(deps, {
    workspaceId: WORKSPACE,
    id: created.id,
    connection: { providerId: "vercel", token: "new-token" },
  });
  const after = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });

  assert.notEqual(after?.sealed.ciphertext, before?.sealed.ciphertext);
  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: created.id });
  assert.equal(resolved?.connection.token, "new-token");
});

test("updatePublishCredential throws PublishCredentialNotFoundError for a non-existent id", async () => {
  const deps = makeDeps();
  await assert.rejects(() => updatePublishCredential(deps, { workspaceId: WORKSPACE, id: "no-such-id", label: "x" }), PublishCredentialNotFoundError);
});

test("updatePublishCredential rejects renaming into a label already used by ANOTHER row for the same provider", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Taken", connection: { providerId: "vercel", token: "a" } });
  const second = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Free", connection: { providerId: "vercel", token: "b" } });

  await assert.rejects(() => updatePublishCredential(deps, { workspaceId: WORKSPACE, id: second.id, label: "Taken" }), PublishCredentialDuplicateLabelError);
});

test("updatePublishCredential renaming a row to its OWN current label is not a false duplicate", async () => {
  const deps = makeDeps();
  const created = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Same", connection: { providerId: "vercel", token: "a" } });
  const updated = await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: created.id, label: "Same" });
  assert.equal(updated.label, "Same");
});

test("deletePublishCredential removes the row; a second delete of the same id is a harmless no-op (idempotent)", async () => {
  const deps = makeDeps();
  const created = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "vercel", token: "t" } });

  await deletePublishCredential(deps, { workspaceId: WORKSPACE, id: created.id });
  assert.equal(await describeCredential(deps, { workspaceId: WORKSPACE, id: created.id }), null);

  // Second delete: must not throw.
  await deletePublishCredential(deps, { workspaceId: WORKSPACE, id: created.id });
});

test("deletePublishCredential on an id that never existed is a harmless no-op", async () => {
  const deps = makeDeps();
  await deletePublishCredential(deps, { workspaceId: WORKSPACE, id: "never-existed" });
});

test("listPublishCredentials only returns the requesting workspace's own rows (tenant isolation)", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "mine", connection: { providerId: "vercel", token: "a" } });
  await createPublishCredential(deps, { workspaceId: OTHER_WORKSPACE, label: "theirs", connection: { providerId: "vercel", token: "b" } });

  const mine = await listPublishCredentials(deps, { workspaceId: WORKSPACE });
  assert.equal(mine.length, 1);
  assert.equal(mine[0]!.label, "mine");
});

/**
 * Contract v2 Correction B: is_default. The previous design failed a publish with "multiple
 * credentials configured, ambiguous" once a workspace saved a second connection for one provider —
 * these tests lock in the replacement invariant instead: exactly one default per (workspace,
 * provider), auto-assigned on first create, explicit thereafter, promoted on delete.
 */

test("the FIRST credential created for a provider becomes its default automatically, with no isDefault requested", async () => {
  const deps = makeDeps();
  const first = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });
  assert.equal(first.isDefault, true);
});

test("a SECOND credential for the same provider is NOT default unless isDefault:true is requested", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });
  const second = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Two", connection: { providerId: "vercel", token: "b" } });
  assert.equal(second.isDefault, false);
});

test("creating with isDefault:true clears the previous default for that provider", async () => {
  const deps = makeDeps();
  const first = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });
  const second = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Two",
    connection: { providerId: "vercel", token: "b" },
    isDefault: true,
  });
  assert.equal(second.isDefault, true);
  assert.equal((await describeCredential(deps, { workspaceId: WORKSPACE, id: first.id }))?.isDefault, false);
});

test("a provider's default is independent of a DIFFERENT provider's default (each group has its own)", async () => {
  const deps = makeDeps();
  const vercel = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });
  const netlify = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Two", connection: { providerId: "netlify", token: "b" } });
  assert.equal(vercel.isDefault, true);
  assert.equal(netlify.isDefault, true);
});

test("updatePublishCredential with isDefault:true promotes this row and demotes the previous default", async () => {
  const deps = makeDeps();
  const first = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });
  const second = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Two", connection: { providerId: "vercel", token: "b" } });

  const updated = await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: second.id, isDefault: true });
  assert.equal(updated.isDefault, true);
  assert.equal((await describeCredential(deps, { workspaceId: WORKSPACE, id: first.id }))?.isDefault, false);
});

test("updatePublishCredential with isDefault OMITTED never un-defaults the current default (no replacement)", async () => {
  const deps = makeDeps();
  const first = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });

  const updated = await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: first.id, label: "Renamed" });
  assert.equal(updated.isDefault, true, "renaming the default must not silently clear its default status");
});

test("updatePublishCredential with isDefault:false on the CURRENT default is a no-op for default status (never leaves a provider with zero defaults)", async () => {
  const deps = makeDeps();
  const first = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });

  const updated = await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: first.id, isDefault: false });
  assert.equal(updated.isDefault, true);
});

test("deleting the default promotes the group's most-recently-updated remaining row", async () => {
  const deps = makeDeps();
  const first = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Two", connection: { providerId: "vercel", token: "b" } });

  await deletePublishCredential(deps, { workspaceId: WORKSPACE, id: first.id });

  const remaining = await listPublishCredentials(deps, { workspaceId: WORKSPACE });
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]!.isDefault, true, "the only remaining row for the provider must become the default");
});

test("deleting the LAST credential for a provider leaves that provider with no default — not an error", async () => {
  const deps = makeDeps();
  const only = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });
  await deletePublishCredential(deps, { workspaceId: WORKSPACE, id: only.id });
  assert.equal(await resolveDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "vercel" }), null);
});

// ---------------------------------------------------------------------------
// Changing a row's PROVIDER on update — Terra audit finding #4/#3 (2026-08-16): moving a credential's
// connection onto a different provider changes which group's default invariant it participates in.
// Confirmed by direct probe against the unfixed code before writing these: (1) the OLD provider group
// ended up with rows but no default at all, and (2) worse than reported, the row's carried-over
// `isDefault` ALSO silently stole default status from the NEW provider's own unrelated, working
// default without the caller ever requesting `isDefault: true`.
// ---------------------------------------------------------------------------

test("updatePublishCredential: moving a credential to a DIFFERENT provider never carries its old isDefault onto the new provider, clobbering that provider's real default", async () => {
  const deps = makeDeps();
  const vercelDefault = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "vercel-main", connection: { providerId: "vercel", token: "real-vercel-default" } });
  // Its own provider's sole (hence default) row — moving THIS one is the adversarial case: it carries
  // `isDefault: true` into the update, but that was true for github-pages, not for vercel.
  const ghRow = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "gh-row", connection: { providerId: "github-pages", token: "gh-token" } });
  assert.equal(ghRow.isDefault, true, "sanity: the only github-pages row starts out as its provider's default");

  await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: ghRow.id, connection: { providerId: "vercel", token: "gh-now-vercel" } });

  const vercelDefaultAfter = await describeCredential(deps, { workspaceId: WORKSPACE, id: vercelDefault.id });
  assert.equal(vercelDefaultAfter?.isDefault, true, "the pre-existing vercel default must survive an unrelated row's provider change");
  const movedRow = await describeCredential(deps, { workspaceId: WORKSPACE, id: ghRow.id });
  assert.equal(movedRow?.isDefault, false, "the moved row must NOT silently become vercel's default just because it was github-pages's default");
});

test("updatePublishCredential: moving a provider's default off to a different provider promotes a replacement in the OLD group, never leaving it with rows but no default", async () => {
  const deps = makeDeps();
  const ghDefault = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "gh-main", connection: { providerId: "github-pages", token: "gh-a" } });
  const ghSecond = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "gh-second", connection: { providerId: "github-pages", token: "gh-b" } });
  assert.equal(ghDefault.isDefault, true);
  assert.equal(ghSecond.isDefault, false);

  await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: ghDefault.id, connection: { providerId: "vercel", token: "now-vercel" } });

  const ghSecondAfter = await describeCredential(deps, { workspaceId: WORKSPACE, id: ghSecond.id });
  assert.equal(ghSecondAfter?.isDefault, true, "the only remaining github-pages row must be promoted — the group must never end up with rows but no default");
  const remainingGithubPages = (await listPublishCredentials(deps, { workspaceId: WORKSPACE })).filter((c) => c.providerId === "github-pages");
  assert.equal(remainingGithubPages.filter((c) => c.isDefault).length, 1, "exactly one default in the old group, never zero, never two");
});

test("updatePublishCredential: a SOLO credential moved onto a brand-new (currently empty) provider group still becomes that group's default — the fix must not regress the first-row auto-default rule", async () => {
  const deps = makeDeps();
  const solo = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "solo", connection: { providerId: "github-pages", token: "solo-token" } });

  const updated = await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: solo.id, connection: { providerId: "netlify", token: "solo-now-netlify" } });

  assert.equal(updated.isDefault, true, "moving the only credential onto an empty provider group mirrors createPublishCredential's own first-row auto-default");
  const netlifyDefault = await describeCredential(deps, { workspaceId: WORKSPACE, id: solo.id });
  assert.equal(netlifyDefault?.isDefault, true);
});

test("createPublishCredential rejects a non-boolean isDefault", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "vercel", token: "t" }, isDefault: "yes" }),
    PublishCredentialValidationError
  );
});

test("resolveDefaultForPublish decrypts the provider's default connection, never an id-specific one", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "old" } });
  const second = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Two",
    connection: { providerId: "vercel", token: "new" },
    isDefault: true,
  });

  const resolved = await resolveDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "vercel" });
  assert.equal(resolved?.id, second.id);
  assert.equal(resolved?.connection.token, "new");
});

test("resolveDefaultForPublish returns null (never 'ambiguous') when a provider has no default — not an error even with rows for OTHER providers", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "netlify", token: "a" } });
  assert.equal(await resolveDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "vercel" }), null);
});

// ---- s3-compatible (custom publish provider, spec `custom-publish-provider-contract.md` §4) ----

const VALID_S3_CONNECTION = {
  providerId: "s3-compatible",
  region: "us-east-1",
  bucket: "my-bucket",
  accessKeyId: "AKIAEXAMPLE",
  secretAccessKey: "s3cr3t",
  publicUrl: "https://my-bucket.s3.us-east-1.amazonaws.com",
};

test("createPublishCredential accepts a full s3-compatible connection, including optional endpoint, and seals it with NO plaintext leak in the summary", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "x",
    connection: { ...VALID_S3_CONNECTION, endpoint: "https://s3.us-east-1.amazonaws.com" },
  });
  assert.equal(summary.providerId, "s3-compatible");
  assert.ok(!("connection" in summary) && !("sealed" in summary), "summary must carry no connection/sealed field at all");
  assert.doesNotMatch(JSON.stringify(summary), /s3cr3t|AKIAEXAMPLE/, "the summary must never leak the secret or access key");

  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: summary.id });
  assert.deepEqual(resolved?.connection, { ...VALID_S3_CONNECTION, endpoint: "https://s3.us-east-1.amazonaws.com" });
});

test("createPublishCredential accepts s3-compatible with NO endpoint (plain AWS S3 — endpoint is the only optional field)", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: VALID_S3_CONNECTION });
  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: summary.id });
  assert.deepEqual(resolved?.connection, VALID_S3_CONNECTION);
  assert.ok(!("endpoint" in (resolved?.connection ?? {})), "omitted endpoint must stay omitted, never coerced to an empty string");
});

for (const field of ["region", "bucket", "accessKeyId", "secretAccessKey", "publicUrl"] as const) {
  test(`createPublishCredential rejects s3-compatible with a blank '${field}' (all five are hard-required)`, async () => {
    const deps = makeDeps();
    await assert.rejects(
      () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { ...VALID_S3_CONNECTION, [field]: "" } }),
      PublishCredentialValidationError
    );
  });
}

test("createPublishCredential rejects s3-compatible with a blank endpoint when one IS supplied (optional means 'may be omitted', not 'may be blank')", async () => {
  const deps = makeDeps();
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { ...VALID_S3_CONNECTION, endpoint: "   " } }),
    PublishCredentialValidationError
  );
});
