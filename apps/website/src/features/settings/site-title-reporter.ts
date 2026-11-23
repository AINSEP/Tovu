import { createConsoleLogger, type Logger } from "@jini-ai/core/primitives";
import type {
  PreserveLegacySiteTitlesResult,
  SiteTitleFailureEvent,
  SiteTitleFailureReporter,
  SiteTitlePreservationSummaryReporter,
} from "@jini-ai/cms/settings/site/site-title";

/**
 * @file The host's bindings for `@jini-ai/cms`'s site-title reporters. A failed pin or render read
 * is logged with the event's fixed text and its safe fields only (`workspaceId`, `errorClass`): the
 * thrown error itself is never logged, since its message can echo a connection string or a stored
 * value. The same rule as `site-timezone-fallback.ts`.
 */

/**
 * A reporter that logs each site-title failure as an error on `logger` (default: the console logger).
 * @complexity O(1).
 */
export function createSiteTitleFailureReporter(_required: Record<string, never> = {}, optional: { logger?: Logger } = {}): SiteTitleFailureReporter {
  const logger = optional.logger ?? createConsoleLogger({ prefix: "" });
  return (event: SiteTitleFailureEvent) => {
    const meta = event.errorClass === undefined ? { workspaceId: event.workspaceId } : { workspaceId: event.workspaceId, errorClass: event.errorClass };
    logger.error({ message: event.message }, { meta });
  };
}

/**
 * A reporter that logs one preservation run's counts as info on `logger` (default: the console logger).
 * @complexity O(1).
 */
export function createSiteTitlePreservationSummaryReporter(
  _required: Record<string, never> = {},
  optional: { logger?: Logger } = {}
): SiteTitlePreservationSummaryReporter {
  const logger = optional.logger ?? createConsoleLogger({ prefix: "" });
  return (result: PreserveLegacySiteTitlesResult) => {
    logger.info({
      message: `preserveLegacySiteTitles: pinned=${result.pinnedWorkspaceIds.length} skipped=${result.skippedWorkspaceIds.length} failed=${result.failedWorkspaceIds.length}`,
    });
  };
}
