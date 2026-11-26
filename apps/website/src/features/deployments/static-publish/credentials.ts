import { createEnvPublishCredentialSource as envWithPorts, createDbPublishCredentialSource as dbWithPorts,
  composePublishCredentialSource as composeWithPorts, type DbPublishCredentialSourceDeps as JiniDbDeps,
  type ComposePublishCredentialSourceInput as JiniComposeInput } from '@jini-ai/devops/deploy/site/static-publish/credentials';
import { describeCredential, hasDefaultForPublish, resolveDefaultForPublish, resolveForPublish } from '../publish-credentials/store.js';

export type DbPublishCredentialSourceDeps = Pick<JiniDbDeps, 'repo' | 'sealer' | 'loadDeployTargets'>;
export type ComposePublishCredentialSourceInput = Omit<JiniComposeInput, 'dbDeps' | 'env'> & { dbDeps: DbPublishCredentialSourceDeps; env?: NodeJS.ProcessEnv };

export function createEnvPublishCredentialSource(required: Omit<Parameters<typeof envWithPorts>[0], 'env'>,
  { env = process.env }: { env?: NodeJS.ProcessEnv } = {}) {
  return envWithPorts({ ...required, env });
}

export function createDbPublishCredentialSource(deps: DbPublishCredentialSourceDeps) {
  return dbWithPorts({ get repo() { return deps.repo; }, get sealer() { return deps.sealer; }, get loadDeployTargets() { return deps.loadDeployTargets; },
    describeCredential, hasDefaultForPublish, resolveForPublish, resolveDefaultForPublish });
}

export function composePublishCredentialSource(input: ComposePublishCredentialSourceInput) {
  return composeWithPorts({ workspaceId: input.workspaceId, executionMode: input.executionMode,
    dbDeps: { get repo() { return input.dbDeps.repo; }, get sealer() { return input.dbDeps.sealer; }, get loadDeployTargets() { return input.dbDeps.loadDeployTargets; },
      describeCredential, hasDefaultForPublish, resolveForPublish, resolveDefaultForPublish },
    get env() { return input.env ?? process.env; },
  });
}
