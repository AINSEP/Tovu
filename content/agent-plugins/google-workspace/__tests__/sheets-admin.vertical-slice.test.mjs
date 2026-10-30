/**
 * @file The ONE vertical-slice proof for the Sheets admin tools (lot G12): the plugin's real tools
 * file and modules load through Jini's contribution definition, register on Tovu's real registrar
 * with no refusals, and a destructive `sheets_tab_modify` call shows the account and affected
 * resources on the existing confirmation card, runs only after the click, sends one reviewed
 * batchUpdate request to the (fake) Sheets API with a host-scoped token, and returns the tab
 * without the token.
 */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { startFakeGoogle } from './fake-google-http.mjs';
import { CONNECTION, PLUGIN, SPREADSHEET, TOKEN, WORKSPACE, bootPluginTools, startConfirmingCall } from './sheets-admin-harness.mjs';

const G12_TOOLS = ['sheets_tab_modify', 'sheets_sort', 'sheets_basic_filter', 'sheets_filter_views', 'sheets_format', 'sheets_named_ranges', 'sheets_protected_ranges_get', 'sheets_developer_metadata', 'sheets_batch_update', 'sheets_export_csv', 'sheets_open_existing'];

let fake;
before(async () => { fake = await startFakeGoogle({ clients: {} }); });
after(async () => { await fake.close(); });

test('vertical slice: a confirmed sheets_tab_modify rename registers, discloses, waits for the click and sends one batchUpdate', async () => {
  const batches = [];
  fake.route({ method: 'POST', path: `/v4/spreadsheets/${SPREADSHEET}:batchUpdate` }, (req, body) => {
    batches.push({ authorization: req.headers.authorization, body: JSON.parse(body) });
    return [200, { spreadsheetId: SPREADSHEET, replies: [{}] }];
  });
  const booted = await bootPluginTools({ fake });
  assert.deepEqual(booted.registered.refusals, []);
  for (const name of G12_TOOLS) assert.ok(booted.registry.has({ toolId: `p_google_workspace__${name}` }), name);

  const input = { connectionRef: CONNECTION, spreadsheetId: SPREADSHEET, action: 'rename', sheetId: 7, title: 'Leads 2026' };
  const call = await startConfirmingCall(booted, 'p_google_workspace__sheets_tab_modify', input);
  assert.deepEqual(call.rows, [['Connection ref', CONNECTION], ['Spreadsheet ID', SPREADSHEET], ['Action', 'rename'], ['Sheet ID', '7'], ['Title', 'Leads 2026'], ['Account', 'alice@example.test'], ['Affects', `spreadsheet ${SPREADSHEET}`], ['Affects', 'rename tab 7']]);
  assert.equal(batches.length, 0, 'nothing reaches Google before the person answers');

  call.answer('confirm');
  const result = await call.pending;
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.output, { action: 'rename', tab: { sheetId: 7, title: 'Leads 2026' } });
  assert.deepEqual(batches, [{ authorization: `Bearer ${TOKEN}`, body: { requests: [{ updateSheetProperties: { properties: { sheetId: 7, title: 'Leads 2026' }, fields: 'title' } }] } }]);
  assert.equal(JSON.stringify(result.output).includes(TOKEN), false);
  assert.deepEqual(booted.tokenRequests, [{ target: { workspaceId: WORKSPACE, pluginId: PLUGIN, connectionRef: CONNECTION }, expectedAccountId: 'perm-alice' }]);
});
