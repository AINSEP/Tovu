import { buildSourceControlRegistrations as build, sourceControlDerivedRisk, type SourceControlToolDeps as Deps } from "@jini-ai/devops/source-control/site/tool-registrations";
import { executeCommitSchema } from "@jini-ai/devops/source-control/site/commit-schema";
import { indexCatalogById, type AgentToolDefinition, type ToolContributor, type ToolHandler } from "@jini-ai/core";
import type { AssistantSurfaceDeps } from "@jini-ai/core/contracts/site/daemon-surface-exchanges";
import { commitSiteToSourceControl, previewCommitExport } from "./commit-site.js";
import { buildSourceControlProvider, switchedOffPluginSentence } from "./provider-registry.js";
import { proposeSourceControlCredential } from "./credential-setup.js";
import { applyPluginCredentialCard } from "../../contracts/core/plugin-credential-card.js";
import { findPluginCredentialCard } from "@jini-ai/agent-plugins/connect";
import { CREDENTIAL_SAVE_TOOL_ID } from "../../contracts/headless/index.js";
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint } from '@tovu/contracts/credential-copy';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { askThenReport } from "@jini-ai/daemon/surface-exchanges";
import { ProjectKeyCreateConflictError } from '#src/contracts/core/credential-store';

const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

export const sourceControlAgentToolCatalog: AgentToolDefinition[] = [

  {
    name: "source_control_get_capabilities",
    description:
      "Reports the source control hosts for this workspace — every host a turned-on Agent Plugin provides, every host a plugin declares but is switched off, and every host that has a saved connection — WITHOUT decrypting or exposing any credential. For each provider: providerId; label, apiOrigin (the API base URL a saved custom credential for that host points at) and maxFileBytes (the largest single file the host accepts in a push; absent when it declares none), when a plugin declares the host; whether a credential is configured (a source-control connection or provider-declared saved API key exists; credentialSource is saved-api-key for that fallback — this is presence only, NOT a live verification that the token still works; a saved credential that the host has since revoked still reports configured:true here and would only be discovered as invalid by an actual commit attempt), every named credential set saved for it (id, label, isDefault, createdAt, updatedAt — NEVER a token or any part of one), and whether committing to that provider is supported yet (commitSupported: true only when an enabled Agent Plugin provides committing to that host; a saved credential for an unavailable host is reported honestly here, but source_control_execute_commit will refuse it; do not imply to the user that saving such a credential enables committing). Call this before telling a human what committing would do, before calling source_control_execute_commit, or whenever asked something like 'can I commit, and where'. Do NOT ask the user to paste a token into this chat — a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid; call credential_save with kind source-control to open a human form, which saves it encrypted server-side and never shows it to you.",
    sideEffects: "none",
    authorization: { permission: "source-control.read" },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "source_control_execute_commit",
    description:
      "Commits a fresh active-theme static copy to a repository using its saved credential. Use the folder the user named; if the destination is unclear ask 'repository root or which folder?'. Run dryRun:true first to preview packaged files and bytes without contacting the host. Requires human approval with {provider, owner, repo, commitMessage, branch?, folder?}; provider must have commitSupported:true and folder commits require supportsFolder:true. Returns {committed:true, owner, repo, folder, entryPath, branch, branchCreated, commitSha, commitUrl, filesChanged, filesDeleted, divergedPaths}. Report destination, entryPath, deleted-file count and divergedPaths. Only unchanged stale paths previously managed in this destination may be removed; unrelated files, human-edited stale files and files outside the folder are preserved. The entry is a root index.html listing the theme and its pages; existing hosting URLs may need configuration. Static publishing has its own tool. Returns {committed:false, reason, message} when the credential or provider is unavailable, and {committed:false, cancelled:false, code, message} when the commit itself fails. Never accepts or exposes a token. Requires source-control.commit.",
    // Genuinely consequential (pushes a real commit into someone's actual git history using a
    // write-scoped external credential) — classified accordingly, cross-checked against
    // `sourceControlDerivedRisk` below at build time. Deliberately carries NO `actorClassRule` — see
    // this file's header for why the MCP-UI held-open exchange gate needs none.
    sideEffects: "mutates-durable-state",
    authorization: { permission: "source-control.commit" },
    inputSchema: executeCommitSchema,
  },
];

const CATALOG_BY_ID = indexCatalogById({ catalog: sourceControlAgentToolCatalog });


export type SourceControlToolDeps = Omit<Deps, "catalog" | "switchedOffPluginSentence" | "buildSourceControlProvider" | "previewCommitExport" | "commitSiteToSourceControl" | "defineSecretCardTool" | "applyPluginCredentialCard" | "findPluginCredentialCard" | "askThenReport" | "credentialSaveToolId" | "credentialFormUriHost" | "backupRepositoryRules" | "credentialText" | "formatCredentialHint" | "reportCredentialFailure" | "assertCredentialFreeField" | "isProjectKeyCreateConflictError">;

export function buildSourceControlCredentialHandler({ deps, surfaces }: { deps: SourceControlToolDeps; surfaces: AssistantSurfaceDeps }, _optional = {}): ToolHandler {
  return (ctx, optional = {}) => proposeSourceControlCredential({ deps, surfaces, ctx }, optional);
}

export function buildSourceControlRegistrations(deps: SourceControlToolDeps, surfaces: AssistantSurfaceDeps) {
  return build({ ...deps, catalog: CATALOG_BY_ID, switchedOffPluginSentence, buildSourceControlProvider, previewCommitExport, commitSiteToSourceControl,
    defineSecretCardTool, applyPluginCredentialCard, findPluginCredentialCard, askThenReport, credentialSaveToolId: CREDENTIAL_SAVE_TOOL_ID,
    credentialFormUriHost: "tovu", backupRepositoryRules: 'For a site backup, the repository must be private and already have at least one commit (for example a README).',
    credentialText, formatCredentialHint, reportCredentialFailure: message => console.warn(message), assertCredentialFreeField,
    isProjectKeyCreateConflictError: (error): error is ProjectKeyCreateConflictError => error instanceof ProjectKeyCreateConflictError,
  }, surfaces);
}

export function contributeSourceControlTools(): ToolContributor<SourceControlToolDeps, AssistantSurfaceDeps> {
  return { domain: "source-control", build: buildSourceControlRegistrations, risk: sourceControlDerivedRisk };
}
