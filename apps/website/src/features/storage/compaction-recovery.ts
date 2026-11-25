/**
 * @file The owner's decision on a database whose compaction rewrite failed its check: `restore-copy`
 * replaces the live file with the pre-compaction recovery copy; `keep-current` keeps the live file after a
 * fresh integrity check. `resumeCompactionRestore` finishes or rolls back an interrupted restore, and
 * `discardCompactionLeftovers` is the approval card — the only place in this flow that deletes owner files.
 *
 * Invariants (needs-opus §2): the live file always exists — the old inode is preserved by a hard link
 * BEFORE the publishing rename (R1); the recovery copy is never modified or removed (R2); nothing runs
 * without the maintenance lease and SQLite exclusive admission, both re-checked just before publishing
 * (R3); nothing is published unless the staged file matches the copy by SHA-256, integrity check and
 * migration ledger, every step of which this binary knows (R4); the marker is cleared only after the
 * PUBLISHED file re-verifies (R5); each irreversible step is journaled first (R6). Staged and disabled:
 * only the storage CLI may import this file (pinned by `recovery-entry-points.unit.test.ts`).
 */
import { createHash } from "node:crypto";
import path from "node:path";
import type {
  DiscardConfirmation, DiscardOutcome, LeftoverItem, MaintenanceLease, RecoveryMarkerStore, ResolveCompactionAttentionRequired,
  RestoreFs, RestoreJournalEntry, RestoreOutcome, RestoreRefusal, ResumeCompactionRestoreRequired,
} from "./compaction-recovery.types.js";

const DEFAULT_RESERVE_BYTES = 64 * 1024 * 1024;

const REFUSAL_MESSAGES: Record<RestoreRefusal, string> = {
  "stale": "The database changed after you confirmed. Open the storage panel again and review it.",
  "running": "The site is running. Stop it, then try again.",
  "busy": "Another program has this database open. Close it, then try again.",
  "not-needs-attention": "This database does not need a decision right now.",
  "copy-missing": "The recovery copy is missing, so nothing was changed.",
  "copy-not-whole": "The recovery copy is incomplete or damaged, so nothing was changed.",
  "schema-unknown": "The recovery copy comes from a newer version of this app, so it was not restored. Update the app first.",
  "low-disk": "There is not enough free disk space to restore the copy. Free some space, then try again.",
  "verify-failed": "The restored file did not match the recovery copy, so it was not used. Nothing was deleted.",
  "publish-verify-failed": "The restored database did not pass its check, so the previous file was put back. Nothing was deleted.",
  "journal-pending": "An earlier restore did not finish. Run `storage compact --resume` first.",
};

type Refused = Extract<RestoreOutcome, { status: "refused" }>;
const refuse = (reason: RestoreRefusal, message: string = REFUSAL_MESSAGES[reason]): Refused => ({ status: "refused", reason, message });
const isRefused = (value: unknown): value is Refused => typeof value === "object" && value !== null && (value as { status?: unknown }).status === "refused";

/** The proof of the recovery copy that the staged and the published file must both match (R4). */
interface SourceProof { readonly sha256: string; readonly ledgerDigest: string }
interface RestoreCall { readonly required: ResolveCompactionAttentionRequired; readonly lease: MaintenanceLease; readonly reserveBytes: number }

const ledgerDigestOf = (steps: unknown): string => createHash("sha256").update(JSON.stringify(steps)).digest("hex");
const stagedPathOf = (mainPath: string): string => `${mainPath}.restore.partial`;
const preservedPathOf = ({ mainPath, database, at }: { mainPath: string; database: string; at: number }): string =>
  path.join(path.dirname(mainPath), `failed-compact-${database}-${at}.db`);

/**
 * Resolve a `needs-attention` marker as the owner confirmed. Every refusal leaves the live file, the
 * recovery copy and the marker as they were.
 * @complexity O(bytes of the copy) for hashing, copying and verifying.
 */
export async function resolveCompactionAttention(
  required: ResolveCompactionAttentionRequired,
  { reserveBytes = DEFAULT_RESERVE_BYTES }: { reserveBytes?: number } = {},
): Promise<RestoreOutcome> {
  const pending = await refuseUnlessConfirmedMarker({ required });
  if (pending) return pending;
  const lease = required.claim({ dir: required.dir, purpose: "maintenance" });
  try {
    if (lease.attached !== null) return refuse("running");
    if ((await required.fs.identity(required.mainPath)) !== required.confirmation.mainIdentity) return refuse("stale");
    if (required.admitStopped({ path: required.mainPath }) === "busy") return refuse("busy");
    if (required.confirmation.action === "keep-current") return await keepCurrent({ required });
    return await required.holdCopy({ path: required.confirmation.recoveryCopyPath, work: () => restoreCopy({ required, lease, reserveBytes }) });
  } finally {
    lease.release();
  }
}

