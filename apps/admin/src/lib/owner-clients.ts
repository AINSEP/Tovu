import { createLocalOwnerSignIn } from '@jini-ai/user-management/react/auth/local-owner-signin';
import { createOwnerMfaPort } from '@jini-ai/user-management/react/auth/owner-mfa-api';
import { createOwnerPasskeyPorts } from '@jini-ai/user-management/react/auth/owner-passkey-api';
import { createOwnerRecoveryClient } from '@jini-ai/user-management/react/auth/owner-recovery-api';
import { readInitialSession } from '@jini-ai/user-management/session-bootstrap';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';

import { ApiError, describeApiError, requestOnce } from './admin-http/request';

/**
 * @file The host binding of Jini's owner clients: the one place they meet this site's transport.
 *
 * Each client is built once over the admin's single-send `requestOnce` (a lost response never
 * replays an MFA/passkey proof or a recovery rotation), the site's `ApiError` class (only its 401
 * `UNAUTHENTICATED` starts a local-owner bootstrap) and the product redaction options (K3: they
 * stay here). Screens import the bound ports from this module; types come from Jini.
 */
export const ownerMfaPort = createOwnerMfaPort({ requestOnce });
export const { settings: ownerPasskeySettingsPort, signIn: ownerPasskeySignInPort } = createOwnerPasskeyPorts({ requestOnce });
export const { port: ownerRecoveryPort, failure: ownerRecoveryFailure } = createOwnerRecoveryClient({
  requestOnce, describeApiError, redactionOptions: TOVU_ERROR_REDACTION_OPTIONS,
});
export const { readInitialAdminSession } = createLocalOwnerSignIn({ apiErrorClass: ApiError, readInitialSession });
