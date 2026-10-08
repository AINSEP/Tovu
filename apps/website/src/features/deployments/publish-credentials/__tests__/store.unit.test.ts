import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import type { KeyringPort } from "#src/features/webhooks/index";
import { InMemoryVendorCredentialSetRepo } from "@jini-ai/platform/secrets/credential-sets";
import {
  createPublishCredential,
  deletePublishCredential,
  describeCredential,
  hasDefaultForPublish,
  healAccountLabel,
  listPublishCredentials,
  PublishCredentialDuplicateLabelError,
  PublishCredentialNotFoundError,
  PublishCredentialSecretStoreUnconfiguredError,
  PublishCredentialValidationError,
  resolveDefaultForPublish,
  resolveForPublish,
  updatePublishCredential,
  type PublishCredentialWriteDeps,
} from "../store.js";
import { loadBundledDeployTargets } from "#src/features/deployments/deploy-targets/__tests__/bundled-deploy-targets.fixture";
import { buildVendorCredentialAad } from "#src/features/vendor-credentials/aad";
import { buildPublishCredentialAad } from "../aad.js";
import { InMemoryPublishCredentialSetRepo } from "../repo.memory.js";
import { copyPublishCredentialsToVendorTable } from "../vendor-table-backfill.js";
import type { DeployTargetRegistry, LoadedDeployTarget } from "#src/features/deployments/deploy-targets/types";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/** Always fails — simulates a missing `TOVU_SITE_KEY` without touching real env state.
 *  Same double used by `server/__tests__/admin-media-provider-routes.test.ts`'s own `BrokenKeyring`
 *  for the identical class of problem on a sibling secret store. */
class BrokenKeyring implements KeyringPort {
  async activeKey(): Promise<{ readonly keyId: string }> {
    throw new Error("no site key: TOVU_SITE_KEY is not set and allowFileFallback is disabled");
  }
  async deriveSigningSecret(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
  async derive(): Promise<Uint8Array> {
    throw new Error("no site key");
  }
}

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
    repo: new InMemoryVendorCredentialSetRepo({}),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: createFakeClock({ startIso: NOW }),
    idGen: { newId: () => `cred-${(counter += 1)}` },
    loadDeployTargets: loadBundledDeployTargets,
    ...overrides,
  };
}

/** A registry holding one host that only a plugin declares: nothing in core knows its id or fields. */
function pluginOnlyHostRegistry(): DeployTargetRegistry {
  const target: LoadedDeployTarget = {
    pluginId: "fixture-plugin",
    module: { create: () => { throw new Error("not used"); } },
    descriptor: {
      id: "fixture-host",
      label: "Fixture host",
      module: "targets/fixture.mjs",
      configFields: [],
      credential: { vendorId: "fixture", tokenField: "apiKey", fields: [{ name: "apiKey", label: "API key", required: true, secret: true }, { name: "zone", label: "Zone", required: true }, { name: "note", label: "Note", required: false }] },
    },
  };
  return { get: (id) => (id === target.descriptor.id ? target : undefined), list: () => [target], refusals: [] };
}

test("a host declared only by a deploy plugin can save a credential; its declared fields are what is validated and sealed", async () => {
  const deps = makeDeps({ loadDeployTargets: async () => pluginOnlyHostRegistry() });
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "fixture-host", apiKey: "k" } }),
    (err: unknown) => err instanceof PublishCredentialValidationError && err.message === "'zone' (non-empty string) is required for provider 'fixture-host'",
  );
  const summary = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "fixture-host", apiKey: " k ", zone: "eu", undeclared: "dropped" } });
  assert.equal(summary.providerId, "fixture-host");
  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: summary.id });
  assert.deepEqual(resolved?.connection, { providerId: "fixture-host", apiKey: "k", zone: "eu" });
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "y", connection: { providerId: "github-pages", token: "t" } }),
    (err: unknown) => err instanceof PublishCredentialValidationError && err.message === "connection.providerId must be one of: fixture-host",
  );
});

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

