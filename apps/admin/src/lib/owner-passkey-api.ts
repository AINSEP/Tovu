import type { PasskeySettingsPort, PasskeySignInPort } from '@jini-ai/user-management/react';
import { requestOnce } from './api';

/** Explicit ceremonies are single-send requests; lost responses never trigger proof replay. */
const post = <T,>(action: string, input: unknown): Promise<T> => requestOnce<T>({
  path: `/auth/passkeys/${action}`, init: { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input), cache: 'no-store' },
});
export const ownerPasskeySettingsPort: PasskeySettingsPort = {
  status: () => requestOnce({ path: '/auth/passkeys', init: { cache: 'no-store' } }),
  enroll: input => post('enroll', input), confirm: input => post('confirm', input), remove: input => post('remove', input),
};
export const ownerPasskeySignInPort: PasskeySignInPort = {
  begin: input => post('begin-login', input), complete: async input => { await post('login', input); },
};