/** Steps 1–2: no pending journal, and the marker is still exactly the one the owner saw. */
async function refuseUnlessConfirmedMarker({ required }: { required: ResolveCompactionAttentionRequired }): Promise<Refused | undefined> {
  if ((await required.journal.read()) !== undefined) return refuse("journal-pending");
  const marker = await required.marker.read();
  if (marker?.state !== "needs-attention") return refuse("not-needs-attention");
  const { markerAt, recoveryCopyPath } = required.confirmation;
  if (marker.at !== markerAt || marker.recoveryCopyPath !== recoveryCopyPath) return refuse("stale");
  return undefined;
}

/** `keep-current`: a fresh integrity check of the live file, then the marker is cleared. Nothing is staged or removed. */
async function keepCurrent({ required }: { required: ResolveCompactionAttentionRequired }): Promise<RestoreOutcome> {
  if (required.inspect({ path: required.mainPath }) !== "ok") return refuse("verify-failed", "The current database did not pass its check, so the decision is still open. The recovery copy is kept.");
  await required.marker.clear();
  return { status: "kept-current", message: "Kept the current database; it passed its check. The recovery copy is kept until you delete it." };
}

/** Steps 7–20, inside `holdCopy` so no pruner removes the copy mid-read. */
async function restoreCopy(call: RestoreCall): Promise<RestoreOutcome> {
  const { required } = call;
  const proof = await proveSource(call);
  if (isRefused(proof)) return proof;
  const { mainPath, confirmation, now } = required;
  const entry: RestoreJournalEntry = {
    v: 1, database: confirmation.database, step: "staging", mainPath, stagedPath: stagedPathOf(mainPath),
    preservedPath: preservedPathOf({ mainPath, database: confirmation.database, at: now() }), recoveryCopyPath: confirmation.recoveryCopyPath,
    sha256: proof.sha256, ledgerDigest: proof.ledgerDigest, oldMainIdentity: confirmation.mainIdentity, stagedIdentity: null, at: now(),
  };
  const staged = await stage({ required, entry });
  if (isRefused(staged)) return staged;
  const published = await publish({ ...call, entry: staged });
  if (isRefused(published)) return published;
  return verifyPublished({ required, entry: published });
}

/** Steps 7–10: the copy is a whole plain file, its schema is known to this binary, and the disk can take a staged copy. */
async function proveSource({ required, reserveBytes }: RestoreCall): Promise<SourceProof | Refused> {
  const { fs, confirmation: { recoveryCopyPath: copy } } = required;
  if ((await fs.lstatKind(copy)) !== "file") return refuse("copy-missing");
  if ((await fs.exists(`${copy}-wal`)) || (await fs.exists(`${copy}-shm`))) return refuse("copy-not-whole");
  if (required.inspect({ path: copy }) !== "ok") return refuse("copy-not-whole");
  const ledger = required.readLedger({ path: copy });
  // A copy written by a newer binary would publish a schema this one cannot run.
  if (ledger.kind !== "ok" || !ledger.steps.every((step) => required.isKnownStep({ id: step.id }))) return refuse("schema-unknown");
  if ((await fs.freeBytes(path.dirname(required.mainPath))) < (await fs.size(copy)) + reserveBytes) return refuse("low-disk");
  return { sha256: await fs.sha256(copy), ledgerDigest: ledgerDigestOf(ledger.steps) };
}

/** Does `file` match the copy on all three checks (R4)? */
type Verifier = Pick<ResolveCompactionAttentionRequired, "fs" | "inspect" | "readLedger">;

async function matchesProof({ required, file, proof }: { required: Verifier; file: string; proof: SourceProof }): Promise<boolean> {
  if ((await required.fs.sha256(file)) !== proof.sha256) return false;
  if (required.inspect({ path: file }) !== "ok") return false;
  const ledger = required.readLedger({ path: file });
  return ledger.kind === "ok" && ledgerDigestOf(ledger.steps) === proof.ledgerDigest;
}

/** Abandon before publishing: only this flow's own partial is removed; the live file, copy and marker stay. */
async function abandonStaged({ required, entry, reason }: { required: ResolveCompactionAttentionRequired; entry: RestoreJournalEntry; reason: RestoreRefusal }): Promise<Refused> {
  await required.fs.removeOwn(entry.stagedPath);
  await required.journal.clear();
  return refuse(reason);
}

