import type { ButtonHTMLAttributes } from "react";
import { Button } from "@jini-ai/ui-kit/react";
import { StorageScreen as JiniStorageScreen } from "@jini-ai/admin/screens/storage/StorageScreen";
import type { RetentionPolicyKind } from "@jini-ai/platform/retention";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { describeApiError } from "@/lib/admin-http/request";
import type { UseAdminLocaleHook } from "@jini-ai/admin/react/kit";

import { storageClient } from "./api/storage-api";
import type { StorageClient } from "@jini-ai/admin/screens/storage/api/storage-api";
import { screenshotCleanupClient } from "./api/screenshot-cleanup-api";
import type { ScreenshotCleanupClient } from "@jini-ai/admin/screens/storage/api/screenshot-cleanup-api";
import { useWiredStorage, type StorageLink } from "@jini-ai/admin/screens/storage/hooks/use-storage.hooks";
import { useScreenshotCleanup } from "@jini-ai/admin/screens/storage/hooks/use-screenshot-cleanup.hooks";
import { t } from "./storage-i18n";

/**
 * @file Storage screen (P11 ST-17) — the `/admin/storage` route. Composes Jini's `StoragePanel` with
 * this admin's storage client, kit, copy and domain links, plus the screenshot "delete older than"
 * preview. Compaction and other ST-7b recovery actions are deliberately absent: no verified stopped-site
 * capability exists yet, and this screen never offers a writable shortcut against the running site.
 */

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

/** The domain screens that own each category's data; labels are translated per locale. */
export function storageLinks({ locale }: { locale: string }, _optional: Record<string, never> = {}): StorageLink[] {
  const link = (key: string, href: string, categories: readonly string[] = []): StorageLink => ({ label: t({ locale, key }), href, categories });
  return [
    link("Chats", "/admin/ai-assistant", ["chat-database"]),
    link("Trash", "/admin/trash"),
    link("Recovery", "/admin/recovery", ["restore-points", "pre-migration-copies"]),
    link("Database", "/admin/database", ["content-database"]),
    link("Exports", "/admin/import-export"),
    link("Screenshots", `#${SCREENSHOTS_ANCHOR}`, ["screenshots"]),
    link("Revisions", "/admin/pages"),
  ];
}

/** `StoragePanel`'s kit takes a DOM-shaped button (`onClick`); this admin's kit Button presses via `onPress`. */
function KitButton({ onClick, children, type = "button", disabled }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <Button type={type === "submit" ? "submit" : "button"} disabled={disabled === true} onPress={() => { onClick?.(undefined as never); }}>{children}</Button>;
}

function storageCopy({ locale }: { locale: string }) {
  const say = (key: string) => t({ locale, key });
  return {
    automatic: say("Cleaned automatically"), yours: say("Yours"), shown: say("Shown only"), dryRun: say("Clean up now"),
    confirm: say("Review and confirm"), clean: say("Clean up"), lastAutomaticPass: say("Last automatic clean-up"),
    freed: say("Freed"), failures: say("Could not clean"),
  };
}

export interface StorageScreenProps {
  client: StorageClient;
  screenshotClient: ScreenshotCleanupClient;
  /** Reports a failed request and answers the plain words to show. */
  reportErrors: (required: { error: unknown }) => string;
  now: () => number;
  locale: string;
  /** Required hooks (no default real hooks): the composition passes `useWiredStorage` and `useScreenshotCleanup`. */
  useWiredStorageHook: typeof useWiredStorage;
  useScreenshotCleanupHook: typeof useScreenshotCleanup;
}

/** The Storage screen over injected clients, clock and locale; {@link Storage} binds the live ones. */
export function StorageScreen({ client, screenshotClient, reportErrors, now, locale, useWiredStorageHook, useScreenshotCleanupHook }: StorageScreenProps, _optional: Record<string, never> = {}) {
  return <JiniStorageScreen client={client} screenshotClient={screenshotClient} reportErrors={reportErrors} now={now} locale={locale} useWiredStorageHook={useWiredStorageHook} useScreenshotCleanupHook={useScreenshotCleanupHook} kit={{ Button: KitButton }} links={storageLinks({ locale })} copy={storageCopy({ locale })} t={t} categoryLabels={CATEGORY_LABELS} kindLabels={KIND_LABELS} screenshotAgeDays={SCREENSHOT_AGE_DAYS} screenshotsAnchor={SCREENSHOTS_ANCHOR} screenshotHeading="Delete screenshots older than 90 days" />;
}

function reportStorageError({ error }: { error: unknown }): string {
  console.error("Storage request failed", describeErrorForLog({ err: error }));
  return describeApiError({ e: error, fallback: "The storage request could not finish. Try again." });
}

/**
 * The live `/admin/storage` screen. The locale hook is a required prop (the panel context's
 * `useAdminLocaleHook`) so the screen never reaches the real locale store on its own.
 */
export function Storage({ useAdminLocaleHook }: { useAdminLocaleHook: UseAdminLocaleHook }) {
  const locale = useAdminLocaleHook({}, {});
  return <StorageScreen client={storageClient} screenshotClient={screenshotCleanupClient} reportErrors={reportStorageError} now={() => Date.now()} locale={locale} useWiredStorageHook={useWiredStorage} useScreenshotCleanupHook={useScreenshotCleanup} />;
}
