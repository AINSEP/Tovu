/** Explicit shell signals: never DOM text, URLs, site identifiers, arguments or content. */
import type { ShellTelemetryPayload, ShellTelemetryBridge } from '../contracts/product-telemetry.js';

/** Reporting must not break a user action or recursively report a broken IPC bridge. O(1). */
export function reportShellTelemetry({ payload }: { payload: ShellTelemetryPayload }, { bridge = typeof window === 'undefined' ? undefined : window.tovuTelemetry }: {
  bridge?: ShellTelemetryBridge;
} = {}): void {
  try { bridge?.report(payload); } catch { /* Product reporting cannot interrupt the shell. */ }
}

/** Install once at renderer boot, before React mounts. Native browser events retain normal handling.
 * @returns Teardown for host/tests. @complexity O(n) capped error text, two listeners only.
 */
export function installShellErrorReporting({ target }: { target: Pick<Window, 'addEventListener' | 'removeEventListener'> }, {
  report = reportShellTelemetry,
}: { report?: typeof reportShellTelemetry } = {}): () => void {
  const send = (failure: unknown, fallback: string) => {
    const message = typeof failure === 'string' ? failure : fallback;
    const error = failure instanceof Error ? failure : new Error(message);
    report({ payload: { kind: 'error', message: error.message.slice(0, 1000), stack: (error.stack ?? '').slice(0, 8000) } });
  };
  const error = (event: ErrorEvent) => send(event.error, event.message);
  const rejection = (event: PromiseRejectionEvent) => send(event.reason, 'Unhandled rejection');
  target.addEventListener('error', error as EventListener);
  target.addEventListener('unhandledrejection', rejection as EventListener);
  return () => {
    target.removeEventListener('error', error as EventListener);
    target.removeEventListener('unhandledrejection', rejection as EventListener);
  };
}
