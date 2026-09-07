import assert from "node:assert/strict";
import test from "node:test";

import { runAadBackfill, type AadBackfillDeps, type AadBackfillUnit } from "../aad-backfill-runner.js";

/**
 * @file Proves the scaffold shared by all six `backfill-*-aad.ts` scripts in isolation, with fakes
 * standing in for the sealer/keyring/db — no real credential material, no real database. Each of
 * the six scripts already has its own black-box CLI test asserting the exact same invariants
 * end-to-end (`backfill-media-provider-credential-aad.test.ts` etc.); this file exists so the
 * shared scaffold's own contract — the piece `c412bc75` had to be hand-patched into six copies of —
 * is pinned once, at the seam, rather than only inferred from six passing end-to-end tests.
 */

function fakeUnit(overrides: Partial<AadBackfillUnit> = {}): AadBackfillUnit {
  return {
    label: "unit-1",
    sealed: { keyId: "k1", ciphertext: "c1", nonce: "n1", alg: "aes-256-gcm" },
    buildAad: () => "aad-1",
    write: () => {},
    ...overrides,
  };
}

const messages = {
  found: (n: number) => `found ${n}`,
  dryRunUnit: (label: string) => `dry-run ${label}`,
  migratedUnit: (label: string) => `migrated ${label}`,
  mismatch: (label: string) => `mismatch ${label}`,
};

test("runAadBackfill: a dry run never touches the sealer or keyring, even with pending units", async () => {
  const seal = () => {
    throw new Error("seal() must never be called during a dry run");
  };
  const open = () => {
    throw new Error("open() must never be called during a dry run");
  };
  const activeKey = () => {
    throw new Error("keyring.activeKey() must never be called during a dry run");
  };
  const write = () => {
    throw new Error("write() must never be called during a dry run");
  };

  const deps: AadBackfillDeps = {
    db: {} as AadBackfillDeps["db"],
    sealer: { seal, open } as unknown as AadBackfillDeps["sealer"],
    keyring: { activeKey } as unknown as AadBackfillDeps["keyring"],
    log: () => {},
  };

  const unit = fakeUnit({ write });
  const result = await runAadBackfill(deps, { apply: false }, { loadPending: () => [unit], messages });

  assert.deepEqual(result, { migrated: 1, total: 1 });
});

test("runAadBackfill: apply seals under the unit's own aad, verifies, then writes — in that order", async () => {
  const calls: string[] = [];
  const sealed = { keyId: "k2", ciphertext: "c2", nonce: "n2", alg: "aes-256-gcm" };

  const deps: AadBackfillDeps = {
    db: {} as AadBackfillDeps["db"],
    sealer: {
      open: async (input: { sealed: unknown; aad?: string }) => {
        calls.push(input.aad === undefined ? "open(no-aad)" : `open(${input.aad})`);
        return "plaintext-1";
      },
      seal: async (input: { aad?: string }) => {
        calls.push(`seal(${input.aad})`);
        return sealed;
      },
    } as unknown as AadBackfillDeps["sealer"],
    keyring: {
      activeKey: async () => {
        calls.push("activeKey");
        return "key-handle" as unknown as Awaited<ReturnType<AadBackfillDeps["keyring"]["activeKey"]>>;
      },
    } as unknown as AadBackfillDeps["keyring"],
    log: () => {},
  };

  const unit = fakeUnit({
    buildAad: () => "derived-aad",
    write: (writtenSealed) => {
      calls.push(`write(${writtenSealed.keyId})`);
    },
  });

  const result = await runAadBackfill(deps, { apply: true }, { loadPending: () => [unit], messages });

  assert.deepEqual(result, { migrated: 1, total: 1 });
  assert.deepEqual(calls, ["open(no-aad)", "activeKey", "seal(derived-aad)", "open(derived-aad)", "write(k2)"]);
});

test("runAadBackfill: a post-seal verification mismatch throws BEFORE writing, and reports the unit's label", async () => {
  let opened = 0;
  let wrote = false;

  const deps: AadBackfillDeps = {
    db: {} as AadBackfillDeps["db"],
    sealer: {
      open: async () => {
        opened += 1;
        // First open (decrypt) returns the real plaintext; the post-seal re-open returns something
        // different, simulating a corrupted re-seal.
        return opened === 1 ? "original-plaintext" : "SOMETHING-ELSE";
      },
      seal: async () => ({ keyId: "k3", ciphertext: "c3", nonce: "n3", alg: "aes-256-gcm" }),
    } as unknown as AadBackfillDeps["sealer"],
    keyring: {
      activeKey: async () => "key-handle" as unknown as Awaited<ReturnType<AadBackfillDeps["keyring"]["activeKey"]>>,
    } as unknown as AadBackfillDeps["keyring"],
    log: () => {},
  };

  const unit = fakeUnit({
    label: "workspace=w1 provider=openai",
    write: () => {
      wrote = true;
    },
  });

  await assert.rejects(
    () => runAadBackfill(deps, { apply: true }, { loadPending: () => [unit], messages }),
    /mismatch workspace=w1 provider=openai/
  );
  assert.equal(wrote, false, "a unit that fails its own post-seal verification must never be written");
});

test("runAadBackfill: a crash on unit 2 leaves unit 1's write already applied — no batching, no rollback", async () => {
  const written: string[] = [];

  const deps: AadBackfillDeps = {
    db: {} as AadBackfillDeps["db"],
    sealer: {
      open: async () => "plaintext",
      seal: async () => ({ keyId: "k", ciphertext: "c", nonce: "n", alg: "aes-256-gcm" }),
    } as unknown as AadBackfillDeps["sealer"],
    keyring: {
      activeKey: async () => "key-handle" as unknown as Awaited<ReturnType<AadBackfillDeps["keyring"]["activeKey"]>>,
    } as unknown as AadBackfillDeps["keyring"],
    log: () => {},
  };

  const goodUnit = fakeUnit({ label: "good", write: () => written.push("good") });
  const badUnit = fakeUnit({
    label: "bad",
    buildAad: () => {
      throw new Error("boom");
    },
    write: () => written.push("bad"),
  });

  await assert.rejects(() => runAadBackfill(deps, { apply: true }, { loadPending: () => [goodUnit, badUnit], messages }), /boom/);
  assert.deepEqual(written, ["good"], "the unit processed before the failure must already be written");
});
