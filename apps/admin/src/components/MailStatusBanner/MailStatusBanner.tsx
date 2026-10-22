import { Icon } from "@jini-ai/ui";

import type { AdminMailStatus } from "@/lib/api";

import { useMailStatusBanner, type MailBannerStorage } from "./hooks/use-mail-status-banner.hooks";
import "./mail-status-banner.css";

/**
 * Banner while no mail provider is chosen (`state: "unconfigured"`, email provider contract v1,
 * 2026-10-21): sign-in links, confirmations and form notifications are refused in production until a
 * provider is set. Owner sign-in itself never needs mail. Dismissible per browser (owner, 2026-10-21:
 * email stays unconfigured on purpose). Logic: `useMailStatusBanner`.
 */
export function MailStatusBanner(props: {
  fetchStatus: () => Promise<AdminMailStatus>;
  /** Accessible name of the × button, already translated by the caller. */
  dismissLabel: string;
  storage?: MailBannerStorage;
}) {
  const { text, dismiss } = useMailStatusBanner({ fetchStatus: props.fetchStatus }, { storage: props.storage });
  if (!text) return null;
  return (
    <div className="mail-status-banner" role="alert">
      <span className="mail-status-banner-text">{text}</span>
      <button
        type="button"
        className="mail-status-banner-dismiss"
        aria-label={props.dismissLabel}
        title={props.dismissLabel}
        onClick={dismiss}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}
