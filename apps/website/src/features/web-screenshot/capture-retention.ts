import path from "node:path";

import type { CleanupPreviewStore } from "@jini-ai/core/contracts/storage";
import type { CaptureRootLock } from "@jini-ai/integrations/web-screenshot/capture-files";
import {
  createCaptureFilePorts, createCaptureRetention,
  type CaptureFs, type CaptureRetentionPreview, type CaptureRetentionResult,
} from "@jini-ai/integrations/web-screenshot/capture-retention";

/**
 * @file The site's binding of Jini's manual screenshot cleanup (`capture-retention`) and the
 * root-keyed lock the capture writer and that cleanup share.
 */

/** The lock file's name inside the captures root; it is not a `<date>/<name>.jpg`, so cleanup never offers it. */
export const CAPTURE_LOCK_NAME = ".writer.lock";

/** The slice of `@jini-ai/platform/fs`'s `withFileLock` this lock uses. */
export type CaptureFileLockRunner = <T>(
  required: { lockPath: string; run: () => Promise<T> },
  options: { createParent: boolean },
) => Promise<T>;

/**
 * A cross-process lock keyed by the resolved captures root: the agent's capture writer and the
 * owner's cleanup may run in different processes (desktop and server share one site folder), so an
 * in-memory mutex would not keep a cleanup from deleting a capture mid-publication.
 * @complexity O(1) per acquisition beyond the file lock's own polling.
 */
export function createCaptureRootFileLock({ withFileLock }: { withFileLock: CaptureFileLockRunner }, _optional: Record<string, never> = {}): CaptureRootLock {
  return {
    withLock: ({ key, run }) => withFileLock({ lockPath: path.join(path.resolve(key), CAPTURE_LOCK_NAME), run }, { createParent: true }),
  };
}

/** Who may clean up: the authorized owner's principal. `authorizeOwner` throws for anyone else. */
export interface CaptureCleanupOwner { principal: string }

/** Required collaborators of {@link bindCaptureRetention}. */
export interface BindCaptureRetentionRequired<Context> {
  /** The booted site's folder; only its current captures root is ever listed. */
  siteDir: string;
  /** The writer's own root derivation (`@jini-ai/integrations/web-screenshot/capture-files`). */
  captureRootFor: (required: { siteDir: string }) => string;
  /** The same root-keyed lock instance the capture writer holds. */
  writerFence: CaptureRootLock;
  fs: CaptureFs;
  clock: () => number;
  previewStore: CleanupPreviewStore;
  /** Resolves the owner from the authenticated request context, or throws (owner-only). */
  authorizeOwner: (required: { context: Context }) => CaptureCleanupOwner | Promise<CaptureCleanupOwner>;
}

/** The owner-facing preview/apply pair the screenshot storage routes call. */
export interface CaptureRetentionBinding<Context> {
  preview(required: { context: Context; before: number }, optional?: Record<string, never>): Promise<CaptureRetentionPreview>;
  apply(required: { context: Context; previewToken: string; confirm: boolean }, optional?: Record<string, never>): Promise<CaptureRetentionResult>;
}

/**
 * Binds Jini's manual capture cleanup to this site's captures folder: the writer's root only, the
 * writer's fence, the default lstat-based ports (date/name shape, no symlinks, no `..`), and an
 * owner check before every preview and every apply. Nothing here registers a schedule or a sweep:
 * cited captures stay until the owner explicitly removes them, because a report or a chat may cite a
 * capture by path and nothing can re-take a picture of the page as it looked then, so no age alone
 * makes one safe to drop; only an owner who saw the list and confirmed it may delete.
 * @throws Whatever `authorizeOwner` throws for a non-owner, before any listing; the engine's plain
 *   errors for a future cutoff, a missing confirm, or an out-of-date preview.
 * @complexity As `createCaptureRetention`: O(n log n) in captures listed.
 */
export function bindCaptureRetention<Context>(
  { siteDir, captureRootFor, writerFence, fs, clock, previewStore, authorizeOwner }: BindCaptureRetentionRequired<Context>,
  { limit }: { limit?: number } = {},
): CaptureRetentionBinding<Context> {
  const root = path.resolve(captureRootFor({ siteDir }));
  // The scope binds a token to this one root, so a preview of another site's captures never applies here.
  const scope = `captures:${root}`;
  const retention = createCaptureRetention(
    { root, ...createCaptureFilePorts({ fs }, {}), previewStore, clock, lock: writerFence },
    limit === undefined ? {} : { limit },
  );
  return {
    async preview({ context, before }) {
      const { principal } = await authorizeOwner({ context });
      return retention.preview({ principal, scope, before }, {});
    },
    async apply({ context, previewToken, confirm }) {
      const { principal } = await authorizeOwner({ context });
      return retention.apply({ principal, scope, previewToken, confirm }, {});
    },
  };
}
