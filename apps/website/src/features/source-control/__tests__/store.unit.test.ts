import { InMemoryVaultRepo } from "@jini-ai/platform/secrets/credential-sets";
import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort } from "../../webhooks/index.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";
import { credentialScope } from "../../vendor-credentials/vault-adapter.js";
import type { LoadSourceControlProviders } from "../provider-registry.js";
import { exampleProviders, exampleProvidersWithoutProbe, exampleRegistry } from './fixtures/example-provider.js';
import {
  createSourceControlCredential,
  deleteSourceControlCredential,
  describeCredential,
  resolveDefaultForSourceControl,
  isUniqueLabelViolation,
  listSourceControlCredentials,
  SourceControlCredentialDuplicateLabelError,
  SourceControlCredentialNotFoundError,
  SourceControlCredentialSecretStoreUnconfiguredError,
  SourceControlCredentialValidationError,
  updateSourceControlCredential,
  type SourceControlCredentialWriteDeps,
} from "../store.js";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

/** Always fails — simulates a missing `TOVU_SITE_KEY` without touching real env state.
 *  Mirrors `store.resolve.unit.test.ts`'s own local `BrokenKeyring` (kept local to each test file, not
 *  shared, per this feature's own no-cross-file-test-helper convention). Used here for the WRITE-side
 *  `sealConnection` catch — `store.resolve.unit.test.ts` already proves the READ-side `decryptRecord`
 *  catch, a different call site wrapping the identical error class. */
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
 * @file Neutral provider contracts for sealed credential CRUD, declared-field validation,
 * opaque saved rows, default-group invariants and save-time identity discovery.
 * All transports are injected fakes; saved read models never open ciphertext.
 */

const WORKSPACE = "ws-1";
const NOW = "2026-08-15T00:00:00.000Z";

/** Empty provider registry, distinct from a loaded provider whose identity probe returns null. */
const noProviders: LoadSourceControlProviders = async () => ({ list: () => [], get: () => undefined, refusals: [] });

/** Reject rather than allowing a fixture token onto the real network. */
function neverCallRealNetwork(): typeof fetch {
  return (async () => {
    throw new Error("test fetchFn stub: no test in this file should reach the real network");
  }) as unknown as typeof fetch;
}

function makeDeps(overrides: Partial<SourceControlCredentialWriteDeps> = {}): SourceControlCredentialWriteDeps {
  const keyring = new InMemoryKeyring();
  let counter = 0;
  return {
    repo: new InMemorySourceControlCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    clock: createFakeClock({ startIso: NOW }),
    idGen: { newId: () => `cred-${(counter += 1)}` },
    fetchFn: neverCallRealNetwork(),
    loadSourceControlProviders: exampleProviders,
    ...overrides,
  };
}

/** Builds a `fetch`-shaped stub that returns one fixed JSON response for every call — for tests that
 *  DO care what the account-label probe does with a real-shaped Example Git `/user` response. */
function fetchReturningJson(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
}

function fetchIdentity(expectedToken: string, account: string): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const valid = String(url) === "https://git.example.test/identity" &&
      new Headers(init?.headers).get("authorization") === `Bearer ${expectedToken}`;
    return Response.json(valid ? { account } : { message: "Bad request" }, { status: valid ? 200 : 401 });
  }) as typeof fetch;
}

test("createSourceControlCredential seals the connection and returns a summary with NO secret material", async () => {
  const deps = makeDeps();
  const summary = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-git", token: "fixture_secret_value" },
  } });

  assert.equal(summary.providerId, "example-git");
  assert.equal(summary.label, "default");
  assert.equal(summary.configured, true);
  assert.equal(summary.createdAt, NOW);
  assert.equal(JSON.stringify(summary).includes("fixture_secret_value"), false);
  const stored = await deps.repo.findById({ workspaceId: WORKSPACE, id: summary.id });
  assert.ok(stored);
  assert.equal(JSON.stringify(stored).includes("fixture_secret_value"), false);
  assert.ok(stored.sealed.ciphertext.length > 0);
  assert.ok(stored.sealed.nonce.length > 0);
});

test("example-paired requires both token and username — missing username is a validation error", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: {
      workspaceId: WORKSPACE,
      label: "default",
      connection: { providerId: "example-paired", token: "app-password" },
    } }),
    SourceControlCredentialValidationError
  );
});

test("example-paired with token+username succeeds; example-git/example-token reject a username-less connection just fine (no username required)", async () => {
  const deps = makeDeps();
  const paired = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-paired", token: "app-password", username: "leona" },
  } });
  assert.equal(paired.providerId, "example-paired");

  const tokenOnly = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-token", token: "fixture-token" },
  } });
  assert.equal(tokenOnly.providerId, "example-token");
});

test("describeCredential/listSourceControlCredentials never touch the sealer — a broken sealer does not fail them", async () => {
  const deps = makeDeps();
  await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-token", token: "fixture-token" },
  } });

  const brokenSealerRepoDeps = { repo: deps.repo }; // deliberately no sealer/keyring at all
  const list = await listSourceControlCredentials(brokenSealerRepoDeps, { workspaceId: WORKSPACE });
  assert.equal(list.length, 1);
  assert.equal(list[0]!.label, "default");

  const one = await describeCredential(brokenSealerRepoDeps, { workspaceId: WORKSPACE, id: list[0]!.id });
  assert.equal(one?.providerId, "example-token");
});

test("a provider's first-ever saved connection auto-defaults", async () => {
  const deps = makeDeps();
  const summary = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-git", token: "t" },
  } });
  assert.equal(summary.isDefault, true);
});

