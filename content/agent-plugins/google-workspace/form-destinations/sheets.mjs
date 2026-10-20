/**
 * @file Form destination `google-sheets` (push only): appends each accepted form submission as one
 * row of the tab its binding names, through the same Google client the Sheets tools use.
 *
 * Exists to turn one frozen delivery job (form, submission, binding config, all fixed when the
 * submission was planned) into at most one spreadsheet row, and to report the outcome in the forms
 * delivery contract's vocabulary. Per attempt it: refuses while the Sheets product is off; finds
 * the tab by its numeric sheet id (renames are safe); matches columns by the frozen mapping
 * (`mapping.mjs`); scans the `_tovu_submission_id` column for this submission (`dedupe.mjs`) and
 * stops as delivered when the row is already there; adds headers for new fields; appends the row
 * with RAW values. An append whose answer was lost is never replayed: the column is scanned again,
 * and when the row is not found the job reports `outcome-unknown`, so the next attempt scans before
 * appending. Delivery is at-least-once with best-effort dedupe; nothing here claims exactly-once.
 *
 * Binding config (non-secret, frozen per job):
 * `{ spreadsheetId: string, tabs: { [formSlug]: { sheetId: number, columns?: { field, header }[] } } }`.
 * `columns` records which header each already-written field uses.
 */
import { googleClientFor, parseA1Range, sheetsUrl, columnName } from '../lib/sheets-client.mjs';
import { GoogleWorkspaceError } from '../lib/request-policy.mjs';
import { findSubmissionRows } from './dedupe.mjs';
import { DeliveryRefusal, failureResult, resultForError } from './delivery-result.mjs';
import { buildMapping, buildRow, planColumns } from './mapping.mjs';

/** Per-request cap passed to the host kit; a request that runs past it counts as a lost answer. */
export const DELIVERY_REQUEST_TIMEOUT_MS = 15_000;
const TAB_FIELDS = 'sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))';

const configurationInvalid = () => new DeliveryRefusal({ code: 'configuration-invalid', retryable: false });

const isColumn = (column) => typeof column?.field === 'string' && column.field !== '' && typeof column.header === 'string' && column.header.trim() !== '';

/**
 * The spreadsheet and tab this form's rows go to, from the frozen binding config.
 * @throws {DeliveryRefusal} `configuration-invalid` when the config does not name them properly.
 * @complexity O(columns).
 */
function targetFor({ binding, form }) {
  const { spreadsheetId, tabs } = binding.config ?? {};
  const tab = tabs && Object.hasOwn(tabs, form.slug) ? tabs[form.slug] : undefined;
  if (typeof spreadsheetId !== 'string' || !isTabConfig(tab)) throw configurationInvalid();
  return { spreadsheetId, tab };
}

/** A tab entry: a numeric sheet id, and (when present) well-formed recorded columns. @complexity O(columns). */
function isTabConfig(tab) {
  if (!Number.isInteger(tab?.sheetId) || tab.sheetId < 0) return false;
  return tab.columns === undefined || (Array.isArray(tab.columns) && tab.columns.every(isColumn));
}

/** `'Tab title'!<cells>`: the title quoted, its quotes doubled, so a title cannot change the range. @complexity O(n). */
const a1 = (title, cells) => `'${title.replaceAll("'", "''")}'!${cells}`;

/**
 * The Sheets requests one delivery makes, over the shared Google client.
 * @complexity O(1) to build; each call is one request (plus the client's retries).
 */
