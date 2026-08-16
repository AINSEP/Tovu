import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../../integrations/keyring.memory";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory";
import {
  createSourceControlCredential,
  deleteSourceControlCredential,
  describeCredential,
  listSourceControlCredentials,
  SourceControlCredentialDuplicateLabelError,
  SourceControlCredentialNotFoundError,
  SourceControlCredentialValidationError,
  updateSourceControlCredential,
  type SourceControlCredentialWriteDeps,
} from "../store";

/**
 * @file `store.ts` — mirrors `publish-credentials/__tests__/store.unit.test.ts`'s coverage shape:
 * the "read model never touches the sealer" contract, validate-then-write CRUD, duplicate-label
 * rejection, and the `isDefault` group invariant (the adversarial cross-record behavior this
 * feature's write path exists to maintain — a provider with two simultaneous `isDefault: true` rows,
 * or zero after a delete, would silently break `defaultSourceControlCredentialForProvider` on the
 * admin page). No decrypt path is tested here because none exists — see `store.ts`'s own header for
 * why.
 */

const WORKSPACE = "ws-1";
const NOW = "2026-08-15T00:00:00.000Z";

function makeDeps(overrides: Partial<SourceControlCredentialWriteDeps> = {}): SourceControlCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemorySourceControlCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `cred-${(counter += 1)}` },
    ...overrides,
  };
}

test("createSourceControlCredential seals the connection and returns a summary with NO secret material", async () => {
  const deps = makeDeps();
  const summary = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "github", token: "ghp_secret_value" },
  });

  assert.equal(summary.providerId, "github");
  assert.equal(summary.label, "default");
  assert.equal(summary.configured, true);
  assert.equal(summary.createdAt, NOW);
  assert.equal(JSON.stringify(summary).includes("ghp_secret_value"), false);
});

test("bitbucket requires both token and username — missing username is a validation error", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, {
      workspaceId: WORKSPACE,
      label: "default",
      connection: { providerId: "bitbucket", token: "app-password" },
    }),
    SourceControlCredentialValidationError
  );
});

test("bitbucket with token+username succeeds; github/gitlab reject a username-less connection just fine (no username required)", async () => {
  const deps = makeDeps();
  const bitbucket = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "bitbucket", token: "app-password", username: "leona" },
  });
  assert.equal(bitbucket.providerId, "bitbucket");

  const gitlab = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "gitlab", token: "glpat-token" },
  });
  assert.equal(gitlab.providerId, "gitlab");
});

test("describeCredential/listSourceControlCredentials never touch the sealer — a broken sealer does not fail them", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "gitlab", token: "glpat-token" },
  });

  const brokenSealerRepoDeps = { repo: deps.repo }; // deliberately no sealer/keyring at all
  const list = await listSourceControlCredentials(brokenSealerRepoDeps, { workspaceId: WORKSPACE });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.label, "default");

  const one = await describeCredential(brokenSealerRepoDeps, { workspaceId: WORKSPACE, id: list[0]!.id });
  assert.equal(one?.providerId, "gitlab");
});

test("a provider's first-ever saved connection auto-defaults", async () => {
  const deps = makeDeps();
  const summary = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "github", token: "t" },
  });
  assert.equal(summary.isDefault, true);
});

test("isDefault group invariant: setting a new default clears the previous one, and at most one TRUE ever exists per (workspace, provider)", async () => {
  const deps = makeDeps();
  const first = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "one",
    connection: { providerId: "github", token: "t1" },
  });
  assert.equal(first.isDefault, true);

  const second = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "two",
    connection: { providerId: "github", token: "t2" },
    isDefault: true,
  });
  assert.equal(second.isDefault, true);

  const list = await listSourceControlCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  const defaults = list.filter((c) => c.isDefault);
  assert.equal(defaults.length, 1, "at most one default per (workspace, provider) — never zero, never two");
  assert.equal(defaults[0]!.id, second.id);
});

test("deleting the default promotes the group's most-recently-updated remaining row", async () => {
  const deps = makeDeps();
  const first = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "one",
    connection: { providerId: "github", token: "t1" },
  });
  const second = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "two",
    connection: { providerId: "github", token: "t2" },
  });
  // `second` is not default yet (first auto-defaulted). Delete the default and confirm promotion.
  await deleteSourceControlCredential(deps, { workspaceId: WORKSPACE, id: first.id });

  const list = await listSourceControlCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, second.id);
  assert.equal(list[0]!.isDefault, true, "the only remaining row must be promoted to default");
});

test("updateSourceControlCredential with connection OMITTED leaves the stored secret untouched (label-only rename)", async () => {
  const deps = makeDeps();
  const created = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "github", token: "t1" },
  });
  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });

  const renamed = await updateSourceControlCredential(deps, { workspaceId: WORKSPACE, id: created.id, label: "renamed" });
  assert.equal(renamed.label, "renamed");
  assert.equal(renamed.id, created.id);

  const after = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });
  assert.equal(after?.sealed.ciphertext, before?.sealed.ciphertext, "a label-only update must not reseal the connection");
  assert.equal(after?.sealed.nonce, before?.sealed.nonce);
});

test("updateSourceControlCredential on a non-existent id throws SourceControlCredentialNotFoundError", async () => {
  const deps = makeDeps();
  await assert.rejects(updateSourceControlCredential(deps, { workspaceId: WORKSPACE, id: "no-such-id", label: "x" }), SourceControlCredentialNotFoundError);
});

test("a duplicate (workspaceId, providerId, label) is rejected and never creates a second row", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "github", token: "t1" },
  });

  await assert.rejects(
    createSourceControlCredential(deps, {
      workspaceId: WORKSPACE,
      label: "default",
      connection: { providerId: "github", token: "t2" },
    }),
    SourceControlCredentialDuplicateLabelError
  );

  const list = await listSourceControlCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.equal(list.length, 1);
});

test("an unknown providerId is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, {
      workspaceId: WORKSPACE,
      label: "default",
      connection: { providerId: "sourcehut", token: "t" },
    }),
    SourceControlCredentialValidationError
  );
});

test("a blank label is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, {
      workspaceId: WORKSPACE,
      label: "   ",
      connection: { providerId: "github", token: "t" },
    }),
    SourceControlCredentialValidationError
  );
});
