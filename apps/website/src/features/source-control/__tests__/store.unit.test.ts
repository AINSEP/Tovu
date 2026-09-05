import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../webhooks/secret-sealer.aesgcm.js";
import { InMemoryKeyring } from "../../webhooks/keyring.memory.js";
import type { KeyringPort } from "../../webhooks/index.js";
import { InMemorySourceControlCredentialSetRepo } from "../repo.memory.js";
import {
  createSourceControlCredential,
  deleteSourceControlCredential,
  describeCredential,
  isUniqueLabelViolation,
  listSourceControlCredentials,
  SourceControlCredentialDuplicateLabelError,
  SourceControlCredentialNotFoundError,
  SourceControlCredentialSecretStoreUnconfiguredError,
  SourceControlCredentialValidationError,
  updateSourceControlCredential,
  type SourceControlCredentialWriteDeps,
} from "../store.js";

/** Always fails — simulates a missing `TOVU_INTEGRATIONS_ROOT_KEY` without touching real env state.
 *  Mirrors `store.resolve.unit.test.ts`'s own local `BrokenKeyring` (kept local to each test file, not
 *  shared, per this feature's own no-cross-file-test-helper convention). Used here for the WRITE-side
 *  `sealConnection` catch — `store.resolve.unit.test.ts` already proves the READ-side `decryptRecord`
 *  catch, a different call site wrapping the identical error class. */
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

/** A `fetch`-shaped stub that never makes a real network call — the SAFE default for every test in
 *  this file that does not specifically care about the account-label probe's own behavior. Without
 *  this, every `github`-provider test above (added before migration 0044's inline probe existed)
 *  would start making a REAL request to `api.github.com/user` with a bogus token on every
 *  `create`/`updateSourceControlCredential` call — see `store.ts`'s own header for why this table's
 *  write path, unlike `publish-credentials/store.ts`'s, is allowed to probe inline. Rejects, which
 *  `probeAccountLabel`'s own `catch` folds into `null` — the same "never throws, degrades silently"
 *  contract the real fetch failure path exercises. */
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
    clock: { nowIso: () => NOW },
    idGen: { newId: () => `cred-${(counter += 1)}` },
    fetchFn: neverCallRealNetwork(),
    ...overrides,
  };
}

/** Builds a `fetch`-shaped stub that returns one fixed JSON response for every call — for tests that
 *  DO care what the account-label probe does with a real-shaped GitHub `/user` response. */
function fetchReturningJson(status: number, body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
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
  const first = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "one", connection: { providerId: "github", token: "t1" } });
  const second = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "two", connection: { providerId: "github", token: "t2" } });
  assert.equal(first.isDefault, true, "first-ever connection auto-defaults");
  assert.equal(second.isDefault, false);

  const updated = await updateSourceControlCredential(deps, { workspaceId: WORKSPACE, id: second.id, isDefault: true });
  assert.equal(updated.label, "two", "label must be left untouched when omitted from the update");
  assert.equal(updated.isDefault, true);

  const refreshedFirst = await describeCredential({ repo: deps.repo }, { workspaceId: WORKSPACE, id: first.id });
  assert.equal(refreshedFirst?.isDefault, false, "promoting the second row must demote the first — at most one default per group");
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

// ---------------------------------------------------------------------------
// account_label (migration 0044, 2026-08-16) — populated INLINE by create/update (unlike
// publish-credentials/store.ts's sibling column — see this file's own header for why the two tables
// differ). Only `github` ever gets a real value; `gitlab`/`bitbucket` are always null.
// ---------------------------------------------------------------------------

test("createSourceControlCredential populates accountLabel from a successful GitHub identity probe", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { login: "leonaburime-ucla" }) });
  const summary = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "github", token: "ghp_real_token" },
  });
  assert.equal(summary.accountLabel, "leonaburime-ucla");
});

test("createSourceControlCredential leaves accountLabel null when the GitHub probe is rejected (never fails the save)", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(401, { message: "Bad credentials" }) });
  const summary = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "github", token: "bad-token" },
  });
  assert.equal(summary.accountLabel, null, "a rejected probe must degrade to null, not throw or block the save");
});

test("createSourceControlCredential leaves accountLabel null when the probe's fetchFn throws (network failure, timeout) — never fails the save", async () => {
  const deps = makeDeps(); // default fetchFn always rejects
  const summary = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "default",
    connection: { providerId: "github", token: "t" },
  });
  assert.equal(summary.accountLabel, null);
});

