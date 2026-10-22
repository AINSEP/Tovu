import { useCallback, useEffect, useState } from "react";

import type { AdminMailStatus } from "@/lib/api";

/** The banner line, or `null` when mail is configured, unknown, or the viewer may not read it. */
export const MAIL_UNCONFIGURED_TEXT =
  "Email is not set up: no mail provider is selected, so sign-in links, confirmations and form notifications are not sent. Choose a provider and save its key under Access Tokens.";

/** Namespaced under `tovu.admin.` like the dashboard's default-password dismiss key, so it can never
 *  collide with an unrelated app key. Per browser, not per user: the mail state is site-wide. */
export const MAIL_BANNER_DISMISSED_KEY = "tovu.admin.mail-status-banner.dismissed";

/** The slice of `localStorage` the dismiss needs; injected for tests. */
export interface MailBannerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Touches `localStorage` only inside each call, so a privacy mode that throws on the property
 *  access itself is caught by the try/catch in the read/write helpers below. */
const browserStorage: MailBannerStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

/** Pure: which line a status shows. */
export function mailStatusBannerText({ status }: { status: AdminMailStatus | null }): string | null {
  return status?.state === "unconfigured" ? MAIL_UNCONFIGURED_TEXT : null;
}

/** Best-effort read — a failing storage just shows the banner again, which is harmless.
 *  @complexity Time/space: O(1). */
export function readMailBannerDismissed({ storage }: { storage: MailBannerStorage }): boolean {
  try {
    return storage.getItem(MAIL_BANNER_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/** Best-effort write — silent on storage failure; the caller's state still hides it for the session.
 *  @complexity Time/space: O(1). */
export function writeMailBannerDismissed({ storage }: { storage: MailBannerStorage }): void {
  try {
    storage.setItem(MAIL_BANNER_DISMISSED_KEY, "1");
  } catch {
    // best-effort; see the doc comment above.
  }
}

/**
 * Reads the mail status once on mount. A failed read (no `admin.forms.manage`, server down) shows
 * nothing: this banner must never block the screen on its own fetch. `dismiss` hides it for this
 * browser (owner, 2026-10-21: email stays unconfigured on purpose, so the line is noise once read).
 * @param required.fetchStatus - `api.getMailStatus` in the app; injected for tests.
 * @param optional.storage - defaults to the browser's `localStorage`.
 */
export function useMailStatusBanner(
  required: { fetchStatus: () => Promise<AdminMailStatus> },
  optional: { storage?: MailBannerStorage } = {},
): { text: string | null; dismiss: () => void } {
  const [status, setStatus] = useState<AdminMailStatus | null>(null);
  const { fetchStatus } = required;
  const storage = optional.storage ?? browserStorage;
  const [dismissed, setDismissed] = useState(() => readMailBannerDismissed({ storage }));
  useEffect(() => {
    let live = true;
    fetchStatus().then((next) => { if (live) setStatus(next); }, () => {});
    return () => { live = false; };
  }, [fetchStatus]);
  const dismiss = useCallback(() => {
    writeMailBannerDismissed({ storage });
    setDismissed(true);
  }, [storage]);
  return { text: dismissed ? null : mailStatusBannerText({ status }), dismiss };
}
