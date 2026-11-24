import { AdminFailureNotice } from "@jini-ai/admin/shell/components/AdminFailureNotice/AdminFailureNotice";
import { t } from "@jini-ai/admin/shell/components/shared-components-i18n";
import { adminFailureChannel } from "../../lib/admin-failure-channel";

/**
 * The shell notice takes its dismiss label as a string. It also mounts before sign-in, where the
 * session locale is not loaded yet, so the host resolves the label from the document language.
 */
export function HostAdminFailureNotice() {
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en";
  return <AdminFailureNotice channel={adminFailureChannel} dismissLabel={t({ locale, key: "Dismiss error" })} />;
}
