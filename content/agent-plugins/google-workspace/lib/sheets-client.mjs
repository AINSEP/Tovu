/**
 * @file The shared Sheets request helper of the Google Workspace plugin: every Sheets tool builds its
 * endpoint, encodes ids and ranges, applies the RAW input default and enforces the §D bounds here,
 * then sends through the one Google client (`http.mjs`), which owns tokens, quotas, retries and safe
 * errors.
 *
 * Exists so the rules that keep a call inside what the person asked for live in one place:
 * - a spreadsheet id or range is ONE encoded path segment (`.`/`..` refused), so caller text can
 *   never change which endpoint is called;
 * - values are written `RAW` unless the caller explicitly asks for `USER_ENTERED`, so text a
 *   visitor typed never becomes a formula;
 * - reads return at most 500 rows, 5,000 cells and 64 KiB, with an explicit continuation range
 *   instead of a silent partial; mutation payloads stay under 1 MiB.
 */
import { createGoogleClient, pathSegment } from './http.mjs';
import { GoogleWorkspaceError } from './request-policy.mjs';

export const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
export const DEFAULT_VALUE_INPUT_OPTION = 'RAW';

/** §D starting bounds. Batch reads share ONE output budget across all their ranges. */
export const SHEETS_LIMITS = Object.freeze({
  maxRows: 500, maxCells: 5_000, maxOutputBytes: 64 * 1024, maxRanges: 20,
  maxMutationEntries: 100, maxPayloadBytes: 1024 * 1024,
  // find reads more than it returns: it scans up to this many cells and returns at most maxMatches.
  maxScannedCells: 50_000, maxMatches: 100, maxExcerptChars: 120,
});

/** Default spreadsheet metadata mask: no grid data, only what chat needs to name tabs. */
const SHEET_PROPERTIES = 'properties(sheetId,title,index,sheetType,gridProperties(rowCount,columnCount,frozenRowCount,frozenColumnCount))';
const SPREADSHEET_PREFIX = 'spreadsheetId,spreadsheetUrl,properties(title,locale,timeZone)';
export const SPREADSHEET_FIELDS = `${SPREADSHEET_PREFIX},sheets(${SHEET_PROPERTIES})`;
const GRID_DATA_FIELDS = `${SPREADSHEET_PREFIX},sheets(${SHEET_PROPERTIES},data(startRow,startColumn,rowData(values(formattedValue))))`;

const byteLength = (value) => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');

/**
 * `<SHEETS_API>/<spreadsheetId>[/<segment>…][<method>]`. `method` (`:append`, `:batchUpdate`, …)
 * is always a constant from plugin code, never caller text.
 * @param {{ spreadsheetId: string }} required
 * @param {{ segments?: readonly string[], method?: string }} [optional]
 * @complexity O(n) characters.
 */
export function sheetsUrl(required, optional = {}) {
  const segments = [required.spreadsheetId, ...(optional.segments ?? [])].map((value) => pathSegment({ value }));
  return `${SHEETS_API}/${segments.join('/')}${optional.method ?? ''}`;
}

/**
 * Sends one Sheets request for a tool call through the shared Google client.
 * @param {{ call: { input: { connectionRef: string }, capabilities: { http: object, connections: object, limiter: object }, signal?: AbortSignal }, request: { url: string, method?: string, query?: object, body?: unknown, kind: 'read' | 'idempotent-write' | 'write' } }} required
 *   `call` is the tool's `invoke` argument as received.
 * @returns {Promise<any>} Google's parsed JSON body.
 * @throws {GoogleWorkspaceError} Every failure, already mapped to a safe code.
 * @complexity O(attempts) (see `createGoogleClient`).
 */
export function sendSheetsRequest(required, _optional = {}) {
  const { input, capabilities, signal } = required.call;
  return googleClientFor({ capabilities }).request({ connectionRef: input.connectionRef, ...required.request }, signal ? { signal } : {});
}

/** The shared Google client over one call's host capabilities. @complexity O(1). */
export function googleClientFor(required, _optional = {}) {
  const { capabilities } = required;
  return createGoogleClient({ http: capabilities.http, connections: capabilities.connections }, { limiter: capabilities.limiter });
}

/** The spreadsheet field mask: the caller's, else the default (plus cell values when grid data is asked for). @complexity O(1). */
export function spreadsheetFields(required, _optional = {}) {
  if (required.fields !== undefined) return required.fields;
  return required.includeGridData ? GRID_DATA_FIELDS : SPREADSHEET_FIELDS;
}

const MAX_RESOURCE_LINES = 50;
const MAX_RESOURCE_CHARS = 300;

/**
 * Lines for the confirmation card, inside the projection's bounds (50 lines of 300 characters):
 * a long line is shortened and extra lines are summarized as a count, so nothing is hidden silently.
 * @complexity O(lines).
 */
export function resourceLines(required, _optional = {}) {
  const fit = (line) => (line.length > MAX_RESOURCE_CHARS ? `${line.slice(0, MAX_RESOURCE_CHARS - 1)}…` : line);
  const { lines } = required;
  if (lines.length <= MAX_RESOURCE_LINES) return lines.map(fit);
  return [...lines.slice(0, MAX_RESOURCE_LINES - 1).map(fit), `… and ${lines.length - MAX_RESOURCE_LINES + 1} more`];
}