test("createSourceControlCredential never probes gitlab or bitbucket — accountLabel stays null even with a fetchFn that would happily answer", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { login: "would-be-wrong-to-use" }) });
  const gitlab = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "gitlab", token: "t" } });
  assert.equal(gitlab.accountLabel, null);

  const bitbucket = await createSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    label: "bb",
    connection: { providerId: "bitbucket", token: "t", username: "leona" },
  });
  assert.equal(bitbucket.accountLabel, null, "bitbucket has no reviewed identity extractor — its OWN username field must not leak into accountLabel either");
});

test("updateSourceControlCredential with connection OMITTED preserves a previously-probed accountLabel (label-only rename)", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { login: "leonaburime-ucla" }) });
  const created = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t" } });
  assert.equal(created.accountLabel, "leonaburime-ucla");

  const renamed = await updateSourceControlCredential(deps, { workspaceId: WORKSPACE, id: created.id, label: "renamed" });
  assert.equal(renamed.accountLabel, "leonaburime-ucla", "a label-only rename must not clear or re-probe the account label");
});

test("updateSourceControlCredential with a NEW connection re-probes and can change the account label (a new token may belong to a different account)", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { login: "old-account" }) });
  const created = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t1" } });
  assert.equal(created.accountLabel, "old-account");

  deps.fetchFn = fetchReturningJson(200, { login: "new-account" });
  const updated = await updateSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    id: created.id,
    connection: { providerId: "github", token: "t2" },
  });
  assert.equal(updated.accountLabel, "new-account", "a new connection must re-probe rather than carry the old account label forward");
});

test("updateSourceControlCredential with a NEW connection resets accountLabel to null when the re-probe fails — a stale label must not survive a token change", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { login: "old-account" }) });
  const created = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t1" } });
  assert.equal(created.accountLabel, "old-account");

  deps.fetchFn = fetchReturningJson(401, { message: "Bad credentials" });
  const updated = await updateSourceControlCredential(deps, {
    workspaceId: WORKSPACE,
    id: created.id,
    connection: { providerId: "github", token: "t2-bad" },
  });
  assert.equal(updated.accountLabel, null, "the old account label must not survive a token change the re-probe could not confirm");
});

// ---------------------------------------------------------------------------
// Branch-coverage fill (2026-09-04) — every validation arm the suite above never independently
// exercised, plus the write-side seal-failure catch and isUniqueLabelViolation's own pure branches.
// ---------------------------------------------------------------------------

test("a label over the 200-character cap is rejected, distinctly from the blank-label case", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "x".repeat(201), connection: { providerId: "github", token: "t" } }),
    SourceControlCredentialValidationError
  );
  // The boundary itself (exactly 200) must still be accepted — proves this is a `>`, not a `>=`, cap.
  const atCap = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "x".repeat(200), connection: { providerId: "github", token: "t" } });
  assert.equal(atCap.label.length, 200);
});

test("isDefault must be a boolean when supplied — a truthy non-boolean (e.g. a string) is rejected, not coerced", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t" }, isDefault: "true" }),
    SourceControlCredentialValidationError
  );
});

test("a connection that is not a plain object (null, an array, or a primitive) is rejected", async () => {
  const deps = makeDeps();
  for (const badConnection of [null, ["not", "an", "object"], "a string", 42]) {
    await assert.rejects(
      createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: `bad-${String(badConnection)}`, connection: badConnection }),
      SourceControlCredentialValidationError,
      `connection ${JSON.stringify(badConnection)} must be rejected`
    );
  }
});

test("a connection.providerId that is not a string (e.g. a number) is rejected the same as an unrecognized provider string", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: 123, token: "t" } }),
    SourceControlCredentialValidationError
  );
});

test("a blank or missing token is rejected for every provider, not just bitbucket's username", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github" } }),
    SourceControlCredentialValidationError
  );
  await assert.rejects(
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "   " } }),
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
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t" } }),
    SourceControlCredentialSecretStoreUnconfiguredError
  );
});

test("updateSourceControlCredential fails closed the same way when a NEW connection cannot be sealed", async () => {
  const workingDeps = makeDeps();
  const created = await createSourceControlCredential(workingDeps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t1" } });

  const brokenDeps: SourceControlCredentialWriteDeps = { ...workingDeps, keyring: new BrokenKeyring(), sealer: new AesGcmSecretSealer(new BrokenKeyring()) };
  await assert.rejects(
    updateSourceControlCredential(brokenDeps, { workspaceId: WORKSPACE, id: created.id, connection: { providerId: "github", token: "t2" } }),
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

test("isUniqueLabelViolation: an Error with neither a matching .code nor matching message text is NOT a unique-constraint violation", () => {
  assert.equal(isUniqueLabelViolation(new Error("connection reset")), false);
});

test("a non-string label (e.g. a number) is rejected the same as a blank one", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: 42, connection: { providerId: "github", token: "t" } }),
    SourceControlCredentialValidationError
  );
});

