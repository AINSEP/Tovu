import type { TotpSettingsPort } from '@jini-ai/user-management/react';
import { requestOnce } from './api';

/** Thin site transport: single-send writes never replay a proof after a lost response.
 * @complexity O(1), one request per explicit action; status loads once, no poll.
 */
const post = <T,>({ action, input }: { action: string; input: unknown }, _options = {}): Promise<T> => requestOnce<T>({
  path: `/auth/mfa/${action}`, init: { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input), cache: 'no-store' },
});

export const ownerMfaPort: TotpSettingsPort = {
  status: () => requestOnce({ path: '/auth/mfa', init: { cache: 'no-store' } }),
  enroll: input => post({ action: 'enroll', input }),
  confirm: input => post({ action: 'confirm', input }),
  remove: input => post({ action: 'remove', input }),
};
