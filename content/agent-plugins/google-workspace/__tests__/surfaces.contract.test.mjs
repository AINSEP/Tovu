/**
 * @file Contract pins for the three admin-surface handler modules (`ui/*.handler.mjs`) through the
 * real Jini handler host and action dispatcher (payload and result schemas included): the account
 * switch actions, the connection view's optional fields, the scope set a sign-in asks for, the
 * destination list (with and without a usable account), removing a destination, the 50-destination
 * ceiling, odd tab answers from Google, the picked-file list (one entry per file, newest first, at
 * most 10) and the default Picker session id. Host ports are the typed in-memory ones of
 * `surface-harness.mjs`; Google is the local fake (throws for every non-Google host).
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { FORM_DESTINATIONS_KEY, MAX_FORM_DESTINATIONS } from '../lib/form-destination-settings.mjs';
import { PICKED_SPREADSHEETS_KEY, rememberPickedSpreadsheet } from '../lib/picker-flow.mjs';
import { startFakeGoogle } from './fake-google-http.mjs';
import { FILE_ID, OTHER_FILE_ID, bootSurfaces, createHostPorts, serveGoogle } from './surface-harness.mjs';

const PICKER_CONFIG = { TOVU_GOOGLE_PICKER_BROWSER_KEY: 'browser-key-placeholder', TOVU_GOOGLE_PICKER_APP_ID: '123456789' };
const SAVED = { spreadsheetId: FILE_ID, title: 'Leads', url: `https://docs.google.com/spreadsheets/d/${FILE_ID}/edit`, sheetId: 7, tabTitle: 'Leads', accountId: 'perm-alice' };

let fake;
before(async () => { fake = await startFakeGoogle({ clients: {} }); });
after(async () => { await fake.close(); });
beforeEach(() => { fake.reset(); });

async function boot(options = {}, optional = { randomId: () => 'session-0123456789abcdef' }) {
  const ports = createHostPorts({ publicConfig: PICKER_CONFIG, ...options });
  ports.state.set('products', { sheets: true });
  return { ports, surfaces: await bootSurfaces({ fake, ports }, optional) };
}

// --- connection panel ---------------------------------------------------------------------------

test('connection: a staged account switch is shown with the pending account label', async () => {
  const { ports, surfaces } = await boot();
  ports.connection.pendingSwitchAccountLabel = 'Bob';
  const { result } = await surfaces.dispatch('connection', 'status');
  assert.deepEqual(result.connection, { status: 'connected', grantedProducts: ['sheets'], accountLabel: 'Alice', pendingSwitchAccountLabel: 'Bob' });
});

test('connection: confirm-switch asks the host to confirm and answers with the new account', async () => {
  const { ports, surfaces } = await boot();
  ports.connection.pendingSwitchAccountLabel = 'Bob';
  const outcome = await surfaces.dispatch('connection', 'confirm-switch');
  assert.equal(ports.calls.confirmSwitch, 1);
  assert.deepEqual(outcome.result.connection, { status: 'connected', grantedProducts: ['sheets'], accountLabel: 'Bob' });
});

test('connection: cancel-switch asks the host to cancel and keeps the current account', async () => {
  const { ports, surfaces } = await boot();
  ports.connection.pendingSwitchAccountLabel = 'Bob';
  const outcome = await surfaces.dispatch('connection', 'cancel-switch');
  assert.equal(ports.calls.cancelSwitch, 1);
  assert.deepEqual(outcome.result.connection, { status: 'connected', grantedProducts: ['sheets'], accountLabel: 'Alice' });
});

test('connection: a host refusal of confirm-switch reaches the panel with its code and message', async () => {
  const { ports, surfaces } = await boot();
  ports.connections.confirmSwitch = async () => { throw Object.assign(new Error('No account switch is waiting.'), { code: 'no-pending-switch' }); };
  const outcome = await surfaces.dispatch('connection', 'confirm-switch');
  assert.deepEqual([outcome.ok, outcome.error.code, outcome.error.message], [false, 'no-pending-switch', 'No account switch is waiting.']);
});

test('connection: sign-in asks for a product that is on but not yet granted, and for one granted but now off', async () => {
  const on = await boot({ granted: [] });
  await on.surfaces.dispatch('connection', 'sign-in', { action: 'reconnect' });
  assert.deepEqual(on.ports.calls.begin[0].scopeSetIds, ['sheets']);
  const grantedOff = await boot({ granted: ['sheets'] });
  grantedOff.ports.state.set('products', { sheets: false });
  await grantedOff.surfaces.dispatch('connection', 'sign-in', { action: 'reconnect' });
  assert.deepEqual(grantedOff.ports.calls.begin[0].scopeSetIds, ['sheets']);
});

test('connection: sign-in with no product on and none granted asks for the base sign-in only', async () => {
  const { ports, surfaces } = await boot({ granted: [] });
  ports.state.set('products', {});
  await surfaces.dispatch('connection', 'sign-in', { action: 'connect' });
  assert.deepEqual(ports.calls.begin[0].scopeSetIds, []);
});

// --- destinations panel -------------------------------------------------------------------------

test('destinations: list shows each saved destination with its binding config and whether it is on the connected account', async () => {
  serveGoogle(fake);
  const { ports, surfaces } = await boot();
  ports.state.set(FORM_DESTINATIONS_KEY, { contact: SAVED, signup: { ...SAVED, accountId: 'perm-bob' } });
  const { result } = await surfaces.dispatch('form-destinations', 'list-destinations');
  assert.deepEqual(result.destinations.map((entry) => [entry.formSlug, entry.sameAccount]), [['contact', true], ['signup', false]]);
  // The binding config freezes the account the spreadsheet was verified with (each job then refuses another account).
  assert.deepEqual(JSON.parse(result.destinations[0].bindingConfigJson), { spreadsheetId: FILE_ID, accountId: 'perm-alice', tabs: { contact: { sheetId: 7 } } });
  assert.deepEqual(JSON.parse(result.destinations[1].bindingConfigJson).accountId, 'perm-bob');
  assert.deepEqual(result.picked, []);
});

test('destinations: while Google needs a reconnect, list still shows destinations, says nothing about accounts, and sends nothing to Google', async () => {
  const { ports, surfaces } = await boot();
  ports.connection.status = 'reconnect-required';
  ports.state.set(FORM_DESTINATIONS_KEY, { contact: SAVED });
  const { result } = await surfaces.dispatch('form-destinations', 'list-destinations');
  assert.equal(result.destinations.length, 1);
  assert.equal('sameAccount' in result.destinations[0], false);
  assert.equal(fake.requests.length, 0);
});

test('destinations: the Picker bootstrap reports reconnect-required while Google needs a reconnect', async () => {
  const { ports, surfaces } = await boot();
  ports.connection.status = 'reconnect-required';
  const bootstrap = await surfaces.bootstrap('form-destinations');
  assert.deepEqual([bootstrap.mode, bootstrap.reason], ['unavailable', 'reconnect-required']);
});

test('destinations: remove deletes only that form\'s destination and answers with the rest', async () => {
  serveGoogle(fake);
  const { ports, surfaces } = await boot();
  ports.state.set(FORM_DESTINATIONS_KEY, { contact: SAVED, signup: SAVED });
  const { result } = await surfaces.dispatch('form-destinations', 'remove-destination', { formSlug: 'contact' });
  assert.deepEqual(result.destinations.map((entry) => entry.formSlug), ['signup']);
  assert.deepEqual(Object.keys(ports.state.get(FORM_DESTINATIONS_KEY)), ['signup']);
});

test('destinations: removing a form with no destination leaves the others unchanged', async () => {
  serveGoogle(fake);
  const { ports, surfaces } = await boot();
  ports.state.set(FORM_DESTINATIONS_KEY, { signup: SAVED });
  assert.equal((await surfaces.dispatch('form-destinations', 'remove-destination', { formSlug: 'contact' })).ok, true);
  assert.deepEqual(ports.state.get(FORM_DESTINATIONS_KEY), { signup: SAVED });
});

const fullHouse = () => Object.fromEntries(Array.from({ length: MAX_FORM_DESTINATIONS }, (_, index) => [`form-${index}`, SAVED]));

test('destinations: a 51st form is refused (too-many-destinations) and nothing is saved', async () => {
  serveGoogle(fake);
  const { ports, surfaces } = await boot();
  ports.state.set(FORM_DESTINATIONS_KEY, fullHouse());
  const outcome = await surfaces.dispatch('form-destinations', 'save-destination', { formSlug: 'contact', spreadsheetId: FILE_ID, sheetId: 7, confirmExternalRows: true });
  assert.equal(outcome.error.code, 'too-many-destinations');
  assert.equal(Object.keys(ports.state.get(FORM_DESTINATIONS_KEY)).length, MAX_FORM_DESTINATIONS);
});

test('destinations: at the ceiling, a form that already has a destination can still change it', async () => {
  serveGoogle(fake);
  const { ports, surfaces } = await boot();
  ports.state.set(FORM_DESTINATIONS_KEY, fullHouse());
  const outcome = await surfaces.dispatch('form-destinations', 'save-destination', { formSlug: 'form-3', spreadsheetId: FILE_ID, sheetId: 0, confirmExternalRows: true });
  assert.equal(outcome.ok, true);
  assert.equal(ports.state.get(FORM_DESTINATIONS_KEY)['form-3'].sheetId, 0);
});

test('destinations: list-tabs keeps grid tabs only (a tab with no type counts as a grid) and gives an untitled tab an empty title', async () => {
  serveGoogle(fake);
  fake.route({ method: 'GET', path: `/v4/spreadsheets/${FILE_ID}` }, (_req, _body, url) => [200, url.searchParams.get('fields')?.startsWith('sheets')
    ? { sheets: [{ properties: { sheetId: 0, title: 'Grid', sheetType: 'GRID' } }, { properties: { sheetId: 1, title: 'Chart', sheetType: 'OBJECT' } }, { properties: { sheetId: 2 } }, null, { properties: { sheetId: 'x' } }] }
    : { spreadsheetId: FILE_ID, properties: { title: 'Leads' } }]);
  const { surfaces } = await boot();
  const { result } = await surfaces.dispatch('form-destinations', 'list-tabs', { spreadsheetId: FILE_ID });
  assert.deepEqual(result.tabs, [{ sheetId: 0, title: 'Grid' }, { sheetId: 2, title: '' }]);
});

test('destinations: list-tabs of an answer with no tab list returns no tabs', async () => {
  serveGoogle(fake);
  fake.route({ method: 'GET', path: `/v4/spreadsheets/${FILE_ID}` }, (_req, _body, url) => [200, url.searchParams.get('fields')?.startsWith('sheets') ? {} : { spreadsheetId: FILE_ID, properties: { title: 'Leads' } }]);
  const { surfaces } = await boot();
  assert.deepEqual((await surfaces.dispatch('form-destinations', 'list-tabs', { spreadsheetId: FILE_ID })).result.tabs, []);
});

// --- picked files -------------------------------------------------------------------------------

/** A plugin-state store typed as the `{ get, set }` port `rememberPickedSpreadsheet` takes. */
function memoryState() {
  const values = new Map();
  return { values, async get({ key }) { return values.get(key) ?? null; }, async set({ key, value }) { values.set(key, value); } };
}
const picked = (spreadsheetId, title = spreadsheetId) => ({ spreadsheetId, title, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, accountId: 'perm-alice' });

