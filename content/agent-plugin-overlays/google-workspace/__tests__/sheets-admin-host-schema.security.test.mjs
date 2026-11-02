/**
 * @file The booted half of the Sheets admin "paths" security pin, kept in Tovu when the plugin
 * moved to `@jini-ai/agent-plugins/google-workspace` (D-W8). The package's own suite checks that the
 * declared `spreadsheetId` pattern refuses a non-Google id; this checks that Tovu's real registrar
 * and executor enforce it (validation before the module runs, nothing sent to Google).
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { startFakeGoogle } from './fake-google-http.mjs';
import { CONNECTION, SPREADSHEET, bootPluginTools } from './sheets-admin-harness.mjs';

let fake;
before(async () => { fake = await startFakeGoogle({ clients: {} }); });
after(async () => { await fake.close(); });
beforeEach(() => { fake.reset(); });

const sheetsRequests = () => fake.requests.filter((request) => request.host === 'sheets.googleapis.com' || request.host === 'www.googleapis.com');

test('paths: Tovu\'s executor refuses a spreadsheet id that is not a Google id against the real input schema', async () => {
  const booted = await bootPluginTools({ fake });
  const result = await booted.executor.execute({ toolId: 'p_google_workspace__sheets_protected_ranges_get', principal: { id: 'owner' }, run: { id: 'run' }, input: { connectionRef: CONNECTION, spreadsheetId: '../x/y/zzzzzz' } }, {});
  assert.equal(result.status, 'failed');
  assert.equal(result.errorKind, 'validation');
  assert.match(result.error, /#\/spreadsheetId \(pattern\)/);
  assert.equal(sheetsRequests().length, 0);
});