test("isDefault group invariant: setting a new default clears the previous one, and at most one TRUE ever exists per (workspace, provider)", async () => {
  const deps = makeDeps();
  const first = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "one",
    connection: { providerId: "example-git", token: "t1" },
  } });
  assert.equal(first.isDefault, true);

  const second = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "two",
    connection: { providerId: "example-git", token: "t2" },
    isDefault: true,
  } });
  assert.equal(second.isDefault, true);

  const list = await listSourceControlCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  const defaults = list.filter((c) => c.isDefault);
  assert.equal(defaults.length, 1, "at most one default per (workspace, provider) — never zero, never two");
  assert.equal(defaults[0]!.id, second.id);
});

test("deleting the default promotes the group's most-recently-updated remaining row", async () => {
  let now = NOW;
  const deps = makeDeps({ clock: { nowMs: () => Date.parse(now) } });
  const first = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "one", connection: { providerId: "example-git", token: "t1" } } });
  now = "2026-08-16T00:00:00.000Z";
  const second = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "two", connection: { providerId: "example-git", token: "t2" } } });
  now = "2026-08-17T00:00:00.000Z";
  const third = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "three", connection: { providerId: "example-git", token: "t3" } } });
  const otherProvider = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "example-token", connection: { providerId: "example-token", token: "gl" } } });
  const otherWorkspace = await createSourceControlCredential({ deps: deps, input: { workspaceId: "ws-2", label: "other", connection: { providerId: "example-git", token: "other" } } });
  now = "2026-08-18T00:00:00.000Z";
  await updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: second.id, label: "recently-updated" } });
  await deleteSourceControlCredential(deps, { workspaceId: WORKSPACE, id: first.id });
  const list = await listSourceControlCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.equal(list.length, 3);
  assert.deepEqual(list.filter((row) => row.providerId === "example-git" && row.isDefault).map((row) => row.id), [second.id]);
  assert.equal(list.find((row) => row.id === third.id)?.isDefault, false);
  assert.equal(list.find((row) => row.id === otherProvider.id)?.isDefault, true);
  assert.equal((await describeCredential(deps, { workspaceId: "ws-2", id: otherWorkspace.id }))?.isDefault, true);
});

test("updateSourceControlCredential with connection OMITTED leaves the stored secret untouched (label-only rename)", async () => {
  const deps = makeDeps();
  const created = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-git", token: "t1" },
  } });
  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });

  const renamed = await updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: created.id, label: "renamed" } });
  assert.equal(renamed.label, "renamed");
  assert.equal(renamed.id, created.id);

  const after = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });
  assert.equal(after?.sealed.ciphertext, before?.sealed.ciphertext, "a label-only update must not reseal the connection");
  assert.equal(after?.sealed.nonce, before?.sealed.nonce);
});

/**
 * Branch-coverage fill (2026-09-04): every update test above supplies a `label`, so
 * `input.label !== undefined ? validateLabel(...) : existing.label`'s FALSE arm (keep the existing
 * label) was never taken. Same gap for `requestedDefault === true ? true : existing.isDefault`'s TRUE
 * arm — no update test ever passed `isDefault: true`. This one update, changing ONLY `isDefault`
 * (label AND connection both omitted), exercises both at once: the SECOND credential (not yet
 * default) is promoted, its label is left untouched, and this proves it is the group invariant that
 * demotes the first — the same "at most one true" contract {@link decideCreateDefault} enforces on
 * create.
 */
test("updateSourceControlCredential changing ONLY isDefault leaves the label untouched and still enforces the one-default-per-group invariant", async () => {
  const deps = makeDeps();
  const first = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "one", connection: { providerId: "example-git", token: "t1" } } });
  const second = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "two", connection: { providerId: "example-git", token: "t2" } } });
  assert.equal(first.isDefault, true, "first-ever connection auto-defaults");
  assert.equal(second.isDefault, false);

  const updated = await updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: second.id, isDefault: true } });
  assert.equal(updated.label, "two", "label must be left untouched when omitted from the update");
  assert.equal(updated.isDefault, true);

  const refreshedFirst = await describeCredential({ repo: deps.repo }, { workspaceId: WORKSPACE, id: first.id });
  assert.equal(refreshedFirst?.isDefault, false, "promoting the second row must demote the first — at most one default per group");
});

test("updateSourceControlCredential on a non-existent id throws SourceControlCredentialNotFoundError", async () => {
  const deps = makeDeps();
  await assert.rejects(updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: "no-such-id", label: "x" } }), SourceControlCredentialNotFoundError);
});

test("a duplicate (workspaceId, providerId, label) is rejected and never creates a second row", async () => {
  const deps = makeDeps();
  await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-git", token: "t1" },
  } });

  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: {
      workspaceId: WORKSPACE,
      label: "default",
      connection: { providerId: "example-git", token: "t2" },
    } }),
    SourceControlCredentialDuplicateLabelError
  );

  const list = await listSourceControlCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.equal(list.length, 1);
});

test("an unknown providerId is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: {
      workspaceId: WORKSPACE,
      label: "default",
      connection: { providerId: "sourcehut", token: "t" },
    } }),
    SourceControlCredentialValidationError
  );
});

test("a blank label is rejected", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: {
      workspaceId: WORKSPACE,
      label: "   ",
      connection: { providerId: "example-git", token: "t" },
    } }),
    SourceControlCredentialValidationError
  );
});

// ---------------------------------------------------------------------------
// account_label (migration 0044, 2026-08-16) — populated INLINE by create/update (unlike
// publish-credentials/store.ts's sibling column — see this file's own header for why the two tables
// differ). Only `example-git` ever gets a real value; `example-token`/`example-paired` are always null.
// ---------------------------------------------------------------------------

