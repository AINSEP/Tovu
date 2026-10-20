/**
 * @file G14b end-to-end proof for the Google Sheets form destination over the REAL host fan-out:
 * a form submission -> planner -> outbox child job -> the host's OAuth connection port (fresh token,
 * frozen account) -> this plugin's `google-sheets` adapter -> an append on the local fake Sheets
 * grid. Plus: a replayed event and a redelivered job add no second row (plan-once + the id-column
 * scan), Sheets turned off pauses the job (retryable) until it is turned back on, a sign-in Google
 * stopped honouring is `authorization-required` with the job kept, and an account switch after
 * planning never sends the frozen job to the new account. The binding config is the one the
 * destination panel shows (`bindingConfigFor`). The host harness is shared with the acme-office twin
 * (`apps/website/src/server/runtime/composition/__tests__/form-delivery-oauth.fixture.ts`).
 *
 * The only transport is the local Google fake (127.0.0.1); every other host throws.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';

import { loadPluginContributionsFromSource } from '../../../../apps/website/src/features/agent-plugins/lifecycle.ts';
import { createOAuthDeliverySite } from '../../../../apps/website/src/server/runtime/composition/__tests__/form-delivery-oauth.fixture.ts';
import { bindingConfigFor } from '../lib/form-destination-settings.mjs';
import { startFakeGoogle } from './fake-google-http.mjs';
import { installSheetsGrid } from './fake-sheets-grid.mjs';
import { PLUGIN_ROOT } from './sheets-admin-harness.mjs';

const PLUGIN = 'google-workspace';
const BOOK = 'sheet1234567890abcdef';
const TAB_ID = 7;
/** Placeholder client identity; the secret is built at runtime and is not secret-shaped. */
const CLIENT_ID = 'web-client.test';
const CLIENT_SECRET = `web-secret-${'w'.repeat(20)}`;
const env = { TOVU_GOOGLE_OAUTH_WEB_CLIENT_ID: CLIENT_ID, TOVU_GOOGLE_OAUTH_WEB_CLIENT_SECRET: CLIENT_SECRET };
const loadContributions = (input) => loadPluginContributionsFromSource({ plugin: { pluginId: PLUGIN, packageRoot: PLUGIN_ROOT }, definition: input.definition });

let fake;
before(async () => { fake = await startFakeGoogle({ clients: { [CLIENT_ID]: { secret: CLIENT_SECRET } } }); });
after(async () => { await fake.close(); });
beforeEach(() => { fake.reset(); });

/** The site's guarded HTTP, over the fake only. */
const http = {
  async send({ request }) {
    const response = await fake.fetch({ url: request.url }, { method: request.method, headers: request.headers, ...(request.body === undefined ? {} : { body: request.body }) });
    return { status: response.status, headers: Object.fromEntries(response.headers.entries()), bodyText: await response.text() };
  },
};
const kit = { timeouts: {}, fetch: (url, init) => fake.fetch({ url }, init) };
const consentAs = (account) => async (authorizationUrl) => fake.consent({ authorizationUrl, account });
const appends = () => fake.requests.filter((request) => request.host === 'sheets.googleapis.com' && request.path.endsWith(':append'));

/** A site signed in as alice with Sheets on, the contact form bound to the tab, and the grid served. */
async function boundSite({ sheetsOn = true } = {}) {
  const site = await createOAuthDeliverySite({ loadContributions, http, kit, env });
  const connectionRef = await site.connect({ pluginId: PLUGIN, consent: consentAs('alice'), scopeSetIds: ['sheets'] });
  await site.setPluginSetting({ pluginId: PLUGIN, key: 'products', value: { sheets: sheetsOn } });
  const token = await site.host.accessTokensFor({ pluginId: PLUGIN }).getAccessToken({ connectionRef });
  const grid = installSheetsGrid({ fake, spreadsheetId: BOOK, token, tabs: [{ sheetId: TAB_ID, title: 'Contact form' }] });
  const config = bindingConfigFor({ formSlug: 'contact', destination: { spreadsheetId: BOOK, sheetId: TAB_ID, accountId: 'perm-alice' } });
  await site.bind({ bindings: [{ bindingId: 'b1', adapterId: 'google-sheets', connectionRef, enabled: true, config }] });
  return { site, grid };
}

