import type { AdminSiteTokenStatus } from "@/lib/api";
import type { Translate } from "@/lib/dictionary-translator";

/** Keep environment provenance in the status rules so rendering has no source policy. */
export function siteTokenStatusBadgeLabel(
  input: { status: Pick<AdminSiteTokenStatus, "active" | "source" | "envVarName">; t: Translate },
  _optional = {},
): string {
  const { status, t } = input;
  if (!status.active) return t("None");
  if (status.source !== "env") return t("Active — key file");
  return t("Active: environment variable {name}").replace("{name}", status.envVarName ?? "TOVU_SITE_KEY");
}
