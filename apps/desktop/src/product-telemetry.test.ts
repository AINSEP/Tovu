import assert from 'node:assert/strict';
import test from 'node:test';
import { createNoopObservabilityPort, createNoopTracker, type Tracker } from '@jini-ai/diagnostics/observability';
import type { ProductTelemetry, ProductConsent } from '../../website/src/server/runtime/composition/product-telemetry.ts';
import { bootDesktopProductTelemetry, desktopProductLaunch, reportDesktopProcessGone, reportDesktopServerExit } from './product-telemetry.ts';
import { buildServeEnv } from './tovu-server.ts';
import { createSiteSupervisor } from './site-supervisor.ts';

const launch = { configPath: '/fake/product.json', preferencePath: '/fake/preferences.json', release: 'tovu-desktop@0.0.0-test' };
const off: ProductConsent = { crashes: false, usage: false, installationId: null };
const on: ProductConsent = { crashes: true, usage: true, installationId: 'FAKE_INSTALL' };
function fixture() {
  const starts: unknown[] = [], uploads: boolean[] = [], events: unknown[] = [], errors: unknown[] = [];
  let consent = off, loads = 0, disposed = 0;
  const raw: ProductTelemetry = { active: true,
    observability: { ...createNoopObservabilityPort({}), reportError: report => { errors.push(report); } },
    productAnalytics: { capture: event => { events.push(event); }, identify() {} },
    crashUpload: { submitURL: 'https://fake.example.test/upload', globalExtra: { release: launch.release } },
    dispose: async () => { disposed++; },
  };
  const crashReporter = { start: (options: unknown) => { starts.push(options); }, setUploadToServer: (value: boolean) => { uploads.push(value); } };
  return { raw, starts, uploads, events, errors, crashReporter, readConsent: () => consent,
    consent: (value: ProductConsent) => { consent = value; }, loads: () => loads, disposed: () => disposed,
    boot: async (): Promise<ProductTelemetry> => { loads++; return raw; } };
}

test('no config in dev means noop tracker, no provider reads, no child launch, and crashReporter never starts', async () => {
  const f = fixture(); f.consent(on);
  const selected = desktopProductLaunch({ isPackaged: false, resourcesPath: '/fake/resources', preferencePath: launch.preferencePath, version: '0.0.0-test', env: {} });
  assert.equal(selected, undefined);
  const product = await bootDesktopProductTelemetry({ launch: selected, readConsent: f.readConsent, crashReporter: f.crashReporter }, { boot: f.boot });
  product.tracker.error({ error: new Error('fake') }); await product.tracker.capture({ name: 'app_started', userId: 'system' });
  assert.equal(product.launch, undefined);
  assert.deepEqual([f.loads(), f.starts.length, f.events.length, f.errors.length], [0, 0, 0, 0]);
  await product.dispose(); assert.equal(f.disposed(), 0);
});

test('packaged config is selected from Resources; explicit test path takes precedence; failed boot stays inactive', async () => {
  assert.deepEqual(desktopProductLaunch({ isPackaged: true, resourcesPath: '/fake/resources', preferencePath: launch.preferencePath, version: '0.0.0-test', env: {} }),
    { ...launch, configPath: '/fake/resources/product-telemetry.json' });
  assert.deepEqual(desktopProductLaunch({ isPackaged: false, resourcesPath: '/unused', preferencePath: launch.preferencePath, version: '0.0.0-test', env: { TOVU_PRODUCT_TELEMETRY_CONFIG: '/fake/product.json' } }), launch);
  const f = fixture(); f.raw.active = false; f.consent(on);
  const product = await bootDesktopProductTelemetry({ launch, readConsent: f.readConsent, crashReporter: f.crashReporter }, { boot: f.boot });
  assert.equal(product.launch, undefined); assert.deepEqual(f.starts, []); assert.deepEqual(f.events, []);
});