/** Steps 11–14: journal, copy to the fixed partial name, verify against the proof, journal its identity. */
async function stage({ required, entry }: { required: ResolveCompactionAttentionRequired; entry: RestoreJournalEntry }): Promise<RestoreJournalEntry | Refused> {
  const { fs, journal } = required;
  await journal.write(entry);
  await fs.removeOwn(entry.stagedPath);
  await fs.copyExclusive(entry.recoveryCopyPath, entry.stagedPath);
  if (!(await matchesProof({ required, file: entry.stagedPath, proof: entry }))) return abandonStaged({ required, entry, reason: "verify-failed" });
  const staged: RestoreJournalEntry = { ...entry, step: "staged", stagedIdentity: await fs.identity(entry.stagedPath) };
  await journal.write(staged);
  return staged;
}

/** Step 15: the lease, exclusive admission, the confirmed identity and no journal sidecars — re-checked just before publishing (R3). */
async function publishRecheck({ required, lease }: { required: ResolveCompactionAttentionRequired; lease: MaintenanceLease }): Promise<RestoreRefusal | undefined> {
  const { fs, mainPath } = required;
  if (!lease.isHeld()) return "running";
  if (required.admitStopped({ path: mainPath }) !== "stopped") return "busy";
  if ((await fs.identity(mainPath)) !== required.confirmation.mainIdentity) return "stale";
  if ((await fs.exists(`${mainPath}-wal`)) || (await fs.exists(`${mainPath}-shm`))) return "busy";
  return undefined;
}

/**
 * Steps 15–17. The old main is preserved under a second name BEFORE the rename, so there is no instant
 * where the live name is missing and a boot could create an empty database (R1).
 */
async function publish(call: RestoreCall & { entry: RestoreJournalEntry }): Promise<RestoreJournalEntry | Refused> {
  const { required, entry } = call;
  const recheck = await publishRecheck(call);
  if (recheck) return abandonStaged({ required, entry, reason: recheck });
  const preserved = await preserveOldMain(call);
  if (preserved) return abandonStaged({ required, entry, reason: preserved });
  await required.journal.write({ ...entry, step: "preserved" });
  await required.fs.renameAtomic(entry.stagedPath, entry.mainPath);
  const published: RestoreJournalEntry = { ...entry, step: "published" };
  await required.journal.write(published);
  return published;
}

/** Step 16: a hard link to the old inode; where links are unsupported, a verified full copy after a budget re-check. */
async function preserveOldMain({ required, entry, reserveBytes }: RestoreCall & { entry: RestoreJournalEntry }): Promise<RestoreRefusal | undefined> {
  const { fs } = required;
  if ((await fs.link(entry.mainPath, entry.preservedPath)) === "linked") return undefined;
  if ((await fs.freeBytes(path.dirname(entry.mainPath))) < (await fs.size(entry.mainPath)) + reserveBytes) return "low-disk";
  await fs.copyExclusive(entry.mainPath, entry.preservedPath);
  if ((await fs.sha256(entry.preservedPath)) === (await fs.sha256(entry.mainPath))) return undefined;
  // This flow's own unverified copy (a fresh, never-existing name), not owner data.
  await fs.removeOwn(entry.preservedPath);
  return "verify-failed";
}

/** Steps 18–20: the published file must be the staged inode and match the copy; only then is the marker cleared (R5). */
async function verifyPublished({ required, entry }: { required: ResolveCompactionAttentionRequired | ResumeCompactionRestoreRequired; entry: RestoreJournalEntry }): Promise<RestoreOutcome> {
  const { fs, journal, marker } = required;
  const sameInode = (await fs.identity(entry.mainPath)) === entry.stagedIdentity;
  if (!sameInode || !(await matchesProof({ required, file: entry.mainPath, proof: entry }))) {
    await fs.renameAtomic(entry.preservedPath, entry.mainPath);
    await journal.clear();
    return refuse("publish-verify-failed");
  }
  await marker.clear();
  await journal.clear();
  return {
    status: "restored", preservedPath: entry.preservedPath, recoveryCopyPath: entry.recoveryCopyPath,
    message: `Restored from the copy made before compaction. The previous file was kept at ${entry.preservedPath}; nothing was deleted.`,
  };
}

/**
 * `storage compact --resume`: finish or roll back an interrupted restore from its journal. It never
 * guesses: any state the table below does not name leaves every file and asks for a person.
 * @complexity O(bytes of the database) when it re-verifies a published file.
 */
export async function resumeCompactionRestore(
  required: ResumeCompactionRestoreRequired,
  _optional: Record<string, never> = {},
): Promise<RestoreOutcome | { readonly status: "nothing-pending" }> {
  const entry = await required.journal.read();
  if (entry === undefined) return { status: "nothing-pending" };
  if (entry === "damaged") return refuse("journal-pending", "The restore record is damaged. It needs a person: compare the database, the preserved file and the recovery copy.");
  const lease = required.claim({ dir: required.dir, purpose: "maintenance" });
  try {
    if (lease.attached !== null) return refuse("running");
    if (required.admitStopped({ path: entry.mainPath }) === "busy") return refuse("busy");
    return await resumeFrom({ required, entry });
  } finally {
    lease.release();
  }
}

