/**
 * @file Tovu-local override of `@jini-ai/cms/media`'s `DEFAULT_MAX_UPLOAD_BYTES` (10 MiB).
 *
 * Owner-directed (2026-09-21): set the media upload cap to 50 MiB for larger video uploads. Kept
 * as a Tovu-local constant rather than editing the Jini
 * package's shared default — `@jini-ai/cms` has other consumers, and widening its default would be
 * a cross-repo publish, not a same-repo, reversible change. Call sites pass this as `uploadMedia`'s
 * `optional.maxUploadBytes` override.
 */
export const TOVU_MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MiB