for (const failure of ["key acquisition", "sealing"] as const) {
  test(`create/update translate ${failure} failures and leave stored credentials unchanged`, async () => {
    const deps = makeDeps();
    const existing = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "existing", connection: { providerId: "vercel", token: "original-token" } });
    const before = structuredClone(await deps.repo.listByWorkspace({ workspaceId: WORKSPACE }));
    const broken = failure === "key acquisition"
      ? { ...deps, keyring: new BrokenKeyring() }
      : { ...deps, sealer: { ...deps.sealer, open: deps.sealer.open.bind(deps.sealer), seal: async () => { throw new Error("seal failed"); } } };
    await assert.rejects(() => createPublishCredential(broken, { workspaceId: WORKSPACE, label: "new", connection: { providerId: "vercel", token: "new-token" }, isDefault: true }), PublishCredentialSecretStoreUnconfiguredError);
    assert.deepEqual(await deps.repo.listByWorkspace({ workspaceId: WORKSPACE }), before);
    await assert.rejects(() => updatePublishCredential(broken, { workspaceId: WORKSPACE, id: existing.id, label: "changed", connection: { providerId: "vercel", token: "replacement-token" } }), PublishCredentialSecretStoreUnconfiguredError);
    assert.deepEqual(await deps.repo.listByWorkspace({ workspaceId: WORKSPACE }), before);
    assert.equal((await resolveForPublish(deps, { workspaceId: WORKSPACE, id: existing.id }))?.connection.token, "original-token");
  });
}

test("describeCredential/listPublishCredentials never touch the sealer — a broken sealer does not fail them", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "Main repo",
    connection: { providerId: "vercel", token: "vercel_token" },
  });

  const brokenSealerRepoDeps = { repo: deps.repo, loadDeployTargets: deps.loadDeployTargets }; // deliberately no sealer/keyring at all
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
  // Only the host's declared credential fields are sealed: Cloudflare Pages stopped declaring a
  // credential `projectName` (53c8fddec — its module never read it), so the extra key is dropped.
  assert.deepEqual(resolved?.connection, { providerId: "cloudflare-pages", token: "cf_token", accountId: "acct-1" });
});

test("resolveForPublish returns null for a non-existent id — not an error", async () => {
  const deps = makeDeps();
  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: "no-such-id" });
  assert.equal(resolved, null);
});

/**
 * Live-found (2026-08-16): a row saved with a working site key, then resolved by a process that
 * never had one (a real, common shape — a server restart/reboot without `TOVU_SITE_KEY`
 * set, hitting a row an EARLIER, correctly-configured boot already saved). Before the fix,
 * `resolveForPublish` let the keyring's raw `Error` escape untyped; every caller's HTTP boundary
 * (`server/routes/admin/system/publish-credentials.ts`'s `sendStoreError`) only recognizes FOUR
 * specific typed errors and rethrows anything else, so the raw error escaped uncaught all the way to
 * an unhandled rejection — which, with Express 4 catching nothing and no process-level guard
 * installed either, took down the whole server (see `server/runtime/boot/process-error-guards.ts`'s header
 * for that half of the fix). This test proves the TYPE, not just that it throws — `resolveForPublish`
 * already had a passing "throws on a bad AAD" test above; a raw `Error` would satisfy that just as
 * well as this typed one does, which is exactly how this gap went unnoticed.
 */
test("resolveForPublish converts a decrypt failure (missing site key) into the typed PublishCredentialSecretStoreUnconfiguredError, never a raw Error the route layer's sendStoreError cannot map", async () => {
  const workingDeps = makeDeps();
  const created = await createPublishCredential(workingDeps, {
    workspaceId: WORKSPACE,
    label: "x",
    connection: { providerId: "github-pages", token: "t" },
  });

  // Same repo (the same saved row), but a keyring that cannot derive the key to open it — simulates
  // exactly the live scenario: the row already exists, the CURRENT process just has no site key.
  const brokenKeyring = new BrokenKeyring();
  const brokenDeps = { repo: workingDeps.repo, sealer: new AesGcmSecretSealer(brokenKeyring), loadDeployTargets: workingDeps.loadDeployTargets };

  await assert.rejects(
    () => resolveForPublish(brokenDeps, { workspaceId: WORKSPACE, id: created.id }),
    PublishCredentialSecretStoreUnconfiguredError
  );
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

  await assert.rejects(() => resolveForPublish(deps, { workspaceId: WORKSPACE, id: first.id }), PublishCredentialSecretStoreUnconfiguredError);
});

