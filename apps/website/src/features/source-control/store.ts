import { createSourceControlCredential as create, updateSourceControlCredential as update, type SourceControlCredentialWriteDeps as Deps } from "@jini-ai/devops/source-control/site/store";
import { ProjectKeyCreateConflictError } from '#src/contracts/core/credential-store';
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { buildSourceControlProvider } from "./provider-registry.js";

export type SourceControlCredentialWriteDeps = Omit<Deps, "assertCredentialFreeField" | "isProjectKeyCreateConflictError" | "buildSourceControlProvider">;

export function createSourceControlCredential({ deps, input }: { deps: SourceControlCredentialWriteDeps; input: Parameters<typeof create>[0]["input"] }, _options = {}) {
  return create({ deps: { ...deps, assertCredentialFreeField, buildSourceControlProvider, isProjectKeyCreateConflictError: (error): error is ProjectKeyCreateConflictError => error instanceof ProjectKeyCreateConflictError }, input });
}

export function updateSourceControlCredential({ deps, input }: { deps: SourceControlCredentialWriteDeps; input: Parameters<typeof update>[0]["input"] }, _options = {}) {
  return update({ deps: { ...deps, assertCredentialFreeField, buildSourceControlProvider, isProjectKeyCreateConflictError: (error): error is ProjectKeyCreateConflictError => error instanceof ProjectKeyCreateConflictError }, input });
}
