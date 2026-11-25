import { t } from "./trash-i18n";
import { ApiError, REQUEST_TIMEOUT_CODE, describeApiError } from "@/lib/admin-http/request";

/** A timeout settles the load; give the operator a localized next action. */
export function describeTrashLoadError({ error, locale }: { error: unknown; locale: string }, _optional = {}): string {
  if (error instanceof ApiError && error.code === REQUEST_TIMEOUT_CODE) {
    return t({ locale: locale, key: "The Tovu API did not respond. Try refreshing the Trash." });
  }
  return describeApiError({ e: error, fallback: t({ locale: locale, key: "failed to load the Trash" }) });
}
