import { bindStorageScreen, createStorageReporter } from "@jini-ai/admin/screens/storage/storage-screen-bindings";
import { Button } from "@jini-ai/ui-kit/react";
import type { RetentionPolicyKind } from "@jini-ai/platform/retention";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { describeApiError } from "@/lib/admin-http/request";
import { storageClient } from "./api/storage-api";
import { screenshotCleanupClient } from "./api/screenshot-cleanup-api";
import { useWiredStorage } from "@jini-ai/admin/screens/storage/hooks/use-storage.hooks";
import { useScreenshotCleanup } from "@jini-ai/admin/screens/storage/hooks/use-screenshot-cleanup.hooks";
import { t } from "./storage-i18n";

const CATEGORY_LABELS: Record<string, string> = {
  "content-database": "Content database", "chat-database": "Chat database", "database-wal": "Database working files",
  "database-shm": "Database working files", uploads: "Uploads", themes: "Themes", plugins: "Plugins",
  "agent-plugins": "Agent plugins", "theme-rollbacks": "Theme rollbacks", screenshots: "Screenshots", shares: "Shared files",
  "pre-migration-copies": "Pre-migration copies", "restore-points": "Restore points", logs: "Logs", exports: "Exports",
  temporary: "Temporary files", other: "Other",
};
const KIND_LABELS: Record<RetentionPolicyKind, string> = { cache: "Cache", derived: "Rebuildable files", "old-copy": "Old copies" };

const SCREENSHOT_AGE_DAYS = 90;
const SCREENSHOTS_ANCHOR = "storage-screenshots";

const reportStorageError = createStorageReporter({
  deps: {
    log: (message, error) => console.error(message, error),
    describeErrorForLog, describeApiError,
    failureLog: "Storage request failed",
    failureCopy: "The storage request could not finish. Try again.",
  },
});

export const Storage = bindStorageScreen({
  hooks: { useWiredStorageHook: useWiredStorage, useScreenshotCleanupHook: useScreenshotCleanup },
  kit: { Button },
  deps: {
    client: storageClient, screenshotClient: screenshotCleanupClient,
    reportErrors: reportStorageError, now: () => Date.now(), t,
    categoryLabels: CATEGORY_LABELS, kindLabels: KIND_LABELS,
    screenshotAgeDays: SCREENSHOT_AGE_DAYS, screenshotsAnchor: SCREENSHOTS_ANCHOR,
    screenshotHeading: "Delete screenshots older than 90 days",
    links: [
      { key: "Chats", href: "/admin/ai-assistant", categories: ["chat-database"] },
      { key: "Trash", href: "/admin/trash", categories: [] },
      { key: "Recovery", href: "/admin/recovery", categories: ["restore-points", "pre-migration-copies"] },
      { key: "Database", href: "/admin/database", categories: ["content-database"] },
      { key: "Exports", href: "/admin/import-export", categories: [] },
      { key: "Screenshots", href: `#${SCREENSHOTS_ANCHOR}`, categories: ["screenshots"] },
      { key: "Revisions", href: "/admin/pages", categories: [] },
    ],
    copy: {
      automatic: "Cleaned automatically", yours: "Yours", shown: "Shown only", dryRun: "Clean up now",
      confirm: "Review and confirm", clean: "Clean up", lastAutomaticPass: "Last automatic clean-up",
      freed: "Freed", failures: "Could not clean",
    },
  },
});
