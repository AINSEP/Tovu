/**
 * @file Tool `sheets_basic_filter` (`p_google_workspace__sheets_basic_filter`): read, set or clear the basic filter
 * of one tab. A filter only hides rows, so the tool is a `write` (confirmed, never destructive).
 *
 * Exists as a named wrapper over the reviewed `setBasicFilter` and `clearBasicFilter` request kinds;
 * `get` reads the tab's filter with a field mask, never the grid data.
 */
import { assertOutputWithin, getSpreadsheet, resourceLines, runBatchUpdate, sheetsClientFor, spreadsheetLine, tabsOf } from '../../lib/sheets-client.mjs';
import { GoogleWorkspaceError } from '../../lib/request-policy.mjs';
import { gridRangeLabel } from '../../lib/sheets-a1.mjs';

/** The tab's current filter, or null. @complexity O(t) tabs. */
async function readFilter(client, input, signal) {
  const body = await getSpreadsheet({ client, connectionRef: input.connectionRef, spreadsheetId: input.spreadsheetId, fields: 'sheets(properties(sheetId),basicFilter)' }, { signal });
  const [tab] = tabsOf({ body, sheetId: input.sheetId });
  if (!tab) throw new GoogleWorkspaceError({ code: 'invalid-input' }, { detail: `no tab with sheetId ${input.sheetId}` });
  return assertOutputWithin({ value: { action: 'get', sheetId: input.sheetId, filter: tab.basicFilter ?? null } });
}

/** The set/clear request. @complexity O(1). */
function changeRequest(input) {
  if (input.action === 'clear') return { clearBasicFilter: { sheetId: input.sheetId } };
  // No sortSpecs: a basic-filter sort physically reorders rows (destructive), so sorting stays in `sheets_sort`.
  const filter = { range: input.range, ...(input.filterSpecs ? { filterSpecs: input.filterSpecs } : {}) };
  return { setBasicFilter: { filter } };
}

export default {
  async invoke({ input, capabilities, signal }) {
    const client = sheetsClientFor({ capabilities });
    if (input.action === 'get') return readFilter(client, input, signal);
    await runBatchUpdate({ client, connectionRef: input.connectionRef, spreadsheetId: input.spreadsheetId, requests: [changeRequest(input)] }, { signal });
    return { action: input.action, sheetId: input.sheetId ?? input.range.sheetId };
  },
  describeAffectedResources({ input }) {
    const where = input.action === 'set' ? gridRangeLabel({ range: input.range }) : `tab ${input.sheetId}`;
    const what = { get: 'read the basic filter of (no change)', set: 'replace the basic filter on', clear: 'remove the basic filter from' }[input.action];
    return resourceLines({ lines: [spreadsheetLine(input), `${what} ${where}`] });
  },
};
