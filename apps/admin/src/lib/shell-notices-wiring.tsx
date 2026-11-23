import "./jini-admin-tokens.css";
import "@jini-ai/admin/shell/components/AdminFailureNotice/admin-failure-notice.css";
import "@jini-ai/admin/shell/components/ServerRestartingBanner/server-restarting-banner.css";
import { AdminFailureNotice, type AdminFailureNoticeProps } from "@jini-ai/admin/shell/components/AdminFailureNotice/AdminFailureNotice";
import { ServerRestartingBanner, type ServerRestartingBannerProps } from "@jini-ai/admin/shell/components/ServerRestartingBanner/ServerRestartingBanner";
import { useServerConnectionBanner } from "@jini-ai/admin/shell/components/ServerRestartingBanner/hooks/use-server-connection-status.hooks";
import { t } from "../components/shared-components-i18n";
import { adminFailureChannel } from "./admin-failure-channel";
import { serverReconnect, type ServerReconnect } from "./server-reconnect";

/**
 * @file Tovu's bindings for the `@jini-ai/admin` shell notices mounted outside `App` (so they also show on
 * the login and boot screens): the admin's one reconnect store and failure channel, the banner's product
 * copy, and the translated Dismiss label. The Jini components take all of these as required props.
 */

/** What the banner shows for each status; `null` = nothing (the server is answering). */
export const SERVER_BANNER_TEXT: ServerRestartingBannerProps["text"] = {
  online: null,
  reconnecting: "Server restarting… reconnecting. Nothing you typed is lost.",
  unreachable: "Can't reach the Tovu server. It will retry when you try again.",
};

/** The restart banner over the app's reconnect store (`lib/server-reconnect.ts`).
 * @param optional.reconnect - Injectable for tests; defaults to the app's one instance. */
export function TovuServerRestartingBanner({ reconnect = serverReconnect }: { reconnect?: ServerReconnect } = {}) {
  return <ServerRestartingBanner reconnect={reconnect} text={SERVER_BANNER_TEXT} useServerConnectionBannerHook={useServerConnectionBanner} />;
}

/** The page-wide failure notice over `adminFailureChannel`; remaining props pass to the kit ErrorNotice. */
export function TovuAdminFailureNotice(notice: Omit<AdminFailureNoticeProps, "channel" | "dismissLabel"> = {}) {
  // This notice also mounts before sign-in; reuse the shell's document locale without reading settings.
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang || "en";
  return <AdminFailureNotice channel={adminFailureChannel} dismissLabel={t({ locale, key: "Dismiss error" })} {...notice} />;
}