test('native reporter starts only with crashes already on at launch; switch-off disables uploads; late enable waits for restart', async () => {
  const f = fixture(); f.consent(on);
  const product = await bootDesktopProductTelemetry({ launch, readConsent: f.readConsent, crashReporter: f.crashReporter }, { boot: f.boot });
  assert.deepEqual(f.starts, [{ ...f.raw.crashUpload, uploadToServer: true, compress: true }]);
  product.consentChanged(off); assert.deepEqual(f.uploads, [false]);
  product.consentChanged(on); assert.deepEqual(f.uploads, [false]); assert.equal(f.starts.length, 1);
  await product.dispose(); assert.equal(f.disposed(), 1);
  const later = fixture();
  const second = await bootDesktopProductTelemetry({ launch, readConsent: later.readConsent, crashReporter: later.crashReporter }, { boot: later.boot });
  later.consent(on); second.consentChanged(on);
  assert.deepEqual(later.starts, []); assert.deepEqual(later.uploads, []);
});

test('app_started happens once per launch with usage consent, including a first-run grant', async () => {
  const f = fixture();
  const product = await bootDesktopProductTelemetry({ launch, readConsent: f.readConsent, crashReporter: f.crashReporter, launchMode: 'update' }, { boot: f.boot });
  assert.deepEqual(f.events, []);
  f.consent(on); product.consentChanged(on); product.consentChanged(on);
  assert.deepEqual(f.events, [{ name: 'app_started', userId: 'system', properties: { launchMode: 'update' } }]);
});

test('non-clean renderer/GPU/utility exits and one unexpected supervisor exit carry only fixed diagnostic fields', () => {
  const reports: { error: Error; context: unknown }[] = [];
  const tracker: Tracker = { ...createNoopTracker({}), error: ({ error }, { context } = {}) => { reports.push({ error, context }); } };
  reportDesktopProcessGone({ tracker, type: 'renderer', reason: 'clean-exit' });
  for (const type of ['renderer', 'GPU', 'Utility']) reportDesktopProcessGone({ tracker, type, reason: 'crashed' });
  assert.equal(reports.length, 3);
  assert.deepEqual(reports[0]!.context, { operation: 'desktop.process_gone', attributes: { process: 'renderer', code: 'crashed' } });
  let exit!: (value: { code: number | null; signal: string | null }) => void;
  const supervisor = createSiteSupervisor({ onUnexpectedExit: (_siteDir, outcome) => reportDesktopServerExit({ tracker, ...outcome }) });
  supervisor.set('/fake/private-site', { server: { onExit: listener => { exit = listener; } } });
  exit({ code: 7, signal: null }); exit({ code: 7, signal: null });
  assert.equal(reports.length, 4);
  assert.equal(reports[3]!.error.message, 'site server exited');
  assert.deepEqual(reports[3]!.context, { operation: 'desktop.server_exit', attributes: { code: 7 } });
  assert.equal(JSON.stringify(reports).includes('private-site'), false);
});

test('buildServeEnv forwards exactly three product env values only with an active launch, for POSIX and Windows paths', () => {
  for (const root of ['/fake', 'C:\\fake']) {
    const config = { configPath: `${root}/product.json`, preferencePath: `${root}/desktop-preferences.json`, release: launch.release };
    const baseEnv = { TOVU_PRODUCT_TELEMETRY_CONFIG: 'FAKE_INHERITED', TOVU_PRODUCT_TELEMETRY_PREFS: 'FAKE_INHERITED', TOVU_PRODUCT_RELEASE: 'FAKE_INHERITED' };
    const empty = buildServeEnv({ repoRoot: root, baseEnv });
    assert.deepEqual(Object.keys(empty).filter(key => key.startsWith('TOVU_PRODUCT_')), []);
    const active = buildServeEnv({ repoRoot: root, baseEnv, productTelemetry: config });
    assert.deepEqual(Object.fromEntries(Object.entries(active).filter(([key]) => key.startsWith('TOVU_PRODUCT_'))), {
      TOVU_PRODUCT_TELEMETRY_CONFIG: config.configPath, TOVU_PRODUCT_TELEMETRY_PREFS: config.preferencePath, TOVU_PRODUCT_RELEASE: config.release,
    });
    assert.equal(baseEnv.TOVU_PRODUCT_RELEASE, 'FAKE_INHERITED');
  }
});