test("bitbucket rejects a blank (whitespace-only) username, distinctly from a MISSING one", async () => {
  const deps = makeDeps();
  await assert.rejects(
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "bitbucket", token: "app-password", username: "   " } }),
    SourceControlCredentialValidationError
  );
});

/** `createSourceControlCredential`'s own `try { insert } catch (err) { if (isUniqueLabelViolation)
 *  ... else throw err }` — every other test either avoids a repo-level throw entirely or triggers the
 *  UNIQUE-violation arm. This proves the ELSE arm: an unrelated repo failure must propagate AS-IS,
 *  never mis-translated into DuplicateLabelError. */
test("createSourceControlCredential propagates a non-unique-violation repo failure unchanged, never mistaking it for a duplicate label", async () => {
  const real = new InMemorySourceControlCredentialSetRepo();
  const failingInsertRepo = {
    insert: async () => {
      throw new Error("SQLITE_BUSY: database is locked");
    },
    update: real.update.bind(real),
    findById: real.findById.bind(real),
    findDefaultByProvider: real.findDefaultByProvider.bind(real),
    listByProvider: real.listByProvider.bind(real),
    listByWorkspace: real.listByWorkspace.bind(real),
    delete: real.delete.bind(real),
  };
  const deps = makeDeps({ repo: failingInsertRepo });
  await assert.rejects(
    createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t" } }),
    (err: unknown) => err instanceof Error && !(err instanceof SourceControlCredentialDuplicateLabelError) && err.message === "SQLITE_BUSY: database is locked"
  );
});

/** Same ELSE-arm proof for `updateSourceControlCredential`'s own identical catch. */
test("updateSourceControlCredential propagates a non-unique-violation repo failure unchanged", async () => {
  const real = new InMemorySourceControlCredentialSetRepo();
  const deps = makeDeps({ repo: real });
  const created = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t" } });

  const failingUpdateRepo = {
    insert: real.insert.bind(real),
    update: async () => {
      throw new Error("SQLITE_BUSY: database is locked");
    },
    findById: real.findById.bind(real),
    findDefaultByProvider: real.findDefaultByProvider.bind(real),
    listByProvider: real.listByProvider.bind(real),
    listByWorkspace: real.listByWorkspace.bind(real),
    delete: real.delete.bind(real),
  };
  const brokenUpdateDeps = makeDeps({ repo: failingUpdateRepo });
  await assert.rejects(
    updateSourceControlCredential(brokenUpdateDeps, { workspaceId: WORKSPACE, id: created.id, label: "renamed" }),
    (err: unknown) => err instanceof Error && !(err instanceof SourceControlCredentialDuplicateLabelError) && err.message === "SQLITE_BUSY: database is locked"
  );
});

test("updateSourceControlCredential rejects renaming into ANOTHER row's (providerId, label), never silently colliding", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "taken", connection: { providerId: "github", token: "t1" } });
  const other = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "renameable", connection: { providerId: "github", token: "t2" } });

  await assert.rejects(
    updateSourceControlCredential(deps, { workspaceId: WORKSPACE, id: other.id, label: "taken" }),
    SourceControlCredentialDuplicateLabelError
  );
  const stillOriginal = await describeCredential({ repo: deps.repo }, { workspaceId: WORKSPACE, id: other.id });
  assert.equal(stillOriginal?.label, "renameable", "a rejected rename must not partially apply");
});

/** `probeAccountLabel`'s `extractGitHubLogin(body) ?? null` — every other 200-status test in this file
 *  supplies a `login` field; this proves the fallback for a well-formed 200 JSON response that simply
 *  doesn't carry one (a GitHub API shape this file has never actually seen, but must degrade the same
 *  as any other unusable probe result, never throw). */
test("createSourceControlCredential leaves accountLabel null when a 200 GitHub /user response has no recognizable login field", async () => {
  const deps = makeDeps({ fetchFn: fetchReturningJson(200, { id: 12345, name: "no login field here" }) });
  const summary = await createSourceControlCredential(deps, { workspaceId: WORKSPACE, label: "default", connection: { providerId: "github", token: "t" } });
  assert.equal(summary.accountLabel, null);
});