test("createPublishCredential rejects a second credential with the same (workspace, provider, label)", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Main repo", connection: { providerId: "vercel", token: "token-a" } });

  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Main repo", connection: { providerId: "vercel", token: "token-b" } }),
    PublishCredentialDuplicateLabelError
  );
});

/** Postgres/PGlite reports the label's UNIQUE index as SQLSTATE `23505` with its own wording, not
 *  SQLite's "UNIQUE constraint failed" — the store must still map it to the typed duplicate-label error. */
test("createPublishCredential maps a Postgres UNIQUE violation (SQLSTATE 23505) to PublishCredentialDuplicateLabelError", async () => {
  class PgDuplicateRepo extends InMemoryVendorCredentialSetRepo {
    override async insert(): Promise<void> {
      throw Object.assign(new Error('duplicate key value violates unique constraint "publish_credential_sets_label_idx"'), { code: "23505" });
    }
  }
  const deps = makeDeps({ repo: new PgDuplicateRepo({}) });
  await assert.rejects(
    () => createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Main repo", connection: { providerId: "vercel", token: "token-a" } }),
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
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "survivor", connection: { providerId: "vercel", token: "untouched" } });
  const before = structuredClone(await deps.repo.listByWorkspace({ workspaceId: WORKSPACE }));
  await deletePublishCredential(deps, { workspaceId: WORKSPACE, id: "never-existed" });
  assert.deepEqual(await deps.repo.listByWorkspace({ workspaceId: WORKSPACE }), before);
});

test("listPublishCredentials only returns the requesting workspace's own rows (tenant isolation)", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "mine", connection: { providerId: "vercel", token: "a" } });
  await createPublishCredential(deps, { workspaceId: OTHER_WORKSPACE, label: "theirs", connection: { providerId: "vercel", token: "b" } });

  const mine = await listPublishCredentials(deps, { workspaceId: WORKSPACE });
  assert.equal(mine.length, 1);
  assert.equal(mine[0]!.label, "mine");
});

test("resolve/update/delete/heal cannot access another workspace's credential", async () => {
  const deps = makeDeps();
  const created = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "owner", connection: { providerId: "vercel", token: "private-token" } });
  const before = structuredClone(await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id }));
  const foreign = { workspaceId: OTHER_WORKSPACE, id: created.id };
  assert.equal(await resolveForPublish(deps, foreign), null);
  await assert.rejects(() => updatePublishCredential(deps, { ...foreign, label: "intruder", connection: { providerId: "vercel", token: "intruder-token" } }), PublishCredentialNotFoundError);
  assert.deepEqual(await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id }), before);
  await deletePublishCredential(deps, foreign);
  assert.deepEqual(await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id }), before);
  await healAccountLabel(deps, { ...foreign, accountLabel: "intruder" });
  assert.deepEqual(await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id }), before);
  assert.equal((await resolveForPublish(deps, { workspaceId: WORKSPACE, id: created.id }))?.connection.token, "private-token");
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
  let now = NOW;
  const deps = makeDeps({ clock: { nowMs: () => Date.parse(now) } });
  const first = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "One", connection: { providerId: "vercel", token: "a" } });
  now = "2026-08-16T00:00:00.000Z";
  const second = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Two", connection: { providerId: "vercel", token: "b" } });
  now = "2026-08-17T00:00:00.000Z";
  const third = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Three", connection: { providerId: "vercel", token: "c" } });
  // Updated order differs from creation/insertion order.
  now = "2026-08-18T00:00:00.000Z";
  await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: second.id, label: "Two updated" });
  await deletePublishCredential(deps, { workspaceId: WORKSPACE, id: first.id });
  const remaining = await listPublishCredentials(deps, { workspaceId: WORKSPACE });
  assert.equal(remaining.length, 2);
  assert.equal(remaining.find((row) => row.id === second.id)?.isDefault, true);
  assert.equal(remaining.find((row) => row.id === third.id)?.isDefault, false);
  const resolved = await resolveDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "vercel" });
  assert.equal(resolved?.id, second.id);
  assert.deepEqual(resolved?.connection, { providerId: "vercel", token: "b" });
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

