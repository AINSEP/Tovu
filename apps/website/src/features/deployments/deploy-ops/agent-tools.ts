import { getDeployOpsAgentToolCatalog as getWithPorts, type BundledDescriptorReader } from '@jini-ai/devops/deploy/site/deploy-ops/agent-tools';
import { MAX_WAIT_SECONDS, type DeployOpsRegistry } from '@jini-ai/devops/deploy';
import { bundledAgentPluginsDir } from '#src/platform/site-dir/index';
import { readBundledDeployOpsDescriptors } from './registry.js';

export const getDeployOpsAgentToolCatalog = (registry?: DeployOpsRegistry, optional: { readBundledDescriptors?: BundledDescriptorReader } = {}) =>
  getWithPorts({ registry, get sourceRoot() { return bundledAgentPluginsDir(); },
    get readBundledDescriptors() { return optional.readBundledDescriptors ?? readBundledDeployOpsDescriptors; },
    maxWaitSeconds: MAX_WAIT_SECONDS, readPermission: 'custom-credentials.read', writePermission: 'custom-credentials.write',
    secretNameDescription: 'Secret (environment variable) name, e.g. TOVU_SITE_KEY.',
    unsetSecretDescription: 'Remove a secret (environment variable) from a hosted app. Always asks the human to confirm on a card first; a name that is not set is reported, not removed. If the provider cannot list the secret with a digest or update timestamp, remove it in the provider console; Tovu has no admin screen for this operation. Returns platform, target, name, removed, appliesOn, supportsStaging, deployNeeded, optional version and summary; a declined card returns removed:false with cancelled/reason/note. When deployNeeded is true the running app keeps the variable until deployment_ops_deploy runs.',
  });

export const deployOpsAgentToolCatalog = getDeployOpsAgentToolCatalog();
