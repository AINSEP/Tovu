import assert from "node:assert/strict";
import test from "node:test";

import { AesGcmSecretSealer } from "#src/features/webhooks/secret-sealer.aesgcm";
import { InMemoryKeyring } from "#src/features/webhooks/keyring.memory";
import { buildVendorCredentialAad } from "#src/features/vendor-credentials/aad";
import { InMemoryVendorCredentialSetRepo } from "#src/features/vendor-credentials/repo.memory";
import { loadBundledDeployTargets } from "#src/features/deployments/deploy-targets/__tests__/bundled-deploy-targets.fixture";
import { buildPublishCredentialAad } from "../aad.js";
import { InMemoryPublishCredentialSetRepo } from "../repo.memory.js";
import { copyPublishCredentialsToVendorTable, type VendorTableBackfillDeps } from "../vendor-table-backfill.js";

/**
 * @file The boot-time copy of legacy `publish_credential_sets` rows into `vendor_credential_sets`:
 * same id, the host's declared vendor, re-sealed under the vendor table's AAD and proven openable
 * before it is written; idempotent; never touches the legacy rows.
 */

const WORKSPACE = "ws-1";
const CREATED = "2026-08-15T00:00:00.000Z";

async function makeDeps(): Promise<VendorTableBackfillDeps & { keyring: InMemoryKeyring; sealer: AesGcmSecretSealer }> {
  const keyring = new InMemoryKeyring();
  return {
    legacyRepo: new InMemoryPublishCredentialSetRepo(),
    vendorRepo: new InMemoryVendorCredentialSetRepo(),
    sealer: new AesGcmSecretSealer(keyring),
    keyring,
    registries: [await loadBundledDeployTargets()],
  };
}

/** Seeds one legacy row exactly as the old store sealed it: `{providerId, ...fields}` under the
 *  legacy table's AAD. */
async function seedLegacy(
  deps: Awaited<ReturnType<typeof makeDeps>>,
  row: { id: string; providerId: string; label: string; isDefault: boolean; accountLabel?: string | null; fields: Record<string, string> },
) {
  const sealed = await deps.sealer.seal({
    plaintext: JSON.stringify({ providerId: row.providerId, ...row.fields }),
    key: await deps.keyring.activeKey(),
    aad: buildPublishCredentialAad({ workspaceId: WORKSPACE, providerId: row.providerId, id: row.id }),
  });
  await deps.legacyRepo.insert({
    workspaceId: WORKSPACE,
    id: row.id,
    providerId: row.providerId,
    label: row.label,
    sealed,
    isDefault: row.isDefault,
    accountLabel: row.accountLabel ?? null,
    createdAt: CREATED,
    updatedAt: CREATED,
  });
}

test("a legacy row is copied under its own id into its host's vendor group, re-sealed under the vendor AAD", async () => {
  const deps = await makeDeps();
  await seedLegacy(deps, { id: "c-1", providerId: "github-pages", label: "GitHub Pages token", isDefault: true, accountLabel: "octo", fields: { token: "ghp_abcd1234" } });

  const report = await copyPublishCredentialsToVendorTable(deps, { workspaceId: WORKSPACE });

  assert.deepEqual(report, { copied: ["c-1"], alreadyCopied: [], skipped: [] });
  const row = await deps.vendorRepo.findById({ workspaceId: WORKSPACE, id: "c-1" });
  assert.ok(row);
  assert.equal(row.vendorId, "github");
  assert.equal(row.label, "GitHub Pages token");
  assert.equal(row.isDefault, true);
  assert.equal(row.accountLabel, "octo");
  assert.equal(row.tokenTail, "1234");
  assert.equal(row.createdAt, CREATED);
  const plaintext = await deps.sealer.open({ sealed: row.sealed, aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: "github", id: "c-1" }) });
  assert.deepEqual(JSON.parse(plaintext), { vendorId: "github", token: "ghp_abcd1234" });
  assert.ok(await deps.legacyRepo.findById({ workspaceId: WORKSPACE, id: "c-1" }), "the legacy row is kept");
});

test("the token tail comes from the host's declared token field (s3-compatible: the secret access key)", async () => {
  const deps = await makeDeps();
  await seedLegacy(deps, {
    id: "s3",
    providerId: "s3-compatible",
    label: "Bucket",
    isDefault: true,
    fields: { region: "auto", bucket: "b", accessKeyId: "AKIAXXXX", secretAccessKey: "secret-wxyz", publicUrl: "https://x" },
  });
  await copyPublishCredentialsToVendorTable(deps, { workspaceId: WORKSPACE });
  const row = await deps.vendorRepo.findById({ workspaceId: WORKSPACE, id: "s3" });
  assert.equal(row?.vendorId, "s3-compatible");
  assert.equal(row?.tokenTail, "wxyz");
});

