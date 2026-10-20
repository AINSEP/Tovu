/**
 * @file Shared plumbing of the Sheets admin tools (tabs, sort, filters, format, named and protected
 * ranges, developer metadata, raw batch update, CSV export, open existing): the Sheets URLs, the
 * `spreadsheets.get` and `spreadsheets.batchUpdate` calls, and the tool-output bound.
 *
 * Exists so the safety rules these tools share live once:
 * - a spreadsheet id is checked against Google's id alphabet and percent-encoded before it becomes
 *   a URL path segment, so tool input can never steer a request to another path or host;
 * - every batch, raw or built by a named tool, passes the reviewed request-kind inventory first;
 * - a tool answer larger than {@link MAX_OUTPUT_BYTES} is refused, never silently cut.
 * Requests go through the plugin's one Google client (`http.mjs`), which reads the token right
 * before each attempt and owns retries. Phase B may fold this into the Sheets client.
 */
import { createGoogleClient, pathSegment } from './http.mjs';
import { GoogleWorkspaceError } from './request-policy.mjs';
import { checkRequests } from './sheets-admin-request-kinds.mjs';
import { SHEETS_API } from './sheets-client.mjs';

/** Largest JSON answer a tool returns to chat. */
export const MAX_OUTPUT_BYTES = 64 * 1024;

/** Google file ids are URL-safe base64 characters; anything else is refused before use. */
const FILE_ID = /^[A-Za-z0-9_-]{10,128}$/;

/**
 * The id, checked: refused unless it is a plausible Google file id.
 * @throws {GoogleWorkspaceError} `invalid-input`.
 * @complexity O(1).
 */
export function checkedFileId(required, _optional = {}) {
  if (typeof required.id !== 'string' || !FILE_ID.test(required.id)) throw new GoogleWorkspaceError({ code: 'invalid-input' }, { detail: 'spreadsheetId' });
  return required.id;
}

/** `…/spreadsheets/<id><suffix>`; the id is checked and encoded. @complexity O(1). */
export function spreadsheetUrl(required, _optional = {}) {
  return `${SHEETS_API}/${pathSegment({ value: checkedFileId({ id: required.spreadsheetId }) })}${required.suffix ?? ''}`;
}

/** The plugin's Google client over one call's host capabilities. @complexity O(1). */
export function clientFor(required, _optional = {}) {
  const { capabilities } = required;
  return createGoogleClient({ http: capabilities.http, connections: capabilities.connections }, { limiter: capabilities.limiter });
}

const signalOption = (signal) => (signal ? { signal } : {});

/**
 * `spreadsheets.get` with a field mask (grid data is never requested).
 * @param {{ client: object, connectionRef: string, spreadsheetId: string, fields: string }} required
 * @param {{ signal?: AbortSignal }} [optional]
 * @complexity O(1) requests.
 */
export function getSpreadsheet(required, optional = {}) {
  return required.client.request({
    connectionRef: required.connectionRef, url: spreadsheetUrl({ spreadsheetId: required.spreadsheetId }), kind: 'read', query: { fields: required.fields },
  }, signalOption(optional.signal));
}

/**
 * `spreadsheets.batchUpdate` after the inventory check; a batch holding any non-replayable kind is a
 * `write`, so an unknown outcome is reported as uncertain and never replayed.
 * @param {{ client: object, connectionRef: string, spreadsheetId: string, requests: readonly object[] }} required
 * @param {{ signal?: AbortSignal }} [optional]
 * @returns {Promise<{ replies: unknown[] }>}
 * @complexity O(n) requests to check, one HTTP request.
 */
export async function runBatchUpdate(required, optional = {}) {
  const { kind } = checkRequests({ requests: required.requests });
  const body = await required.client.request({
    connectionRef: required.connectionRef, url: spreadsheetUrl({ spreadsheetId: required.spreadsheetId, suffix: ':batchUpdate' }),
    method: 'POST', kind, body: { requests: required.requests },
  }, signalOption(optional.signal));
  return { replies: Array.isArray(body?.replies) ? body.replies : [] };
}

/**
 * The value, unless its JSON is larger than the tool-output bound.
 * @throws {GoogleWorkspaceError} `limit-exceeded`.
 * @complexity O(serialized size).
 */
export function boundedOutput(required, _optional = {}) {
  if (Buffer.byteLength(JSON.stringify(required.value)) > MAX_OUTPUT_BYTES) throw new GoogleWorkspaceError({ code: 'limit-exceeded' }, { detail: 'answer over 64 KiB; narrow it to one tab or fewer items' });
  return required.value;
}

/** The first line of every disclosure. @complexity O(1). */
export function spreadsheetLine(required, _optional = {}) {
  return `spreadsheet ${checkedFileId({ id: required.spreadsheetId })}`;
}

/**
 * The tabs of a `sheets(properties(...),<part>)` answer, optionally only one tab.
 * @complexity O(t) tabs.
 */
export function tabsOf(required, _optional = {}) {
  const sheets = Array.isArray(required.body?.sheets) ? required.body.sheets : [];
  return required.sheetId === undefined ? sheets : sheets.filter((sheet) => sheet?.properties?.sheetId === required.sheetId);
}
