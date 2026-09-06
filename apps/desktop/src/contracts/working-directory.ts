/**
 * Browser-safe contract for the fleet chat's working-directory surface — the native folder picker
 * and its most-recently-used list that `@jini-ai/chat`'s `ChatPaneWorkingDirectoryAccess` expects
 * from a host. Channel constants only, no logic; the shapes crossing each channel are exactly
 * `ChatPaneWorkingDirectoryAccess`'s own method signatures (`types.ts` in `@jini-ai/chat`), so
 * there is nothing to redeclare here.
 */
export const RUNNER_WORKING_DIRECTORY_CHANNELS = {
  /** Native folder dialog. Resolves `null` when the operator cancels. Also records the pick as a recent directory. */
  pick: 'runner:working-directory:pick',
  /** Most-recently-picked folders, most-recent first. */
  recent: 'runner:working-directory:recent',
  /** Whether a folder still exists on disk. */
  exists: 'runner:working-directory:exists',
  /** Canonicalizes a directory (resolves symlinks/`..`), or `null` if it cannot be resolved. */
  normalize: 'runner:working-directory:normalize',
} as const;
