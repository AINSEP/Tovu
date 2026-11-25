import { describeErrorForLog } from '@jini-ai/core/model-facing-tool-errors';
import type { AttachedVaultFailure } from '@jini-ai/user-management/project-keys/attached-vault';
import { ProjectKeyCreateConflictError } from '../../contracts/core/credential-store.js';

export const attachedVaultPolicy = {
  readonlyMessage: 'Change this saved key in Shared Keys. To stop using it here, revoke its grant on this site.',
  report(failure: AttachedVaultFailure, _optional: Record<string, never> = {}) {
    if (failure.kind === 'list') {
      console.warn('[shared-keys] Grants could not be read. Retry Shared Keys. Details: P25_GRANTS_READ_FAILED; secret values omitted.');
    } else {
      if (failure.kind === 'find') console.warn('[shared-keys] A granted key could not be read. Local keys remain available; retry Shared Keys. Details: P25_SHARED_READ_FAILED; secret values omitted.', describeErrorForLog({ err: failure.error }));
      else console.warn('[shared-keys] A granted key label could not be resolved. Reopen Use a saved key and retry. Details: P25_SHARED_LABEL_READ_FAILED; secret values omitted.', describeErrorForLog({ err: failure.error }));
    }
  },
};

export const projectKeyCreatePolicy = {
  conflictError: (_required: Record<string, never>, _optional: Record<string, never> = {}) => new ProjectKeyCreateConflictError({}),
  replacementRefusedMessage: 'Replace this shared key from the owner session or Shared Keys. Refresh the site grant before trying again.',
};

export const ownerKeyPolicy = {
  derivationRefusedMessage: 'Owner key derivation is private to Shared Keys. Use the saved credential through its site grant.',
};

export const siteGrantedSealerPolicy = {
  ownerScope: { workspaceId: 'project', ownerKey: 'tovu', kinds: ['vendor', 'custom', 'source-control'] },
  accessRefusedMessage: 'This site no longer has access to this saved key. Open Use a saved key to approve access again.',
};
