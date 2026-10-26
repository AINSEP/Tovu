/** Electron policy over the shared product tracker, consent and native crash-upload ports. */
import path from 'node:path';
import { createNoopTracker, type Tracker } from '@jini-ai/diagnostics/observability';
import { createTracker } from '@jini-ai/diagnostics/observability/node';
import { bootProductTelemetry, type ProductTelemetry, type ProductConsent } from '../../website/src/server/runtime/composition/product-telemetry.ts';
export interface DesktopProductLaunch { configPath: string; preferencePath: string; release: string }
export interface DesktopProductTelemetry {
  tracker: Tracker; launch: DesktopProductLaunch | undefined;
  consentChanged(preference: ProductConsent): void;
  dispose(): Promise<void>;
}
interface CrashReporter {
  start(options: { submitURL: string; globalExtra: Readonly<Record<string, string>>; uploadToServer: boolean; compress: boolean }): void;
  setUploadToServer(enabled: boolean): void;
}

/** Electron owns native dumps; an SDK/configuration failure cannot fail the app's boot. O(1). */
function startNativeReporting({ active, product, readConsent, crashReporter }: {
  active: boolean; product: ProductTelemetry | undefined; readConsent: () => ProductConsent; crashReporter: CrashReporter;
}, { warn }: { warn: (message: string) => void }): boolean {
  if (!active || !product?.crashUpload || !readConsent().crashes) return false;
  try {
    crashReporter.start({ ...product.crashUpload, uploadToServer: true, compress: true });
    return true;
  } catch { warn('[product-telemetry] native crash reporting is unavailable'); return false; }
}

/** Development has no implicit product config; an explicit test path opts into the same flow.
 * @returns Paths and release only, or undefined. No reads. @complexity O(n) path length.
 */
export function desktopProductLaunch({ isPackaged, resourcesPath, preferencePath, version, env }: {
  isPackaged: boolean; resourcesPath: string; preferencePath: string; version: string; env: NodeJS.ProcessEnv;
}, _options = {}): DesktopProductLaunch | undefined {
  const configPath = env.TOVU_PRODUCT_TELEMETRY_CONFIG || (isPackaged ? path.join(resourcesPath, 'product-telemetry.json') : undefined);
  return configPath ? { configPath, preferencePath, release: `tovu-desktop@${version}` } : undefined;
}

/** Boot before children/windows; failed config stays inactive, with no dialog or child env.
 * Native dumps start only with launch-time consent. Enabling later cannot start collection.
 * @returns A tracker and owned disposal even in dev. @complexity Delegates to shared boot.
 */
export async function bootDesktopProductTelemetry({ launch, readConsent, crashReporter, launchMode = 'fresh' }: {
  launch: DesktopProductLaunch | undefined; readConsent: () => ProductConsent; crashReporter: CrashReporter; launchMode?: 'fresh' | 'update';
}, { boot = bootProductTelemetry, warn = console.warn }: { boot?: typeof bootProductTelemetry; warn?: (message: string) => void } = {}): Promise<DesktopProductTelemetry> {
  let product: ProductTelemetry | undefined;
  if (launch) product = await boot({ ...launch, processRole: 'desktop-main' }, { readConsent });
  const active = product?.active === true;
  const tracker = product ? createTracker(product) : createNoopTracker({});
  const nativeStarted = startNativeReporting({ active, product, readConsent, crashReporter }, { warn });
  let started = false;
  const captureStarted = () => {
    const consent = readConsent();
    if (!active || started || !consent.usage || !consent.installationId) return;
    started = true;
    void tracker.capture({ name: 'app_started', properties: { launchMode } });
  };
  captureStarted();
  return { tracker, launch: active ? launch : undefined,
    consentChanged({ crashes }: ProductConsent) {
      if (nativeStarted && !crashes) crashReporter.setUploadToServer(false);
      captureStarted();
    },
    async dispose() { await product?.dispose(); },
  };
}

/** Parent-observed exits deliberately carry no site directory, title, executable or log text. */
export function reportDesktopProcessGone({ tracker, type, reason }: { tracker: Tracker; type: string; reason: string }, _options = {}): void {
  if (reason === 'clean-exit') return;
  tracker.error(new Error('process gone'), { operation: 'desktop.process_gone', attributes: { process: type, code: reason } });
}

/** Supervisor owns unexpected-exit classification and invokes this exactly once per child. */
export function reportDesktopServerExit({ tracker, code, signal }: { tracker: Tracker; code: number | null; signal: string | null }, _options = {}): void {
  tracker.error(new Error('site server exited'), { operation: 'desktop.server_exit',
    attributes: { ...(code === null ? {} : { code }), ...(signal === null ? {} : { signal }) } });
}