/** The value input option to send: `RAW` unless the caller explicitly chose `USER_ENTERED`. @complexity O(1). */
export function valueInputOption(required, _optional = {}) {
  return required.option === 'USER_ENTERED' ? 'USER_ENTERED' : DEFAULT_VALUE_INPUT_OPTION;
}

/** Read options every values read sends: rows-major, plus the caller's render choices. @complexity O(1). */
export function readOptions(required, _optional = {}) {
  const { valueRenderOption, dateTimeRenderOption } = required.input;
  return { majorDimension: 'ROWS', ...(valueRenderOption ? { valueRenderOption } : {}), ...(dateTimeRenderOption ? { dateTimeRenderOption } : {}) };
}

/** Total cells in rows of values. @complexity O(rows). */
export function cellCount(required, _optional = {}) {
  return required.values.reduce((total, row) => total + row.length, 0);
}

/**
 * Refuses a mutation whose serialized body exceeds the payload bound, before anything is sent.
 * @throws {GoogleWorkspaceError} `limit-exceeded`.
 * @complexity O(n) serialized size.
 */
export function assertPayloadWithin(required, _optional = {}) {
  if (byteLength(required.value) > SHEETS_LIMITS.maxPayloadBytes) throw new GoogleWorkspaceError({ code: 'limit-exceeded' });
  return required.value;
}

/**
 * Returns a result only when it fits the tool-output bound; a larger result is an error, never a
 * silently cut one (used where no range continuation exists: metadata and data-filter reads).
 * @throws {GoogleWorkspaceError} `limit-exceeded`.
 * @complexity O(n) serialized size.
 */
export function assertOutputWithin(required, _optional = {}) {
  if (byteLength(required.value) > SHEETS_LIMITS.maxOutputBytes) throw new GoogleWorkspaceError({ code: 'limit-exceeded' });
  return required.value;
}

const A1_RANGE = /^(?<sheet>.+)!(?<startColumn>[A-Z]+)(?<startRow>\d+)(?::(?<endColumn>[A-Z]+)(?<endRow>\d+))?$/;

/**
 * Google's normalized A1 range (`'Tab name'!B2:D90`) as its parts; undefined when it is not in that
 * shape (Google normalizes every values range it returns to it).
 * @complexity O(n) characters.
 */
export function parseA1Range(required, _optional = {}) {
  const groups = A1_RANGE.exec(required.range ?? '')?.groups;
  if (!groups) return undefined;
  return { sheet: groups.sheet, startColumn: groups.startColumn, startRow: Number(groups.startRow), endColumn: groups.endColumn, endRow: groups.endRow === undefined ? undefined : Number(groups.endRow) };
}

/** `A` → 0, `AA` → 26. @complexity O(letters). */
export function columnIndex(required, _optional = {}) {
  return [...required.column].reduce((index, letter) => index * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

/** 0 → `A`, 26 → `AA`. @complexity O(letters). */
export function columnName(required, _optional = {}) {
  let name = '';
  for (let n = required.index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
}

/**
 * The range that continues `range` after its first `rows` rows, same columns.
 * @throws {GoogleWorkspaceError} `limit-exceeded` when Google's range cannot be continued, so the
 *   caller errors instead of returning an undisclosed partial read.
 * @complexity O(n) characters.
 */
export function continuationRange(required, _optional = {}) {
  const parts = parseA1Range({ range: required.range });
  if (!parts) throw new GoogleWorkspaceError({ code: 'limit-exceeded' });
  const start = `${parts.sheet}!${parts.startColumn}${parts.startRow + required.rows}`;
  return parts.endRow === undefined ? start : `${start}:${parts.endColumn}${parts.endRow}`;
}

/** Whether one more row fits the shared output budget. @complexity O(1). */
function rowFits(totals, row, rowBytes) {
  return totals.rows < SHEETS_LIMITS.maxRows && totals.cells + row.length <= SHEETS_LIMITS.maxCells && totals.bytes + rowBytes <= SHEETS_LIMITS.maxOutputBytes;
}

/**
 * Cuts value ranges to ONE shared output budget (rows, cells, bytes) in order. A cut range gets
 * `continuation`: the exact range to read next.
 * @param {{ valueRanges: readonly { range: string, values?: unknown[][] }[] }} required
 * @returns {{ range: string, values: unknown[][], continuation?: string }[]}
 * @throws {GoogleWorkspaceError} `limit-exceeded` when not even the first row fits (no progress possible).
 * @complexity O(cells).
 */
export function boundValueRanges(required, _optional = {}) {
  const totals = { rows: 0, cells: 0, bytes: 0 };
  const bounded = required.valueRanges.map((valueRange) => {
    const values = valueRange.values ?? [];
    let kept = 0;
    for (const row of values) {
      const rowBytes = byteLength(row);
      if (!rowFits(totals, row, rowBytes)) break;
      Object.assign(totals, { rows: totals.rows + 1, cells: totals.cells + row.length, bytes: totals.bytes + rowBytes });
      kept += 1;
    }
    if (kept === values.length) return { range: valueRange.range, values };
    return { range: valueRange.range, values: values.slice(0, kept), continuation: continuationRange({ range: valueRange.range, rows: kept }) };
  });
  if (totals.rows === 0 && bounded.some((entry) => entry.continuation)) throw new GoogleWorkspaceError({ code: 'limit-exceeded' });
  return bounded;
}
