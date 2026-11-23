/**
 * @file Public surface of the `observability` feature.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder — same feature-boundary
 * convention `plugins/index.ts`/`security/index.ts` document.
 *
 * Host wiring for the Observability screen (`panels.tsx`/`panel-pages.ts` import from HERE).
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
import { useAdminKitValues } from "@jini-ai/admin/react/kit";

import { useAdminThemeBoundary } from "../../admin-themes/use-admin-theme.hooks";
import { observabilityApi } from "./api/observability-api";
import { useObservabilityTab } from "./hooks/use-observability-tab.hooks";
import { useRecentErrorItem } from "./hooks/use-recent-error-item.hooks";
import { QueryDevtoolsPanel, useWiredObservabilityStatus, useWiredQueriesTab, useWiredRecentServerErrors } from "./hooks/observability-wiring.hooks";

const HOST_BINDINGS: Omit<ObservabilityProps, "tabId" | "QueriesPanelComponent"> = {
  /**
   * Providers tab: an honest not-yet-built state, explicitly modeled on `AgentPlugins.tsx`'s own
   * `MarketplacePanel` (same designed-empty-state tone, same reasoning) — see that component's own
   * header for why a plain "not built yet" beats a functional-looking form that does nothing.
   *
   * Deliberately no input, no "Connect" button, and no saved-credential list: nothing in Tovu can
   * fetch, save, or send to a monitoring endpoint yet (owner's own words, `development/
   * todos.md` 2026-09-09: "let's set that up with another subagent"). Building the appearance of
   * that feature here would be worse than stating plainly that it isn't built.
   * Now: the tab itself is `@jini-ai/admin`'s `ProvidersPanel`; this admin binds the screen here.
   */
  productName: "Tovu",
  /** Dependency injection seam for tests — the same convention `AgentPluginsProps.useAgentPluginsHook`
   *  uses. Defaulted to the real hook, so production callers pass nothing and behave exactly as
   *  before. */
  useObservabilityStatusHook: useWiredObservabilityStatus,
  useRecentServerErrorsHook: useWiredRecentServerErrors,
  useRecentErrorItemHook: useRecentErrorItem,
  useQueriesTabHook: useWiredQueriesTab,
  QueryCachePanel: QueryDevtoolsPanel,
  readToolGaps: () => observabilityApi.getToolGaps(),
  useAdminThemeBoundaryHook: useAdminThemeBoundary,
  useObservabilityTabHook: useObservabilityTab,
  useAdminKitValuesHook: useAdminKitValues,
  /** This admin's page chrome — the same `.page-header` markup Secrets/AiAssistant use, and the shell's
   *  `settings-ui-section--page-flow` modifier (see its own comment in the admin stylesheet). */
  layoutClassNames: {
    page: "page",
    header: "page-header",
    headerText: "page-header-text",
    kicker: "page-kicker",
    title: "page-title",
    description: "page-description",
    section: "settings-ui-section settings-ui-section--page-flow",
  },
};

/** Operations > Observability, bound to this admin. */
export function Observability(props: Partial<ObservabilityProps> = {}) {
  return createElement(ObservabilityScreen, { ...HOST_BINDINGS, ...props });
}
