import { secretFingerprint as fingerprintWithPorts, bindDeployOpsRuntime as bindRuntimeWithPorts } from '@jini-ai/devops/deploy/site/deploy-ops/run-ops';
import { homedir } from 'node:os';
import { resolveRuntimeMode } from '#src/contracts/core/runtime-mode';
import { fingerprintSiteKeyHex, parseSiteKeyHex, revealSiteKeyMaterial } from '#src/features/webhooks/keyring.env';
import { siteKeySourcesForSiteDir } from '#src/features/webhooks/site-key-sources';
import type { PublishHistoryStore } from '@jini-ai/devops/deploy/site/static-publish/publish-history';
import type { OperatorLocaleDeps } from '@jini-ai/core/contracts/headless/plugin-host';
import type { AuthorizeFn } from '@jini-ai/core/contracts/events';
import { issueCredentialSetup } from '#src/contracts/core/tool-failure-diagnostics';
import { makeCredentialedRequest, resolveRequestTarget, listCustomCredentials, allowedOriginsFor, type CredentialedRequestDeps } from '#src/features/custom-credentials/index';
import { classifyCredentialedRequestError } from '@jini-ai/integrations/custom-credentials/credential-ports';
import { EgressRefusedError } from '#src/platform/http/index';
import type { DeployOpsRegistry, DeployOpsInput, LoadedDeployOps, DeployOpsStatus, DeployOpsLogs, DeployOpsTargets, DeployOpsRuntime, WaitClock } from '@jini-ai/devops/deploy';
import * as portable from '@jini-ai/devops/deploy';
export interface DeployOpsToolDeps extends OperatorLocaleDeps {
  authorize: AuthorizeFn;
  /** Shared site ledger, injected by production; optional for credential-only consumers. */
  publishHistoryStore?: PublishHistoryStore;
  workspaceId: string;
  clock: CredentialedRequestDeps["clock"];
  customCredentialSetRepo: CredentialedRequestDeps["repo"];
  siteAssistantSecretSealer: CredentialedRequestDeps["sealer"];
  /** Dedicated guarded client with redirects disabled, constructed by the composition root. */
  deployOpsHttpClient?: CredentialedRequestDeps["httpClient"];
  customCredentialsAudit?: CredentialedRequestDeps["audit"];
  loadAuthSchemes: CredentialedRequestDeps["loadAuthSchemes"];
  /** Production injects freshly gated installed packages; tests/hermetic composition inject source. */
  loadDeployOps: (ctx: { workspaceId: string }) => Promise<DeployOpsRegistry>;
  deployOpsRegistry?: DeployOpsRegistry;
  /** Workflow declared by the deployment config owner, passed by the host. */
  loadDeployWorkflowFiles?: (input: { workspaceId: string }) => Promise<readonly string[]>;
  waitClock?: WaitClock;
  /** This boot's site folder; the default site-key reader resolves the same sources the Security page does. */
  siteBinding?: { dir?: string };
  /** Test seam: this site's active site key in hex, or undefined when none is usable. Never returned to the model. */
  readSiteKey?: () => string | undefined;
}

export const secretFingerprint = ({ value }: { value: string }, _options = {}) =>
  fingerprintWithPorts({ value, deps: { parseSiteKeyHex, fingerprintSiteKeyHex } });

/** Same ordered sources and precedence the Security page and the keyring read; re-read on every call. */
function defaultReadSiteKey(deps: DeployOpsToolDeps): string | undefined {
  const siteDir = deps.siteBinding?.dir;
  if (!siteDir) return undefined;
  const env = process.env;
  return revealSiteKeyMaterial({ sources: siteKeySourcesForSiteDir({ siteDir, mode: resolveRuntimeMode({ env }), env, home: homedir(), cwd: process.cwd() }) }).hex;
}


export function readDeploySiteKey(deps:DeployOpsToolDeps):string|undefined {return deps.readSiteKey ? deps.readSiteKey() : defaultReadSiteKey(deps);}
export const bindDeployOpsRuntime = (deps:DeployOpsToolDeps):DeployOpsRuntime =>
  bindRuntimeWithPorts({ deps, makeCredentialedRequest, runtime: {
    workspaceId:deps.workspaceId,clock:deps.clock,loadDeployOps:deps.loadDeployOps,
    loadDeployWorkflowFiles:deps.loadDeployWorkflowFiles,waitClock:deps.waitClock,publishHistoryStore:deps.publishHistoryStore,
    credentials:{
      available:!!deps.deployOpsHttpClient,
      list:async()=> (await listCustomCredentials({repo:deps.customCredentialSetRepo},{workspaceId:deps.workspaceId})).map(c=>({label:c.label,get allowedOrigins(){return allowedOriginsFor(c);}})),
      resolveTarget:(required,optional)=>resolveRequestTarget({repo:deps.customCredentialSetRepo},{...required,...optional}),
      classifyError:({error})=>classifyCredentialedRequestError({error,EgressRefusedError}),

    },
    siteKey:{read:()=>readDeploySiteKey(deps),fingerprint:({value})=>secretFingerprint({ value })},
    recovery:{setupRequired:({label,baseUrl})=>({message:"No matching deployment credential is saved. Call credential_save with kind api to open its secure card, then retry once.",credentialSetup:issueCredentialSetup({ setupToolId: "credential_save", prefill: { kind: "api", label, baseUrl, category: "ops" } }, {})})},
    toolIds:{status:'deployment_ops_status',logs:'deployment_ops_logs',wait:'deployment_ops_wait',listTargets:'deployment_ops_list_targets',deploy:'deployment_ops_deploy',listSecrets:'deployment_ops_list_secrets',setSecret:'deployment_ops_set_secret',unsetSecret:'deployment_ops_unset_secret',credentialVerify:'custom_credential_verify'},
    messages:{noUsableSiteKey:"This site has no usable site key to copy. Check Security > Site key in the admin first.",severalCredentials:({host,labels})=>`Several saved custom credentials match '${host}'. Set credentialLabel to one of: ${labels.join(", ")}.`,noSavedCredential:({label})=>`No saved custom credential labeled '${label}'. Choose another credentialLabel.`},
  } });
export function boundContext({deps,platform,explicit}:{deps:DeployOpsToolDeps;platform:LoadedDeployOps;explicit:string|undefined},{signal,...options}:{signal?:AbortSignal;allowDelete?:boolean}={}) {return portable.boundContext({deps:bindDeployOpsRuntime(deps),platform,explicit},{signal,...options});}
export function runDeployOps(required:{deps:DeployOpsToolDeps;input:DeployOpsInput;operation:'status'},optional?:{signal?:AbortSignal}):Promise<DeployOpsStatus>;
export function runDeployOps(required:{deps:DeployOpsToolDeps;input:DeployOpsInput;operation:'logs'},optional?:{signal?:AbortSignal}):Promise<DeployOpsLogs>;
export function runDeployOps(required:{deps:DeployOpsToolDeps;input:DeployOpsInput;operation:'listTargets'},optional?:{signal?:AbortSignal}):Promise<DeployOpsTargets>;
export function runDeployOps({deps,input,operation}:{deps:DeployOpsToolDeps;input:DeployOpsInput;operation:'status'|'logs'|'listTargets'},{signal}:{signal?:AbortSignal}={}) {return portable.runDeployOps({deps:bindDeployOpsRuntime(deps),input,operation},{signal});}
export function runDeploy(required:{deps:DeployOpsToolDeps;input:portable.DeployRequest},optional:{signal?:AbortSignal}={}) {return portable.runDeploy({...required,deps:bindDeployOpsRuntime(required.deps)},optional);}
