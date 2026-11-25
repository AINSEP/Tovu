/**
 * @file Migration readiness for a site update as a rehearsal: the exact staged candidate runs its own migration
 * runner (ADR-066) on a disposable copy of the snapshot the update just captured. Never the live database, never
 * the running release: only the candidate can say whether its migrations accept this site's data.
 */
import type { MigrationReadiness, SiteUpdateCallOptions } from "@jini-ai/devops/deploy";

/** Rehearses `toVersion`'s migrations on a copy of the snapshot at `artifactRef`, taken of `fromVersion`. */
export type RehearseMigration = (required: { artifactRef: string; fromVersion: string; toVersion: string }, optional?: SiteUpdateCallOptions) => Promise<MigrationReadiness>;

const blocked = (reason: string): MigrationReadiness => ({ status: "blocked", reason });

const NOT_TRIED = "The new version's database changes could not be tried on a copy of this site's backup, so it was not installed. Nothing was changed.";
const NO_CANDIDATE = "The new version is not ready on this computer to be tried first, so it was not installed. Nothing was changed.";

/** Where no host can rehearse a candidate yet: every update is blocked before anything is deployed. */
export const rehearsalUnavailable: RehearseMigration = async () => blocked(NOT_TRIED);

/**
 * @returns `checkCandidate`, which answers ok only on the rehearsal's exact `{ status: "ok" }`; a throw, an
 *   unrecognised answer or a blocked rehearsal blocks. The thrown message is not shown: it may name host paths.
 * @complexity O(1) besides the rehearsal.
 */
export function createCandidateReadiness({ rehearseMigration }: { rehearseMigration: RehearseMigration }, _optional = {}): { checkCandidate: RehearseMigration } {
  return {
    checkCandidate: async (required, optional) => {
      const answer = await rehearseMigration(required, optional).catch(() => null);
      if (answer?.status === "ok") return { status: "ok" };
      return answer?.status === "blocked" && typeof answer.reason === "string" ? blocked(answer.reason) : blocked(NOT_TRIED);
    },
  };
}

/** A release staged for install; `release` is the host's handle on those exact bits. */
export interface StagedCandidate { version: string; release: string }

export interface SnapshotCopyRehearsalRequired {
  /** Copies the captured snapshot to a fresh disposable database; `dispose` deletes that copy. */
  copySnapshot(required: { artifactRef: string }, optional?: SiteUpdateCallOptions): Promise<{ databasePath: string; dispose(): Promise<void> }>;
  /** The candidate staged for `version`, or null when none is staged. */
  stagedCandidate(required: { version: string }, optional?: SiteUpdateCallOptions): Promise<StagedCandidate | null>;
  /** Runs `candidate`'s own migration runner against the database at `databasePath`. */
  runCandidateMigrations(required: { candidate: StagedCandidate; databasePath: string }, optional?: SiteUpdateCallOptions): Promise<MigrationReadiness>;
}

/**
 * @returns A rehearsal that copies the snapshot, migrates the copy with the staged `toVersion`, and deletes the copy.
 *   A missing or substituted candidate blocks before anything is copied.
 * @complexity O(database size) for the copy plus the candidate's migrations.
 */
export function createSnapshotCopyRehearsal({ copySnapshot, stagedCandidate, runCandidateMigrations }: SnapshotCopyRehearsalRequired, _optional = {}): RehearseMigration {
  return async ({ artifactRef, toVersion }, optional) => {
    const candidate = await stagedCandidate({ version: toVersion }, optional);
    if (candidate === null || candidate.version !== toVersion) return blocked(NO_CANDIDATE);
    // A copy, so the rehearsal's writes can never reach the backup a rollback would restore from.
    const copy = await copySnapshot({ artifactRef }, optional);
    try {
      return await runCandidateMigrations({ candidate, databasePath: copy.databasePath }, optional);
    } finally {
      await copy.dispose();
    }
  };
}
