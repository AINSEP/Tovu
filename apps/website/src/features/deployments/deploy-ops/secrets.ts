import { bindDeployOpsRuntime, type DeployOpsToolDeps } from './run-ops.js';
import * as portable from '@jini-ai/devops/deploy';
export type { SecretValueSource, SecretTargetInput, SetSecretInput, UnsetSecretInput, SecretComparison, SecretConfirmRequest, SecretNotConfirmed, SecretConfirm, SetSecretResult, UnsetSecretResult } from '@jini-ai/devops/deploy';
export { SECRET_NAME_PATTERN } from '@jini-ai/devops/deploy';
export { secretFingerprint, readDeploySiteKey } from './run-ops.js';
export function runListSecrets(required:{deps:DeployOpsToolDeps;input:import('@jini-ai/devops/deploy').SecretTargetInput},optional:Parameters<typeof portable.runListSecrets>[1]={}) {return portable.runListSecrets({...required,deps:bindDeployOpsRuntime(required.deps)},optional);}
export function runSetSecret(required:{deps:DeployOpsToolDeps;input:import('@jini-ai/devops/deploy').SetSecretInput},optional:Parameters<typeof portable.runSetSecret>[1]={}) {return portable.runSetSecret({...required,deps:bindDeployOpsRuntime(required.deps)},optional);}
export function runUnsetSecret(required:{deps:DeployOpsToolDeps;input:import('@jini-ai/devops/deploy').UnsetSecretInput},optional:Parameters<typeof portable.runUnsetSecret>[1]={}) {return portable.runUnsetSecret({...required,deps:bindDeployOpsRuntime(required.deps)},optional);}
