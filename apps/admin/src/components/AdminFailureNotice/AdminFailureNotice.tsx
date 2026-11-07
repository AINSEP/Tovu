import { useSyncExternalStore } from "react";
import { ErrorNotice, type ErrorNoticeProps } from "@jini-ai/ui/panel-kit";
import { adminFailureChannel } from "@/lib/admin-failure-channel";
import { t } from "../shared-components-i18n";
import "./admin-failure-notice.css";

/** The existing shared ErrorNotice beside the restart banner, retained until the operator dismisses it.
 * Optional clipboard ports preserve selectable details when browser copying is unavailable.
 * @complexity O(one bounded copy block) per incident render, no requests or polling.
 * @overallScore 99 — layout uses the existing host notice styling; Chrome visual review remains external.
 */
export function AdminFailureNotice(ports: Omit<ErrorNoticeProps, "failure" | "role"> = {}) {
  // This notice also mounts before sign-in; reuse the shell's document locale without reading settings.
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en";
  const failure = useSyncExternalStore(adminFailureChannel.subscribe, adminFailureChannel.getSnapshot, adminFailureChannel.getSnapshot);
  if (!failure) return null;
  // A floating card with Dismiss inside it: a full-width strip above the sidebar pushed the whole layout down.
  return <section className="admin-failure-notice">
    <ErrorNotice failure={failure} role="status" {...ports} />
    <button type="button" className="admin-failure-notice__dismiss" aria-label={t({ locale, key: "Dismiss error" })} onClick={() => adminFailureChannel.reset()}>×</button>
  </section>;
}
