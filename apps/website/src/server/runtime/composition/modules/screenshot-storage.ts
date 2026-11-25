import { withFileLock } from "@jini-ai/platform/fs/file-lock";
import type { CaptureRootLock } from "@jini-ai/integrations/web-screenshot/capture-files";

import { createCaptureRootFileLock } from "#src/features/web-screenshot/capture-retention";

/**
 * @file Screenshot storage composition: the one root-keyed lock the capture writer
 * (`tool-catalog-manifest.ts`) and the owner's manual cleanup routes both hold.
 */

/** The writer fence: the same instance is injected into the capture writer and the cleanup. */
export const captureWriterFence: CaptureRootLock = createCaptureRootFileLock({ withFileLock }, {});