test("createPublishCredential trims a leading/trailing-whitespace endpoint before persisting it — a stray paste-space must not survive into storage", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "x",
    connection: { ...VALID_S3_CONNECTION, endpoint: "  https://s3.us-east-1.amazonaws.com  " },
  });
  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: summary.id });
  assert.deepEqual(resolved?.connection, { ...VALID_S3_CONNECTION, endpoint: "https://s3.us-east-1.amazonaws.com" }, "the persisted endpoint must be trimmed, not the raw pasted value with its surrounding whitespace intact");
});

// `requireNonEmptyString` backs every s3-compatible hard-required field — including the two
// SECRET-bearing ones, `secretAccessKey` and (for the token-bearing providers) `token`. Pin all five
// s3-compatible fields together so the fix cannot land in the arm that doesn't matter (`region`) while
// leaving the arm that does (`secretAccessKey`) untrimmed — an untrimmed pasted secret persists, then
// fails signing later, surfacing as a misleading "wrong credentials" far from where the space was typed.
for (const field of ["region", "bucket", "accessKeyId", "secretAccessKey", "publicUrl"] as const) {
  test(`createPublishCredential trims a leading/trailing-whitespace '${field}' before persisting it (s3-compatible)`, async () => {
    const deps = makeDeps();
    const summary = await createPublishCredential(deps, {
      workspaceId: WORKSPACE,
      label: "x",
      connection: { ...VALID_S3_CONNECTION, [field]: `  ${VALID_S3_CONNECTION[field]}  ` },
    });
    const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: summary.id });
    assert.equal(
      (resolved?.connection as Record<string, unknown> | undefined)?.[field],
      VALID_S3_CONNECTION[field],
      `'${field}' must be persisted trimmed, not the raw pasted value with its surrounding whitespace intact`
    );
  });
}

test("createPublishCredential trims a leading/trailing-whitespace 'token' before persisting it (github-pages) — the other secret-bearing field requireNonEmptyString validates", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, {
    workspaceId: WORKSPACE,
    label: "x",
    connection: { providerId: "github-pages", token: "  ghp_example  " },
  });
  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: summary.id });
  assert.equal(resolved?.connection.token, "ghp_example", "'token' must be persisted trimmed, not the raw pasted value with its surrounding whitespace intact");
});

// ---------------------------------------------------------------------------
// account_label (migration 0044, 2026-08-16) — see this file's own header for why create/update
// never populate this with a real value themselves (the s3-compatible custom-provider agent tool
// shares this write path, and static-publish/verify.ts's network probe must never run on an
// agent-reachable path). healAccountLabel is the ONE function allowed to write a real value, and only
// the human-gated admin route calls it.
// ---------------------------------------------------------------------------

test("createPublishCredential always starts a new row with accountLabel null — it never probes a provider itself", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "github-pages", token: "t" } });
  assert.equal(summary.accountLabel, null);
});

test("healAccountLabel persists a real value, readable back through listPublishCredentials/describeCredential — never decrypting", async () => {
  const deps = makeDeps();
  const created = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "github-pages", token: "t" } });
  assert.equal(created.accountLabel, null);

  await healAccountLabel(deps, { workspaceId: WORKSPACE, id: created.id, accountLabel: "leonaburime-ucla" });

  const described = await describeCredential(deps, { workspaceId: WORKSPACE, id: created.id });
  assert.equal(described?.accountLabel, "leonaburime-ucla");
  const listed = await listPublishCredentials(deps, { workspaceId: WORKSPACE });
  assert.equal(listed.find((c) => c.id === created.id)?.accountLabel, "leonaburime-ucla");
});

