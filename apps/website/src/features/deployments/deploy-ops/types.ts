/** Generic deployment observation and deploy contract; vendor code belongs to trusted plugins.
 *  The contract lives in `@jini-ai/devops/deploy`; this path keeps the host's existing imports. */
export type {
  DeployOpsState, DeployOpsStatus, DeployOpsLogs, DeployOpsTargets, DeployOpsInput, DeployOpsResponse,
  DeployOpsSendRequest, DeployOpsDeployInput, DeployOpsDeployResult, DeployOpsSecretInfo, DeployOpsSecretList,
  DeployOpsSecretAppliesOn, DeployOpsSecretCapabilities, DeployOpsSecretRead, DeployOpsSecretWrite,
  DeployOpsContext, DeployOpsModule, DeployOpsDescriptor, LoadedDeployOps, DeployOpsRegistry, DeployOpsWaitResult,
} from "@jini-ai/devops/deploy";
