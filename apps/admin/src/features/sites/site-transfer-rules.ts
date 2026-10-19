import type { Translate } from "@jini-ai/ui/panel-kit";
import type { SiteImport, SiteImportState, SiteShare } from "./hooks/site-transfer-dependencies.hooks";

/**
 * @file Pure display rules for the Export Site and Import Site tabs: labels, pill tones and short
 * forms of links. No React, so each rule is tested directly.
 */

/** An archive size in B / KB / MB / GB, one decimal from MB up. `—` for a missing or bad value.
 *  @complexity O(1). */
export function formatTransferBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** The pill for one export: its label and the shared `.status-*` tone class. */
export function shareStatusView(status: SiteShare["status"], t: Translate): { label: string; className: string } {
  if (status === "active") return { label: t("Active"), className: "status status-ok" };
  if (status === "revoked") return { label: t("Revoked"), className: "status status-neutral" };
  return { label: t("Failed"), className: "status status-error" };
}

/** Each import state's label and tone. Only `ready` is green and `failed` red; `needs-owner` waits
 *  on the owner (amber); the rest are in progress. */
const IMPORT_STATE_VIEWS: Record<SiteImportState, { label: string; tone: string }> = {
  verifying: { label: "Checking…", tone: "status-neutral" },
  "needs-owner": { label: "Needs a password", tone: "status-warning" },
  creating: { label: "Creating…", tone: "status-neutral" },
  ready: { label: "Ready", tone: "status-ok" },
  failed: { label: "Failed", tone: "status-error" },
};

/** The pill for one import. An unknown state from a newer server reads as Failed, never blank. */
export function importStateView(state: SiteImportState, t: Translate): { label: string; className: string } {
  const view = IMPORT_STATE_VIEWS[state] ?? IMPORT_STATE_VIEWS.failed;
  return { label: t(view.label), className: `status ${view.tone}` };
}

/** A link shown short: host and path, no scheme or query, so a table cell stays readable. The full
 *  link is still what Copy link copies. */
export function shortLink(link: string): string {
  try {
    const url = new URL(link);
    return `${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return link;
  }
}

/** Where an import came from: the share link's host, or "Uploaded zip". Never a server path. */
export function importSourceLabel(source: SiteImport["source"], t: Translate): string {
  return "url" in source ? shortLink(source.url) : t("Uploaded zip");
}

/** The one ⓘ beside "Import Site"'s heading: a line per way in (the `groupOptionTooltips` idiom). */
export function importOptionsTip(t: Translate): string {
  return [
    `• ${t("Share link or zip")}: ${t("Makes a new site from another Tovu site's export. This site stays as it is.")}`,
    `• ${t("Live website")}: ${t("The assistant copies a public website's pages into this site. You read its request first, then press Send.")}`,
  ].join("\n");
}