test("healAccountLabel never disturbs the sealed connection, isDefault, or updatedAt — a verify is not a credential change", async () => {
  let now = NOW;
  const deps = makeDeps({ clock: { nowMs: () => Date.parse(now) } });
  const created = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "github-pages", token: "t" } });
  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });

  now = "2026-08-20T00:00:00.000Z";
  await healAccountLabel(deps, { workspaceId: WORKSPACE, id: created.id, accountLabel: "leonaburime-ucla" });

  const after = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });
  assert.deepEqual(after?.sealed, before?.sealed);
  assert.equal(after?.isDefault, before?.isDefault);
  assert.equal(after?.updatedAt, before?.updatedAt);
  const resolved = await resolveForPublish(deps, { workspaceId: WORKSPACE, id: created.id });
  assert.equal(resolved?.connection.token, "t", "the underlying token must be completely unaffected by healing the account label");
});

test("healAccountLabel on a non-existent id is a harmless no-op (matches this port's other idempotent-write contracts)", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "survivor", connection: { providerId: "vercel", token: "untouched" } });
  const before = structuredClone(await deps.repo.listByWorkspace({ workspaceId: WORKSPACE }));
  await healAccountLabel(deps, { workspaceId: WORKSPACE, id: "no-such-id", accountLabel: "someone" });
  assert.deepEqual(await deps.repo.listByWorkspace({ workspaceId: WORKSPACE }), before);
});

test("updatePublishCredential with connection OMITTED preserves a previously-healed accountLabel", async () => {
  const deps = makeDeps();
  const created = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "github-pages", token: "t" } });
  await healAccountLabel(deps, { workspaceId: WORKSPACE, id: created.id, accountLabel: "leonaburime-ucla" });

  const updated = await updatePublishCredential(deps, { workspaceId: WORKSPACE, id: created.id, label: "renamed" });
  assert.equal(updated.accountLabel, "leonaburime-ucla", "a label-only rename must not clear a healed account label");
});

test("updatePublishCredential with a NEW connection resets accountLabel back to null — a stale label naming the OLD token's account must not survive", async () => {
  const deps = makeDeps();
  const created = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "x", connection: { providerId: "github-pages", token: "old-token" } });
  await healAccountLabel(deps, { workspaceId: WORKSPACE, id: created.id, accountLabel: "leonaburime-ucla" });

  const updated = await updatePublishCredential(deps, {
    workspaceId: WORKSPACE,
    id: created.id,
    connection: { providerId: "github-pages", token: "new-token" },
  });
  assert.equal(updated.accountLabel, null, "a new token replaces the credential — the old account label must not be carried over unverified");
});

// ---------------------------------------------------------------------------------------------
// Storage: `vendor_credential_sets` (2026-09-29). A row belongs to the vendor its host declares.
// ---------------------------------------------------------------------------------------------

test("a saved connection lands in its host's vendor group, sealed as {vendorId, ...fields} under the vendor AAD", async () => {
  const deps = makeDeps();
  const summary = await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "Pages", connection: { providerId: "github-pages", token: "ghp_abcd9876" } });

  assert.equal(summary.vendorId, "github");
  assert.equal(summary.tokenTail, "9876");
  const row = await deps.repo.findById({ workspaceId: WORKSPACE, id: summary.id });
  assert.equal(row?.vendorId, "github");
  const plaintext = await deps.sealer.open({ sealed: row!.sealed }, { aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: "github", id: summary.id }) });
  assert.deepEqual(JSON.parse(plaintext), { vendorId: "github", token: "ghp_abcd9876" });
});

