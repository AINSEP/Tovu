import { isDeepStrictEqual } from "node:util";
import type { VaultContext, VaultMeta, VaultRecord } from "@jini-ai/platform/secrets/credential-sets";
import type { SealedSecret } from "../features/webhooks/index.js";
import { assistantVaultId, type AssistantVaultRepo } from "./assistant-vault.js";

/** The feature-owned columns a compatibility row write supplies; everything else comes from the stored singleton. */
export interface AssistantVaultRowWrite {
  provider: string | null; meta: VaultMeta; sealed: SealedSecret | null; createdAt: string; updatedAt: string;
}

/** Stored envelope fields every compatibility read model exposes, derived from one vault row.
 * @complexity O(1). */
export function assistantVaultKeyView({ row }: { row: VaultRecord }, _options = {}): {
  sealed: SealedSecret | null; masked: string | null; aadVersion: number; createdAt: string; updatedAt: string;
} {
  return { sealed: row.sealed, masked: row.last4 === null ? null : `••••${row.last4}`,
    aadVersion: row.sealed === null ? 0 : 2, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

/** Full-row compatibility write for one assistant singleton: create it, or CAS-replace the stored
 * row keeping its identity, label, default flag, createdAt and any unrelated metadata.
 * @throws VaultError from the repository on CAS or identity conflicts.
 * @complexity One singleton read and one CAS write. */
export async function upsertAssistantVaultRow({ vault, context, write }: {
  vault: AssistantVaultRepo; context: VaultContext; write: AssistantVaultRowWrite;
}, _options = {}): Promise<void> {
  const existing = await vault.findOne(context);
  await vault.put(existing ? replacedRow({ context, existing, write }) : createdRow({ context, write }));
}

/** Clearing is a nullable-envelope replacement, preserving settings and singleton identity.
 * A missing singleton writes nothing. @complexity One singleton read and at most one CAS write. */
export async function clearAssistantVaultKey({ vault, context, updatedAt }: {
  vault: AssistantVaultRepo; context: VaultContext; updatedAt: string;
}, _options = {}): Promise<void> {
  const existing = await vault.findOne(context);
  if (!existing) return;
  await vault.put({ expectedRevision: existing.revision, record: { ...existing,
    sealed: null, last4: null, tokenLength: null, revision: existing.revision + 1, updatedAt } });
}

/** First write of a singleton: fresh identity and no token hint (a raw envelope proves no suffix). */
function createdRow({ context, write }: { context: VaultContext; write: AssistantVaultRowWrite }): { expectedRevision: null; record: VaultRecord } {
  return { expectedRevision: null, record: { ...context, id: assistantVaultId({ context }), provider: write.provider, label: "",
    isDefault: false, revision: 1, meta: { ...write.meta }, sealed: write.sealed, last4: null, tokenLength: null,
    createdAt: write.createdAt, updatedAt: write.updatedAt } };
}

/** Replacement of a stored singleton under CAS on its current revision. */
function replacedRow({ context, existing, write }: {
  context: VaultContext; existing: VaultRecord; write: AssistantVaultRowWrite;
}): { expectedRevision: number; record: VaultRecord } {
  // A raw envelope supplies no trustworthy token length. Preserve the stored hint only for
  // an identical envelope; an unverified mask cannot establish a safe suffix.
  const unchanged = write.sealed !== null && isDeepStrictEqual(existing.sealed, write.sealed);
  return { expectedRevision: existing.revision, record: { ...context, id: existing.id, provider: write.provider, label: existing.label,
    isDefault: existing.isDefault, revision: existing.revision + 1, meta: { ...existing.meta, ...write.meta }, sealed: write.sealed,
    last4: unchanged ? existing.last4 : null, tokenLength: unchanged ? existing.tokenLength : null,
    createdAt: existing.createdAt, updatedAt: write.updatedAt } };
}