test("createSourceControlCredential populates accountLabel from a successful Example Git identity probe", async () => {
  const deps = makeDeps({ fetchFn: fetchIdentity("fixture_real_token", "leonaburime-ucla") });
  const summary = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-git", token: "fixture_real_token" },
  } });
  assert.equal(summary.accountLabel, "leonaburime-ucla");
});

test("createSourceControlCredential leaves accountLabel null when the Example Git probe is rejected (never fails the save)", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(401, { message: "Bad credentials" }) });
  const summary = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-git", token: "bad-token" },
  } });
  assert.equal(summary.accountLabel, null, "a rejected probe must degrade to null, not throw or block the save");
});

test("createSourceControlCredential leaves accountLabel null when the probe's fetchFn throws (network failure, timeout) — never fails the save", async () => {
  const deps = makeDeps(); // default fetchFn always rejects
  const summary = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "example-git", token: "t" },
  } });
  assert.equal(summary.accountLabel, null);
});

test("createSourceControlCredential never probes example-token or example-paired — accountLabel stays null even with a fetchFn that would happily answer", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { account: "would-be-wrong-to-use" }) });
  const tokenOnly = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-token", token: "t" } } });
  assert.equal(tokenOnly.accountLabel, null);

  const paired = await createSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    label: "bb",
    connection: { providerId: "example-paired", token: "t", username: "leona" },
  } });
  assert.equal(paired.accountLabel, null, "example-paired has no reviewed identity extractor — its OWN username field must not leak into accountLabel either");
});

test("updateSourceControlCredential with connection OMITTED preserves a previously-probed accountLabel (label-only rename)", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { account: "leonaburime-ucla" }) });
  const created = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t" } } });
  assert.equal(created.accountLabel, "leonaburime-ucla");

  const renamed = await updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: created.id, label: "renamed" } });
  assert.equal(renamed.accountLabel, "leonaburime-ucla", "a label-only rename must not clear or re-probe the account label");
});

test("updateSourceControlCredential with a NEW connection re-probes and can change the account label (a new token may belong to a different account)", async () => {
  const deps = makeDeps({ fetchFn: fetchIdentity("t1", "old-account") });
  const created = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t1" } } });
  assert.equal(created.accountLabel, "old-account");

  deps.fetchFn = fetchIdentity("t2", "new-account");
  const updated = await updateSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    id: created.id,
    connection: { providerId: "example-git", token: "t2" },
  } });
  assert.equal(updated.accountLabel, "new-account", "a new connection must re-probe rather than carry the old account label forward");
  assert.deepEqual((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "example-git" }))?.connection,
    { providerId: "example-git", token: "t2" });
  await updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: created.id,
    connection: { providerId: "example-paired", token: "bb-new", username: "paired-new" } } });
  assert.equal(await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "example-git" }), null);
  assert.deepEqual((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "example-paired" }))?.connection,
    { providerId: "example-paired", token: "bb-new", username: "paired-new" });
});

test("updateSourceControlCredential with a NEW connection resets accountLabel to null when the re-probe fails — a stale label must not survive a token change", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { account: "old-account" }) });
  const created = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t1" } } });
  assert.equal(created.accountLabel, "old-account");

  deps.fetchFn = fetchReturningJson(401, { message: "Bad credentials" });
  const updated = await updateSourceControlCredential({ deps: deps, input: {
    workspaceId: WORKSPACE,
    id: created.id,
    connection: { providerId: "example-git", token: "t2-bad" },
  } });
  assert.equal(updated.accountLabel, null, "the old account label must not survive a token change the re-probe could not confirm");
});

// ---------------------------------------------------------------------------
// Branch-coverage fill (2026-09-04) — every validation arm the suite above never independently
// exercised, plus the write-side seal-failure catch and isUniqueLabelViolation's own pure branches.
// ---------------------------------------------------------------------------

test("a label over the 200-character cap is rejected, distinctly from the blank-label case", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "x".repeat(201), connection: { providerId: "example-git", token: "t" } } }),
    SourceControlCredentialValidationError
  );
  // The boundary itself (exactly 200) must still be accepted — proves this is a `>`, not a `>=`, cap.
  const atCap = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "x".repeat(200), connection: { providerId: "example-git", token: "t" } } });
  assert.equal(atCap.label.length, 200);
});

test("isDefault must be a boolean when supplied — a truthy non-boolean (e.g. a string) is rejected, not coerced", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t" }, isDefault: "true" } }),
    SourceControlCredentialValidationError
  );
});

test("a connection that is not a plain object (null, an array, or a primitive) is rejected", async () => {
  const deps = makeDeps();
  for (const badConnection of [null, ["not", "an", "object"], "a string", 42]) {
    await assert.rejects(
      createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: `bad-${String(badConnection)}`, connection: badConnection } }),
      SourceControlCredentialValidationError,
      `connection ${JSON.stringify(badConnection)} must be rejected`
    );
  }
});

test("a connection.providerId that is not a string (e.g. a number) is rejected the same as an unrecognized provider string", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: 123, token: "t" } } }),
    SourceControlCredentialValidationError
  );
});

test("a blank or missing token is rejected for every provider, not just example-paired's username", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git" } } }),
    SourceControlCredentialValidationError
  );
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "   " } } }),
    SourceControlCredentialValidationError
  );
});

/**
 * `sealConnection`'s own catch (write-side) — distinct from `decryptRecord`'s catch
 * (`store.resolve.unit.test.ts`'s own coverage), a different call site wrapping the same typed error.
 * Exercised on BOTH create and update, since `updateSourceControlCredential` calls `sealConnection`
 * again whenever a new `connection` is supplied.
 */