test("a row written by the vendor-credentials store (the custom-provider form) resolves for its host", async () => {
  const deps = makeDeps();
  const sealed = await deps.sealer.seal({
    plaintext: JSON.stringify({ vendorId: "s3-compatible", region: "auto", bucket: "b", accessKeyId: "AK", secretAccessKey: "SK12", publicUrl: "https://x" }),
    key: await deps.keyring.activeKey(),
    aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: "s3-compatible", id: "v-1" }),
  });
  await deps.repo.insert({ workspaceId: WORKSPACE, id: "v-1", vendorId: "s3-compatible", label: "custom", sealed, tokenTail: "SK12", isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW });

  const resolved = await resolveDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "s3-compatible" });
  assert.deepEqual(resolved?.connection, { providerId: "s3-compatible", region: "auto", bucket: "b", accessKeyId: "AK", secretAccessKey: "SK12", publicUrl: "https://x" });
  assert.deepEqual((await listPublishCredentials(deps, { workspaceId: WORKSPACE })).map((c) => [c.id, c.providerId]), [["v-1", "s3-compatible"]]);
});

test("a vendor row no deploy host declares (a source-control-only vendor) is not a publish credential", async () => {
  const deps = makeDeps();
  const sealed = await deps.sealer.seal({ plaintext: JSON.stringify({ vendorId: "gitlab", token: "t" }), key: await deps.keyring.activeKey(), aad: "unused" });
  await deps.repo.insert({ workspaceId: WORKSPACE, id: "gl", vendorId: "gitlab", label: "gl", sealed, tokenTail: "t", isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW });

  assert.deepEqual(await listPublishCredentials(deps, { workspaceId: WORKSPACE }), []);
  assert.equal(await describeCredential(deps, { workspaceId: WORKSPACE, id: "gl" }), null);
  assert.equal(await resolveForPublish(deps, { workspaceId: WORKSPACE, id: "gl" }), null);
  await assert.rejects(
    () => updatePublishCredential(deps, { workspaceId: WORKSPACE, id: "gl", label: "renamed" }),
    (err: unknown) => err instanceof PublishCredentialNotFoundError && err.message === "no publish credential 'gl' in this workspace",
  );
});

test("hasDefaultForPublish reads the host's vendor group without decrypting", async () => {
  const deps = makeDeps();
  assert.equal(await hasDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "vercel" }), false);
  await createPublishCredential(deps, { workspaceId: WORKSPACE, label: "v", connection: { providerId: "vercel", token: "t" } });
  assert.equal(await hasDefaultForPublish({ repo: deps.repo, loadDeployTargets: deps.loadDeployTargets }, { workspaceId: WORKSPACE, providerId: "vercel" }), true);
  assert.equal(await hasDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "no-such-host" }), false);
});

test("a legacy row copied by the boot backfill is what a publish resolves", async () => {
  const deps = makeDeps();
  const legacyRepo = new InMemoryPublishCredentialSetRepo();
  const sealed = await deps.sealer.seal({
    plaintext: JSON.stringify({ providerId: "netlify", token: "nf-token" }),
    key: await deps.keyring.activeKey(),
    aad: buildPublishCredentialAad({ workspaceId: WORKSPACE, providerId: "netlify", id: "legacy-1" }),
  });
  await legacyRepo.insert({ workspaceId: WORKSPACE, id: "legacy-1", providerId: "netlify", label: "Netlify", sealed, isDefault: true, accountLabel: null, createdAt: NOW, updatedAt: NOW });

  assert.equal(await resolveDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "netlify" }), null, "the legacy table is no longer read");
  await copyPublishCredentialsToVendorTable(
    { legacyRepo, vendorRepo: deps.repo, sealer: deps.sealer, keyring: deps.keyring, registries: [await loadBundledDeployTargets()] },
    { workspaceId: WORKSPACE },
  );

  const resolved = await resolveDefaultForPublish(deps, { workspaceId: WORKSPACE, providerId: "netlify" });
  assert.equal(resolved?.id, "legacy-1");
  assert.deepEqual(resolved?.connection, { providerId: "netlify", token: "nf-token" });
});
