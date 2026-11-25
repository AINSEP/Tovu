/**
 * @file The erase arm's retirement proof (ST-2b), bound to this profile's sign-in removal list.
 *
 * A record here is POSITIVE proof: the erase arm writes it only after it erased the website's folder
 * itself and then saw that folder certainly gone. The next-start pass may remove a whole sign-in
 * partition only on such a record. It is never reconstructed from missing rows — a partition with no
 * tracked row may belong to an untracked card, an unplugged drive or an older sibling copy of the app,
 * and inferring "deleted" from absence is exactly how a live website's logins would be wiped.
 * Anything uncertain therefore yields no candidate and no record: the partition stays, and is listed.
 */
import path from "node:path";
import type { Stats } from "node:fs";
import {
  createRetirementLedger,
  type ErasedRetirementCandidate,
  type RetirementLedger,
  type RetirementLedgerStore,
} from "@jini-ai/desktop-host/electron/partitions";

/** `absent` only when the parent is the same volume and the folder lstat says ENOENT. */
export type RetirementAbsence = "absent" | "present" | "unknown";

/** What `deleteProject` needs from the ledger. Required on `ProjectIpcDeps`; there is no silent bypass. */
export interface SiteRetirementPort {
  capture(required: { siteDir: string; siteId: string }, optional?: Record<string, never>): ErasedRetirementCandidate | null;
  absence(required: { candidate: ErasedRetirementCandidate }, optional?: Record<string, never>): RetirementAbsence;
  append(required: { candidate: ErasedRetirementCandidate }, optional?: Record<string, never>): void;
  invalidate(required: { partition: string; reason: string }, optional?: Record<string, never>): void;
}

/** Records nothing: a test double for handlers that never reach the erase arm. Never bound in production. */
export const NO_RETIREMENT: SiteRetirementPort = Object.freeze({
  capture: () => null,
  absence: () => "unknown" as const,
  append: () => {},
  invalidate: () => {},
});

type RetirementFs = { lstatSync(path: string): Stats; realpathSync(path: string): string };

interface SiteRetirementRequired {
  ledger: RetirementLedger; fs: RetirementFs; sessionDataDir: string; eraseVersion: string;
  partitionFor: (required: { siteDir: string }) => string; clock: { now(): number };
}

const PERSIST = "persist:";

/** Identity before the erase; any read failure means no proof, never a guessed one. @complexity O(1) fs calls. */
function capture(req: SiteRetirementRequired, { siteDir, siteId }: { siteDir: string; siteId: string }): ErasedRetirementCandidate | null {
  const name = req.partitionFor({ siteDir });
  // An in-memory partition owns no folder, so there is nothing a pass could ever remove.
  if (!name.startsWith(PERSIST)) return null;
  try {
    const subjectDir = path.resolve(siteDir), parentDir = path.dirname(subjectDir);
    const dir = req.fs.lstatSync(subjectDir);
    if (!dir.isDirectory()) return null;
    const parentDev = req.fs.lstatSync(parentDir).dev;
    const sessionRoot = req.fs.realpathSync(path.join(req.sessionDataDir, "Partitions"));
    return { basis: "erased", profile: req.ledger.profile, sessionRoot, partition: name.slice(PERSIST.length), subjectId: siteId, subjectDir,
      dirIdentity: { dev: dir.dev, ino: dir.ino, birthtimeMs: dir.birthtimeMs }, parentDir, parentDev, eraseVersion: req.eraseVersion,
      erasedAt: new Date(req.clock.now()).toISOString() };
  } catch { return null; }
}

/** An unmounted volume also reads as ENOENT, so the parent must still be the captured device. @complexity O(1). */
function absence(fs: RetirementFs, { candidate }: { candidate: ErasedRetirementCandidate }): RetirementAbsence {
  try {
    const parent = fs.lstatSync(candidate.parentDir);
    if (!parent.isDirectory() || parent.dev !== candidate.parentDev) return "unknown";
  } catch { return "unknown"; }
  try { fs.lstatSync(candidate.subjectDir); return "present"; }
  catch (error) { return (error as NodeJS.ErrnoException).code === "ENOENT" ? "absent" : "unknown"; }
}

/** The port over an already-bound ledger. @complexity O(records) per append/invalidate. */
export function createSiteRetirement(required: SiteRetirementRequired, _optional: Record<string, never> = {}): SiteRetirementPort {
  const { ledger, fs, clock } = required;
  return {
    capture: (input) => capture(required, input),
    absence: (input) => absence(fs, input),
    append: ({ candidate }) => { ledger.append({ candidate: { ...candidate, erasedAt: new Date(clock.now()).toISOString() } }); },
    invalidate: (input) => { ledger.invalidate(input); },
  };
}

/**
 * The production binding: this profile's `<userData>/partition-interlock/retired-partitions.json`,
 * keyed to the canonical (realpath) profile so a moved or overridden profile never reads another's proofs.
 * @complexity O(1) plus one realpath.
 */
export function bindDesktopRetirement(
  { userDataDir, sessionDataDir, eraseVersion, partitionFor, fs, clock, id, durableJsonFor }: {
    userDataDir: string; sessionDataDir: string; eraseVersion: string; partitionFor: (required: { siteDir: string }) => string;
    fs: RetirementFs; clock: { now(): number }; id: () => string; durableJsonFor: (required: { filePath: string }) => RetirementLedgerStore;
  },
  _optional: Record<string, never> = {},
): { ledger: RetirementLedger; port: SiteRetirementPort } {
  const ledger = openProfileLedger({ userDataDir, fs, clock, id, durableJsonFor });
  return { ledger, port: createSiteRetirement({ ledger, fs, sessionDataDir, eraseVersion, partitionFor, clock }) };
}

type ProfileLedgerRequired = {
  userDataDir: string; fs: Pick<RetirementFs, "realpathSync">; clock: { now(): number }; id: () => string;
  durableJsonFor: (required: { filePath: string }) => RetirementLedgerStore;
};

/** This profile's one ledger file, keyed to the canonical profile. @complexity O(1) plus one realpath. */
function openProfileLedger({ userDataDir, fs, clock, id, durableJsonFor }: ProfileLedgerRequired): RetirementLedger {
  const profile = fs.realpathSync(userDataDir);
  const durableJson = durableJsonFor({ filePath: path.join(profile, "partition-interlock", "retired-partitions.json") });
  return createRetirementLedger({ profile, durableJson, clock, id });
}

/**
 * The tracked-list writer's `beforeAddedRows` for a process with no partition interlock — the
 * `add-site` CLI. Each added path invalidates its pending record in the profile's same ledger file the
 * app uses, so a website deleted and then added back by path keeps its new sign-in (owner rule (a)).
 * The ledger is opened at call time, inside the projects lock: a brand-new profile folder exists only
 * once that lock has created it, and a profile with no folder holds no record to invalidate.
 * @complexity O(rows × records).
 */
export function bindTrackedAgainRetirement(
  required: ProfileLedgerRequired & { partitionFor: (required: { siteDir: string }) => string },
  _optional: Record<string, never> = {},
): (required: { rows: readonly { siteDir: string }[] }) => void {
  return ({ rows }) => {
    const ledger = openProfileLedger(required);
    for (const { siteDir } of rows) ledger.invalidate({ partition: required.partitionFor({ siteDir }).replace(/^persist:/, ""), reason: "tracked-again" });
  };
}
