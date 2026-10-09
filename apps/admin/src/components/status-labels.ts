import { t } from "./shared-components-i18n";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";

/**
 * Server enums are deliberately kept as protocol values. This is the one presentation boundary
 * that turns known values into localized copy; a newly introduced server value remains visible
 * (rather than disappearing behind an untranslated placeholder) until it is added here.
 */
export const KNOWN_SERVER_LABELS: ReadonlySet<string> = new Set([
  "published", "draft", "active", "trashed", "pending", "approved", "spam", "trash",
  "owner", "recipient", "recipients", "built-in", "site", "tier-1", "tier-2", "tier-3",
  "valid", "invalid", "success", "disabled", "exact", "prefix", "wildcard", "manual", "auto_slug_change", "import",
  "paused", "delivering", "delivered", "failed", "dead", "canceled",
]);

const ENGLISH_LABELS: Readonly<Record<string, string>> = {
  active: "Active", disabled: "Disabled", pending: "Pending", approved: "Approved", spam: "Spam", trash: "Trash",
  exact: "Exact match", prefix: "Starts with", wildcard: "Wildcard", manual: "Manual", auto_slug_change: "URL change", import: "Imported",
  paused: "Paused", delivering: "Delivering", delivered: "Delivered", failed: "Failed", dead: "Failed permanently", canceled: "Canceled",
};

export function serverLabel(value: string, locale: string): string {
  if (!KNOWN_SERVER_LABELS.has(value)) return value;
  const label = t({ locale, key: value });
  return label === value ? ENGLISH_LABELS[value] ?? value : label;
}

export function recipientLabel(count: number, locale: string): string {
  return serverLabel(count === 1 ? "recipient" : "recipients", locale);
}

export function pluginMetadataLabel(values: readonly string[], locale: string): string {
  return values.map((value) => serverLabel(value, locale)).join(" · ");
}

/** Render-only wrappers let table cell callbacks localize values without altering their protocol
 * value or threading a second locale dependency through each feature's data model. */
export function ServerLabel({ value }: { value: string }) {
  return serverLabel(value, useAdminLocale());
}

export function RecipientLabel({ count }: { count: number }) {
  return recipientLabel(count, useAdminLocale());
}

export function PluginMetadataLabel({ values }: { values: readonly string[] }) {
  return pluginMetadataLabel(values, useAdminLocale());
}
