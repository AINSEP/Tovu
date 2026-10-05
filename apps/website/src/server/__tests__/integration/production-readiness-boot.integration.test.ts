import { LEGACY_SITE_KEY_FILENAME } from "#src/features/webhooks/site-key-sources";
import { LEGACY_SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import test from "node:test";

import { CAPABILITY_INVENTORY } from "../../runtime/configuration/capability-inventory.js";
import { runProductionReadinessGate } from "../../runtime/boot/production-readiness-gate.js";
import { resolveRuntimeMode } from "#src/contracts/core/runtime-mode";
import { createSiteRouteDeps } from "../../runtime/composition/deps.js";
import { processUnsubscribe } from "#src/features/newsletter/unsubscribe";
import { toPublicUnsubscribeDeps } from "../../inbound/public-http/routes/site/newsletter-deps.js";

async function withComposedSite(
  t: test.TestContext,
  mode: "local" | "production",
  exercise: (required: { dbPath: string; root: string; open: () => Promise<Awaited<ReturnType<typeof createSiteRouteDeps>>>; close: () => Promise<void> }) => Promise<void>
): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-production-composition-"));
  const cwd = process.cwd();
  const names = ["TOVU_RUNTIME_MODE", "TOVU_ADMIN_PASSWORD", "ANALYTICS_ROOT_KEY_SEED", "TOVU_SITE_KEY", LEGACY_SITE_KEY_ENV_VAR_NAME];
  const original = new Map(names.map((name) => [name, process.env[name]]));
  const home = t.mock.method(os, "homedir", () => root);
  syncBuiltinESMExports();
  let closeStore: (() => Promise<void>) | undefined;
  const close = async () => {
    const current = closeStore;
    closeStore = undefined;
    await current?.();
  };
  try {
    process.chdir(root);
    process.env.TOVU_RUNTIME_MODE = mode;
    process.env.TOVU_ADMIN_PASSWORD = "composition-test-password";
    process.env.ANALYTICS_ROOT_KEY_SEED = "12".repeat(32);
    process.env[LEGACY_SITE_KEY_ENV_VAR_NAME] = "34".repeat(32);
    delete process.env.TOVU_SITE_KEY;
    const dbPath = path.join(root, "site", "content.db");
    fs.mkdirSync(path.dirname(dbPath));
    const open = async () => {
      assert.equal(closeStore, undefined, "close the previous composition before reopening");
      const deps = await createSiteRouteDeps(dbPath, { storeRole: "client", onStoreOpened: (store) => { closeStore = () => store.close(); } });
      await Promise.all(Object.values(deps).filter((value) => value instanceof Promise));
      // Drain the SQLite boot writers chained off the exposed readiness promises.
      await new Promise<void>((resolve) => setImmediate(resolve));
      // An empty batch waits for the unexposed mailer boot lookup without sending mail.
      await deps.mailer.sendBatch([], {
        idempotencyKey: "composition-fixture-drain", workspaceId: deps.workspaceId,
        sourceContext: { module: "composition-test" }, lane: "interactive",
      });
      return deps;
    };
    await exercise({ dbPath, root, open, close });
  } finally {
    try {
      await close();
    } finally {
      process.chdir(cwd);
      home.mock.restore();
      syncBuiltinESMExports();
      for (const [name, value] of original) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
}

for (const mode of ["local", "production"] as const) {
  test(`composed public unsubscribe in ${mode} refuses a missing key without minting one`, async (t) => {
    await withComposedSite(t, mode, async ({ root, open }) => {
      const deps = await open();
      delete process.env[LEGACY_SITE_KEY_ENV_VAR_NAME];
      const localKey = path.join(root, ".tovu", LEGACY_SITE_KEY_FILENAME);
      const productionKey = path.join(root, "sites", ".tovu", "site-key.hex");
      await assert.rejects(processUnsubscribe({ deps: toPublicUnsubscribeDeps(deps), input: { rawToken: "e30.x" } }), /no site key/);
      assert.equal(fs.existsSync(localKey), false);
      assert.equal(fs.existsSync(productionKey), false);
      if (mode === "production") {
        fs.mkdirSync(path.dirname(productionKey), { recursive: true });
        fs.writeFileSync(productionKey, "56".repeat(32));
        await assert.rejects(processUnsubscribe({ deps: toPublicUnsubscribeDeps(deps), input: { rawToken: "e30.x" } }), /no site key/);
        assert.equal(fs.readFileSync(productionKey, "utf8"), "56".repeat(32));
      }
    });
  });
}

test("the real production gateway keeps a pending confirmation token after closing and reopening its site", async (t) => {
  await withComposedSite(t, "production", async ({ open, close }) => {
    const record = {
      confirmationToken: "ctok-production-restart", planHash: "distinct-plan-hash", scopeId: "workspace-production",
      confirmerPrincipalId: "principal-production", status: "minted" as const,
      createdAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-10-01T00:10:00.000Z",
    };
    const first = await open();
    await first.gatedMutations.gatewayDeps.tokens.save(record);
    await close();
    const reopened = await open();
    assert.deepEqual(await reopened.gatedMutations.gatewayDeps.tokens.findByToken(record.confirmationToken), record);
    assert.deepEqual(await reopened.gatedMutations.gatewayDeps.tokens.tryRedeem({ token: record.confirmationToken, now: "2026-10-01T00:05:00.000Z" }), {
      redeemed: true, record: { ...record, status: "redeemed" },
    });
  });
});

/**
 * @file SPEC-022 — real-composition integration coverage (AC-01, AC-05, AC-12, AC-23/24,
 * INV-01). Unlike the unit suite (fakes throughout), this exercises the REAL
 * `capability-inventory.ts` against the REAL route-registration source in `deps.ts`/`app.ts`,
 * and the REAL gate function against today's actual durability state.
 *
 * History (why the second test below flipped polarity): as of ADR-046 Phase 1's rollout, every
 * production-classified capability EXCEPT `gated-mutations` had gained a durable SQLite adapter —
 * `gated-mutations` alone still composed `InMemoryTokenStore` unconditionally
 * (`core/gated-mutations/composition.ts`'s old `buildGatewayDeps`), with no env escape hatch. That
 * made `TOVU_RUNTIME_MODE=production` refuse to boot ALWAYS, regardless of any env var — verified
 * empirically (a real boot on a scratch port), not just by reading the source. This test used to
 * assert exactly that refusal (a genuine, if unintended, regression test for the bug). The SPEC-022
 * durability fix gave `gated-mutations` a real durable adapter (`SqliteTokenStore`,
 * `platform/db/sqlite/gated-mutation-token-repo.sqlite.ts`, `gated_mutation_tokens` table,
 * migration `0052`) — production boot can now genuinely succeed, so the test now asserts that
 * instead.
 */

const COMPOSITION_DIR = path.join(import.meta.dirname, "..", "..", "runtime", "composition");
const DEPS_SOURCE = fs.readFileSync(path.join(COMPOSITION_DIR, "deps.ts"), "utf8");
const APP_SOURCE = fs.readFileSync(path.join(COMPOSITION_DIR, "app.ts"), "utf8");

test("AC-23/24/REQ-12: every capability named in the inventory corresponds to something real in deps.ts or app.ts", () => {
  for (const cap of CAPABILITY_INVENTORY) {
    const mentioned = DEPS_SOURCE.includes(cap.name) || APP_SOURCE.includes(cap.name) || (cap.sourceHints ?? []).some((h) => DEPS_SOURCE.includes(h) || APP_SOURCE.includes(h));
    assert.ok(mentioned, `inventory entry "${cap.name}" (or one of its sourceHints) was not found anywhere in deps.ts/app.ts — likely stale (REQ-12)`);
  }
});

test("SPEC-022 durability fix regression: gated-mutations' historical exact refusal text (locked in so a future regression is legible)", async () => {
  // Reconstructs the OLD `gated-mutations` capability-inventory entry shape verbatim (classification
  // "production", hasDurableAdapter false) as a synthetic single-entry inventory — not the real
  // CAPABILITY_INVENTORY, which now reports this capability as durable. This is what the REAL gate
  // actually printed, always, in production mode, before this fix — reproduced live via a real
  // process boot (`TOVU_RUNTIME_MODE=production node --import tsx src/index.ts` on a scratch port)
  // during this fix's own verification.
  const result = await runProductionReadinessGate({
    mode: "production",
    inventory: [
      {
        name: "gated-mutations",
        ownerModule: "core/gated-mutations",
        classification: "production",
        sourceOfTruth: "in-memory (InMemoryTokenStore, one process-lifetime instance)",
        readinessDependencies: ["durable TokenStorePort adapter (Phase 1)"],
        startupCriticality: "critical",
        securityDependencies: ["identity authorize() gate", "actor-identity binding"],
        restartTestOwner: "core/gated-mutations test suite",
        hasDurableAdapter: false,
      },
    ],
    envSnapshot: { hasDevSecretPlaceholder: false, hasLocalhostEgressAllowance: false, hasAlwaysOnAnalyticsStub: false, hasDefaultOwnerPassword: false, hasMissingSiteKey: false },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, "PRODUCTION_CAPABILITY_NOT_DURABLE");
    assert.equal(
      result.failures[0].message,
      'Refusing to boot in production mode: capability "gated-mutations" is classified production but has no durable adapter configured.'
    );
    assert.deepEqual(result.failures[0].details, { capabilityName: "gated-mutations", missingRequirement: "durable-adapter" });
  }
});

test("AC-05/INV-01 (regression, FAILS FIRST without the fix): the real composition now boots successfully in production mode — every real production-classified capability is durable", async () => {
  const mode = resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "production" } });
  assert.equal(mode, "production");

  const gatedMutationsEntry = CAPABILITY_INVENTORY.find((c) => c.name === "gated-mutations");
  assert.ok(gatedMutationsEntry, "gated-mutations capability-inventory entry must exist");
  assert.equal(gatedMutationsEntry!.hasDurableAdapter, true, "gated-mutations must now be durable (SqliteTokenStore) — before this fix it was false, unconditionally");

  const productionClassifiedButUndurable = CAPABILITY_INVENTORY.filter((c) => c.classification === "production" && c.hasDurableAdapter === false);
  assert.deepEqual(
    productionClassifiedButUndurable.map((c) => c.name),
    [],
    "every production-classified capability must now have a durable adapter — before this fix this list included \"gated-mutations\", which alone was enough to always refuse production boot"
  );

  const result = await runProductionReadinessGate({
    mode,
    inventory: CAPABILITY_INVENTORY,
    envSnapshot: {
      // A safe production deploy's env snapshot (ANALYTICS_ROOT_KEY_SEED set, TOVU_ADMIN_PASSWORD
      // changed from the default, TOVU_INTEGRATIONS_ROOT_KEY set) — matches what this fix's own
      // manual boot verification used.
      hasDevSecretPlaceholder: false,
      hasLocalhostEgressAllowance: false,
      hasAlwaysOnAnalyticsStub: false,
      hasDefaultOwnerPassword: false,
      hasMissingSiteKey: false,
    },
  });

  assert.equal(result.ok, true, "the real composition must now be able to boot in production mode given a safe envSnapshot — before this fix it always refused with PRODUCTION_CAPABILITY_NOT_DURABLE for \"gated-mutations\", regardless of env vars");
});

