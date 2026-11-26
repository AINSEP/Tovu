import { SOURCE_CONTROL_CREDENTIAL_DEPS } from "./store.js";
import { bindSourceControlTools, type SourceControlToolDeps as Deps } from "@jini-ai/devops/source-control/site/tool-registrations";
import { createSourceControlAgentToolCatalog } from "@jini-ai/devops/source-control/site/agent-tools";
import { indexCatalogById } from "@jini-ai/core";
import { commitSiteToSourceControl, previewCommitExport } from "./commit-site.js";
import { buildSourceControlProvider, switchedOffPluginSentence } from "./provider-registry.js";
import { applyPluginCredentialCard } from "../../contracts/core/plugin-credential-card.js";
import { findPluginCredentialCard } from "@jini-ai/agent-plugins/connect";
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/index.js";
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint } from '@tovu/contracts/credential-copy';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { askThenReport } from "@jini-ai/daemon/surface-exchanges";
import { ProjectKeyCreateConflictError } from '#src/contracts/core/credential-store';

export const sourceControlAgentToolCatalog = createSourceControlAgentToolCatalog({ credentialSaveToolId: CREDENTIAL_SAVE_TOOL_ID });

const CATALOG_BY_ID = indexCatalogById({ catalog: sourceControlAgentToolCatalog });


export type SourceControlToolDeps = Omit<Deps, "deps" | "catalog" | "switchedOffPluginSentence" | "buildSourceControlProvider" | "previewCommitExport" | "commitSiteToSourceControl" | "defineSecretCardTool" | "applyPluginCredentialCard" | "findPluginCredentialCard" | "askThenReport" | "credentialSaveToolId" | "credentialFormUriHost" | "backupRepositoryRules" | "credentialText" | "formatCredentialHint" | "reportCredentialFailure" | "assertCredentialFreeField" | "isProjectKeyCreateConflictError">;

export const { buildSourceControlCredentialHandler, buildSourceControlRegistrations, contributeSourceControlTools } = bindSourceControlTools({
  deps: SOURCE_CONTROL_CREDENTIAL_DEPS, catalog: CATALOG_BY_ID, switchedOffPluginSentence, buildSourceControlProvider, previewCommitExport, commitSiteToSourceControl,
  defineSecretCardTool, applyPluginCredentialCard, findPluginCredentialCard, askThenReport, credentialSaveToolId: CREDENTIAL_SAVE_TOOL_ID,
  credentialFormUriHost: "tovu", backupRepositoryRules: 'For a site backup, the repository must be private and already have at least one commit (for example a README).',
  credentialText, formatCredentialHint, reportCredentialFailure: message => console.warn(message), assertCredentialFreeField,
  isProjectKeyCreateConflictError: (error): error is ProjectKeyCreateConflictError => error instanceof ProjectKeyCreateConflictError,
});
