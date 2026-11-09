import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { resolveRuntimeMode } from '#src/contracts/core/runtime-mode';
import { fingerprintSiteKeyHex, parseSiteKeyHex, revealSiteKeyMaterial, siteKeySourcesForSiteDir } from '#src/features/webhooks/index';
import { bindDeployOpsRuntime, type DeployOpsToolDeps } from './run-ops.js';
import * as portable from '@jini-ai/devops/deploy';
export type { SecretValueSource, SecretTargetInput, SetSecretInput, UnsetSecretInput, SecretComparison, SecretConfirmRequest, SecretNotConfirmed, SecretConfirm, SetSecretResult, UnsetSecretResult } from '@jini-ai/devops/deploy';
export { SECRET_NAME_PATTERN } from '@jini-ai/devops/deploy';
const sha256 = (value:string)=>createHash('sha256').update(value,'utf8').digest();
/** A site-key-shaped value gets the Security page's own fingerprint, so the two can be compared by eye. O(n). */
export function secretFingerprint(value: string): { fingerprint: string; fingerprintKind: "site-key" | "sha256" } {
  const parsed = parseSiteKeyHex(value);
  return parsed.ok ? { fingerprint: fingerprintSiteKeyHex(parsed.hex), fingerprintKind: "site-key" } : { fingerprint: sha256(value).toString("hex").slice(0, 12), fingerprintKind: "sha256" };
}

/** Same ordered sources and precedence the Security page and the keyring read; re-read on every call. */
function defaultReadSiteKey(deps: DeployOpsToolDeps): string | undefined {
  const siteDir = deps.siteBinding?.dir;
  if (!siteDir) return undefined;
  const env = process.env;
  return revealSiteKeyMaterial({ sources: siteKeySourcesForSiteDir({ siteDir, mode: resolveRuntimeMode({ env }), env, home: homedir(), cwd: process.cwd() }) }).hex;
}


export function readDeploySiteKey(deps:DeployOpsToolDeps):string|undefined {return deps.readSiteKey ? deps.readSiteKey() : defaultReadSiteKey(deps);}
export function runListSecrets(required:{deps:DeployOpsToolDeps;input:import('@jini-ai/devops/deploy').SecretTargetInput},optional:Parameters<typeof portable.runListSecrets>[1]={}) {return portable.runListSecrets({...required,deps:bindDeployOpsRuntime(required.deps)},optional);}
export function runSetSecret(required:{deps:DeployOpsToolDeps;input:import('@jini-ai/devops/deploy').SetSecretInput},optional:Parameters<typeof portable.runSetSecret>[1]={}) {return portable.runSetSecret({...required,deps:bindDeployOpsRuntime(required.deps)},optional);}
export function runUnsetSecret(required:{deps:DeployOpsToolDeps;input:import('@jini-ai/devops/deploy').UnsetSecretInput},optional:Parameters<typeof portable.runUnsetSecret>[1]={}) {return portable.runUnsetSecret({...required,deps:bindDeployOpsRuntime(required.deps)},optional);}
