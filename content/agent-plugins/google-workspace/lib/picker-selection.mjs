/**
 * @file Server-side checks for a Google Picker selection, shared by the hosted JS Picker surface and
 * the desktop native Picker (system browser, `picked_file_ids` callback field).
 *
 * Exists because a selection is only a claim until the server re-checks it: the browser (or the
 * callback) names a file id, and under `drive.file` that id is useful only if the Picker really
 * granted it to THIS account. So a selection is saved only after: the id is a plain Drive id (it is
 * placed in URL paths), the connection is still the account the Picker was opened for, Drive says
 * the file is a Google Sheets spreadsheet, and the Sheets API actually opens it. A pasted URL never
 * reaches here as a grant. Results are file metadata only, never contents or tokens.
 */
import { DRIVE_FILES_URL, readAccount } from './drive-files.mjs';
import { pathSegment } from './http.mjs';
import { GoogleWorkspaceError } from './request-policy.mjs';
import { SHEETS_API } from './sheets-client.mjs';

export const SPREADSHEET_MIME_TYPE = 'application/vnd.google-apps.spreadsheet';

/**
 * Extra authorization parameters for "Choose spreadsheet" on desktop: Google's native Picker in the
 * system browser, one file, spreadsheets only. The connection descriptor allowlists both names
 * (`startParams`); `prompt=consent` already comes from its installed-app parameters.
 */
export const DESKTOP_PICKER_START_PARAMS = Object.freeze({ trigger_onepick: 'true', mimetypes: SPREADSHEET_MIME_TYPE });

// Drive ids are URL-safe base64-like strings; anything else could reshape the request path.
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/** The id when it is a plain Drive file id; `invalid-selection` otherwise (the value is never echoed). @complexity O(n). */
function assertFileId(value) {
  if (typeof value !== 'string' || !DRIVE_FILE_ID.test(value)) throw new GoogleWorkspaceError({ code: 'invalid-selection' });
  return value;
}

/**
 * The one file id a desktop native Picker callback carried, or null when the person cancelled.
 * `picked_file_ids` is comma-separated; "Choose spreadsheet" asks for one file, so more than one is
 * refused rather than guessing which to keep. Call only after the sign-in's state and code checked out.
 * @param {{ value: string | undefined }} required The raw `picked_file_ids` callback field.
 * @returns {string | null}
 * @throws {GoogleWorkspaceError} `invalid-selection`.
 * @complexity O(n) in the field length (the connection descriptor caps it at 4096).
 */
export function parsePickedFileIds(required, _optional = {}) {
  const { value } = required;
  if (value === undefined || value === '') return null;
  const ids = value.split(',');
  if (ids.length !== 1) throw new GoogleWorkspaceError({ code: 'invalid-selection' });
  return assertFileId(ids[0]);
}

/** Drive metadata for the picked file; refuses anything but a spreadsheet. @complexity O(1): one request. */
async function readSpreadsheetFile(client, connectionRef, fileId, optional) {
  const file = await client.request({
    connectionRef, url: `${DRIVE_FILES_URL}/${pathSegment({ value: fileId })}`, kind: 'read',
    query: { fields: 'id,name,mimeType', supportsAllDrives: 'true' },
  }, optional);
  if (file?.id !== fileId) throw new GoogleWorkspaceError({ code: 'unexpected-response' });
  if (file.mimeType !== SPREADSHEET_MIME_TYPE) throw new GoogleWorkspaceError({ code: 'not-a-spreadsheet' });
  return file;
}

/** Opens the spreadsheet through the Sheets API itself: Drive metadata alone does not prove access. @complexity O(1). */
async function openSpreadsheet(client, connectionRef, fileId, optional) {
  const sheet = await client.request({
    connectionRef, url: `${SHEETS_API}/${pathSegment({ value: fileId })}`, kind: 'read',
    query: { fields: 'spreadsheetId,properties.title' },
  }, optional);
  if (sheet?.spreadsheetId !== fileId) throw new GoogleWorkspaceError({ code: 'unexpected-response' });
  return sheet;
}

/**
 * Verifies a Picker selection before anything saves it.
 * @param {{ client: { request(input: object, options?: object): Promise<unknown> }, connectionRef: string, fileId: unknown, expectedAccountId: string }} required
 *   `expectedAccountId` is the account the Picker session was opened for (hosted: the bootstrap's;
 *   desktop: the connection's account when "Choose spreadsheet" started).
 * @param {{ signal?: AbortSignal }} [optional]
 * @returns {Promise<{ spreadsheetId: string, title: string, accountId: string, url: string }>}
 * @throws {GoogleWorkspaceError} `invalid-selection`, `account-changed`, `not-a-spreadsheet`,
 *   `file-not-granted` / `access-denied` (from the client), `unexpected-response`.
 * @complexity O(1): three requests (account, Drive metadata, Sheets).
 */
export async function verifySelectedSpreadsheet(required, optional = {}) {
  const { client, connectionRef, expectedAccountId } = required;
  const fileId = assertFileId(required.fileId);
  const account = await readAccount({ client, connectionRef }, optional);
  if (account.accountId !== expectedAccountId) throw new GoogleWorkspaceError({ code: 'account-changed' });
  const file = await readSpreadsheetFile(client, connectionRef, fileId, optional);
  const sheet = await openSpreadsheet(client, connectionRef, fileId, optional);
  const title = sheet.properties?.title ?? file.name ?? 'Untitled spreadsheet';
  return { spreadsheetId: fileId, title, accountId: account.accountId, url: `https://docs.google.com/spreadsheets/d/${fileId}/edit` };
}
