import { navigate } from "@jini-ai/admin/shell/lib/router";
import { describeApiError as describeRolesApiError, type RolesApiErrorPort } from "@jini-ai/admin/roles/rules";
import { ApiError, describeApiError as describeApiErrorDefault } from "../../lib/admin-http/request";

/**
 * @file The host's bindings for the roles screen — what Tovu injects into the Jini roles feature:
 * the `?tab=` navigation and this host's admin HTTP error class/default describer.
 */

/** `replace: true` so moving between the two tabs does not grow the back stack one entry per click
 *  — the same call `Deployment.tsx`/`Sites.tsx`/`Themes.tsx` make for their own `?tab=`. A
 *  module-level function, not an inline arrow, so `TabBar`'s `onChange` takes it directly. */
export function goToRolesTab({ tabId }: { tabId: string }, _options: Record<string, never> = {}) {
  navigate({ routePath: `/roles?tab=${tabId}` }, { replace: true });
}

/** This host's admin HTTP client, as the roles error copy needs it. */
export const ROLES_API_ERRORS: RolesApiErrorPort = {
  isApiError: (e): e is ApiError => e instanceof ApiError,
  describeDefault: ({ e, fallback }) => describeApiErrorDefault({ e, fallback }),
};

/** The roles screen's error copy with this host's {@link ROLES_API_ERRORS} bound in. */
export function describeApiError({ e, fallback, locale }: { e: unknown; fallback: string; locale: string }, _optional: Record<string, never> = {}): string {
  return describeRolesApiError({ e, fallback, locale, errors: ROLES_API_ERRORS });
}
