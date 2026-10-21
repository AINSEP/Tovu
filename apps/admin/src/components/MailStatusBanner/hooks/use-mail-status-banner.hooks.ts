import { useEffect, useState } from "react";

import type { AdminMailStatus } from "@/lib/api";

/** The banner line, or `null` when mail is configured, unknown, or the viewer may not read it. */
export const MAIL_UNCONFIGURED_TEXT =
  "Email is not set up: no mail provider is selected, so sign-in links, confirmations and form notifications are not sent. Choose a provider and save its key under Access Tokens.";

/** Pure: which line a status shows. */
export function mailStatusBannerText({ status }: { status: AdminMailStatus | null }): string | null {
  return status?.state === "unconfigured" ? MAIL_UNCONFIGURED_TEXT : null;
}

/**
 * Reads the mail status once on mount. A failed read (no `admin.forms.manage`, server down) shows
 * nothing: this banner must never block the screen on its own fetch.
 * @param required.fetchStatus - `api.getMailStatus` in the app; injected for tests.
 */
export function useMailStatusBanner(required: { fetchStatus: () => Promise<AdminMailStatus> }): { text: string | null } {
  const [status, setStatus] = useState<AdminMailStatus | null>(null);
  const { fetchStatus } = required;
  useEffect(() => {
    let live = true;
    fetchStatus().then((next) => { if (live) setStatus(next); }, () => {});
    return () => { live = false; };
  }, [fetchStatus]);
  return { text: mailStatusBannerText({ status }) };
}