test("createSourceControlCredential fails closed with SourceControlCredentialSecretStoreUnconfiguredError when the keyring cannot supply a key — never a plaintext write", async () => {
  const deps = makeDeps({ keyring: new BrokenKeyring(), sealer: new AesGcmSecretSealer(new BrokenKeyring()) });
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t" } } }),
    SourceControlCredentialSecretStoreUnconfiguredError
  );
});

test("updateSourceControlCredential fails closed the same way when a NEW connection cannot be sealed", async () => {
  const workingDeps = makeDeps();
  const created = await createSourceControlCredential({ deps: workingDeps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t1" } } });

  const brokenDeps: SourceControlCredentialWriteDeps = { ...workingDeps, keyring: new BrokenKeyring(), sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  await assert.rejects(
    updateSourceControlCredential({ deps: brokenDeps, input: { workspaceId: WORKSPACE, id: created.id, connection: { providerId: "example-git", token: "t2" } } }),
    SourceControlCredentialSecretStoreUnconfiguredError
  );
});

test("isUniqueLabelViolation: a non-Error thrown value is never mistaken for a unique-constraint violation", () => {
  assert.equal(isUniqueLabelViolation("just a string"), false);
  assert.equal(isUniqueLabelViolation(null), false);
  assert.equal(isUniqueLabelViolation({ message: "UNIQUE constraint failed" }), false, "an object merely SHAPED like an Error is not one");
});

test("isUniqueLabelViolation: an Error with better-sqlite3's own .code is recognized, independent of its message text", () => {
  const err = new Error("some unrelated driver wording");
  (err as Error & { code: string }).code = "SQLITE_CONSTRAINT_UNIQUE";
  assert.equal(isUniqueLabelViolation(err), true);
});

test("isUniqueLabelViolation: a Postgres/PGlite UNIQUE violation (SQLSTATE 23505, Postgres wording) is recognized", () => {
  const err = Object.assign(new Error('duplicate key value violates unique constraint "source_control_credential_sets_label_idx"'), { code: "23505" });
  assert.equal(isUniqueLabelViolation(err), true);
});

test("isUniqueLabelViolation: an Error with neither a matching .code nor matching message text is NOT a unique-constraint violation", () => {
  assert.equal(isUniqueLabelViolation(new Error("connection reset")), false);
});

test("a non-string label (e.g. a number) is rejected the same as a blank one", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 42, connection: { providerId: "example-git", token: "t" } } }),
    SourceControlCredentialValidationError
  );
});

test("example-paired rejects a blank (whitespace-only) username, distinctly from a MISSING one", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-paired", token: "app-password", username: "   " } } }),
    SourceControlCredentialValidationError
  );
});

/** `createSourceControlCredential`'s own `try { insert } catch (err) { if (isUniqueLabelViolation)
 *  ... else throw err }` — every other test either avoids a repo-level throw entirely or triggers the
 *  UNIQUE-violation arm. This proves the ELSE arm: an unrelated repo failure must propagate AS-IS,
 *  never mis-translated into DuplicateLabelError. */
test("createSourceControlCredential propagates a non-unique-violation repo failure unchanged, never mistaking it for a duplicate label", async () => {
  const real = new InMemorySourceControlCredentialSetRepo();
  class FailingVault extends InMemoryVaultRepo {
    override async put(): Promise<never> { throw new Error("SQLITE_BUSY: database is locked"); }
  }
  const failingInsertRepo = new InMemorySourceControlCredentialSetRepo({ vault: new FailingVault({}) });
  const deps = makeDeps({ repo: failingInsertRepo });
  await assert.rejects(
    createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t" } } }),
    (err: unknown) => err instanceof Error && !(err instanceof SourceControlCredentialDuplicateLabelError) && err.message === "SQLITE_BUSY: database is locked"
  );
});

/** Same ELSE-arm proof for `updateSourceControlCredential`'s own identical catch. */
test("updateSourceControlCredential propagates a non-unique-violation repo failure unchanged", async () => {
  const real = new InMemorySourceControlCredentialSetRepo();
  const deps = makeDeps({ repo: real });
  const created = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t" } } });

  real.vault.put = async () => { throw new Error("SQLITE_BUSY: database is locked"); };
  const failingUpdateRepo = real;
  const brokenUpdateDeps = makeDeps({ repo: failingUpdateRepo });
  await assert.rejects(
    updateSourceControlCredential({ deps: brokenUpdateDeps, input: { workspaceId: WORKSPACE, id: created.id, label: "renamed" } }),
    (err: unknown) => err instanceof Error && !(err instanceof SourceControlCredentialDuplicateLabelError) && err.message === "SQLITE_BUSY: database is locked"
  );
});

test("updateSourceControlCredential rejects renaming into ANOTHER row's (providerId, label), never silently colliding", async () => {
  const deps = makeDeps();
  await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "taken", connection: { providerId: "example-git", token: "t1" } } });
  const other = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "renameable", connection: { providerId: "example-git", token: "t2" } } });

  await assert.rejects(
    updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: other.id, label: "taken" } }),
    SourceControlCredentialDuplicateLabelError
  );
  const stillOriginal = await describeCredential({ repo: deps.repo }, { workspaceId: WORKSPACE, id: other.id });
  assert.equal(stillOriginal?.label, "renameable", "a rejected rename must not partially apply");
});

/** `probeAccountLabel`'s `extractExample GitLogin(body) ?? null` — every other 200-status test in this file
 *  supplies a `account` field; this proves the fallback for a well-formed 200 JSON response that simply
 *  doesn't carry one (a Example Git API shape this file has never actually seen, but must degrade the same
 *  as any other unusable probe result, never throw). */
test("createSourceControlCredential leaves accountLabel null when a 200 Example Git /user response has no recognizable account field", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { id: 12345, name: "no account field here" }) });
  const summary = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "default", connection: { providerId: "example-git", token: "t" } } });
  assert.equal(summary.accountLabel, null);
});

