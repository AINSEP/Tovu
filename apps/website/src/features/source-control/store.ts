import { createSourceControlCredential as create, updateSourceControlCredential as update, type SourceControlCredentialWriteDeps as Deps } from "@jini-ai/devops/source-control/site/store";
import { CREDENTIAL_MESSAGES, CredentialInputError, normalizeCredentialToken } from "@jini-ai/platform/secrets/credential-token";
import { credentialScopes, credentialCreateTarget } from "@jini-ai/integrations/vendor-credentials/project-scope";
import { abortGuardedCredentialRepo } from "@jini-ai/integrations/vendor-credentials/abort-guarded-repo";
import { ProjectKeyCreateConflictError } from '#src/contracts/core/credential-store';
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { buildSourceControlProvider } from "./provider-registry.js";

export const SOURCE_CONTROL_CREDENTIAL_DEPS = { CREDENTIAL_MESSAGES, CredentialInputError, normalizeCredentialToken, credentialScopes, credentialCreateTarget, abortGuardedCredentialRepo };

export type SourceControlCredentialWriteDeps = Omit<Deps, "deps" | "assertCredentialFreeField" | "isProjectKeyCreateConflictError" | "buildSourceControlProvider">;

export function createSourceControlCredential({ deps, input }: { deps: SourceControlCredentialWriteDeps; input: Parameters<typeof create>[0]["input"] }, _options = {}) {
  return create({ deps: { ...deps, deps: SOURCE_CONTROL_CREDENTIAL_DEPS, assertCredentialFreeField, buildSourceControlProvider, isProjectKeyCreateConflictError: (error): error is ProjectKeyCreateConflictError => error instanceof ProjectKeyCreateConflictError }, input });
}

export function updateSourceControlCredential({ deps, input }: { deps: SourceControlCredentialWriteDeps; input: Parameters<typeof update>[0]["input"] }, _options = {}) {
  return update({ deps: { ...deps, deps: SOURCE_CONTROL_CREDENTIAL_DEPS, assertCredentialFreeField, buildSourceControlProvider, isProjectKeyCreateConflictError: (error): error is ProjectKeyCreateConflictError => error instanceof ProjectKeyCreateConflictError }, input });
}