const ROLLED_BACK = "The interrupted restore was rolled back. The current database was left in place and the recovery copy is kept; you can run the restore again.";

/** The resume table (needs-opus §2.3). */
async function resumeFrom({ required, entry }: { required: ResumeCompactionRestoreRequired; entry: RestoreJournalEntry }): Promise<RestoreOutcome> {
  const { fs, journal } = required;
  const mainIdentity = await fs.identity(entry.mainPath);
  const mainIsOld = mainIdentity === entry.oldMainIdentity;
  if (entry.step === "staging" || (entry.step === "staged" && mainIsOld)) {
    await fs.removeOwn(entry.stagedPath);
    await journal.clear();
    return refuse("verify-failed", ROLLED_BACK);
  }
  if (entry.step === "preserved" && mainIsOld && (await identityOrMissing({ fs, file: entry.preservedPath })) === entry.oldMainIdentity) {
    await fs.removeOwn(entry.stagedPath);
    // The preserved name is the SAME inode as the live file (asserted on both), so removing it frees no data.
    await fs.removeOwn(entry.preservedPath);
    await journal.clear();
    return refuse("verify-failed", ROLLED_BACK);
  }
  if ((entry.step === "preserved" || entry.step === "published") && entry.stagedIdentity !== null && mainIdentity === entry.stagedIdentity) {
    return verifyPublished({ required, entry });
  }
  return refuse("journal-pending", `The restore needs a person: compare ${entry.mainPath}, ${entry.preservedPath} and ${entry.recoveryCopyPath}. Nothing was changed.`);
}

async function identityOrMissing({ fs, file }: { fs: RestoreFs; file: string }): Promise<string | undefined> {
  return (await fs.exists(file)) ? fs.identity(file) : undefined;
}

export interface DiscardCompactionLeftoversRequired {
  readonly dir: string;
  readonly items: readonly LeftoverItem[];
  readonly confirmation: DiscardConfirmation;
  readonly claim: ResolveCompactionAttentionRequired["claim"];
  readonly fs: Pick<RestoreFs, "identity" | "exists">;
  readonly marker: Pick<RecoveryMarkerStore, "read">;
  readonly holdCopy: ResolveCompactionAttentionRequired["holdCopy"];
  /** Permanently deletes one owner file. Reached only after the card's confirmation re-checks. */
  readonly unlink: (required: { path: string }) => Promise<void>;
}

/**
 * The approval card: the only place this flow deletes owner files. The card showed every path, its size
 * and "These files will be deleted permanently"; the token binds the paths, their identities and the
 * marker state. A pending decision must never lose its copy, so a `needs-attention` marker refuses.
 * @complexity O(items).
 */
export async function discardCompactionLeftovers(required: DiscardCompactionLeftoversRequired, _optional: Record<string, never> = {}): Promise<DiscardOutcome> {
  const lease = required.claim({ dir: required.dir, purpose: "maintenance" });
  try {
    if (lease.attached !== null) return { status: "refused", reason: "running", message: REFUSAL_MESSAGES.running };
    const marker = await required.marker.read();
    if (marker?.state === "needs-attention") return { status: "refused", reason: "needs-attention", message: "Decide what to do with the database first; the recovery copy is still needed." };
    if (!(await confirmationStillHolds({ required, markerState: marker?.state ?? "none" }))) return { status: "refused", reason: "stale", message: REFUSAL_MESSAGES.stale };
    for (const item of required.items) await required.holdCopy({ path: item.path, work: () => required.unlink({ path: item.path }) });
    return { status: "discarded", paths: required.items.map((item) => item.path), message: "Deleted the files you confirmed." };
  } finally {
    lease.release();
  }
}

/** Same paths in the same order, each still the same file, and the marker in the state the card showed. */
async function confirmationStillHolds({ required, markerState }: { required: DiscardCompactionLeftoversRequired; markerState: DiscardConfirmation["markerState"] }): Promise<boolean> {
  const { items, confirmation, fs } = required;
  if (confirmation.markerState !== markerState || items.length === 0 || confirmation.paths.length !== items.length) return false;
  for (const [index, item] of items.entries()) {
    if (confirmation.paths[index] !== item.path || confirmation.identities[index] !== item.identity) return false;
    if (!(await fs.exists(item.path)) || (await fs.identity(item.path)) !== item.identity) return false;
  }
  return true;
}
