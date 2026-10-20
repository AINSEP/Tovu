/**
 * @file Tool `sheets_named_ranges` (`p_google_workspace__sheets_named_ranges`): list, add, update or delete named
 * ranges. Destructive because deleting or re-pointing a named range breaks formulas that use it.
 *
 * Exists as a named wrapper over the reviewed named-range request kinds.
 */
import { boundedOutput, clientFor, getSpreadsheet, runBatchUpdate, spreadsheetLine } from '../../lib/sheets-admin-common.mjs';
import { gridRangeLabel } from '../../lib/sheets-admin-ranges.mjs';

/** The fields an update changes: only the ones given. @complexity O(1). */
const updatedFields = (input) => ['name', 'range'].filter((field) => input[field] !== undefined).join(',');

/** action → the one batch request it sends. */
const REQUESTS = {
  add: (input) => ({ addNamedRange: { namedRange: { name: input.name, range: input.range } } }),
  update: (input) => ({ updateNamedRange: { namedRange: { namedRangeId: input.namedRangeId, ...(input.name === undefined ? {} : { name: input.name }), ...(input.range === undefined ? {} : { range: input.range }) }, fields: updatedFields(input) } }),
  delete: (input) => ({ deleteNamedRange: { namedRangeId: input.namedRangeId } }),
};

export default {
  async invoke({ input, capabilities, signal }) {
    const client = clientFor({ capabilities });
    if (input.action === 'list') {
      const body = await getSpreadsheet({ client, connectionRef: input.connectionRef, spreadsheetId: input.spreadsheetId, fields: 'namedRanges' }, { signal });
      return boundedOutput({ value: { action: 'list', namedRanges: body?.namedRanges ?? [] } });
    }
    const { replies } = await runBatchUpdate({ client, connectionRef: input.connectionRef, spreadsheetId: input.spreadsheetId, requests: [REQUESTS[input.action](input)] }, { signal });
    const added = replies[0]?.addNamedRange?.namedRange;
    return { action: input.action, ...(added ? { namedRange: added } : { namedRangeId: input.namedRangeId }) };
  },
  describeAffectedResources({ input }) {
    const where = input.range ? ` at ${gridRangeLabel({ range: input.range })}` : '';
    const lines = {
      list: 'list named ranges (no change)',
      add: `add named range "${input.name}"${where}`,
      update: `change named range ${input.namedRangeId}${input.name === undefined ? '' : ` to "${input.name}"`}${where} (formulas using it follow the change)`,
      delete: `delete named range ${input.namedRangeId} (formulas using it stop working)`,
    };
    return [spreadsheetLine(input), lines[input.action]];
  },
};
