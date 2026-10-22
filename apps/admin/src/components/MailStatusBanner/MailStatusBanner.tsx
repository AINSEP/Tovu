import { Icon } from "@jini-ai/ui";

import type { AdminMailStatus } from "@/lib/api";
import { adminHref } from "@/lib/router";

import { useMailStatusBanner, type MailBannerStorage } from "./hooks/use-mail-status-banner.hooks";
import "./mail-status-banner.css";

/**
 * Banner while no mail provider is chosen (`state: "unconfigured"`, email provider contract v1,
 * 2026-10-21): sign-in links, confirmations and form notifications are refused in production until a
 * provider is set. Owner sign-in itself never needs mail. Dismissible per browser (owner, 2026-10-21:
 * email stays unconfigured on purpose). "Set up email" opens the Email screen (2026-10-22). Logic:
 * `useMailStatusBanner`.
 */
export function MailStatusBanner(props: {
  fetchStatus: () => Promise<AdminMailStatus>;
  /** Already translated by the caller: the line, the link to Email, and the × button's name. */
  labels: { text: string; setUp: string; dismiss: string };
  storage?: MailBannerStorage;
}) {
  const { visible, dismiss } = useMailStatusBanner({ fetchStatus: props.fetchStatus }, { storage: props.storage });
  if (!visible) return null;
  return (
    <div className="mail-status-banner" role="alert">
      <span className="mail-status-banner-text">
        {props.labels.text}{" "}
        <a className="mail-status-banner-link" href={adminHref("/email")}>{props.labels.setUp}</a>
      </span>
      <button
        type="button"
        className="mail-status-banner-dismiss"
        aria-label={props.labels.dismiss}
        title={props.labels.dismiss}
        onClick={dismiss}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
