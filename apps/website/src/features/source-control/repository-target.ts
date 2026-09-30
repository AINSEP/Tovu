import type { RepositoryTarget, RepositoryTargetValidator } from "./provider-module.js";

/**
 * @file The owner/repo check every source-control write runs before anything is built or sent:
 * `commit-site.ts` (`source_control_execute_commit`), `custom_credential_write_files` and
 * `site_backup_plan`. The host's own, stricter rules come first (the plugin module's
 * `validateTarget`, e.g. GitHub's name patterns and its "invalid GitHub owner" text live in the
 * `github` plugin), so a host's refusal reads the same whichever tool hit it. Then one generic rule
 * applies to every host: each value is one URL path segment.
 */

/** Owner and repo, whatever the host: one URL path segment each, so never empty, never `.`/`..`,
 *  never a slash, whitespace or control character. */
const GENERIC_SEGMENT_PATTERN = /^[^\s/\\\x00-\x1f\x7f]{1,100}$/;

function isGenericSegment(value: string): boolean {
  return GENERIC_SEGMENT_PATTERN.test(value) && value !== "." && value !== "..";
}

/**
 * `null` when `target` is valid, else a caller-safe reason naming the field (never echoes more than
 * the offending value, capped).
 *
 * @complexity O(1) — a handful of fixed-size regex tests.
 */
export function repositoryTargetError(target: RepositoryTarget, validateTarget?: RepositoryTargetValidator): string | null {
  const hostError = validateTarget?.(target) ?? null;
  if (hostError !== null) return hostError;
  if (!isGenericSegment(target.owner)) return `invalid owner '${target.owner.slice(0, 60)}'`;
  if (!isGenericSegment(target.repo)) return `invalid repo '${target.repo.slice(0, 100)}'`;
  return null;
}