test("new credentials for an unavailable provider are refused without network or persistence", async () => {
  const deps = makeDeps({ loadSourceControlProviders: noProviders });
  await assert.rejects(createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'work', connection: { providerId: 'example-git', token: 'fixture-secret' } } }), SourceControlCredentialValidationError);
  assert.deepEqual(await listSourceControlCredentials(deps, { workspaceId: WORKSPACE }), []);
});

test("credential CRUD and default resolution isolate workspaces and leave the owner's row untouched", async () => {
  const deps = makeDeps();
  const created = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "owner", connection: { providerId: "example-git", token: "owner-secret" } } });
  const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id });
  await assert.rejects(() => updateSourceControlCredential({ deps: deps, input: { workspaceId: "ws-2", id: created.id, label: "attacker" } }), SourceControlCredentialNotFoundError);
  await deleteSourceControlCredential(deps, { workspaceId: "ws-2", id: created.id });
  assert.equal(await describeCredential(deps, { workspaceId: "ws-2", id: created.id }), null);
  assert.deepEqual(await listSourceControlCredentials(deps, { workspaceId: "ws-2" }), []);
  assert.equal(await resolveDefaultForSourceControl(deps, { workspaceId: "ws-2", providerId: "example-git" }), null);
  assert.deepEqual(await deps.repo.findById({ workspaceId: WORKSPACE, id: created.id }), before);
  assert.deepEqual((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "example-git" }))?.connection, { providerId: "example-git", token: "owner-secret" });
});

for (const status of [401, 403]) test(`save-time probe reports ${status} as authentication failure after saving`, async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(status, { message: 'untrusted provider text' }) });
  const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'auth-check', connection: { providerId: 'example-git', token: 'fixture-credential-a9F2' } } });
  assert.equal(saved.connection, 'auth');
  assert.deepEqual(saved.tokenHint, { length: 23, last4: 'a9F2' });
  assert.equal((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: 'example-git' }))?.connection.token === 'fixture-credential-a9F2', true, 'rejection does not undo the save');
});

test('a pending old probe cannot overwrite a newer token rotation or label', async () => {
  const repo = new InMemorySourceControlCredentialSetRepo();
  let rotated = false;
  let deps: SourceControlCredentialWriteDeps;
  const fetchFn = (async () => {
    const [row] = await repo.listByWorkspace({ workspaceId: WORKSPACE });
    assert.equal(Boolean(row), true, 'the token is saved before probing');
    await updateSourceControlCredential({ deps: { ...deps, loadSourceControlProviders: exampleProvidersWithoutProbe }, input: {
      workspaceId: WORKSPACE, id: row!.id, label: 'renamed',
      connection: { providerId: 'example-git', token: 'replacement-credential-b8G3' },
    } });
    rotated = true;
    return new Response(JSON.stringify({ account: 'old-account' }), { status: 200 });
  }) as typeof fetch;
  deps = makeDeps({ repo, fetchFn });
  const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'original', connection: { providerId: 'example-git', token: 'original-credential-a9F2' } } });
  assert.equal(rotated, true);
  const current = await repo.findById({ workspaceId: WORKSPACE, id: saved.id });
  assert.equal(current?.label, 'renamed');
  assert.equal(current?.accountLabel, null, 'the old account label cannot attach to a new token');
  assert.equal((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: 'example-git' }))?.connection.token === 'replacement-credential-b8G3', true);
});

test("vault default resolution never lists sibling credentials", async () => {
  const deps = makeDeps({ loadSourceControlProviders: exampleProvidersWithoutProbe });
  const created = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Default", connection: { providerId: "example-git", token: "default-secret" } } });
  deps.repo.vault!.list = async () => { throw new Error("default reads must not list"); };
  assert.equal((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "example-git" }))?.id, created.id);
});

test("vault summary hints require no per-row reads or opens and suppress short tails", async () => {
  const deps = makeDeps({ loadSourceControlProviders: exampleProvidersWithoutProbe });
  await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Short", connection: { providerId: "example-git", token: "short" } } });
  await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Long", connection: { providerId: "example-git", token: "twelvechars!" } } });
  deps.repo.vault!.find = async () => { throw new Error("summary list must not hydrate rows"); };
  const listed = await listSourceControlCredentials({ repo: deps.repo }, { workspaceId: WORKSPACE });
  assert.deepEqual(listed.map(row => row.tokenHint), [{ length: 5, last4: null }, { length: 12, last4: "ars!" }]);
});

test("a source identity probe completing after deletion cannot recreate its vault row", async () => {
  let begin!: () => void;
  let finish!: () => void;
  const started = new Promise<void>(resolve => { begin = resolve; });
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const deps = makeDeps({ fetchFn: async () => { begin(); await pending; return Response.json({ account: "old-account" }); } });
  const saving = createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Pending", connection: { providerId: "example-git", token: "pending-secret" } } });
  await started;
  const saved = (await listSourceControlCredentials(deps, { workspaceId: WORKSPACE }))[0]!;
  await deleteSourceControlCredential(deps, { workspaceId: WORKSPACE, id: saved.id });
  finish();
  await saving;
  const reboot = new InMemorySourceControlCredentialSetRepo({ vault: deps.repo.vault! });
  assert.deepEqual(await listSourceControlCredentials({ repo: reboot }, { workspaceId: WORKSPACE }), []);
});

