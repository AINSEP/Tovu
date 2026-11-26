import { proposeSourceControlCredential as propose, type SourceControlCredentialSetupDeps as Deps } from "@jini-ai/devops/source-control/site/credential-setup";
import { applyPluginCredentialCard } from "../../contracts/core/plugin-credential-card.js";
import { findPluginCredentialCard } from "@jini-ai/agent-plugins/connect";
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/index.js";
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint } from '@tovu/contracts/credential-copy';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { askThenReport } from "@jini-ai/daemon/surface-exchanges";
import { buildSourceControlProvider } from "./provider-registry.js";
import { ProjectKeyCreateConflictError } from '#src/contracts/core/credential-store';

export type SourceControlCredentialSetupDeps = Omit<Deps, "defineSecretCardTool" | "applyPluginCredentialCard" | "findPluginCredentialCard" | "askThenReport" | "credentialSaveToolId" | "credentialFormUriHost" | "backupRepositoryRules" | "credentialText" | "formatCredentialHint" | "reportCredentialFailure" | "assertCredentialFreeField" | "buildSourceControlProvider" | "isProjectKeyCreateConflictError">;

export function proposeSourceControlCredential(spec: Omit<Parameters<typeof propose>[0], "deps"> & { deps: SourceControlCredentialSetupDeps }, optional: Parameters<typeof propose>[1] = {}) {
  return propose({ ...spec, deps: { ...spec.deps, defineSecretCardTool, applyPluginCredentialCard, findPluginCredentialCard, askThenReport,
    credentialSaveToolId: CREDENTIAL_SAVE_TOOL_ID, credentialFormUriHost: "tovu",
    backupRepositoryRules: 'For a site backup, the repository must be private and already have at least one commit (for example a README).',
    credentialText, formatCredentialHint, reportCredentialFailure: message => console.warn(message), assertCredentialFreeField, buildSourceControlProvider,
    isProjectKeyCreateConflictError: (error): error is ProjectKeyCreateConflictError => error instanceof ProjectKeyCreateConflictError,
  } }, optional);
}
