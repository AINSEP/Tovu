/**
 * @file Tool `sheets_batch_update` (`p_google_workspace__sheets_batch_update`): send up to 100 reviewed Sheets
 * request objects in one atomic `spreadsheets.batchUpdate`. Always destructive: the card lists every
 * request kind in the batch with its count and effect.
 *
 * Exists for broad coverage without a wrapper per request family (dimensions, merges, validation,
 * conditional formats, charts, banding, groups, pivots, slicers, tables, metadata, protection). Only
 * kinds in `lib/sheets-admin-request-kinds.mjs` pass; anything else fails closed before any request.
 */
import { clientFor, MAX_OUTPUT_BYTES, runBatchUpdate, spreadsheetLine } from '../../lib/sheets-admin-common.mjs';
import { checkRequests, describeRequests } from '../../lib/sheets-admin-request-kinds.mjs';

export default {
  async invoke({ input, capabilities, signal }) {
    const { kinds } = checkRequests({ requests: input.requests });
    const { replies } = await runBatchUpdate({ client: clientFor({ capabilities }), connectionRef: input.connectionRef, spreadsheetId: input.spreadsheetId, requests: input.requests }, { signal });
    const summary = { applied: input.requests.length, kinds: Object.fromEntries([...kinds].map(([kind, { count }]) => [kind, count])) };
    // The batch has already been applied: an oversized reply list is dropped, not turned into an error.
    const fits = Buffer.byteLength(JSON.stringify(replies)) <= MAX_OUTPUT_BYTES - 4096;
    return fits ? { summary, replies } : { summary, repliesOmitted: 'larger than 64 KiB' };
  },
  describeAffectedResources({ input }) {
    return [spreadsheetLine(input), ...describeRequests({ requests: input.requests })];
  },
};
