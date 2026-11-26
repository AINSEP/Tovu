import { domainPublishTool as domainWithPorts } from '@jini-ai/devops/deploy/site/static-publish/domain-publish-tool';
import type { StaticPublishToolDeps } from '../publish-tool-deps.js';
import { publishToolPorts } from '../publish-agent-tools.js';

export function domainPublishTool(required: Omit<Parameters<typeof domainWithPorts>[0], 'deps'> & { deps: StaticPublishToolDeps }, _options = {}) {
  return domainWithPorts({ ...required, deps: { ...required.deps, ...publishToolPorts, get env() { return process.env; } } });
}
