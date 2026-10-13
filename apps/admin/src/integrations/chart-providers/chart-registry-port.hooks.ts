/** This host's authenticated metadata read; browser loading remains in @jini-ai/ui/charts/browser. */
import type { AdminChartProviderSnapshot } from "@tovu/headless";
export type { AdminChartProviderSnapshot } from "@tovu/headless";
export interface ChartRegistryPort {
  readSnapshot(input: Record<string, never>, options?: Record<string, never>): Promise<AdminChartProviderSnapshot>;
}
