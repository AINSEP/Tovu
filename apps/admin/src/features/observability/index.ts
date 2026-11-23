/**
 * @file Host wiring for the Observability screen (`panels.tsx`/`panel-pages.ts` import from HERE).
 *
 * Binds this admin's real values into `@jini-ai/admin`'s Observability: the product name, the
 * API-bound state hooks, the per-row copy hook and tab/URL adapter (both on UI-library helpers the
 * admin kit does not carry yet), the theme boundary, the TanStack devtools panel, and the
 * stylesheets. Tests may override any binding through props.
 */
import { createElement } from "react";
import "@jini-ai/ui/settings-dialog.css";
import "@jini-ai/admin/screens/observability/observability.css";
import "@jini-ai/admin/screens/observability/recent-errors.css";
import { Observability as ObservabilityScreen, type ObservabilityProps } from "@jini-ai/admin/screens/observability/Observability";

import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { observabilityApi } from "./api/observability-api";
import { useObservabilityTab } from "./hooks/use-observability-tab.hooks";
import { useRecentErrorItem } from "./hooks/use-recent-error-item.hooks";
import { QueryDevtoolsPanel, useWiredObservabilityStatus, useWiredQueriesTab, useWiredRecentServerErrors } from "./hooks/observability-wiring.hooks";

const HOST_BINDINGS: Omit<ObservabilityProps, "tabId" | "QueriesPanelComponent"> = {
  productName: "Tovu",
  useObservabilityStatusHook: useWiredObservabilityStatus,
  useRecentServerErrorsHook: useWiredRecentServerErrors,
  useRecentErrorItemHook: useRecentErrorItem,
  useQueriesTabHook: useWiredQueriesTab,
  QueryCachePanel: QueryDevtoolsPanel,
  readToolGaps: () => observabilityApi.getToolGaps(),
  useAdminThemeBoundaryHook: useAdminThemeBoundary,
  useObservabilityTabHook: useObservabilityTab,
};

/** Operations > Observability, bound to this admin. */
export function Observability(props: Partial<ObservabilityProps> = {}) {
  return createElement(ObservabilityScreen, { ...HOST_BINDINGS, ...props });
}
