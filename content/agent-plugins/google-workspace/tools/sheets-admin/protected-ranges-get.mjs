/**
 * @file Tool `sheets_protected_ranges_get` (`p_google_workspace__sheets_protected_ranges_get`): which ranges of a
 * spreadsheet are protected, by whom, and whether the connected account may edit them. Read only.
 *
 * Exists so chat can explain a refused edit before trying it. Protection changes go through
 * `batch_update` (destructive, confirmed) instead of a wrapper.
 */
import { boundedOutput, clientFor, getSpreadsheet, tabsOf } from '../../lib/sheets-admin-common.mjs';

const FIELDS = 'sheets(properties(sheetId,title),protectedRanges(protectedRangeId,range,namedRangeId,tableId,description,warningOnly,requestingUserCanEdit,unprotectedRanges,editors))';

export default {
  async invoke({ input, capabilities, signal }) {
    const body = await getSpreadsheet({ client: clientFor({ capabilities }), connectionRef: input.connectionRef, spreadsheetId: input.spreadsheetId, fields: FIELDS }, { signal });
    const tabs = tabsOf({ body, sheetId: input.sheetId }).map((sheet) => ({ sheetId: sheet.properties?.sheetId, title: sheet.properties?.title, protectedRanges: sheet.protectedRanges ?? [] }));
    return boundedOutput({ value: { tabs } });
  },
};
