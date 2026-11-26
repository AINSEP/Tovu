import { assertCredentialFreeField } from '../../../contracts/core/credential-token.js';
import { CredentialInputError, CREDENTIAL_MESSAGES, normalizeCredentialToken } from '@jini-ai/platform/secrets/credential-token';
import { ProjectKeyCreateConflictError } from '#src/contracts/core/credential-store';
import { parseTovuStoreMeta } from '#src/platform/secrets/vault-kinds';
import { matchingCredentialProviderIds, selectCredentialForProvider, normalizeCredentialWorksFor } from '@jini-ai/platform/secrets/credential-sets';
import { credentialCreateTarget, credentialScopes } from '@jini-ai/integrations/vendor-credentials/project-scope';
import { listPublishCredentials as listWithPorts, describeCredential as describeWithPorts,
  createPublishCredential as createWithPorts, updatePublishCredential as updateWithPorts,
  publishHostsForCredential as hostsWithPorts, invalidatePublishCredentialCompatibility as invalidateWithPorts,
  type PublishCredentialReadDeps as JiniReadDeps, type PublishCredentialWriteDeps as JiniWriteDeps,
  type CreatePublishCredentialInput, type UpdatePublishCredentialInput } from '@jini-ai/devops/deploy/site/publish-credentials/store';
import { hasDefaultForPublish as hasDefaultWithPorts, resolveForPublish as resolveWithPorts,
  resolveDefaultForPublish as defaultWithPorts } from '@jini-ai/devops/deploy/site/publish-credentials/store-resolution';

export type PublishCredentialReadDeps = Pick<JiniReadDeps, 'repo' | 'sealer' | 'loadDeployTargets'>;
export type PublishCredentialWriteDeps = PublishCredentialReadDeps & Pick<JiniWriteDeps, 'sealer' | 'keyring' | 'clock' | 'idGen' | 'allowSharedKeyReplacement'>;
export type PublishCredentialResolveDeps = PublishCredentialReadDeps & Pick<JiniWriteDeps, 'sealer'>;

export const credentialStorePorts = {
  ownerKey: 'tovu', projectWorkspaceId: 'project', storageMessage: CREDENTIAL_MESSAGES.storage,
  CredentialInputError, ProjectKeyCreateConflictError, normalizeCredentialToken, assertCredentialFreeField,
  normalizeCredentialWorksFor, matchingCredentialProviderIds, selectCredentialForProvider, credentialScopes, credentialCreateTarget,
  parseStoreMeta: parseTovuStoreMeta,
};

export function listPublishCredentials(deps: PublishCredentialReadDeps, input: Parameters<typeof listWithPorts>[1]) {
  return listWithPorts({ ...deps, ...credentialStorePorts }, input);
}
export function describeCredential(deps: PublishCredentialReadDeps, input: Parameters<typeof describeWithPorts>[1]) {
  return describeWithPorts({ ...deps, ...credentialStorePorts }, input);
}
export function createPublishCredential(deps: PublishCredentialWriteDeps, input: CreatePublishCredentialInput) {
  return createWithPorts({ ...deps, ...credentialStorePorts }, input);
}
export function updatePublishCredential(deps: PublishCredentialWriteDeps, input: UpdatePublishCredentialInput) {
  return updateWithPorts({ ...deps, ...credentialStorePorts }, input);
}
export function hasDefaultForPublish(deps: PublishCredentialReadDeps, input: Parameters<typeof hasDefaultWithPorts>[1]) {
  return hasDefaultWithPorts({ ...deps, ...credentialStorePorts }, input);
}
export function resolveForPublish(deps: PublishCredentialResolveDeps, input: Parameters<typeof resolveWithPorts>[1]) {
  return resolveWithPorts({ ...deps, ...credentialStorePorts }, input);
}
export function resolveDefaultForPublish(deps: PublishCredentialResolveDeps, input: Parameters<typeof defaultWithPorts>[1]) {
  return defaultWithPorts({ ...deps, ...credentialStorePorts }, input);
}
export function publishHostsForCredential(required: Omit<Parameters<typeof hostsWithPorts>[0], 'deps'>, _optional = {}) {
  return hostsWithPorts({ ...required, deps: { matchingCredentialProviderIds } });
}
export function invalidatePublishCredentialCompatibility(required: Omit<Parameters<typeof invalidateWithPorts>[0], 'deps'>, _optional = {}) {
  return invalidateWithPorts({ ...required, deps: { matchingCredentialProviderIds } });
}
