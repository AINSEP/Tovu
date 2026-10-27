/** Admit only the trusted shell's main frame and the existing product catalog. */
import type { Tracker } from '@jini-ai/diagnostics/observability';
import { PRODUCT_EVENTS } from '../../website/src/server/runtime/composition/product-events.ts';
import { PRODUCT_TELEMETRY_CHANNEL, type ShellTelemetryPayload } from './contracts/product-telemetry.ts';
interface Sender { getURL(): string }
interface TelemetryEvent { sender: Sender; senderFrame: { url: string; parent: unknown } | null }

/** Error text is the only permitted free text, capped before the main tracker scrubs it. O(k). */
function errorPayload({ record }: { record: Record<string, unknown> }, _options = {}): ShellTelemetryPayload | undefined {
  if (Object.keys(record).length !== 3 || typeof record.message !== 'string' || typeof record.stack !== 'string') return;
  if (record.message.length > 1000 || record.stack.length > 8000) return;
  return { kind: 'error', message: record.message, stack: record.stack };
}

/** Catalog ownership stays in the shared product map, including screens and actions. O(k). */
function catalogPayload({ record }: { record: Record<string, unknown> }, _options = {}): ShellTelemetryPayload | undefined {
  if (record.kind !== 'action' && record.kind !== 'screen') return;
  if (Object.keys(record).length !== 2 || typeof record.id !== 'string' || record.id.length > 80) return;
  const rules = record.kind === 'action' ? PRODUCT_EVENTS.desktop_action!.action : PRODUCT_EVENTS.desktop_screen_viewed!.screen;
  if (!Array.isArray(rules) || !rules.includes(record.id)) return;
  return { kind: record.kind, id: record.id };
}

/** Exact shape and bounded strings; malformed input is dropped, never echoed. O(k), k <= 3. */
export function shellTelemetryPayload({ input }: { input: unknown }, _options = {}): ShellTelemetryPayload | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const record = input as Record<string, unknown>;
  return record.kind === 'error' ? errorPayload({ record }) : catalogPayload({ record });
}

/** The trusted shell's main frame. A frame or sender torn down while its message was in flight
 * throws on `url`/`getURL()`; inside an `ipcMain` listener that is a main-process error, so it reads
 * as untrusted and the message is dropped. O(1). */
function fromShellMainFrame({ event, isShellPage }: { event: TelemetryEvent; isShellPage: (url: string) => boolean }, _options = {}): boolean {
  try {
    const frame = event.senderFrame;
    return !!frame && frame.parent === null && isShellPage(frame.url) && isShellPage(event.sender.getURL());
  } catch {
    return false;
  }
}

/** Register before the shell opens. One rolling error budget for the whole shell (reloads cannot
 * reset it). Returns teardown; no per-sender registry can grow. O(1), at most ten timestamps.
 */
export function registerProductTelemetryIpc({ ipcMain, isShellPage, tracker }: {
  ipcMain: { on(channel: string, listener: (event: TelemetryEvent, input: unknown) => void): unknown;
    removeListener(channel: string, listener: (event: TelemetryEvent, input: unknown) => void): unknown };
  isShellPage: (url: string) => boolean; tracker: Tracker;
}, { now = Date.now }: { now?: () => number } = {}): () => void {
  let errors: number[] = [];
  const listener = (event: TelemetryEvent, input: unknown) => {
    if (!fromShellMainFrame({ event, isShellPage })) return;
    const payload = shellTelemetryPayload({ input });
    if (!payload) return;
    if (payload.kind === 'error') {
      const at = now();
      errors = errors.filter(time => at - time < 60_000);
      if (errors.length >= 10) return;
      errors.push(at);
      const error = new Error(payload.message);
      error.stack = payload.stack;
      tracker.error({ error }, { context: { operation: 'desktop.shell_error', attributes: { process: 'renderer' } } });
    } else {
      const action = payload.kind === 'action';
      void tracker.capture({ name: action ? 'desktop_action' : 'desktop_screen_viewed', userId: 'system' }, { properties: { [action ? 'action' : 'screen']: payload.id } });
    }
  };
  ipcMain.on(PRODUCT_TELEMETRY_CHANNEL, listener);
  return () => { ipcMain.removeListener(PRODUCT_TELEMETRY_CHANNEL, listener); };
}