test("a second run copies nothing and changes nothing", async () => {
  const deps = await makeDeps();
  await seedLegacy(deps, { id: "c-1", providerId: "vercel", label: "default", isDefault: true, fields: { token: "vtok" } });
  await copyPublishCredentialsToVendorTable(deps, { workspaceId: WORKSPACE });
  const before = await deps.vendorRepo.findById({ workspaceId: WORKSPACE, id: "c-1" });

  const report = await copyPublishCredentialsToVendorTable(deps, { workspaceId: WORKSPACE });

  assert.deepEqual(report, { copied: [], alreadyCopied: ["c-1"], skipped: [] });
  assert.deepEqual(await deps.vendorRepo.findById({ workspaceId: WORKSPACE, id: "c-1" }), before);
});

test("a label already used in the vendor group is disambiguated with the host id; an existing default is kept", async () => {
  const deps = await makeDeps();
  const existingSealed = await deps.sealer.seal({
    plaintext: JSON.stringify({ vendorId: "github", token: "other" }),
    key: await deps.keyring.activeKey(),
    aad: buildVendorCredentialAad({ workspaceId: WORKSPACE, vendorId: "github", id: "v-1" }),
  });
  await deps.vendorRepo.insert({
    workspaceId: WORKSPACE, id: "v-1", vendorId: "github", label: "default", sealed: existingSealed, tokenTail: "ther",
    isDefault: true, accountLabel: null, createdAt: CREATED, updatedAt: CREATED,
  });
  await seedLegacy(deps, { id: "c-1", providerId: "github-pages", label: "default", isDefault: true, fields: { token: "ghp_1" } });

  await copyPublishCredentialsToVendorTable(deps, { workspaceId: WORKSPACE });

  const copied = await deps.vendorRepo.findById({ workspaceId: WORKSPACE, id: "c-1" });
  assert.equal(copied?.label, "default (github-pages)");
  assert.equal(copied?.isDefault, false);
  assert.equal((await deps.vendorRepo.findById({ workspaceId: WORKSPACE, id: "v-1" }))?.isDefault, true);
});

test("the legacy default is copied first, so it stays the vendor group's default whatever the row order", async () => {
  const deps = await makeDeps();
  await seedLegacy(deps, { id: "a-not-default", providerId: "netlify", label: "second", isDefault: false, fields: { token: "n2" } });
  await seedLegacy(deps, { id: "b-default", providerId: "netlify", label: "first", isDefault: true, fields: { token: "n1" } });

  await copyPublishCredentialsToVendorTable(deps, { workspaceId: WORKSPACE });

  assert.equal((await deps.vendorRepo.findDefaultByVendor({ workspaceId: WORKSPACE, vendorId: "netlify" }))?.id, "b-default");
  assert.equal((await deps.vendorRepo.findById({ workspaceId: WORKSPACE, id: "a-not-default" }))?.isDefault, false);
});

test("a row whose host no registry declares, or that cannot be opened, is skipped with a reason and left in place", async () => {
  const deps = await makeDeps();
  await seedLegacy(deps, { id: "gone", providerId: "retired-host", label: "x", isDefault: true, fields: { token: "t" } });
  await deps.legacyRepo.insert({
    workspaceId: WORKSPACE, id: "corrupt", providerId: "vercel", label: "y", isDefault: true, accountLabel: null, createdAt: CREATED, updatedAt: CREATED,
    sealed: (await deps.legacyRepo.findById({ workspaceId: WORKSPACE, id: "gone" }))!.sealed,
  });

  const report = await copyPublishCredentialsToVendorTable(deps, { workspaceId: WORKSPACE });

  assert.deepEqual(report.copied, []);
  assert.deepEqual(report.skipped.map((s) => s.id).sort(), ["corrupt", "gone"]);
  assert.equal(report.skipped.find((s) => s.id === "gone")?.reason, "no deploy plugin declares the host 'retired-host'");
  assert.match(report.skipped.find((s) => s.id === "corrupt")?.reason ?? "", /^the saved credential could not be opened: /);
  assert.deepEqual(await deps.vendorRepo.listByWorkspace({ workspaceId: WORKSPACE }), []);
  assert.equal((await deps.legacyRepo.listByWorkspace({ workspaceId: WORKSPACE })).length, 2);
});

test("a later registry is consulted when the first does not declare the host (the plugin is switched off)", async () => {
  const deps = await makeDeps();
  const empty = { get: () => undefined, list: () => [], refusals: [] };
  deps.registries = [empty, ...deps.registries];
  await seedLegacy(deps, { id: "c-1", providerId: "cloudflare-pages", label: "cf", isDefault: true, fields: { token: "cftok", accountId: "acc" } });

  const report = await copyPublishCredentialsToVendorTable(deps, { workspaceId: WORKSPACE });

  assert.deepEqual(report.copied, ["c-1"]);
  assert.equal((await deps.vendorRepo.findById({ workspaceId: WORKSPACE, id: "c-1" }))?.vendorId, "cloudflare");
});