test("a source identity probe completing after rotation cannot heal the new token", async () => {
  let begin!: () => void;
  let finish!: () => void;
  let probes = 0;
  const started = new Promise<void>(resolve => { begin = resolve; });
  const pending = new Promise<void>(resolve => { finish = resolve; });
  const deps = makeDeps({ fetchFn: async () => {
    if (++probes === 1) { begin(); await pending; return Response.json({ account: "old-account" }); }
    return Response.json({ account: "new-account" });
  } });
  const saving = createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Pending", connection: { providerId: "example-git", token: "original-token" } } });
  await started;
  const saved = (await listSourceControlCredentials(deps, { workspaceId: WORKSPACE }))[0]!;
  await updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: saved.id, connection: { providerId: "example-git", token: "replacement-token" } } });
  finish();
  await saving;
  assert.equal((await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }))?.accountLabel, "new-account");
  assert.equal((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "example-git" }))?.connection.token, "replacement-token");
});

for (const selectDefault of [false, true]) {
  test(`provider-only source moves preserve the envelope and atomically select defaults (explicit=${selectDefault})`, async () => {
    const deps = makeDeps({ loadSourceControlProviders: exampleProvidersWithoutProbe });
    const original = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Moving", connection: { providerId: "example-git", token: "original-secret" } } });
    const sibling = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Remaining", connection: { providerId: "example-git", token: "remaining-secret" } } });
    const destination = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Destination", connection: { providerId: "example-token", token: "destination-secret" } } });
    assert.ok(deps.repo.updateAccountLabel);
    await deps.repo.updateAccountLabel({ workspaceId: WORKSPACE, id: original.id, accountLabel: "old-account" });
    const before = await deps.repo.vault!.find({ workspaceId: WORKSPACE, id: original.id });
    const noCrypto = { seal: async () => { throw new Error("move must not seal"); }, open: async () => { throw new Error("move must not open"); } };
    const moved = await updateSourceControlCredential({ deps: { ...deps, keyring: new BrokenKeyring(), sealer: noCrypto }, input: { workspaceId: WORKSPACE, id: original.id, connection: { providerId: "example-token", token: "" }, ...(selectDefault ? { isDefault: true } : {}) } });
    const after = await deps.repo.vault!.find({ workspaceId: WORKSPACE, id: original.id });
    assert.ok(before);
    assert.ok(after);
    assert.equal(moved.id, original.id);
    assert.equal(moved.createdAt, original.createdAt);
    assert.equal(moved.providerId, "example-token");
    assert.equal(moved.accountLabel, null);
    assert.equal(moved.isDefault, selectDefault);
    assert.deepEqual(after.sealed, before.sealed);
    assert.deepEqual(moved.tokenHint, original.tokenHint);
    assert.equal(after.revision, before.revision + 1);
    assert.equal((await deps.repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "example-git" }))?.id, sibling.id);
    assert.equal((await deps.repo.findDefaultByProvider({ workspaceId: WORKSPACE, providerId: "example-token" }))?.id, selectDefault ? original.id : destination.id);
    assert.equal((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "example-token" }))?.connection.token, selectDefault ? "original-secret" : "destination-secret");
    if (!selectDefault) {
      const returned = await updateSourceControlCredential({ deps: { ...deps, sealer: noCrypto }, input: { workspaceId: WORKSPACE, id: original.id, connection: { providerId: "example-git" }, isDefault: true } });
      assert.equal(returned.isDefault, true);
      assert.deepEqual((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: "example-git" }))?.connection, { providerId: "example-git", token: "original-secret" });
    }
  });
}

test("source provider moves reject label collisions and incompatible paired credentials without changing either group", async () => {
  const deps = makeDeps({ loadSourceControlProviders: exampleProvidersWithoutProbe });
  const original = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Collision", connection: { providerId: "example-git", token: "original-secret" } } });
  await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: "Collision", connection: { providerId: "example-token", token: "destination-secret" } } });
  const before = await deps.repo.vault!.list({ ...credentialScope({ workspaceId: WORKSPACE, kind: "source-control" }) });
  await assert.rejects(updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: original.id, connection: { providerId: "example-token" }, isDefault: true } }), SourceControlCredentialDuplicateLabelError);
  await assert.rejects(updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: original.id, connection: { providerId: "example-paired" } } }), SourceControlCredentialValidationError);
  await assert.rejects(updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: original.id, connection: { providerId: "unknown" } } }), SourceControlCredentialValidationError);
  assert.deepEqual(await deps.repo.vault!.list({ ...credentialScope({ workspaceId: WORKSPACE, kind: "source-control" }) }), before);
});

test('paired-field transitions use the declaration message and never alter either credential group', async () => {
  const deps = makeDeps({ loadSourceControlProviders: exampleProvidersWithoutProbe });
  const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'original', connection: { providerId: 'example-git', token: 'original-secret' } } });
  const before = await deps.repo.vault!.find({ workspaceId: WORKSPACE, id: saved.id });
  await assert.rejects(updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: saved.id, connection: { providerId: 'example-paired', token: '' } } }), {
    name: 'Error', message: 'moving to example-paired requires a new token and username',
  });
  assert.deepEqual(await deps.repo.vault!.find({ workspaceId: WORKSPACE, id: saved.id }), before);
  const moved = await updateSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, id: saved.id, connection: { providerId: 'example-paired', token: 'new-secret', username: 'operator' } } });
  assert.equal(moved.providerId, 'example-paired');
  assert.deepEqual((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: 'example-paired' }))?.connection, { providerId: 'example-paired', token: 'new-secret', username: 'operator' });
});

