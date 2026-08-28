import { describeApiError, type AdminDeploymentOverview } from "@/lib/api";
import { useFetchQuery } from "@/lib/fetch-query";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as defaultT, deploymentOverviewLoadErrorMessage } from "../deployment-i18n";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultDeploymentOverviewPort } from "./deployment-overview-dependencies.hooks";
import type { DeploymentOverviewPort } from "./deployment-overview-port.hooks";

/**
 * @file Everything the Overview tab does, so `OverviewTab.tsx` is only markup.
 *
 * Read-only, single query, no mutations — the simplest member of this app's `useX(port, t, locale)`
 * / `useWiredX()` pair (see `use-integrations.hooks.ts` for the canonical fuller example). `port` is
 * injected — see `deployment-overview-port.hooks.ts` — so a test can describe the loading/loaded/
 * error states against `createFakeDeploymentOverviewPort` instead of stubbing global `fetch`.
 *
 * `t`/`locale` follow the same standing i18n rule every other feature hook in this app follows: a
 * component with a hook gets a BOUND `t` from that hook, not its own `useAdminLocale()`/dictionary
 * import (see `use-recovery.hooks.ts`'s header for the original statement of this rule).
 */
export interface DeploymentOverviewController {
  /** `undefined` until the first successful load — `OverviewTab.tsx` renders the loading state. */
  snapshot: AdminDeploymentOverview | undefined;
  /** Already-formatted, translated message — `null` while loading or once loaded successfully. */
  error: string | null;
  /** Bound translator — see this file's header. */
  t: Translate;
}

export function useDeploymentOverview(
  port: DeploymentOverviewPort,
  t: Translate,
  locale: string
): DeploymentOverviewController {
  const query = useFetchQuery({
    key: ["deployment", "overview"],
    fetch: () => port.getDeploymentOverview(),
  });

  const error = query.error
    ? deploymentOverviewLoadErrorMessage(locale, describeApiError(query.error, "unknown error"))
    : null;

  return { snapshot: query.data, error, t };
}

/**
 * Binds the real `/api/.../system/deployment-overview` client, and a `t` bound to the real resolved
 * locale (`useAdminLocale()`, called here and ONLY here — see this file's header).
 *
 * The zero-argument half of the `useX(dependencies)` / `useWiredX()` pair, so `OverviewTab.tsx`
 * composes this and a test composes {@link useDeploymentOverview} with
 * `createFakeDeploymentOverviewPort` and a fake `t`/`locale`.
 */
export function useWiredDeploymentOverview(): DeploymentOverviewController {
  const locale = useAdminLocale();
  const t = (key: string): string => defaultT(locale, key);
  return useDeploymentOverview(defaultDeploymentOverviewPort, t, locale);
}
