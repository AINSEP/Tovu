import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "../../../integrations/secret-sealer.aesgcm";
import { InMemoryKeyring } from "../../../integrations/keyring.memory";
import { createPublishCredential, InMemoryPublishCredentialSetRepo, type PublishCredentialWriteDeps } from "../../deployments/publish-credentials/index";
import {
  createSourceControlCredential,
  InMemorySourceControlCredentialSetRepo,
  type SourceControlCredentialWriteDeps,
} from "../../source-control/index";
import { resolveDefaultForVendorDualRead, type VendorCredentialDualReadDeps } from "../dual-read";
import { createVendorCredential, VendorCredentialSecretStoreUnconfiguredError, type VendorCredentialWriteDeps } from "../store";
import { InMemoryVendorCredentialSetRepo } from "../repo.memory";

/**
 * @file `dual-read.ts` — proves the three outcomes this feature's own acceptance criteria name
 * explicitly: `vendor_credential_sets` populated -> reads new; empty -> falls back to whichever
 * legacy table used to carry that vendor and returns the SAME working credential a pre-Phase-3
 * caller already got; both empty -> an honest `null` ("not configured"), never a thrown error. Plus
 * the `github` dual-legacy-table precedence rule and the one adversarial case that matters here: a
 * corrupt/undecryptable NEW-table row must surface its own failure, never silently paper over real
 * data corruption by falling back to a legacy row instead.
 *
 * One shared sealer/keyring across all three tables — matches production (`server/deps.ts` seals
 * every credential table through the same `siteAssistantSecretSealer` instance); this file's own
 * `makeDeps` mirrors that rather than giving each table an isolated sealer, so a bug where dual-read
 * accidentally opened one table's ciphertext against a DIFFERENT table's AAD would show up as a
 * decrypt failure here exactly like it would in production, not be masked by test isolation.
 */

const WORKSPACE = "ws-1";
const NOW = "2026-08-16T00:00:00.000Z";

function makeDeps(): VendorCredentialDualReadDeps & {
  vendorWriteDeps: VendorCredentialWriteDeps;
  publishWriteDeps: PublishCredentialWriteDeps;
  sourceControlWriteDeps: SourceControlCredentialWriteDeps;
} {
  const keyring = new InMemoryKeyring();
  const sealer = new AesGcmSecretSealer(keyring);
  let counter = 0;
  const idGen = { newId: () => `cred-${(counter += 1)}` };
  const clock = { nowIso: () => NOW };

  const vendorRepo = new InMemoryVendorCredentialSetRepo();
  const publishRepo = new InMemoryPublishCredentialSetRepo();
  const sourceControlRepo = new InMemorySourceControlCredentialSetRepo();

  return {
    vendorRepo,
    publishRepo,
    sourceControlRepo,
    sealer,
    vendorWriteDeps: { repo: vendorRepo, sealer, keyring, clock, idGen },
    publishWriteDeps: { repo: publishRepo, sealer, keyring, clock, idGen },
    sourceControlWriteDeps: { repo: sourceControlRepo, sealer, keyring, clock, idGen },
  };
}

test("resolveDefaultForVendorDualRead: new table populated -> reads new, never touches either legacy table", async () => {
  const deps = makeDeps();
  await createVendorCredential(deps.vendorWriteDeps, {
    workspaceId: WORKSPACE,
    label: "Primary",
    connection: { vendorId: "vercel", token: "vendor_table_token" },
  });
  // A legacy row also exists for the same vendor — if this ever won instead of the new-table row,
  // this assertion would catch it via the token value below.
  await createPublishCredential(deps.publishWriteDeps, {
    workspaceId: WORKSPACE,
    label: "Legacy",
    connection: { providerId: "vercel", token: "legacy_table_token" },
  });

  const result = await resolveDefaultForVendorDualRead(deps, { workspaceId: WORKSPACE, vendorId: "vercel" });

  assert.ok(result);
  assert.equal(result.source, "vendor");
  assert.equal(result.connection.vendorId, "vercel");
  assert.equal((result.connection as { token: string }).token, "vendor_table_token");
});