test('saved ids and payload fields stay opaque when their provider disappears', async () => {
  const deps = makeDeps({ loadSourceControlProviders: exampleProvidersWithoutProbe });
  const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'legacy', connection: { providerId: 'example-paired', token: 'saved-secret', username: 'operator' } } });
  const before = await deps.repo.vault!.find({ workspaceId: WORKSPACE, id: saved.id });
  const absent = { ...deps, loadSourceControlProviders: noProviders };
  const renamed = await updateSourceControlCredential({ deps: absent, input: { workspaceId: WORKSPACE, id: saved.id, label: 'retained', connection: { providerId: 'example-paired', token: '' }, isDefault: true } });
  assert.equal(renamed.providerId, 'example-paired');
  assert.deepEqual((await deps.repo.vault!.find({ workspaceId: WORKSPACE, id: saved.id }))?.sealed, before?.sealed);
  assert.deepEqual((await resolveDefaultForSourceControl(absent, { workspaceId: WORKSPACE, providerId: 'example-paired' }))?.connection, { providerId: 'example-paired', token: 'saved-secret', username: 'operator' });
  assert.equal((await describeCredential(absent, { workspaceId: WORKSPACE, id: saved.id }))?.label, 'retained');
  await assert.rejects(updateSourceControlCredential({ deps: absent, input: { workspaceId: WORKSPACE, id: saved.id, connection: { providerId: 'example-paired', token: 'replacement' } } }), SourceControlCredentialValidationError);
  await assert.rejects(updateSourceControlCredential({ deps: absent, input: { workspaceId: WORKSPACE, id: saved.id, connection: { providerId: 'unavailable' } } }), SourceControlCredentialValidationError);
  await deleteSourceControlCredential(absent, { workspaceId: WORKSPACE, id: saved.id });
  assert.deepEqual(await listSourceControlCredentials(absent, { workspaceId: WORKSPACE }), []);
});

test('optional and secret fields reuse credential.fields, while undeclared values are never sealed', async () => {
  const registry = exampleRegistry({ probe: false });
  const base = registry.list()[0]!;
  const descriptor = { ...base.descriptor, credential: { tokenField: 'token', fields: [
    { name: 'token', label: 'Token', required: true, secret: true as const },
    { name: 'note', label: 'Note', required: false },
    { name: 'password', label: 'Password', required: false, secret: true as const },
  ] } };
  const loaded = { ...base, descriptor };
  const deps = makeDeps({ loadSourceControlProviders: async () => ({ list: () => [loaded], get: id => id === descriptor.id ? loaded : undefined, refusals: [] }) });
  await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'optional-absent', connection: { providerId: descriptor.id, token: 'token-one', undeclared: 'ignored' } } });
  assert.deepEqual((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: descriptor.id }))?.connection, { providerId: descriptor.id, token: 'token-one' });
  const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'optional-present', isDefault: true, connection: { providerId: descriptor.id, token: 'token-two', note: 'metadata', password: '  paired-secret  ' } } });
  assert.deepEqual((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: descriptor.id }))?.connection, { providerId: descriptor.id, token: 'token-two', note: 'metadata', password: 'paired-secret' });
  assert.equal(JSON.stringify(saved).includes('paired-secret'), false);
  for (const note of ['', 42, '   ']) await assert.rejects(createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'invalid', connection: { providerId: descriptor.id, token: 'token-three', note } } }), SourceControlCredentialValidationError);
});

test('non-default declared token names accept canonical admin input and normalize form input on creation and rotation', async () => {
  const base = exampleRegistry({ probe: false, ids: ['example-access'] }).list()[0]!;
  const loaded = { ...base, descriptor: { ...base.descriptor, credential: { tokenField: 'accessToken', fields: [
    { name: 'accessToken', label: 'Access token', required: true, secret: true as const },
    { name: 'username', label: 'Username', required: true },
  ] } } };
  const deps = makeDeps({ loadSourceControlProviders: async () => ({ list: () => [loaded], get: id => id === loaded.descriptor.id ? loaded : undefined, refusals: [] }) });
  // Keep public labels distinct from secret field names so the leak assertion checks the payload.
  for (const [field, label] of [['token', 'canonical-input'], ['accessToken', 'declared-input']] as const) {
    const saved = await createSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, label, isDefault: true,
      connection: { providerId: 'example-access', [field]: '  first-secret  ', username: 'operator' } } });
    const resolve = async () => {
      const resolved = await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: 'example-access' });
      assert.ok(resolved);
      return resolved.connection;
    };
    assert.deepEqual(await resolve(), { providerId: 'example-access', token: 'first-secret', username: 'operator' });
    const rotated = await updateSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, id: saved.id,
      connection: { providerId: 'example-access', [field]: '  replacement-secret  ', username: 'new-operator' } } });
    assert.deepEqual(await resolve(), { providerId: 'example-access', token: 'replacement-secret', username: 'new-operator' });
    assert.equal(rotated.label, label);
    assert.equal(rotated.tokenHint?.last4, 'cret');
    assert.doesNotMatch(JSON.stringify(rotated), /first-secret|replacement-secret|accessToken|new-operator/);
    const before = await deps.repo.findById({ workspaceId: WORKSPACE, id: saved.id });
    for (const patch of [{}, { accessToken: '' }, { token: '', accessToken: 'ignored-secret' }]) {
      await updateSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, id: saved.id, connection: { providerId: 'example-access', ...patch } } });
      assert.deepEqual((await deps.repo.findById({ workspaceId: WORKSPACE, id: saved.id }))?.sealed, before?.sealed);
      assert.equal((await resolve()).token, 'replacement-secret');
    }
    for (const value of [42, null, '   ']) {
      await assert.rejects(updateSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, id: saved.id,
        connection: { providerId: 'example-access', accessToken: value, username: 'operator' } } }), SourceControlCredentialValidationError);
      assert.equal((await resolve()).token, 'replacement-secret');
    }
  }
});