test("§2.1 step 1: the real composition boots successfully in local mode despite the same real non-durable capabilities", async () => {
  const mode = resolveRuntimeMode({ env: { TOVU_RUNTIME_MODE: "local" } });
  const result = await runProductionReadinessGate({
    mode,
    inventory: CAPABILITY_INVENTORY,
    envSnapshot: { hasDevSecretPlaceholder: false, hasLocalhostEgressAllowance: false, hasAlwaysOnAnalyticsStub: false, hasDefaultOwnerPassword: false, hasMissingSiteKey: false },
  });
  assert.equal(result.ok, true, "local mode must never be blocked by production-only containment");
});

/**
 * 2026-09-09 integrations-root-key fix — real-composition wiring regression, same DEPS_SOURCE
 * static-read technique the AC-23/24 test above already uses for the identical reason: exercising
 * `createSiteRouteDeps()` end-to-end here would let `newsletterKeyring` actually write to the
 * REAL `homedir()`-relative `~/.tovu/integrations-root-key.hex` on whichever machine runs this
 * suite whenever `TOVU_INTEGRATIONS_ROOT_KEY` is unset there — a live-filesystem side effect this
 * test must never risk. A source-level assertion on the exact composition-root wiring line proves
 * the same fact safely: before this fix, `newsletterKeyring` was `new EnvOrFileKeyring()` with an
 * unconditional (bare) fallback — a hardcoded `true` regardless of runtime mode — which is exactly
 * the silent-rekey bug this whole fix closes for production. This assertion fails against that
 * hardcoded construction and passes only once the fallback is gated off `runtimeMode`.
 */
// D1: the real-composition behavior tests above now pin read-only resolution and env-only
// production newsletter signing, replacing the former allowFileFallback/allowFileAutoGenerate regexes.
