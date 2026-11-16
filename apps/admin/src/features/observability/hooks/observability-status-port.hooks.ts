import type { AdminObservabilityStatus, AdminTelemetryTestResult } from "@/features/observability/api/observability-api.types";

/**
 * @file What `use-observability-status.hooks.ts` needs from the outside world, as an interface
 * rather than a direct `lib/api` import — same `useX(dependencies)` / `useWiredX()` pair
 * `features/plugins/hooks/agent-plugins-port.hooks.ts` establishes for that sibling screen.
 */
export interface ObservabilityStatusPort {
  getObservabilityStatus(): Promise<AdminObservabilityStatus>;
  sendTestError?(): Promise<AdminTelemetryTestResult>;
}
