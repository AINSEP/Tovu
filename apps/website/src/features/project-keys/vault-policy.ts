import { describeErrorForLog } from '@jini-ai/core/model-facing-tool-errors';
import type { AttachedVaultFailure } from '@jini-ai/user-management/project-keys/attached-vault';
import { ProjectKeyCreateConflictError } from '../../contracts/core/credential-store.js';

type Empty = Record<string, never>;

/** Host copy and log lines for the site-granted read-only vault; the generic fences live in Jini. */
export const attachedVaultPolicy = {
  readonlyMessage: 'Change this saved key in Shared Keys. To stop using it here, revoke its grant on this site.',
  report(required: AttachedVaultFailure, _optional: Empty = {}): void {
    if (required.kind === 'list') {
      console.warn('[shared-keys] Grants could not be read. Retry Shared Keys. Details: P25_GRANTS_READ_FAILED; secret values omitted.');
    } else if (required.kind === 'find') {
      console.warn('[shared-keys] A granted key could not be read. Local keys remain available; retry Shared Keys. Details: P25_SHARED_READ_FAILED; secret values omitted.', describeErrorForLog({ err: required.error }));
    } else {
      console.warn('[shared-keys] A granted key label could not be resolved. Reopen Use a saved key and retry. Details: P25_SHARED_LABEL_READ_FAILED; secret values omitted.', describeErrorForLog({ err: required.error }));
    }
  },
};

/** Host typed conflict and replacement-refusal copy for the create-only / trusted-replacement ports. */
export const createVaultPolicy = {
  conflictError: (required: Empty, _optional: Empty = {}): Error => new ProjectKeyCreateConflictError(required),
  replacementRefusedMessage: 'Replace this shared key from the owner session or Shared Keys. Refresh the site grant before trying again.',
};

/** Host refusal copy for the handle-only owner keyring. */
export const keyringPolicy = {
  derivationRefusedMessage: 'Owner key derivation is private to Shared Keys. Use the saved credential through its site grant.',
};

/** Fixed owner scope (data) and refusal copy for the site-granted sealer. */
export const sealerPolicy = {
  ownerScope: { workspaceId: 'project', ownerKey: 'tovu', kinds: ['vendor', 'custom', 'source-control'] },
  accessRefusedMessage: 'This site no longer has access to this saved key. Open Use a saved key to approve access again.',
};
