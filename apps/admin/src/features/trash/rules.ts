import { t } from "./trash-i18n";
import { ApiError, REQUEST_TIMEOUT_CODE, describeApiError } from "@/lib/admin-http/request";

import type { Translate } from "@jini-ai/core/text";

/** The Trash dictionary bound to one locale — what `@jini-ai/admin`'s Trash rules take as `translate`. */
export function trashTranslator({ locale }: { locale: string }, _optional = {}): Translate {
  return (key: string): string => t({ locale, key });
}

/** A timeout settles the load; give the operator a localized next action. */
export function describeTrashLoadError({ error, locale }: { error: unknown; locale: string }, _optional = {}): string {
  if (error instanceof ApiError && error.code === REQUEST_TIMEOUT_CODE) {
    return t({ locale: locale, key: "The Tovu API did not respond. Try refreshing the Trash." });
  }
  return describeApiError({ e: error, fallback: t({ locale: locale, key: "failed to load the Trash" }) });
}
