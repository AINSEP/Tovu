import { createHash } from 'node:crypto';
import { ToolInputError } from '@jini-ai/core';
import { createDeployHostKit } from '../deploy-targets/host-kit.js';
import type { DeployTargetInspection, FormDestinationForm } from '../deploy-targets/types.js';
import { planStaticPublish, type StaticPublishDeps } from './adapter.js';
import { toDeployTargetCredential } from './credentials.js';
import type { StaticPublishConfig } from './types.js';

export interface StaticPublishInspectionInput {
  readonly workspaceId: string;
  readonly config: StaticPublishConfig;
  readonly projectName: string;
  readonly credentialId?: string;
}
export interface StaticPublishInspection {
  readonly inspection?: DeployTargetInspection;
  readonly credentialId?: string;
  /** Internal binding only; never returned to a model or browser. */
  readonly credentialBinding?: string;
}

/** Provider inspection is an explicit authenticated READ, unlike the local readiness check.
 * Reuses the exact workspace/worksFor-aware credential resolver used by execution. Secrets remain
 * server-side; providers without inspection retain their existing non-decrypting preview behavior.
 * @complexity One registry/credential read plus the plugin's bounded inventory reads. */
export async function inspectStaticPublish({ deps, input }: { deps: StaticPublishDeps; input: StaticPublishInspectionInput }, _options = {}): Promise<StaticPublishInspection> {
  const registry = await deps.loadDeployTargets(input.workspaceId);
  const plan = planStaticPublish(registry, input.config);
  if (!plan.ok) throw new ToolInputError({ message: plan.message });
  if (!plan.target.module.preview) return {};
  // Callers without a project label (the admin Static Site card) keep the local-only preview they
  // had before provider inspection existed; only a domain review cannot be answered without one.
  if (!input.projectName.trim()) {
    if (!input.config.customDomain) return {};
    throw new ToolInputError({ message: 'PROJECT_NAME_REQUIRED: A custom-domain preview needs projectName. Pass the same project name to preview and execute.' });
  }
  const resolved = await resolveInspectionCredential({ deps, input });
  if (!resolved.ok) throw new ToolInputError({ message: `NO_CREDENTIALS_CONFIGURED: ${resolved.reason}` });
  const credential = toDeployTargetCredential(resolved);
  const formDestination = await previewFormDestination({ deps, workspaceId: input.workspaceId });
  try {
    const inspection = await plan.target.module.preview({ credential, config: input.config, projectName: input.projectName,
      kit: deps.hostKit ?? createDeployHostKit({ observability: deps.observability }), ...formDestination });
    return { inspection, credentialId: resolved.credentialId,
      credentialBinding: createHash('sha256').update(JSON.stringify(credential)).digest('hex') };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Provider inspection failed. Check the connection and preview again.';
    throw new ToolInputError({ message: message.replaceAll(resolved.token, '[REDACTED]') });
  }
}

/** The site's active forms for a preview, or nothing. Forms only: the receiver key is never read
 * or created by a preview. @complexity One forms read when the port is wired. */
async function previewFormDestination({ deps, workspaceId }: { deps: StaticPublishDeps; workspaceId: string }, _options = {}): Promise<{ formDestination?: { forms: readonly FormDestinationForm[] } }> {
  const forms = deps.formDestination ? await deps.formDestination.listForms({ workspaceId }) : [];
  return forms.length ? { formDestination: { forms } } : {};
}

async function resolveInspectionCredential({ deps, input }: { deps: StaticPublishDeps; input: StaticPublishInspectionInput }, _options = {}) {
  try {
    return await deps.credentialSource.resolve({ workspaceId: input.workspaceId, target: input.config.target,
      ...(input.credentialId !== undefined ? { credentialId: input.credentialId } : {}) });
  } catch {
    throw new ToolInputError({ message: 'CREDENTIAL_RESOLUTION_FAILED: The saved connection could not be opened. Reopen the secure connection form and select or repair it before previewing again.' });
  }
}
