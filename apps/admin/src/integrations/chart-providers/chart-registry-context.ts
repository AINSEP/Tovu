/** The authenticated admin's stable chart registry. Standalone cards retain Jini's core tables. */
import { createContext } from "react";
import { DEFAULT_INTERACTIVE_UI_REGISTRY, type InteractiveUiRegistry } from "@jini-ai/ui/interactive-ui";

export interface AdminChartRegistrySnapshot {
  readonly generation: string;
  readonly registry: InteractiveUiRegistry;
  readonly stylesheets: readonly string[];
}
export const CORE_CHART_SNAPSHOT: AdminChartRegistrySnapshot = {
  generation: "core", registry: DEFAULT_INTERACTIVE_UI_REGISTRY, stylesheets: [],
};
export const AdminChartRegistryContext = createContext(CORE_CHART_SNAPSHOT);
