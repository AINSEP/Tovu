import { createConsoleLogger, type Logger } from "@jini-ai/core/primitives";
import type { SiteTimeZoneFallbackEvent, SiteTimeZoneFallbackReporter } from "@jini-ai/cms/settings/site/site-timezone";

/**
 * @file The host's binding for `@jini-ai/cms`'s timezone fallback reporter. A failed
 * `core.site.timezone` read is logged with the event's fixed text and its safe fields only
 * (`workspaceId`, `errorClass`): the repository error itself is never logged, since its message can
 * echo a connection string or a stored value.
 */

/**
 * A reporter that logs each fallback as an error on `logger` (default: the console logger).
 * @complexity O(1).
 */
export function createSiteTimeZoneFallbackReporter(_required: Record<string, never> = {}, optional: { logger?: Logger } = {}): SiteTimeZoneFallbackReporter {
  const logger = optional.logger ?? createConsoleLogger({ prefix: "" });
  return (event: SiteTimeZoneFallbackEvent) => {
    logger.error({ message: event.message }, { meta: { workspaceId: event.workspaceId, errorClass: event.errorClass } });
  };
}
