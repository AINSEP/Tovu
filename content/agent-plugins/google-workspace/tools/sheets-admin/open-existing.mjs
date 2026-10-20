/**
 * @file Tool `sheets_open_existing` (`p_google_workspace__sheets_open_existing`): work with a spreadsheet the
 * person already has. Without a `spreadsheetId` it answers `waiting` and points to the file picker;
 * with one (from a completed pick) it verifies, with the connected account, that Tovu can open the
 * file and that it is a spreadsheet, and returns its id, title and link. Read only.
 *
 * Exists because under `drive.file` a pasted link grants nothing: only Google's picker (or Tovu
 * creating the file) does. Verifying through the API is the only honest answer to "can Tovu open
 * this?": an ungranted file is `file-not-granted` with the next action "choose it with the picker".
 * Chat receives resource metadata only; the link is built from the verified id, not taken from Google.
 */
import { DRIVE_FILES_URL } from '../../lib/drive-files.mjs';
import { pathSegment } from '../../lib/http.mjs';
import { SPREADSHEET_MIME_TYPE } from '../../lib/picker-selection.mjs';
import { checkedFileId, clientFor } from '../../lib/sheets-admin-common.mjs';
import { GoogleWorkspaceError } from '../../lib/request-policy.mjs';

const WAITING = Object.freeze({
  status: 'waiting',
  nextAction: 'open-picker',
  message: 'Ask the person to choose the spreadsheet with Google\'s file picker in the Google Workspace plugin (or offer to create a new one). A pasted link is not enough. Then call this again with the chosen spreadsheetId.',
});

export default {
  async invoke({ input, capabilities, signal }) {
    if (input.spreadsheetId === undefined) return WAITING;
    const id = checkedFileId({ id: input.spreadsheetId });
    const file = await clientFor({ capabilities }).request({
      connectionRef: input.connectionRef, url: `${DRIVE_FILES_URL}/${pathSegment({ value: id })}`, kind: 'read', query: { fields: 'id,name,mimeType,trashed' },
    }, signal ? { signal } : {});
    if (file?.id !== id || file.trashed === true) throw new GoogleWorkspaceError({ code: 'file-not-granted' });
    if (file.mimeType !== SPREADSHEET_MIME_TYPE) throw new GoogleWorkspaceError({ code: 'not-a-spreadsheet' });
    return { status: 'selected', resource: { spreadsheetId: id, title: typeof file.name === 'string' ? file.name : '', url: `https://docs.google.com/spreadsheets/d/${id}/edit` } };
  },
};
