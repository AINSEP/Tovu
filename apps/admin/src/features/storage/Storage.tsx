import type { ButtonHTMLAttributes } from "react";
import { Button } from "@jini-ai/ui-kit/react";
import { StoragePanel } from "@jini-ai/admin/screens/storage/StoragePanel";
import { describeErrorForLog } from "@jini-ai/core/model-facing-tool-errors";
import { describeApiError } from "@/lib/admin-http/request";
import type { UseAdminLocaleHook } from "@jini-ai/admin/react/kit";

import { storageClient, type StorageClient } from "./api/storage-api";
import { screenshotCleanupClient, type ScreenshotCleanupClient } from "./api/screenshot-cleanup-api";
import { useWiredStorage, formatBytes, type StorageLink } from "./hooks/use-storage.hooks";
import { useScreenshotCleanup } from "./hooks/use-screenshot-cleanup.hooks";
import { t } from "./storage-i18n";

/**
 * @file Storage screen (P11 ST-17) — the `/admin/storage` route. Composes Jini's `StoragePanel` with
 * this admin's storage client, kit, copy and domain links, plus the screenshot "delete older than"
 * preview. Compaction and other ST-7b recovery actions are deliberately absent: no verified stopped-site
 * capability exists yet, and this screen never offers a writable shortcut against the running site.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
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

function ScreenshotCleanupSection({ client, reportErrors, now, locale, useScreenshotCleanupHook }: { useScreenshotCleanupHook: typeof useScreenshotCleanup; client: ScreenshotCleanupClient; reportErrors: (required: { error: unknown }) => string; now: () => number; locale: string }) {
  const screenshots = useScreenshotCleanupHook({ client, describeError: reportErrors }, {});
  const { state } = screenshots;
  return <section id={SCREENSHOTS_ANCHOR}>
    <h2>{t({ locale, key: "Delete screenshots older than 90 days" })}</h2>
    {state.status === "idle" || state.status === "error" || state.status === "done"
      ? <KitButton type="button" onClick={() => { void screenshots.preview({ before: now() - SCREENSHOT_AGE_DAYS * DAY_MS }); }}>{t({ locale, key: "Show what would be deleted" })}</KitButton> : null}
    {state.status === "shown" ? <>
      <p>{state.preview.count} · {formatBytes({ bytes: state.preview.bytes, locale })}</p>
      <ul>{state.preview.items.map(item => <li key={item}>{item}</li>)}</ul>
      <KitButton type="button" onClick={() => { void screenshots.confirm(); }}>{t({ locale, key: "Delete these screenshots" })}</KitButton>
    </> : null}
    {state.status === "done" ? <p role="status">{t({ locale, key: "Deleted" })}: {state.result.deleted.length} · {t({ locale, key: "Kept" })}: {state.result.kept.length}</p> : null}
    {state.status === "error" ? <p role="alert">{state.message}</p> : null}
  </section>;
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
  const links = storageLinks({ locale });
  const useStorage = () => useWiredStorageHook({ client, reportErrors, locale, links }, {});
  return <>
    <StoragePanel useStorage={useStorage} kit={{ Button: KitButton }} copy={storageCopy({ locale })} links={links} />
    <ScreenshotCleanupSection client={screenshotClient} reportErrors={reportErrors} now={now} locale={locale} useScreenshotCleanupHook={useScreenshotCleanupHook} />
  </>;
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
