import { LEGACY_SITE_KEY_FILENAME } from "#src/features/webhooks/site-key-sources";
import { LEGACY_SITE_KEY_ENV_VAR_NAME } from "#src/features/webhooks/site-key-sources";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

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
/**
 * F3431: what the two composition roots actually reference in CODE, from the TypeScript AST — so a
 * comment (not an AST node) can never count, and a word inside a longer identifier never counts.
 * Imports are kept apart: an import only counts when one of its bindings is used in the code.
 */
function compositionReferences(...files: string[]): { identifiers: Set<string>; strings: string[]; imports: Array<{ specifier: string; bindings: string[] }> } {
  const identifiers = new Set<string>();
  const strings: string[] = [];
  const imports: Array<{ specifier: string; bindings: string[] }> = [];
  for (const file of files) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const specifier = node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) ? node.moduleSpecifier.text : "";
        const bindings: string[] = [];
        const collect = (child: ts.Node): void => {
          if (ts.isImportSpecifier(child) || ts.isNamespaceImport(child) || ts.isExportSpecifier(child)) bindings.push(child.name.text);
          else if (ts.isImportClause(child) && child.name) bindings.push(child.name.text);
          ts.forEachChild(child, collect);
        };
        collect(node);
        imports.push({ specifier, bindings });
        return;
      }
      if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) identifiers.add(node.text);
      else if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) strings.push(node.text);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { identifiers, strings, imports };
}

const COMPOSITION = compositionReferences(path.join(COMPOSITION_DIR, "deps.ts"), path.join(COMPOSITION_DIR, "app.ts"));

/** A hint is wired when code uses it: an identifier, text inside a code string (SQL, dynamic
 * import), or an import path whose imported bindings the code then uses. */
function hintIsWired(hint: string): boolean {
  if (COMPOSITION.identifiers.has(hint)) return true;
  if (COMPOSITION.strings.some((text) => text.includes(hint))) return true;
  return COMPOSITION.imports.some(({ specifier, bindings }) => specifier.includes(hint) && bindings.some((name) => COMPOSITION.identifiers.has(name)));
}

test("AC-23/24/REQ-12: every capability in the inventory is referenced by real code (not a comment) in deps.ts or app.ts", () => {
  for (const cap of CAPABILITY_INVENTORY) {
    // The capability's bare name ("seo", "store", "forms") is a common word that matched comments
    // and unrelated identifiers; the sourceHints name the actual wiring, so they are what counts.
    assert.ok((cap.sourceHints ?? []).length > 0, `inventory entry "${cap.name}" names no sourceHints, so nothing can prove it is wired`);
    const wired = (cap.sourceHints ?? []).filter(hintIsWired);
    assert.ok(wired.length > 0, `inventory entry "${cap.name}": none of its sourceHints (${(cap.sourceHints ?? []).join(", ")}) is used by code in deps.ts/app.ts — likely stale (REQ-12)`);
  }
});

test("F3431: the wiring scan ignores comments and partial identifiers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-capability-scan-"));
  try {
    const file = path.join(dir, "probe.ts");
    fs.writeFileSync(file, [
      "// SqliteCommentOnlyRepo wires nothing",
      "/** featureOnlyInDocs */",
      'import { usedBinding } from "./features/used-path.js";',
      'import { unusedBinding } from "./features/unused-path.js";',
      "const longerSqliteThingRepoName = usedBinding();",
      'const sql = "SELECT * FROM table_in_sql";',
    ].join("\n"));
    const refs = compositionReferences(file);
    assert.equal(refs.identifiers.has("SqliteCommentOnlyRepo"), false);
    assert.equal(refs.identifiers.has("featureOnlyInDocs"), false);
    assert.equal(refs.identifiers.has("SqliteThingRepo"), false);
    assert.equal(refs.identifiers.has("usedBinding"), true);
    assert.ok(refs.strings.some((text) => text.includes("table_in_sql")));
    const used = refs.imports.find((entry) => entry.specifier.includes("features/used-path"));
    const unused = refs.imports.find((entry) => entry.specifier.includes("features/unused-path"));
    assert.equal(used?.bindings.some((name) => refs.identifiers.has(name)), true);
    assert.equal(unused?.bindings.some((name) => refs.identifiers.has(name)), false, "an import whose binding is never used is not wiring");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
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
      // A safe production deploy's env snapshot (ANALYTICS_SITE_KEY_SEED set, TOVU_ADMIN_PASSWORD
      // changed from the default, TOVU_SITE_KEY set) — matches what this fix's own
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
 * 2026-09-09 site-key fix — real-composition wiring regression, same DEPS_SOURCE
 * static-read technique the AC-23/24 test above already uses for the identical reason: exercising
 * `createSiteRouteDeps()` end-to-end here would let `newsletterKeyring` actually write to the
 * REAL `homedir()`-relative `~/.tovu/site-key.hex` on whichever machine runs this
 * suite whenever `TOVU_SITE_KEY` is unset there — a live-filesystem side effect this
 * test must never risk. A source-level assertion on the exact composition-root wiring line proves
 * the same fact safely: before this fix, `newsletterKeyring` was `new EnvOrFileKeyring()` with an
 * unconditional (bare) fallback — a hardcoded `true` regardless of runtime mode — which is exactly
 * the silent-rekey bug this whole fix closes for production. This assertion fails against that
 * hardcoded construction and passes only once the fallback is gated off `runtimeMode`.
 */
// D1: the real-composition behavior tests above now pin read-only resolution and env-only
// production newsletter signing, replacing the former allowFileFallback/allowFileAutoGenerate regexes.