test('picked files: picking a file again moves it to the top instead of listing it twice', async () => {
  const state = memoryState();
  await rememberPickedSpreadsheet({ state, spreadsheet: picked(FILE_ID, 'Old title') });
  await rememberPickedSpreadsheet({ state, spreadsheet: picked(OTHER_FILE_ID) });
  await rememberPickedSpreadsheet({ state, spreadsheet: picked(FILE_ID, 'New title') });
  assert.deepEqual(state.values.get(PICKED_SPREADSHEETS_KEY).map((entry) => [entry.spreadsheetId, entry.title]), [[FILE_ID, 'New title'], [OTHER_FILE_ID, OTHER_FILE_ID]]);
});

test('picked files: at most 10 are kept, newest first', async () => {
  const state = memoryState();
  for (let index = 0; index < 12; index += 1) await rememberPickedSpreadsheet({ state, spreadsheet: picked(`sheet-number-${String(index).padStart(2, '0')}`) });
  const ids = state.values.get(PICKED_SPREADSHEETS_KEY).map((entry) => entry.spreadsheetId);
  assert.equal(ids.length, 10);
  assert.deepEqual([ids[0], ids[9]], ['sheet-number-11', 'sheet-number-02']);
});

test('picker: without an injected id source, a hosted session id is a random UUID', async () => {
  serveGoogle(fake);
  const { ports, surfaces } = await boot({}, {});
  const bootstrap = await surfaces.bootstrap('picker');
  assert.match(bootstrap.picker.sessionId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(ports.state.get('picker-session:picker').id, bootstrap.picker.sessionId);
});