function sheetsRequests({ client, connectionRef, spreadsheetId }) {
  const send = (request) => client.request({ connectionRef, ...request });
  const valuesUrl = (range, method) => sheetsUrl({ spreadsheetId }, { segments: ['values', range], ...(method ? { method } : {}) });
  return {
    async tab(sheetId) {
      const body = await send({ kind: 'read', url: sheetsUrl({ spreadsheetId }), query: { fields: TAB_FIELDS } });
      const properties = (body?.sheets ?? []).map((sheet) => sheet?.properties).find((entry) => entry?.sheetId === sheetId);
      // The tab was deleted (or never existed): the person picks the tab again.
      if (typeof properties?.title !== 'string') throw configurationInvalid();
      const grid = properties.gridProperties ?? {};
      return { sheetId, title: properties.title, rowCount: grid.rowCount ?? 0, columnCount: grid.columnCount ?? 0 };
    },
    async rows(range) {
      return (await send({ kind: 'read', url: valuesUrl(range), query: { majorDimension: 'ROWS' } }))?.values ?? [];
    },
    async addColumns(sheetId, length) {
      await send({ kind: 'write', method: 'POST', url: sheetsUrl({ spreadsheetId }, { method: ':batchUpdate' }), body: { requests: [{ appendDimension: { sheetId, dimension: 'COLUMNS', length } }] } });
    },
    async writeHeaders(range, headers) {
      await send({ kind: 'idempotent-write', method: 'PUT', url: valuesUrl(range), query: { valueInputOption: 'RAW' }, body: { range, majorDimension: 'ROWS', values: [headers] } });
    },
    async append(range, row) {
      const body = await send({ kind: 'write', method: 'POST', url: valuesUrl(range, ':append'), query: { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' }, body: { range, majorDimension: 'ROWS', values: [row] } });
      return body?.updates?.updatedRange;
    },
  };
}

/** The rows of `tab` holding the submission id, in the id column at `idColumn`. @complexity see `findSubmissionRows`. */
function scanFor(requests, tab, idColumn, submissionId) {
  const column = columnName({ index: idColumn });
  return findSubmissionRows({ rowCount: tab.rowCount, submissionId, readColumn: ({ from, to }) => requests.rows(a1(tab.title, `${column}${from}:${column}${to}`)) });
}

/** Success, naming where the row is (sheet id and row numbers only: no titles, no values). @complexity O(rows). */
function delivered(sheetId, rows) {
  if (rows.length === 0) return { ok: true, reference: `sheet ${sheetId}` };
  return { ok: true, reference: `sheet ${sheetId} ${rows.length === 1 ? 'row' : 'rows'} ${rows.join(', ')}` };
}

/** Grows the grid and writes the new headers before the row that needs them. @complexity O(new headers). */
async function ensureHeaders(requests, tab, layout) {
  if (layout.newHeaders.length === 0) return;
  if (layout.width > tab.columnCount) await requests.addColumns(tab.sheetId, layout.width - tab.columnCount);
  const first = layout.newHeaders[0].index;
  const range = a1(tab.title, `${columnName({ index: first })}1:${columnName({ index: first + layout.newHeaders.length - 1 })}1`);
  await requests.writeHeaders(range, layout.newHeaders.map((entry) => entry.header));
}

/**
 * After an append whose answer was lost: scan again (the tab may have grown). Found → delivered.
 * Not found, or the scan itself failed → `outcome-unknown`, retryable: the next attempt scans
 * before it appends, which also gives a late append time to land.
 * @complexity see `findSubmissionRows`.
 */
async function confirmUncertainAppend(requests, sheetId, idColumn, submissionId) {
  try {
    const rows = await scanFor(requests, await requests.tab(sheetId), idColumn, submissionId);
    if (rows.length > 0) return delivered(sheetId, rows);
  } catch {
    // A failed re-scan proves nothing either way; the outcome stays unknown.
  }
  return failureResult({ code: 'outcome-unknown', retryable: true, outcome: 'unknown' });
}

const isUncertain = (error) => error instanceof GoogleWorkspaceError && error.code === 'uncertain-outcome';

/** Appends the row once; a lost answer is re-checked, never replayed. @complexity O(1) requests plus a re-scan. */
async function appendOnce(requests, tab, layout, row, submissionId) {
  try {
    const updatedRange = await requests.append(a1(tab.title, 'A1'), row);
    const startRow = parseA1Range({ range: updatedRange })?.startRow;
    return delivered(tab.sheetId, startRow === undefined ? [] : [startRow]);
  } catch (error) {
    if (!isUncertain(error)) throw error;
    return confirmUncertainAppend(requests, tab.sheetId, layout.columns[0], submissionId);
  }
}

/** Off unless the host's reader says the Sheets product is on: an unwired reader never enables delivery. @complexity O(1). */
async function productEnabled(optional) {
  return typeof optional.productEnabled === 'function' && (await optional.productEnabled()) === true;
}

/** One delivery attempt; throws for every failure (mapped by the caller). @complexity O(rowCount / chunk) requests. */
async function deliverRow(required, optional) {
  // Retryable: turning Sheets off pauses deliveries, it does not fail them.
  if (!(await productEnabled(optional))) throw new DeliveryRefusal({ code: 'adapter-unavailable', retryable: true });
  const { spreadsheetId, tab: tabConfig } = targetFor(required);
  const connections = { getAccessToken: async () => required.credential.token };
  const client = googleClientFor({ capabilities: { http: { fetch: ({ url }, init) => required.kit.fetch(url, init, { timeoutMs: DELIVERY_REQUEST_TIMEOUT_MS }) }, connections, limiter: optional.limiter } });
  const requests = sheetsRequests({ client, connectionRef: required.binding.connectionRef, spreadsheetId });
  const tab = await requests.tab(tabConfig.sheetId);
  const mapping = buildMapping({ form: required.form, tab: tabConfig });
  const layout = planColumns({ mapping, headerRow: (await requests.rows(a1(tab.title, '1:1')))[0] ?? [] });
  const existing = await scanFor(requests, tab, layout.columns[0], required.submission.id);
  if (existing.length > 0) return delivered(tab.sheetId, existing);
  await ensureHeaders(requests, tab, layout);
  return appendOnce(requests, tab, layout, buildRow({ mapping, ...layout, submission: required.submission }), required.submission.id);
}

export default {
  /**
   * The forms delivery contract's `deliver`. Never throws: every failure is a contract result.
   * @param {{ kit: { fetch(url: string, init: RequestInit, options: { timeoutMs: number }): Promise<Response> }, credential: { token: string }, form: { slug: string, fields: readonly { name: string, label?: string }[] }, submission: { id: string, answers: Readonly<Record<string, unknown>>, submittedAt: string }, binding: { connectionRef: string, config: Readonly<Record<string, unknown>> }, idempotencyKey?: string }} required
   * @param {{ productEnabled?: () => boolean | Promise<boolean>, limiter?: { check(input: { key: string }): Promise<{ allowed: boolean, retryAfterSeconds?: number }> } }} [optional]
   *   Host ports the delivery contract does not carry yet (wired with the forms fan-out): the
   *   Sheets product flag (absent = off) and the plugin's quota limiter (the tools' budgets).
   * @returns {Promise<{ ok: true, reference?: string } | { ok: false, error: { code: string, retryable: boolean, retryAfterMs?: number, outcome?: 'not-applied' | 'unknown' } }>}
   */
  async deliver(required, optional = {}) {
    try {
      return await deliverRow(required, optional);
    } catch (error) {
      return resultForError({ error });
    }
  },
};
