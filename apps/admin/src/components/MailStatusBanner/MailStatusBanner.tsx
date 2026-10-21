import type { AdminMailStatus } from "@/lib/api";

import { useMailStatusBanner } from "./hooks/use-mail-status-banner.hooks";
import "./mail-status-banner.css";

/**
 * Blocking banner while no mail provider is chosen (`state: "unconfigured"`, email provider contract
 * v1, 2026-10-21). Not dismissible: sign-in links, confirmations and form notifications are refused
 * in production until a provider is set. Owner sign-in itself never needs mail. Logic: `useMailStatusBanner`.
 */
export function MailStatusBanner(props: { fetchStatus: () => Promise<AdminMailStatus> }) {
  const { text } = useMailStatusBanner({ fetchStatus: props.fetchStatus });
  if (!text) return null;
  return (
    <div className="mail-status-banner" role="alert">
      {text}
    </div>
  );
}
