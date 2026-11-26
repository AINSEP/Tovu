import { buildStaticPublishRegistrations as buildWithPorts, buildPublishHostCredentialHandler as credentialWithPorts,
  staticPublishDerivedRisk, EXECUTE_STATIC_PUBLISH_SCHEMA } from '@jini-ai/devops/deploy/site/publish-agent-tools';
import type { AgentToolDefinition, ToolContributor } from '@jini-ai/core';
import type { AssistantSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import type { StaticPublishToolDeps } from './publish-tool-deps.js';
import { staticPublishPorts } from './static-publish/adapter.js';
import { credentialStorePorts, describeCredential, hasDefaultForPublish, resolveForPublish, resolveDefaultForPublish } from './publish-credentials/store.js';
import { verificationPorts } from './static-publish/verify.js';
import { requireToolPermission } from '@jini-ai/core';
import { resolveOperatorLocale } from '@jini-ai/core/operator-locale';
import { plan as gatewayPlan, confirm as gatewayConfirm, execute as gatewayExecute } from '#src/contracts/core/gated-mutations/gateway';
import { planHashOf, resolveActorClassIdentity } from '#src/contracts/core/gated-mutations/composition';
import { checkToolPublishConsent } from './static-publish/publish-consent.js';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { buildOutcomeSurface } from '@jini-ai/ui/mcp-ui/surfaces';
import { askThenReport } from '@jini-ai/daemon/surface-exchanges';
import { CREDENTIAL_SAVE_TOOL_ID } from '../../contracts/headless/index.js';
import { abortGuardedCredentialRepo } from '@jini-ai/integrations/vendor-credentials/abort-guarded-repo';
import { findPluginCredentialCard } from '@jini-ai/agent-plugins/connect';
import { applyPluginCredentialCard } from '../../contracts/core/plugin-credential-card.js';
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { credentialText, formatCredentialHint, translateCredentialMessage } from '@tovu/contracts/credential-copy';
import { issueCredentialSetup } from '#src/contracts/core/tool-failure-diagnostics';
import { toolApprovalConfirmation, approvalToolHandler } from '../../contracts/core/human-confirm.js';



/** No arguments — parameterless read tool. Matches `agent-tools.ts`'s own `NO_INPUT_SCHEMA` exactly;
 *  declared separately here rather than imported from that sibling file, per this file's own
 *  "no dependency on agent-tools.ts" architectural rule (this file's header). */
const DEPLOYMENTS_READ_PERMISSION = "deployments.read";

const NO_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;


/** `deployment_preview_static_publish`'s input — the same target-discriminated shape
 *  `publish-site.ts`'s trigger route body uses, with optional `projectName` for authenticated provider inspection. A preview never runs a real
 *  publish. Reused (spread) by
 *  {@link EXECUTE_STATIC_PUBLISH_SCHEMA} below, which adds the one field a real publish needs. */
const PREVIEW_STATIC_PUBLISH_SCHEMA = {
  type: "object",
  // Each host's own config fields (its `configFields` in deployment_get_static_publish_capabilities),
  // as top-level strings. The handler refuses any key the chosen host does not declare.
  additionalProperties: { type: "string" },
  required: ["target"],
  properties: {
    projectName: { type: "string", title: "Project name", description: "Use the same project label at preview and execute. Required for authenticated provider resource/domain inspection." },
    credentialId: { type: "string", title: "Saved connection", description: "Optional saved connection chosen by the person; preview and execute use this exact connection." },
    target: {
      type: "string",
      title: "Hosting provider",
      description:
        "Which host to publish to: one of the providerId values deployment_get_static_publish_capabilities lists. Pass that host's configFields as top-level string fields next to target (for example { target, <fieldName>: '<value>' }); a field the host does not declare is refused. The base path is computed from the host and the config, never passed in.",
    },
  },
} as const;


/** `deployment_propose_custom_provider_credential`'s input: the host, plus optional pre-fill hints
 *  named after that host's non-secret credential fields. There is no secret property to fill in; the
 *  handler refuses a secret or undeclared field before any form is raised. */


/** `deployment_generate_bucket_hosting_setup`'s input: the host, plus the non-secret credential
 *  fields its plugin module needs to compose the steps (a bucket and region, for example). */
const GENERATE_BUCKET_HOSTING_SETUP_SCHEMA = {
  type: "object",
  additionalProperties: { type: "string" },
  required: ["target"],
  properties: {
    target: {
      type: "string",
      description:
        "Which host to generate hosting-setup steps for: one of the providerId values deployment_get_static_publish_capabilities lists. Pass that host's non-secret credential fields as top-level strings (for object storage: bucket, region and, when not plain AWS, endpoint).",
    },
  },
} as const;


/**
 * This domain's fixed agent-tool catalog. All five entries are wired — see this file's header for
 * why `deployment_execute_static_publish` (destructive/irreversible) needs no `actorClassRule` despite
 * that, and why `deployment_propose_custom_provider_credential` needs the identical reasoning for its
 * own write.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const staticPublishAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "deployment_get_static_publish_status",
    description: "Read a static-publish job's progress and final result. Pass the jobId returned by deployment_execute_static_publish, or executionId for an interrupted tool call; omit both to recover this site's most recent job after a lost response. Poll no more often than every 5 seconds. Read the job before retrying a timed-out publish; a public site's 200 may belong to an older deployment. Jobs survive call timeouts and are retained in this process for the last 20 completed publishes; a server restart loses these snapshots, so inspect the hosting dashboard then.",
    sideEffects: "none",
    authorization: { permission: DEPLOYMENTS_READ_PERMISSION },
    inputSchema: { type: "object", additionalProperties: false, properties: { jobId: { type: "string", minLength: 1 }, executionId: { type: "string", minLength: 1 } } },
  },
  {
    name: "deployment_preview_static_publish",
    description:
      "Previews publishing the current site WITHOUT publishing anything. Hosts with authenticatedPreview require projectName (same value at execute) and resolve the selected credential server-side for authenticated READS of resource collisions and current domain records/bindings/routes. providerInspection includes the exact hosting/domain changes and per-hostname states; inventoryStatus unknown refuses domain changes. This never uploads or provisions. Other hosts retain local-only previews: validates the target's config fields, reports the base path a real publish would use (computed from the host and its config, never passed in, so it can never mismatch the export), and reports whether a publish credential is configured for that target (true/false only, never the credential itself). Use this before telling a human what a publish would do, or to check readiness. This tool NEVER publishes or changes remote state. Authenticated previews send provider API reads; secrets never reach the caller. Account fields: when a host's config field names the account to publish under (an owner, user or organization), do NOT guess it from the human's name, email address or any other context. Call deployment_get_static_publish_capabilities first: a verified credential reports its real account login as that provider's accountLabel. Use the requested account, or default to accountLabel when present. Ask only when the target account is missing or ambiguous. If accountLabel is null and no account was supplied the account is UNKNOWN: say so plainly and ask the human directly. Never soften that question with an illustrative example, placeholder, or 'e.g. <name>' value of any kind: this tool cannot know whether a made-up example matches a real account, and offering one is how an invented account name once got published to.",
    sideEffects: "none",
    authorization: { permission: DEPLOYMENTS_READ_PERMISSION },
    inputSchema: PREVIEW_STATIC_PUBLISH_SCHEMA,
  },
  {
    name: "deployment_get_static_publish_capabilities",
    description:
      "Reports live publish readiness for every static-publish host the installed hosting plugins provide, including disabled ones (enabled:false, with guidance to turn them on), WITHOUT exposing any credential. If no hosts are listed, install a hosting plugin under Agent Plugins. Server-side unsealing derives only safe length and last-4 hints; short tokens expose length alone. For each provider: providerId and label; defaultForNewDestination (prefer this for a NEW destination; retain lastPublish target/config for an existing destination or explicit choice), authenticatedPreview (needs projectName and may issue authenticated provider READS); configFields (the fields to pass to deployment_preview_static_publish/deployment_execute_static_publish as top-level strings: name, label, required, help); whether it is ready to publish to right now (ready is true ONLY when a credential is configured AND it was last verified to actually work against the real provider; a saved-but-unverified or saved-but-failing credential is reported as NOT ready, distinctly from no credential at all); credentialConfigured (true iff a credential row/env var exists at all for this provider. This reports configuration, not saved-key presence; credentialOrigin is 'saved' when savedCredentials is nonempty, 'environment' when only the server environment configures it, or null when neither exists. It is kept deliberately separate from verified/accountLabel below: credentialConfigured:true with accountLabel:null means a credential EXISTS but its account identity is not yet known (never verified, or a verify that has not run since), which is a completely different situation from credentialConfigured:false, where no usable credential is configured for this provider and the human needs to configure one); every named credential set saved for it (id, label, isDefault, createdAt, updatedAt, tokenHint: the server-derived length and last4, with no characters exposed for tokens shorter than 12; tokenTail: the same safe last4 or an empty string, so it can be shown to a human as a short identifier like '••••ab12' when they have more than one saved connection for a provider; it is NEVER the full token, a longer fragment, or any ciphertext); the cached verification state (verified: 'valid' | 'invalid' | 'unreachable' | null, and verifiedAt. null means configured but never verified; 'unreachable' means the last check could not reach the provider due to a network issue and does NOT mean the credential is bad, distinctly from 'invalid', which means the provider itself rejected it; this is a CACHED result from the last time a human verified it, possibly stale, never a live check made by this call); accountLabel (the verified credential's own public account login/username, or null when not yet verified or for a provider with no such field to report; NEVER an email, plan, or org. Use it as the default for a config field that names the account to publish under, instead of guessing one from the human's name or email address, using the requested account when supplied. Ask only when the account is missing or ambiguous; when accountLabel is null and no account was supplied, say plainly that the account is not known yet and ask the human directly. NEVER offer an example, placeholder, or 'e.g. <name>' value to illustrate the answer, even a made-up-looking one, since this tool has no way to know whether it happens to match a real account); lastPublish (the last successful publish to this provider from this server: target, url, reachable, status, projectName, publishedAt and the config it used, or null if this provider has never been published to from here. When the human asks to 'publish again' or 'publish the same way as last time', use this to fill the config fields and projectName without asking, and report the previous url when relevant); and, for a provider that is NOT ready, a human-readable reason naming what is missing or wrong (no credential saved for this workspace, a required credential field is not configured, the credential has never been verified yet, it was rejected by the provider, or the last check could not reach the provider). Also reports this install's executionMode ('self-hosted-cli' or 'hosted-api-only'), which affects whether a server-environment-variable credential can ever be used as a fallback. credentialOrigin 'environment' means a working server key exists; publish with it; never open credential_save for that host unless a publish with it failed. credentialOrigin 'environment' with verified null is publishable even when ready is false. Call this before telling a human what publishing would do, before calling deployment_execute_static_publish, or whenever asked something like 'can I publish, and to where'. Do NOT ask the user to paste an API token, access key, or any other secret into this chat, ever, for any reason: a value typed into chat is written into the conversation transcript, which is exactly what this workspace's encrypted credential store exists to avoid, and this tool has no way to accept one anyway (it takes no input). On a local installation, open credential_copy_from_project to select a shared key in the owner's card. Remote sites use credential_save to enter a new key securely. Saved worksFor IDs declare compatibility; labels never imply it. Compatible vendor-group defaults take precedence, then a sole compatible key; choose an explicit id when ambiguous. If no existing key can be reused, or a credential was rejected, call credential_save with kind publish-host in this turn to open its secure card, then retry once after a successful save. The admin's Static Site tab (Deployment panel → Static Site → Publish) is an alternative for manual setup.",
    sideEffects: "none",
    authorization: { permission: DEPLOYMENTS_READ_PERMISSION },
    inputSchema: NO_INPUT_SCHEMA,
  },
  {
    name: "deployment_execute_static_publish",
    description:
      "Starts a background publish and returns jobId quickly. Read deployment_get_static_publish_status with that jobId every 5 seconds for progress and the final result. A running job is not a completed publication. If this call times out, read status without jobId before retrying. Publishes a fresh static export to a host listed by deployment_get_static_publish_capabilities using its saved credential.\n\nInput is {target, projectName, credentialId?, ...host configFields as top-level strings}; customDomain and zoneId are descriptor-owned fields. A requested domain is freshly inspected, shown in a human confirmation card and checked for stale state before mutation. A model-supplied confirmation flag is refused. unknown fields and secrets are refused. Requires deployments.publish. Wait for the result: {published:true, reachable:true, target, url, status, deploymentId?, basePath?} confirms the site is live. An upload awaiting public reachability returns {published:true, reachable:false, target, url, status, message, deploymentId?, basePath?}; report that partial outcome honestly. Missing credentials return {published:false, reason:'no-credential', message}; failures return {published:false, code, message}. Never exposes a token or raw provider response. A concurrent publish returns ALREADY_RUNNING; wait for it to settle.",
    // Genuinely destructive in the sense that matters for this domain (sends content to the public
    // internet with a write-scoped external credential) — classified accordingly, and cross-checked
    // against `staticPublishDerivedRisk` below at build time (`assertToolIsWirable`) so this
    // declaration cannot quietly soften itself. Deliberately carries NO `actorClassRule` — see this
    // file's header for why the MCP-UI held-open exchange gate needs none.
    sideEffects: "mutates-durable-state",
    authorization: { permission: "deployments.publish" },
    inputSchema: EXECUTE_STATIC_PUBLISH_SCHEMA,
  },

  {
    name: "deployment_generate_bucket_hosting_setup",
    description:
      "Generates the exact steps (and, where applicable, the exact policy JSON with the real names substituted in) a host needs in the human's own console before a published site is reachable, such as making a storage bucket publicly readable. Only some hosts have such steps; for the others this refuses with the reason. Tovu composes this but NEVER applies it: the human applies it themselves in their own provider console. This is a PURE READ: it writes nothing, calls no API, and does not need a saved credential (call it before or after credential_save with kind publish-host). Relay the returned 'steps' as prose plus copyable code blocks for any 'consoleJson' present, and relay 'warning' verbatim if present: it can say the step needs a DIFFERENT login than the saved credential, so say so plainly.",
    sideEffects: "none",
    authorization: { permission: DEPLOYMENTS_READ_PERMISSION },
    inputSchema: GENERATE_BUCKET_HOSTING_SETUP_SCHEMA,
  },
];

export const publishToolPorts = {
  catalog: staticPublishAgentToolCatalog, staticPublishPorts, credentialStorePorts,
  credentialSourceStorePorts: { describeCredential, hasDefaultForPublish, resolveForPublish, resolveDefaultForPublish },
  verificationPorts, requireToolPermission, resolveOperatorLocale, gatewayPlan, gatewayConfirm, gatewayExecute,
  resolveActorClassIdentity, planHashOf, checkToolPublishConsent, defineSecretCardTool, buildOutcomeSurface, askThenReport,
  secretCardOptions: { uriHost: 'tovu', text: { noEmitter: "deployment_propose_custom_provider_credential: this execution context has no interactive confirmation channel " +
    "(no emitSurface), so a credential form cannot be shown here. Nothing was saved." } },
  uriHost: 'tovu', publishOutcomeApp: { appName: 'tovu-deployment-execute-static-publish-outcome', appVersion: '1' },
  credentialFormApp: { appName: 'tovu-deployment-propose-custom-provider-credential', appVersion: '1' },
  credentialRowLabel: 'default', credentialSaveToolId: CREDENTIAL_SAVE_TOOL_ID, abortGuardedCredentialRepo,
  findPluginCredentialCard, applyPluginCredentialCard, assertCredentialFreeField, credentialText, formatCredentialHint,
  translateCredentialMessage, issueCredentialSetup, toolApprovalConfirmation, approvalToolHandler,
};

export function buildPublishHostCredentialHandler(required: { deps: StaticPublishToolDeps; surfaces: AssistantSurfaceDeps }, _optional = {}) {
  return credentialWithPorts({ ...required, deps: { ...required.deps, ...publishToolPorts, get env() { return process.env; } } });
}
export function buildStaticPublishRegistrations(deps: StaticPublishToolDeps, surfaces: AssistantSurfaceDeps) {
  return buildWithPorts({ ...deps, ...publishToolPorts, get env() { return process.env; } }, surfaces);
}
export function contributeStaticPublishTools(): ToolContributor<StaticPublishToolDeps, AssistantSurfaceDeps> {
  return { domain: 'static-publish', build: buildStaticPublishRegistrations, risk: staticPublishDerivedRisk };
}
