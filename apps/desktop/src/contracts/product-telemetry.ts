/** Shell-only, closed IPC contract. No site identity or arbitrary event properties. */
export const PRODUCT_TELEMETRY_CHANNEL = 'tovu:product-telemetry';
export type ShellTelemetryPayload = { kind: 'error'; message: string; stack: string }
  | { kind: 'action' | 'screen'; id: string };
export interface ShellTelemetryBridge { report(payload: ShellTelemetryPayload, options?: Record<string, never>): void }
declare global { interface Window { tovuTelemetry?: ShellTelemetryBridge } }
