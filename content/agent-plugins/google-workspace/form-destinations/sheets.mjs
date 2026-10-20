/**
 * @file Form destination `google-sheets` (push only): appends each accepted submission as a row of
 * the bound spreadsheet. Declared now so the plugin's contribution set is complete; until the
 * Sheets adapter (mapping + dedupe) lands, every delivery refuses as retryable so the forms ledger
 * keeps the submission and retries later. It never drops one.
 */
import { GoogleWorkspaceError } from '../lib/request-policy.mjs';

export default {
  async deliver() {
    throw new GoogleWorkspaceError({ code: 'destination-unavailable' });
  },
};
