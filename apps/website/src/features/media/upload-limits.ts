/**
 * @file Tovu-local override of `@jini-ai/cms/media`'s `DEFAULT_MAX_UPLOAD_BYTES` (10 MiB).
 *
 * Owner-directed (2026-09-16): raise the media upload cap to 35 MiB so a 10-20s generated video
 * clip (which routinely exceeds 10 MB) can be uploaded. Kept as a Tovu-local constant rather than
 * editing the Jini package's shared default — `@jini-ai/cms` has other consumers, and widening its
 * default would be a cross-repo publish, not a same-repo, reversible change. Call sites pass this as
 * `uploadMedia`'s `optional.maxUploadBytes` override.
 */
export const TOVU_MAX_UPLOAD_BYTES = 35 * 1024 * 1024; // 35 MiB
