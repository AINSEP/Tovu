import { t } from "./shared-components-i18n";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";

/**
 * Server enums are deliberately kept as protocol values. This is the one presentation boundary
 * that turns known values into localized copy; a newly introduced server value remains visible
 * (rather than disappearing behind an untranslated placeholder) until it is added here.
 */
const KNOWN_SERVER_LABELS: ReadonlySet<string> = new Set([
  "published", "draft", "active", "trashed", "pending", "approved", "spam", "trash",
  "owner", "recipient", "recipients", "built-in", "site", "tier-1", "tier-2", "tier-3",
  "valid", "invalid", "success", "disabled", "exact", "prefix", "wildcard",
]);

export function serverLabel(value: string, locale: string): string {
  return KNOWN_SERVER_LABELS.has(value) ? t(locale, value) : value;
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
