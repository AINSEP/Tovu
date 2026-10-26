import { ToolInputError, type ToolHandler } from '@jini-ai/core';
import { nowIso } from '@jini-ai/core/primitives';
import { requireToolPermission, adaptLegacyAuthorize } from '@jini-ai/cms/core';
import type { AssistantSurfaceDeps } from '@jini-ai/daemon/surface-exchanges';
import { humanConfirmedToolHandler } from '#src/contracts/core/human-confirm';
import { plan, confirm, execute, PlanStaleError, ForbiddenError, type GatedMutationHooks, type GatewayDeps } from '#src/contracts/core/gated-mutations/gateway';
import { TokenExpiredError, TokenAlreadyRedeemedError } from '#src/contracts/core/gated-mutations/token';
import { planHashOf, resolveActorClassIdentity } from '#src/contracts/core/gated-mutations/composition';
import type { StaticPublishToolDeps } from '../publish-agent-tools.js';
import type { StaticPublishConfig, StaticPublishOutcome, PublishCredentialSource } from './types.js';
import { inspectStaticPublish, type StaticPublishInspection } from './inspection.js';
import { getPublishRunSnapshot, runPublishAndAwait } from './publish-run.js';
import { domainPublishRows } from './domain-publish-rows.js';
import type { PublishHistoryStore } from './publish-history.js';

interface DomainPublishDetails extends StaticPublishInspection {
  readonly workspaceId: string;
  readonly actorId: string;
  readonly config: StaticPublishConfig;
  readonly projectName: string;
}

/** CMS wiring only: the existing gateway owns authorization/token/hash/single-use semantics;
 * the existing human exchange owns consent. Nothing in a model request can create this capability.
 * No new approval store, domain ledger, journal or automatic rollback is introduced. */
export function domainPublishTool(required: {
  deps: StaticPublishToolDeps;
  surfaces: AssistantSurfaceDeps;
  credentialSource: PublishCredentialSource;
  historyStore: PublishHistoryStore;
  config: StaticPublishConfig;
  projectName: string;
  credentialId?: string;
}, _options = {}): ToolHandler {
  const { deps, surfaces, config, projectName } = required;
  const gateway = deps.gatedMutations?.gatewayDeps;
  if (!gateway) throw new ToolInputError({ message: 'DOMAIN_APPROVAL_UNAVAILABLE: The shared mutation gateway is not configured. Contact the installation owner; no domain changes were made.' });
  return humanConfirmedToolHandler(surfaces, {
    flag: 'published',
    prepare: async ctx => {
      const hooks = makeHooks({ ...required, gateway, actorId: ctx.principal.id, signal: ctx.signal });
      const planned = await plan({ deps: gateway, principalId: ctx.principal.id, principalKind: 'agent', hooks });
      const details = planned.details as DomainPublishDetails;
      return { hooks, planned, details };
    },
    dialog: ({ details }) => ({
      toolId: 'deployment_execute_static_publish', errorCode: 'DOMAIN_PUBLISH', title: 'Publish and change these domain bindings?',
      details: domainPublishRows({ inspection: details.inspection!, projectName, target: config.target }),
      warning: 'The listed records, bindings and whole overlapping routes will be changed. This can interrupt the existing site and other hosts covered by wildcard routes. Mail, TXT and CAA stay unchanged. There is no automatic rollback. Cancel to keep everything as it is.',
      danger: true, confirmLabel: 'Publish and apply these changes',
    }),
    run: async (ctx, { hooks, planned }, confirmer) => {
      const token = await confirm({ deps: gateway, principalId: confirmer.id, principalKind: confirmer.kind, hooks, planId: planned.planId, planHash: planned.planHash });
      const result = await executeDomainPublish({ gateway, principalId: ctx.principal.id, hooks, confirmationToken: token.confirmationToken });
      if (!result.ok) return { published: false, ...result };
      return { published: true, reachable: result.ok === true, target: result.targetId, url: result.url, status: result.status,
        ...(result.ok === 'partial' ? { message: result.message } : {}), deploymentId: result.deploymentId, providerMetadata: result.providerMetadata };
    },
  });
}

