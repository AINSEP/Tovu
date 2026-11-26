import { createPublishJobStore } from '@jini-ai/devops/deploy';
import type { StaticPublishOutcome } from '@jini-ai/devops/deploy/site/static-publish/types';
import { getPublishRunSnapshot as snapshotWithPorts, getPublishJobSnapshot as jobWithPorts,
  startPublishRun as startWithPorts } from '@jini-ai/devops/deploy/site/static-publish/publish-run';
import { staticPublishPorts, type StaticPublishDeps } from './adapter.js';

export const publishJobs = createPublishJobStore<StaticPublishOutcome>({});

export function getPublishRunSnapshot() {
  return snapshotWithPorts({ publishJobs });
}
export function getPublishJobSnapshot(required: Omit<Parameters<typeof jobWithPorts>[0], 'deps'>, _options = {}) {
  return jobWithPorts({ ...required, deps: { publishJobs } });
}
export function startPublishRun(required: Omit<Parameters<typeof startWithPorts>[0], 'deps'> & { deps: StaticPublishDeps },
  optional: Parameters<typeof startWithPorts>[1] = {}) {
  return startWithPorts({ ...required, deps: { ...required.deps, ...staticPublishPorts } }, optional);
}
