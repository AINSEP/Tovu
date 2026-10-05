import type { UUID } from "@jini-ai/core/primitives";

import { buildVendorCredentialAad } from "../../vendor-credentials/aad.js";
import type { VendorCredentialSetRecord, VendorCredentialSetRepoPort } from "../../vendor-credentials/types.js";
import type { KeyringPort, SecretSealerPort } from "../../webhooks/index.js";
import type { DeployTargetCredentialSpec, DeployTargetRegistry } from "../deploy-targets/types.js";
import { buildPublishCredentialAad } from "./aad.js";
import type { PublishCredentialSetRecord, PublishCredentialSetRepoPort } from "./types.js";

/**
 * @file Copies every legacy `publish_credential_sets` row into `vendor_credential_sets`, the table
 * publish credentials live in. Runs at every boot (`server/runtime/composition/deps.ts`); nobody runs
 * it by hand.
 *
 * Each row keeps its id and moves into the vendor group its host declares
 * (`DeployTargetDescriptor.credential.vendorId`). The two tables bind a different AAD into the
 * ciphertext, so the row is opened under the legacy AAD, re-sealed under the vendor AAD, and opened
 * back and compared before it is written: a row that would land unopenable is never written.
 *
 * Idempotent: a row whose id is already in the vendor table is left alone. Legacy rows are never
 * changed or deleted (they stay one release as a safety net), so a row skipped today (its host's
 * plugin is missing, the site key is not set) is simply tried again at the next boot.
 */

export interface VendorTableBackfillDeps {
  readonly legacyRepo: PublishCredentialSetRepoPort;
  readonly vendorRepo: VendorCredentialSetRepoPort;
  readonly sealer: SecretSealerPort;
  readonly keyring: KeyringPort;
  /** Consulted in order for a legacy row's host: the workspace's own registry first, then the
   *  deploy plugin shipped with this build, so a row still moves while its plugin is switched off. */
  registries: readonly DeployTargetRegistry[];
}

export interface VendorTableBackfillReport {
  readonly copied: string[];
  readonly alreadyCopied: string[];
  readonly skipped: { readonly id: string; readonly reason: string }[];
}

/** The credential spec the first registry that knows `providerId` declares. @complexity O(r). */
function credentialSpecFor(registries: readonly DeployTargetRegistry[], providerId: string): DeployTargetCredentialSpec | undefined {
  for (const registry of registries) {
    const spec = registry.get(providerId)?.descriptor.credential;
    if (spec !== undefined) return spec;
  }
  return undefined;
}

/** `label`, or the first variant of it no OTHER row of the vendor group already uses (the vendor
 *  table's label is unique per vendor). @complexity O(n) in the (small) vendor group. */
function freeLabel(row: PublishCredentialSetRecord, group: readonly VendorCredentialSetRecord[]): string {
  const taken = new Set(group.filter((other) => other.id !== row.id).map((other) => other.label));
  const candidates = [row.label, `${row.label} (${row.providerId})`, `${row.label} (${row.id.slice(0, 8)})`];
  return candidates.find((candidate) => !taken.has(candidate)) ?? `${row.label} (${row.id})`;
}

/**
 * Opens one legacy row, re-seals it for the vendor table and proves the new ciphertext opens to the
 * same bytes. Returns the vendor-table record, or why it cannot be copied.
 *
 * @complexity O(1): one open, one seal, one verifying open, one group read.
 */
async function toVendorRecord(deps: VendorTableBackfillDeps, row: PublishCredentialSetRecord): Promise<VendorCredentialSetRecord | string> {
  const spec = credentialSpecFor(deps.registries, row.providerId);
  if (spec === undefined) return `no deploy plugin declares the host '${row.providerId}'`;

  let fields: Record<string, string>;
  try {
    const legacyAad = buildPublishCredentialAad({ workspaceId: row.workspaceId, providerId: row.providerId, id: row.id });
    const { providerId: _providerId, ...rest } = JSON.parse(await deps.sealer.open({ sealed: row.sealed, aad: legacyAad })) as Record<string, string>;
    fields = rest;
  } catch (err) {
    return `the saved credential could not be opened: ${err instanceof Error ? err.message : String(err)}`;
  }

  const plaintext = JSON.stringify({ vendorId: spec.vendorId, ...fields });
  const aad = buildVendorCredentialAad({ workspaceId: row.workspaceId, vendorId: spec.vendorId, id: row.id });
  let sealed: VendorCredentialSetRecord["sealed"];
  try {
    sealed = await deps.sealer.seal({ plaintext, key: await deps.keyring.activeKey(), aad });
    if ((await deps.sealer.open({ sealed, aad })) !== plaintext) return "the re-sealed credential did not open to the same value";
  } catch (err) {
    return `the credential could not be re-sealed: ${err instanceof Error ? err.message : String(err)}`;
  }

  const group = await deps.vendorRepo.listByVendor({ workspaceId: row.workspaceId, vendorId: spec.vendorId });
  return {
    workspaceId: row.workspaceId,
    id: row.id,
    vendorId: spec.vendorId,
    label: freeLabel(row, group),
    sealed,
    tokenTail: (fields[spec.tokenField] ?? "").slice(-4),
    // The group keeps a default it already has; an empty group takes this row whatever it was.
    isDefault: group.length === 0 || (row.isDefault && !group.some((other) => other.isDefault)),
    accountLabel: row.accountLabel,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Copies every legacy publish credential of `workspaceId` not yet in the vendor table. Legacy
 * defaults go first, so a legacy default stays its vendor group's default.
 *
 * @throws Only a repo read/insert fault; a row that cannot be copied is reported in `skipped`.
 * @complexity O(n) rows, each O(1) crypto plus a read of its (small) vendor group.
 */
export async function copyPublishCredentialsToVendorTable(deps: VendorTableBackfillDeps, input: { workspaceId: UUID }): Promise<VendorTableBackfillReport> {
  const report: VendorTableBackfillReport = { copied: [], alreadyCopied: [], skipped: [] };
  const rows = await deps.legacyRepo.listByWorkspace(input);
  const defaultsFirst = [...rows.filter((row) => row.isDefault), ...rows.filter((row) => !row.isDefault)];

  for (const row of defaultsFirst) {
    if (await deps.vendorRepo.findById({ workspaceId: row.workspaceId, id: row.id })) {
      report.alreadyCopied.push(row.id);
      continue;
    }
    const record = await toVendorRecord(deps, row);
    if (typeof record === "string") {
      report.skipped.push({ id: row.id, reason: record });
      continue;
    }
    await deps.vendorRepo.insert(record);
    report.copied.push(row.id);
  }
  return report;
}