/** Preserve typed gateway refusals through the tool transport's caller-safe error channel. */
async function executeDomainPublish(required: {
  gateway: GatewayDeps; principalId: string; hooks: GatedMutationHooks<DomainPublishDetails, StaticPublishOutcome>; confirmationToken: string;
}, _options = {}): Promise<StaticPublishOutcome> {
  try { return await execute({ deps: required.gateway, principalId: required.principalId, principalKind: 'agent', hooks: required.hooks, confirmationToken: required.confirmationToken }); }
  catch (error) {
    if (error instanceof PlanStaleError) throw new ToolInputError({ message: 'DOMAIN_PLAN_STALE: Infrastructure or the connection changed after review. Preview and confirm the current state; no publish or domain changes were started.' });
    if (error instanceof TokenExpiredError) throw new ToolInputError({ message: 'DOMAIN_APPROVAL_EXPIRED: The domain approval expired. Preview and confirm again.' });
    if (error instanceof TokenAlreadyRedeemedError) throw new ToolInputError({ message: 'DOMAIN_APPROVAL_ALREADY_USED: This approval was already used. Inspect the last publish and preview again.' });
    if (error instanceof ForbiddenError) throw new ToolInputError({ message: 'DOMAIN_APPROVAL_FORBIDDEN: Permission or the approving person changed. Ask the installation owner to restore access, then preview again.' });
    throw error;
  }
}

function makeHooks(required: {
  deps: StaticPublishToolDeps; gateway: GatewayDeps; surfaces: AssistantSurfaceDeps;
  credentialSource: PublishCredentialSource; historyStore: PublishHistoryStore;
  config: StaticPublishConfig; projectName: string; credentialId?: string; actorId: string; signal: AbortSignal;
}, _options = {}): GatedMutationHooks<DomainPublishDetails, StaticPublishOutcome> {
  const { deps, credentialSource, historyStore, config, projectName, actorId, signal } = required;
  const expiresAt = Date.parse(nowIso({ clock: deps.clock })) + 600_000;
  return {
    domain: 'deployment.static-publish-domain', scopeId: deps.workspaceId, readPermission: 'deployments.read', mutatePermission: 'deployments.publish',
    resolveActorClassIdentity,
    computePlan: async () => {
      const inspected = await inspectStaticPublish({ deps: { credentialSource, loadDeployTargets: deps.loadDeployTargets, tracker: deps.tracker, observability: deps.observability, hostKit: deps.hostKit, formDestination: deps.formDestination },
        input: { workspaceId: deps.workspaceId, config, projectName, ...(required.credentialId ? { credentialId: required.credentialId } : {}) } });
      if (inspected.inspection?.domains?.inventoryStatus !== 'complete') throw new ToolInputError({ message: `DOMAIN_INVENTORY_UNKNOWN: ${inspected.inspection?.domains?.message ?? 'Complete authenticated domain inspection is required. Preview again.'}` });
      const details = { ...inspected, workspaceId: deps.workspaceId, actorId, config, projectName };
      return { details, planHash: inspectionPlanHash({ details }) };
    },
    executeMutation: async ({ details }) => {
      signal.throwIfAborted();
      if (getPublishRunSnapshot().status === 'running') throw new ToolInputError({ message: 'ALREADY_RUNNING: A publish is running. Wait for it to finish, then preview again.' });
      const domainPlan = details.inspection!.domains!;
      return runPublishAndAwait({ credentialSource, loadDeployTargets: deps.loadDeployTargets, tracker: deps.tracker, observability: deps.observability, hostKit: deps.hostKit, formDestination: deps.formDestination }, {
        workspaceId: deps.workspaceId, publishOutputRootDir: deps.publishOutputRootDir, idGen: deps.idGen, exportSiteBound: deps.exportSiteBound,
        config, projectName, ...(details.credentialId ? { credentialId: details.credentialId } : {}),
        domainApproval: { plan: domainPlan, credentialBinding: details.credentialBinding!, authorize: async ({ fingerprint }) => {
          signal.throwIfAborted();
          await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize }), workspaceId: deps.workspaceId, principalId: actorId, permission: 'deployments.publish' });
          return fingerprint === domainPlan.fingerprint && Date.parse(nowIso({ clock: deps.clock })) <= expiresAt;
        } },
      }, { nowIso: () => nowIso({ clock: deps.clock }) }, historyStore);
    },
  };
}

/** The plugin fingerprint binds exact inventory and operations canonically. Preserve that contract:
 * response ordering alone must not invalidate a human's consent at the shared gateway. */
function inspectionPlanHash({ details }: { details: DomainPublishDetails }, _options = {}): string {
  const inspected = details.inspection!;
  return planHashOf({ ...details, inspection: { resourceName: inspected.resourceName, targetId: inspected.targetId,
    hostingChanges: inspected.hostingChanges, domainFingerprint: inspected.domains!.fingerprint } });
}
