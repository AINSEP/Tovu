import type { CrashUpload, ObservabilityPort } from '@jini-ai/diagnostics/observability';
import type { ProductAnalyticsPort } from '@jini-ai/analytics/product';

export interface ProductConsent { crashes: boolean; usage: boolean; installationId: string | null; }
export interface ProductTelemetry {
  /** Successful config/provider initialization; desktop must not prompt on a failed boot. */
  active?: boolean;
  observability: ObservabilityPort;
  productAnalytics: ProductAnalyticsPort;
  crashUpload?: CrashUpload;
  dispose(): Promise<void>;
}
