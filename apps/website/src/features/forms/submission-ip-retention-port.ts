/**
 * Structural adapter contract for Jini's additive maintenance export. Kept local so Tovu
 * still compiles against the published cms-forms package before its next release.
 */
export interface SubmissionIpRetentionPort {
  clearExpiredIps(required: { submittedBeforeOrAt: string }, optional?: { limit?: number }): Promise<number>;
}

export type SubmissionIpSweep = (
  required: { now: number; repo: SubmissionIpRetentionPort },
  optional?: { batchSize?: number },
) => Promise<number>;
