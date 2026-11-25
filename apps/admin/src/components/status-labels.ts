import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { pluginMetadataLabel, recipientLabel, serverLabel } from "@jini-ai/admin/shell/lib/status-labels";

/**
 * @file Host binding of the status-label presentation: the pure lookups live in
 * `@jini-ai/admin/shell/lib/status-labels`; these render-only wrappers bind the operator locale.
 */

/** Render-only wrappers let table cell callbacks localize values without altering their protocol
 * value or threading a second locale dependency through each feature's data model. */
export function ServerLabel({ value }: { value: string }) {
  return serverLabel({ value, locale: useAdminLocale() });
}

export function RecipientLabel({ count }: { count: number }) {
  return recipientLabel({ count, locale: useAdminLocale() });
}

export function PluginMetadataLabel({ values }: { values: readonly string[] }) {
  return pluginMetadataLabel({ values, locale: useAdminLocale() });
}