test("resolveDefaultForVendorDualRead: new table EMPTY -> falls back to the legacy publish table and returns the working credential", async () => {
  const deps = makeDeps();
  await createPublishCredential(deps.publishWriteDeps, {
    workspaceId: WORKSPACE,
    label: "Existing GitHub Pages token",
    connection: { providerId: "github-pages", token: "ghp_legacy_value" },
  });

  const result = await resolveDefaultForVendorDualRead(deps, { workspaceId: WORKSPACE, vendorId: "github" });

  assert.ok(result);
  assert.equal(result.source, "legacy-publish");
  assert.deepEqual(result.connection, { vendorId: "github", token: "ghp_legacy_value" });
});

test("resolveDefaultForVendorDualRead: new table EMPTY -> falls back to the legacy source-control table for a source-control-only vendor", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps.sourceControlWriteDeps, {
    workspaceId: WORKSPACE,
    label: "Existing Bitbucket identity",
    connection: { providerId: "bitbucket", token: "bb_legacy_value", username: "octo" },
  });

  const result = await resolveDefaultForVendorDualRead(deps, { workspaceId: WORKSPACE, vendorId: "bitbucket" });

  assert.ok(result);
  assert.equal(result.source, "legacy-source-control");
  assert.deepEqual(result.connection, { vendorId: "bitbucket", token: "bb_legacy_value", username: "octo" });
});

test("resolveDefaultForVendorDualRead: both empty -> honest null, not an error", async () => {
  const deps = makeDeps();
  const result = await resolveDefaultForVendorDualRead(deps, { workspaceId: WORKSPACE, vendorId: "netlify" });
  assert.equal(result, null);
});

test("resolveDefaultForVendorDualRead: a vendor with no legacy source-control counterpart resolves null cleanly (no crash on the missing map entry)", async () => {
  const deps = makeDeps();
  const result = await resolveDefaultForVendorDualRead(deps, { workspaceId: WORKSPACE, vendorId: "s3-compatible" });
  assert.equal(result, null);
});

test("resolveDefaultForVendorDualRead: github with rows in BOTH legacy tables prefers the publish table (matches the backfill script's own precedence)", async () => {
  const deps = makeDeps();
  await createSourceControlCredential(deps.sourceControlWriteDeps, {
    workspaceId: WORKSPACE,
    label: "Source control identity",
    connection: { providerId: "github", token: "source_control_value" },
  });
  await createPublishCredential(deps.publishWriteDeps, {
    workspaceId: WORKSPACE,
    label: "Publish token",
    connection: { providerId: "github-pages", token: "publish_value" },
  });

  const result = await resolveDefaultForVendorDualRead(deps, { workspaceId: WORKSPACE, vendorId: "github" });

  assert.ok(result);
  assert.equal(result.source, "legacy-publish");
  assert.equal((result.connection as { token: string }).token, "publish_value");
});

test("resolveDefaultForVendorDualRead: a corrupt NEW-table row throws its own typed error and does NOT silently fall back to a legacy row", async () => {
  const deps = makeDeps();
  await createVendorCredential(deps.vendorWriteDeps, {
    workspaceId: WORKSPACE,
    label: "Corruptible",
    connection: { vendorId: "netlify", token: "will_be_unreadable" },
  });
  // A legacy row also exists — if the corrupt new-table row were swallowed instead of thrown, this
  // fallback data would be exactly what a bug could wrongly return instead of surfacing the failure.
  await createPublishCredential(deps.publishWriteDeps, {
    workspaceId: WORKSPACE,
    label: "Legacy fallback bait",
    connection: { providerId: "netlify", token: "legacy_bait_value" },
  });

  // A sealer built from a DIFFERENT keyring instance than the one every row above was sealed under —
  // `AesGcmSecretSealer.open()` fails closed against ciphertext it does not hold the matching key
  // for, the same "missing/wrong master secret" failure mode `store.ts`'s own `decryptRecord` doc
  // names as the realistic real-world cause of this error.
  const brokenSealer = new AesGcmSecretSealer(new InMemoryKeyring());

  await assert.rejects(
    () => resolveDefaultForVendorDualRead({ ...deps, sealer: brokenSealer }, { workspaceId: WORKSPACE, vendorId: "netlify" }),
    VendorCredentialSecretStoreUnconfiguredError
  );
});
