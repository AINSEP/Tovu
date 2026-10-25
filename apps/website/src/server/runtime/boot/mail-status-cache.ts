/**
 * @file A short-TTL, single-flight cache for the mail status report (email phase 2, 2026-10-22).
 * Building the report can call the provider (domain status) and decrypt keys, which took 4–9 s per
 * admin page load; within the TTL every reader shares one result. `refresh` requests a fresh build,
 * subject to the optional minimum refresh interval.
 * `invalidate` drops the cached one (a provider switch or a key save). A failed build is never
 * cached, and a build that started before an invalidation is not stored over it.
 */

export { createTtlCache, MAIL_STATUS_TTL_MS } from "@jini-ai/platform/mail";
export type { TtlCache } from "@jini-ai/platform/mail";
