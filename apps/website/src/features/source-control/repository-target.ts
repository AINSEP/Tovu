/**
 * @file The owner/repo check every source-control write runs before anything is built or sent:
 * `commit-site.ts` (`source_control_execute_commit`), `custom_credential_write_files` and
 * `site_backup_plan`. The host's own, stricter rules come first (the plugin module's
 * `validateTarget`, e.g. GitHub's name patterns and its "invalid GitHub owner" text live in the
 * `github` plugin), so a host's refusal reads the same whichever tool hit it. Then one generic rule
 * applies to every host: each value is one URL path segment.
 */

import { repositoryTargetError as validate } from "@jini-ai/devops/source-control";
import type { RepositoryTarget, RepositoryTargetValidator } from "./provider-module.js";
/**
 * `null` when `target` is valid, else a caller-safe reason naming the field (never echoes more than
 * the offending value, capped).
 *
 * @complexity O(1) — a handful of fixed-size regex tests.
 */
export function repositoryTargetError(target: RepositoryTarget, validateTarget?: RepositoryTargetValidator): string | null {
  return validate(target, { validateTarget });
}
