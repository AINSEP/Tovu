import type { PublishHistoryStore } from '../static-publish/publish-history.js';
import type { OperatorLocaleDeps } from '#src/contracts/headless/index';
import type { AuthorizeFn } from '../../../contracts/core/commands/index.js';
import { issueCredentialSetup } from '#src/contracts/core/tool-failure-diagnostics';
import { makeCredentialedRequest, resolveRequestTarget, listCustomCredentials, allowedOriginsFor, type CredentialedRequestDeps } from '#src/features/custom-credentials/index';
import { CredentialedRequestValidationError, CredentialedRequestTransportError, CustomCredentialNotFoundError } from '#src/features/custom-credentials/index';
import { EgressRefusedError } from '../../../platform/http/index.js';
import type { CredentialedRequestErrorClass } from '@jini-ai/core/contracts/credentials';
import type { DeployOpsRegistry, DeployOpsInput, LoadedDeployOps, DeployOpsStatus, DeployOpsLogs, DeployOpsTargets, DeployOpsRuntime, WaitClock } from '@jini-ai/devops/deploy';
import { readDeploySiteKey, secretFingerprint } from './secrets.js';
import { aborted, MAX_RESPONSE_CHARS } from '@jini-ai/devops/deploy';
import * as portable from '@jini-ai/devops/deploy';
export { aborted, MAX_RESPONSE_CHARS, MAX_WAIT_SECONDS, MAX_MODULE_SLEEP_MS, DeployCredentialSetupRequired, waitForDeployOps } from '@jini-ai/devops/deploy';
export type { DeployRequest } from '@jini-ai/devops/deploy';
export type { WaitClock } from '@jini-ai/devops/deploy';
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

export function bindDeployOpsRuntime(deps:DeployOpsToolDeps):DeployOpsRuntime {

  return {
    workspaceId:deps.workspaceId,clock:deps.clock,loadDeployOps:deps.loadDeployOps,
    loadDeployWorkflowFiles:deps.loadDeployWorkflowFiles,waitClock:deps.waitClock,publishHistoryStore:deps.publishHistoryStore,
    credentials:{
      available:!!deps.deployOpsHttpClient,
      list:async()=> (await listCustomCredentials({repo:deps.customCredentialSetRepo},{workspaceId:deps.workspaceId})).map(c=>({label:c.label,allowedOrigins:allowedOriginsFor(c)})),
      resolveTarget:(required,optional)=>resolveRequestTarget({repo:deps.customCredentialSetRepo},{...required,...optional}),
      classifyError:({error})=>classifyDeployError(error),
      request:async(required,optional)=>{
        const {signal}=optional;
        const requestDeps:CredentialedRequestDeps={repo:deps.customCredentialSetRepo,sealer:deps.siteAssistantSecretSealer,httpClient:deps.deployOpsHttpClient!,clock:deps.clock,...(deps.customCredentialsAudit?{audit:deps.customCredentialsAudit}:{}),loadAuthSchemes:deps.loadAuthSchemes};
        let transportTruncated = false;
    // Preserve the text clipping flag the credential API does not expose in its returned shape.
    const boundedDeps: CredentialedRequestDeps = { ...requestDeps, httpClient: { send: async request => {
      // Auth scheme loading can yield after the earlier abort check. Recheck at the I/O boundary.
      if (signal?.aborted) throw aborted();
      const result = await requestDeps.httpClient.send({ ...request, ...(signal ? { signal } : {}), maxResponseBytes: required.maxResponseBytes });
      transportTruncated = result.bodyTruncated === true;
      return result;
    } } };
        const {maxResponseBytes: _limit,...request}=required;
        const result=await makeCredentialedRequest(boundedDeps,{...request,headers:optional.headers,body:optional.body});
        return {...result,bodyTruncated:transportTruncated};
      },
    },
    siteKey:{read:()=>readDeploySiteKey(deps),fingerprint:({value})=>secretFingerprint(value)},
    recovery:{setupRequired:({label,baseUrl})=>({message:"No matching deployment credential is saved. Call credential_save with kind api to open its secure card, then retry once.",credentialSetup:issueCredentialSetup({ setupToolId: "credential_save", prefill: { kind: "api", label, baseUrl, category: "ops" } }, {})})},
    toolIds:{status:'deployment_ops_status',logs:'deployment_ops_logs',wait:'deployment_ops_wait',listTargets:'deployment_ops_list_targets',deploy:'deployment_ops_deploy',listSecrets:'deployment_ops_list_secrets',setSecret:'deployment_ops_set_secret',unsetSecret:'deployment_ops_unset_secret',credentialVerify:'custom_credential_verify'},
    messages:{noUsableSiteKey:"This site has no usable site key to copy. Check Security > Site key in the admin first.",severalCredentials:({host,labels})=>`Several saved custom credentials match '${host}'. Set credentialLabel to one of: ${labels.join(", ")}.`,noSavedCredential:({label})=>`No saved custom credential labeled '${label}'. Choose another credentialLabel.`},
  };
}
export function boundContext(deps:DeployOpsToolDeps,platform:LoadedDeployOps,explicit:string|undefined,signal?:AbortSignal,options:{allowDelete?:boolean}={}) {return portable.boundContext({deps:bindDeployOpsRuntime(deps),platform,explicit},{signal,...options});}
export function runDeployOps(deps:DeployOpsToolDeps,input:DeployOpsInput,operation:'status',signal?:AbortSignal):Promise<DeployOpsStatus>;
export function runDeployOps(deps:DeployOpsToolDeps,input:DeployOpsInput,operation:'logs',signal?:AbortSignal):Promise<DeployOpsLogs>;
export function runDeployOps(deps:DeployOpsToolDeps,input:DeployOpsInput,operation:'listTargets',signal?:AbortSignal):Promise<DeployOpsTargets>;
export function runDeployOps(deps:DeployOpsToolDeps,input:DeployOpsInput,operation:'status'|'logs'|'listTargets',signal?:AbortSignal) {return portable.runDeployOps({deps:bindDeployOpsRuntime(deps),input,operation},{signal});}
export function runDeploy(required:{deps:DeployOpsToolDeps;input:portable.DeployRequest},optional:{signal?:AbortSignal}={}) {return portable.runDeploy({...required,deps:bindDeployOpsRuntime(required.deps)},optional);}

function classifyDeployError(error:unknown):CredentialedRequestErrorClass {
 if(error instanceof EgressRefusedError) return {category:'egress-refused',error,callerSafeMessage:error.callerSafeMessage,callerSafeError:new EgressRefusedError({message:error.callerSafeMessage},{callerSafeMessage:error.callerSafeMessage})};
 if(error instanceof CredentialedRequestValidationError) return {category:'validation',error,callerSafeMessage:error.message};
 if(error instanceof CustomCredentialNotFoundError) return {category:'not-found',error,callerSafeMessage:error.message};
 if(error instanceof CredentialedRequestTransportError) return {category:'transport',error};
 return {category:'unknown',error};
}
