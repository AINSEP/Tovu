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
    // One row changed — the ordinary case. The runner treats any other count as a stale write, so a
    // fixture returning nothing would abort every test that does not override this.
    write: () => 1,
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
      return 1;
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

/**
 * The lost-update guard. Every `backfill-*-aad.ts` script reads its pending rows up front, then
 * re-seals and writes them one at a time. Nothing made the write conditional on the row still being
 * in the state it was selected in, so a credential rotated by the live server between `loadPending`
 * and this unit's own write was silently overwritten with the OLD plaintext, re-sealed. The rotation
 * was reverted and nothing reported it — near-undetectable after the fact, since the row looks
 * perfectly well-formed and opens cleanly under the new AAD.
 *
 * The fix is a compare-and-swap: each script's `where` gained its own `aad_version = 0` predicate,
 * so a row someone else already moved off 0 matches nothing and the write reports 0 changes. These
 * tests pin the other half — that the runner treats "changed no rows" as an abort rather than as
 * success.
 */
function applyDeps(overrides: Partial<AadBackfillDeps> = {}): AadBackfillDeps {
  return {
    db: {} as AadBackfillDeps["db"],
    sealer: {
      seal: async () => ({ keyId: "k2", ciphertext: "c2", nonce: "n2", alg: "aes-256-gcm" }),
      open: async () => "plaintext",
    } as unknown as AadBackfillDeps["sealer"],
    keyring: { activeKey: async () => ({ id: "k2" }) } as unknown as AadBackfillDeps["keyring"],
    log: () => {},
    ...overrides,
  };
}

test("runAadBackfill: a write that changed NO row aborts the run instead of counting it as migrated", async () => {
  // What a concurrent rotation looks like from here: the CAS predicate matched nothing because the
  // row is no longer at aad_version 0. Counting that as migrated is the silent revert.
  const unit = fakeUnit({ write: () => 0 });
  await assert.rejects(
    () => runAadBackfill(applyDeps(), { apply: true }, { loadPending: () => [unit], messages }),
    /changed 0 row/,
  );
});

test("runAadBackfill: the abort names the unit, so an operator knows which credential to check", async () => {
  const unit = fakeUnit({ label: "workspace=ws-1 principal=admin-a", write: () => 0 });
  await assert.rejects(
    () => runAadBackfill(applyDeps(), { apply: true }, { loadPending: () => [unit], messages }),
    /workspace=ws-1 principal=admin-a/,
  );
});

test("runAadBackfill: a write that changed MORE than one row aborts too", async () => {
  // A `where` too loose to identify one row is as dangerous as one too tight, and in the other
  // direction: it would re-seal somebody else's credential under this unit's AAD.
  const unit = fakeUnit({ write: () => 2 });
  await assert.rejects(
    () => runAadBackfill(applyDeps(), { apply: true }, { loadPending: () => [unit], messages }),
    /changed 2 row/,
  );
});

test("runAadBackfill: a stale write aborts the WHOLE run — later units are never attempted", async () => {
  let secondAttempted = false;
  const stale = fakeUnit({ label: "unit-1", write: () => 0 });
  const later = fakeUnit({
    label: "unit-2",
    write: () => {
      secondAttempted = true;
      return 1;
    },
  });

  await assert.rejects(() =>
    runAadBackfill(applyDeps(), { apply: true }, { loadPending: () => [stale, later], messages }),
  );
  assert.equal(secondAttempted, false, "a concurrent writer invalidates the whole snapshot, not just one row");
});

test("runAadBackfill: a normal write reporting exactly one row still succeeds", async () => {
  const unit = fakeUnit({ write: () => 1 });
  const result = await runAadBackfill(applyDeps(), { apply: true }, { loadPending: () => [unit], messages });
  assert.deepEqual(result, { migrated: 1, total: 1 });
});

test("every backfill-*-aad.ts script writes under a CAS predicate and reports its row count", async () => {
  // The chokepoint above can only abort on a count somebody actually gives it. This is the other
  // half, checked across all six consumers at once: a fix that landed in one arm and left five
  // siblings on the old shape is this repo's most common defect, and the runner exists precisely so
  // that cannot happen silently.
  const fs = await import("node:fs");
  const path = await import("node:path");
  const scriptsDir = path.resolve(import.meta.dirname, "..");
  const scripts = fs
    .readdirSync(scriptsDir)
    .filter((name) => name.startsWith("backfill-") && name.endsWith("-aad.ts"));

  assert.equal(scripts.length, 6, `expected the six backfill-*-aad.ts scripts, found ${scripts.join(", ")}`);

  for (const name of scripts) {
    const source = fs.readFileSync(path.join(scriptsDir, name), "utf8");
    const writeBody = source.slice(source.indexOf("write: (sealed)"));
    assert.notEqual(source.indexOf("write: (sealed)"), -1, `${name}: no write callback found`);
    assert.match(
      writeBody,
      /\.run\(\)\.changes/,
      `${name}: its write must report rows changed, or the runner has nothing to check`,
    );
    assert.match(
      writeBody,
      /eq\(\w+\.(aadVersion|oauthAadVersion), 0\)/,
      `${name}: its write must be conditional on the row still being at aad_version 0`,
    );
  }
});
