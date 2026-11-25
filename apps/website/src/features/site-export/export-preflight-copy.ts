import type { ExportPreflightCopy } from "@jini-ai/devops/static-export/site/export-preflight";

/** The literal the privacy page template leaves where the owner's contact address belongs. */
export const CONTACT_EMAIL_PLACEHOLDER = "ADD YOUR CONTACT EMAIL";
const MAX_HOSTS_SHOWN = 5;

function placeholderWarning({ pages }: { pages: number }, _optional = {}): string | undefined {
  if (pages === 0) return undefined;
  return `${pages} exported ${pages === 1 ? "page still shows" : "pages still show"} the placeholder "${CONTACT_EMAIL_PLACEHOLDER}" (the privacy page's contact line). Replace it with a real address before sharing this copy.`;
}

function thirdPartyWarning({ pages, hosts }: { pages: number; hosts: readonly string[] }, _optional = {}): string | undefined {
  if (pages === 0) return undefined;
  const shown = hosts.slice(0, MAX_HOSTS_SHOWN).join(", ") + (hosts.length > MAX_HOSTS_SHOWN ? ", ..." : "");
  // Why a warning and not an automatic block: a script written into a page is the owner's own code and the
  // banner cannot tell optional trackers from needed ones, so it is told, not rewritten (A400).
  return `${pages} ${pages === 1 ? "page loads" : "pages load"} third-party scripts written straight into the page (${shown}). The cookie banner does not hold these back until a visitor agrees. Declare them in the theme's scripts with a consent category, or remove them.`;
}

export const EXPORT_PREFLIGHT_COPY: ExportPreflightCopy = {
  contactEmailPlaceholder: CONTACT_EMAIL_PLACEHOLDER,
  placeholderWarning,
  thirdPartyWarning,
};
