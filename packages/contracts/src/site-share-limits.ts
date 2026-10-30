/**
 * Why: a share is portable site content, including unpublished work, without the source's
 * identity or runtime state. Construct a NEW trusted database: deleting private rows from a
 * copied SQLite file leaves recoverable credentials in free pages. This policy is also the
 * import verifier's boundary; never broaden it from an archive's own schema or manifest.
 * Approved round17 deliberately buffered; v2 keeps those bounds while changing the archive contract.
 * Streaming remains a separate change.
 */
export const SHARE_LIMITS = {
  maxArchiveBytes: 300 * 1024 * 1024,
  maxExpandedBytes: 300 * 1024 * 1024,
  maxFiles: 2000,
  maxFileBytes: 64 * 1024 * 1024,
  maxManifestBytes: 2 * 1024 * 1024,
  maxPathSegments: 32,
} as const;