test('opaque metadata and canonical blank-token patches never load provider code', async () => {
  const deps = makeDeps({ loadSourceControlProviders: exampleProvidersWithoutProbe });
  const saved = await createSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, label: 'original', connection: { providerId: 'example-git', token: 'saved-secret' } } });
  deps.loadSourceControlProviders = async () => assert.fail('an opaque metadata patch must not load providers');
  for (const connection of [undefined, {}, { providerId: 'example-git' }, { token: '' }]) {
    await updateSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, id: saved.id, label: 'renamed', connection } });
  }
  assert.equal((await resolveDefaultForSourceControl(deps, { workspaceId: WORKSPACE, providerId: 'example-git' }))?.connection.token, 'saved-secret');
});

test('T26: token-only rotation retains the saved provider', async () => {
  const deps = makeDeps({ loadSourceControlProviders: exampleProvidersWithoutProbe });
  const saved = await createSourceControlCredential({ deps, input: {
    workspaceId: WORKSPACE, label: 'rotation',
    connection: { providerId: 'example-git', token: 'original-fixture-token' },
  } });

  await assert.doesNotReject(() => updateSourceControlCredential({ deps, input: {
    workspaceId: WORKSPACE, id: saved.id, connection: { token: 'replacement-fixture-token' },
  } }));
  assert.deepEqual((await resolveDefaultForSourceControl(deps, {
    workspaceId: WORKSPACE, providerId: 'example-git',
  }))?.connection, { providerId: 'example-git', token: 'replacement-fixture-token' });
});

test('T36: blank-token patches refuse changes to other connection fields', async () => {
  const base = exampleRegistry({ probe: false }).list()[0]!;
  const loaded = { ...base, descriptor: { ...base.descriptor, credential: {
    tokenField: 'token', fields: [
      { name: 'token', label: 'Token', required: true, secret: true as const },
      { name: 'baseUrl', label: 'API URL', required: false },
    ],
  } } };
  const deps = makeDeps({ loadSourceControlProviders: async () => ({
    list: () => [loaded], get: id => id === loaded.descriptor.id ? loaded : undefined, refusals: [],
  }) });
  const connection = { providerId: loaded.descriptor.id, token: 'saved-fixture-token', baseUrl: 'https://old.example.test' };
  const saved = await createSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, label: 'endpoint', connection } });

  await assert.rejects(() => updateSourceControlCredential({ deps, input: {
    workspaceId: WORKSPACE, id: saved.id,
    connection: { providerId: loaded.descriptor.id, token: '', baseUrl: 'https://new.example.test' },
  } }), SourceControlCredentialValidationError);
  assert.deepEqual((await resolveDefaultForSourceControl(deps, {
    workspaceId: WORKSPACE, providerId: loaded.descriptor.id,
  }))?.connection, connection);
});

test('token-only providers without a credential form still use token admission; missing registry refuses new writes', async () => {
  const base = exampleRegistry({ probe: false }).list()[0]!;
  const { credential: _credential, ...descriptor } = base.descriptor;
  const loaded = { ...base, descriptor };
  const deps = makeDeps({ loadSourceControlProviders: async () => ({ list: () => [loaded], get: id => id === descriptor.id ? loaded : undefined, refusals: [] }) });
  const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'no-form', connection: { providerId: descriptor.id, token: 'accepted-secret' } } });
  assert.equal(saved.configured, true);
  const absent = { ...deps, loadSourceControlProviders: undefined };
  await assert.rejects(createSourceControlCredential({ deps: absent, input: { workspaceId: WORKSPACE, label: 'absent', connection: { providerId: descriptor.id, token: 'new-secret' } } }), SourceControlCredentialValidationError);
  // Envelope-only metadata writes never require a registry or a decryption key.
  assert.equal((await updateSourceControlCredential({ deps: absent, input: { workspaceId: WORKSPACE, id: saved.id, connection: { token: '' } } })).id, saved.id);
});

for (const failure of [new DOMException('bounded', 'AbortError'), new DOMException('bounded', 'TimeoutError')]) {
  test(`probe ${failure.name} is reported after a durable save`, async () => {
    const deps = makeDeps({ fetchFn: async () => { throw failure; } });
    const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'timeout', connection: { providerId: 'example-git', token: 'saved-secret' } } });
    assert.equal(saved.connection, 'timeout');
    assert.equal((await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }))?.configured, true);
  });
}

test('non-auth HTTP failures report unreachable without removing the saved credential', async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(503, {}) });
  const saved = await createSourceControlCredential({ deps: deps, input: { workspaceId: WORKSPACE, label: 'upstream', connection: { providerId: 'example-git', token: 'saved-secret' } } });
  assert.equal(saved.connection, 'unreachable');
});

test('a provider disabled after admission cannot prevent durable storage or run its identity probe', async () => {
  let reads = 0;
  const deps = makeDeps({ loadSourceControlProviders: async () => ++reads === 1 ? exampleRegistry() : noProviders('') });
  const saved = await createSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, label: 'racing-disable', connection: { providerId: 'example-git', token: 'stored-secret' } } });
  assert.equal(saved.connection, 'saved');
  assert.equal(saved.accountLabel, null);
  assert.equal((await describeCredential(deps, { workspaceId: WORKSPACE, id: saved.id }))?.configured, true);
});

test('a write-only caller can retain an admitted connection if its discovery port disappears', async () => {
  const deps = makeDeps();
  deps.loadSourceControlProviders = async () => { delete deps.loadSourceControlProviders; return exampleRegistry({ probe: false }); };
  const saved = await createSourceControlCredential({ deps, input: { workspaceId: WORKSPACE, label: 'no-discovery', connection: { providerId: 'example-git', token: 'stored-secret' } } });
  assert.equal(saved.connection, 'saved');
});
