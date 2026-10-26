import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createProductConsentReader, readProductTelemetryPreference, writeProductTelemetryPreference,
  offerProductTelemetryConsent, productTelemetryMenu, PRODUCT_CONSENT_DIALOG } from './product-telemetry-preference.ts';

const OFF = { crashes: false, usage: false, installationId: null, decidedAt: null };
function fixture(t: test.TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-product-prefs-'));
  t.after(() => fs.rmSync(dir, { force: true, recursive: true }));
  const preferencePath = path.join(dir, 'desktop-preferences.json');
  return { preferencePath, put: (value: unknown) => fs.writeFileSync(preferencePath, JSON.stringify(value)),
    read: () => readProductTelemetryPreference({ preferencePath }),
    save: (patch: { crashes?: boolean; usage?: boolean }) => writeProductTelemetryPreference({ preferencePath, patch }) };
}

test('prefs missing/unreadable/non-boolean are off; grants mint UUIDs, retain them while either switch is on, clear on both off', t => {
  const f = fixture(t);
  assert.deepEqual(f.read(), OFF);
  for (const value of [null, [], 'on', { crashes: 'true', usage: 1 }, { crashes: {}, usage: [] }]) {
    f.put({ automaticUpdates: false, productTelemetry: value });
    assert.deepEqual(f.read(), OFF);
  }
  f.put({ automaticUpdates: false, futureSetting: 42 });
  const first = f.save({ crashes: true });
  assert.match(first.installationId!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(typeof first.decidedAt, 'string');
  assert.deepEqual(JSON.parse(fs.readFileSync(f.preferencePath, 'utf8')), { automaticUpdates: false, futureSetting: 42, productTelemetry: first });
  assert.equal(f.save({ usage: true }).installationId, first.installationId);
  assert.equal(f.save({ crashes: false }).installationId, first.installationId);
  assert.equal(f.save({ usage: false }).installationId, null);
  assert.notEqual(f.save({ usage: true }).installationId, first.installationId);
});

test('unreadable bytes refuse writes and restore both menu choices without changing behavior', t => {
  const f = fixture(t);
  const preference = f.save({ crashes: true, usage: true });
  fs.writeFileSync(f.preferencePath, '{damaged');
  assert.deepEqual(f.read(), OFF);
  assert.throws(() => f.save({ crashes: false }), { message: 'DESKTOP_PREFERENCES_UNREADABLE' });
  let applied = 0, errors = 0;
  const menu = productTelemetryMenu({ preference, save: f.save, changed: () => { applied++; }, onError: () => { errors++; } });
  for (const entry of menu) {
    const item = { checked: false };
    entry.click(item);
    assert.equal(item.checked, true);
  }
  assert.equal(applied, 0);
  assert.equal(errors, 2);
  assert.equal(fs.readFileSync(f.preferencePath, 'utf8'), '{damaged');
});

test('menu persists the requested switch before applying live behavior; the other switch is preserved', t => {
  const f = fixture(t);
  const observed: unknown[] = [];
  const menu = productTelemetryMenu({ preference: OFF, save: f.save, changed: value => {
    assert.deepEqual(f.read(), value);
    observed.push([value.crashes, value.usage]);
  }, onError: () => assert.fail('unexpected save error') });
  assert.deepEqual(menu.map(entry => [entry.label, entry.type, entry.checked]), [
    ['Send crash reports to Tovu', 'checkbox', false], ['Send usage statistics to Tovu', 'checkbox', false],
  ]);
  menu[0]!.click({ checked: true });
  menu[1]!.click({ checked: true });
  menu[0]!.click({ checked: false });
  assert.deepEqual(observed, [[true, false], [true, true], [false, true]]);
  assert.match(menu[0]!.toolTip, /10 seconds/);
  assert.match(menu[0]!.toolTip, /restart/);
});

test('first-run only with active config and undecided prefs; each button writes its pair; closing writes nothing', async () => {
  const saved: unknown[] = [];
  let shown = 0;
  const run = (active: boolean, decidedAt: string | null, response: number) => offerProductTelemetryConsent({ active,
    preference: { ...OFF, decidedAt }, show: async options => { assert.equal(options, PRODUCT_CONSENT_DIALOG); shown++; return { response }; },
    save: patch => { saved.push(patch); } });
  assert.equal(await run(false, null, 0), false);
  assert.equal(await run(true, 'already-decided', 0), false);
  assert.equal(shown, 0);
  for (const response of [0, 1, 2]) assert.equal(await run(true, null, response), true);
  assert.deepEqual(saved, [{ crashes: true, usage: true }, { crashes: true, usage: false }, { crashes: false, usage: false }]);
  assert.equal(await run(true, null, PRODUCT_CONSENT_DIALOG.cancelId), false);
  assert.equal(await run(true, null, -1), false);
  assert.equal(saved.length, 3);
  assert.equal(PRODUCT_CONSENT_DIALOG.buttons.length, 3);
  assert.match(PRODUCT_CONSENT_DIALOG.detail, /snapshot of process memory/);
});

test('desktop reuses the cross-process cache: mtime-only reads and stat failure fail closed on darwin/win32 paths', () => {
  for (const preferencePath of ['/fake/desktop-preferences.json', 'C:\\fake\\desktop-preferences.json']) {
    let mtimeMs = 1, reads = 0, fail = false;
    let record = { crashes: true, usage: true, installationId: 'FAKE_INSTALL' };
    const read = createProductConsentReader({ preferencePath }, { stat: file => {
      assert.equal(file, preferencePath); if (fail) throw new Error('FAKE_STAT_ERROR'); return { mtimeMs };
    }, read: () => { reads++; return JSON.stringify({ productTelemetry: record }); } });
    assert.deepEqual(read(), record); read(); assert.equal(reads, 1);
    record = { ...record, usage: false };
    assert.equal(read().usage, true); assert.equal(reads, 1);
    mtimeMs++; assert.equal(read().usage, false); assert.equal(reads, 2);
    fail = true; assert.deepEqual(read(), { crashes: false, usage: false, installationId: null });
    fail = false; read(); assert.equal(reads, 3);
  }
});
