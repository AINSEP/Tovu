/** Explicit shell signals: never DOM text, URLs, site identifiers, arguments or content. */
import { installGlobalErrorReporting, type GlobalErrorTarget } from '@jini-ai/diagnostics/observability';
import type { ShellTelemetryPayload, ShellTelemetryBridge } from '../contracts/product-telemetry.js';

/** Reporting must not break a user action or recursively report a broken IPC bridge. O(1). */
export function reportShellTelemetry({ payload }: { payload: ShellTelemetryPayload }, { bridge = typeof window === 'undefined' ? undefined : window.tovuTelemetry }: {
  bridge?: ShellTelemetryBridge;
} = {}): void {
  try { bridge?.report({ payload }); } catch { /* Product reporting cannot interrupt the shell. */ }
}

/** Install once at renderer boot, before React mounts. Native browser events retain normal handling.
 * The listener lifecycle and caps are `@jini-ai/diagnostics`'; this binds them to the shell's `error` payload.
 * @returns Teardown for host/tests. @complexity O(n) capped error text, two listeners only.
 */
export function installShellErrorReporting({ target }: { target: GlobalErrorTarget }, {
  report = reportShellTelemetry,
}: { report?: typeof reportShellTelemetry } = {}): () => void {
  return installGlobalErrorReporting({ target, report: ({ message, stack }) => report({ payload: { kind: 'error', message, stack } }) });
}
