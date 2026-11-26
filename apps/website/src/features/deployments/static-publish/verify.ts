import { assertCredentialToken, CredentialInputError } from '@jini-ai/platform/secrets/credential-token';
import { credentialText } from '@tovu/contracts/credential-copy';
import { createDeployHostKit } from '../deploy-targets/host-kit-binding.js';
import { resolveForPublish } from '../publish-credentials/store.js';
import { verifyPublishCredential as verifyWithPorts, verifyPublishCredentialById as byIdWithPorts,
  verifySubmittedPublishCredential as submittedWithPorts,
  type VerifyPublishCredentialDeps as JiniVerifyDeps, type VerifyPublishCredentialByIdDeps as JiniByIdDeps } from '@jini-ai/devops/deploy/site/static-publish/verify';

export type VerifyPublishCredentialDeps = Omit<JiniVerifyDeps, 'assertCredentialToken' | 'CredentialInputError' | 'credentialText' | 'createDeployHostKit'>;
export type VerifyPublishCredentialByIdDeps = Omit<JiniByIdDeps, 'assertCredentialToken' | 'CredentialInputError' | 'credentialText' | 'createDeployHostKit' | 'resolveForPublish'>;
export const verificationPorts = { assertCredentialToken, CredentialInputError, credentialText, createDeployHostKit };

export function verifyPublishCredential(deps: VerifyPublishCredentialDeps, input: Parameters<typeof verifyWithPorts>[1]) {
  return verifyWithPorts({ ...deps, ...verificationPorts }, input);
}
export function verifyPublishCredentialById(deps: VerifyPublishCredentialByIdDeps, input: Parameters<typeof byIdWithPorts>[1]) {
  return byIdWithPorts({ ...deps, ...verificationPorts, resolveForPublish }, input);
}
export function verifySubmittedPublishCredential(required: Omit<Parameters<typeof submittedWithPorts>[0], 'deps'> & {
  deps: Omit<Parameters<typeof submittedWithPorts>[0]['deps'], keyof typeof verificationPorts>;
}, _options = {}) {
  return submittedWithPorts({ ...required, deps: { ...required.deps, ...verificationPorts } });
}