const ledger = (site, submissionId) => site.jobsFor({ submissionId }).map(({ status, attempts, lastError }) => ({ status, attempts, lastError }));

test('end to end: one submission becomes one RAW row; a replayed event and a redelivered job add no second row', async () => {
  const { site, grid } = await boundSite();
  await site.submit({ submissionId: 'sub-1', answers: { email: 'ada@example.test', message: '=1+1' } });
  await site.drain();
  await site.drain();
  assert.deepEqual(ledger(site, 'sub-1'), [{ status: 'delivered', attempts: 1, lastError: undefined }]);
  assert.deepEqual(grid.rowsOf(TAB_ID), [
    ['_tovu_submission_id', '_tovu_submitted_at', 'Email', 'Message'],
    ['sub-1', '2026-10-20T10:00:00.000Z', 'ada@example.test', '=1+1'],
  ]);
  assert.equal(appends()[0].query.get('valueInputOption'), 'RAW');

  await site.replayReceived({ submissionId: 'sub-1' });
  await site.drain();
  await site.drain();
  assert.equal(site.jobsFor({ submissionId: 'sub-1' }).length, 1, 'the plan is stored once');
  await site.redeliver({ job: site.jobsFor({ submissionId: 'sub-1' })[0] });
  await site.drain();
  assert.deepEqual(site.jobsFor({ submissionId: 'sub-1' }).map((row) => row.status), ['delivered', 'delivered'], 'the redelivery succeeded by finding the row');
  assert.equal(grid.rowsOf(TAB_ID).length, 2, 'still one data row');
  assert.equal(appends().length, 1, 'never appended twice');
});

test('Sheets turned off pauses delivery (adapter-unavailable, retryable, nothing sent); turned back on, the same job delivers', async () => {
  const { site, grid } = await boundSite({ sheetsOn: false });
  await site.submit({ submissionId: 'sub-1', answers: { email: 'ada@example.test' } });
  await site.drain();
  await site.drain();
  assert.deepEqual(ledger(site, 'sub-1'), [{ status: 'pending', attempts: 1, lastError: 'adapter-unavailable' }]);
  assert.equal(fake.requests.filter((request) => request.host === 'sheets.googleapis.com').length, 0);

  await site.setPluginSetting({ pluginId: PLUGIN, key: 'products', value: { sheets: true } });
  site.clock.advanceMs(30 * 60_000);
  await site.drain();
  assert.deepEqual(ledger(site, 'sub-1'), [{ status: 'delivered', attempts: 2, lastError: 'adapter-unavailable' }]);
  assert.equal(grid.rowsOf(TAB_ID).length, 2);
});

test('reconnect required (Google refuses the refresh with invalid_grant): authorization-required, the job kept, nothing appended', async () => {
  const { site } = await boundSite();
  await site.submit({ submissionId: 'sub-1', answers: { email: 'ada@example.test' } });
  await site.drain();
  site.clock.advanceMs(2 * 60 * 60_000);
  fake.behaviour.refreshError = 'invalid_grant';
  await site.drain();
  assert.deepEqual(ledger(site, 'sub-1'), [{ status: 'failed', attempts: 1, lastError: 'authorization-required' }]);
  assert.equal(appends().length, 0);
});

test('an account switch after planning: the frozen job is refused, never appended with the new account', async () => {
  const { site } = await boundSite();
  await site.submit({ submissionId: 'sub-1', answers: { email: 'ada@example.test' } });
  await site.drain();
  await site.switchAccount({ pluginId: PLUGIN, consent: consentAs('bob'), scopeSetIds: ['sheets'] });
  await site.drain();
  assert.deepEqual(ledger(site, 'sub-1'), [{ status: 'failed', attempts: 1, lastError: 'authorization-required' }]);
  assert.equal(appends().length, 0);
});
