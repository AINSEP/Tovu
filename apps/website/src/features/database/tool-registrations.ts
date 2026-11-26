import { buildDatabaseRegistrations as buildWithPorts, databaseDerivedRisk } from '@jini-ai/db/site/tool-registrations';
import type { Clock } from '@jini-ai/core/primitives';
import type { ToolRegistration, ToolContributor } from '@jini-ai/core';
import type { AuthorizeFn, MutationActor } from '@jini-ai/core/contracts/events';
import type { RestorePointListPort, RestorePointSavePort, LedgerReadPort } from '@jini-ai/db/tools';
import type { LedgerAppendPort } from '@jini-ai/db/recovery/migrate-forward-hooks';
import type { DbOpsPort } from '@jini-ai/core/contracts/site/gated-mutations-ports';
import type { DatabaseIntrospectionPort } from '@jini-ai/core/contracts/site/database-introspection';
import { confirm as gatewayConfirm, execute as gatewayExecute, plan as gatewayPlan, type GatewayDeps } from '../../contracts/core/gated-mutations/gateway.js';
import { acquireOperationLock, releaseOperationLock } from '../../contracts/core/operation-lock.js';
import { humanConfirmedToolHandler } from '#src/contracts/core/human-confirm';
import { refuseUnexpectedKeysPort as refuseUnexpectedKeys } from '@jini-ai/core';
import { adaptLegacyAuthorize } from '@jini-ai/cms/core';
import { createSurfaceExchangeStore } from '@jini-ai/daemon/surface-exchanges';
import type { AssistantSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import { createSystemClock, createRandomUuidGenerator } from '@jini-ai/platform/system';
import { createTimeoutScheduler } from '@jini-ai/daemon/scheduler';
import { buildMigrateForwardHooks } from './gated-hooks.js';
import { getDatabaseAgentToolCatalog } from './agent-tools.js';
import { TOVU_DATABASE_MESSAGES } from './db-messages.js';

export interface DatabaseToolDeps {
  authorize: AuthorizeFn;
  workspaceId: string;
  clock: Clock;
  idGen: { newId(): string };
  databaseLedgerRepo: LedgerReadPort & LedgerAppendPort;
  restorePointsRepo: RestorePointListPort & RestorePointSavePort;
  databaseIntrospection: DatabaseIntrospectionPort;
  dbOps: DbOpsPort;
  gatedMutations: { gatewayDeps: GatewayDeps };
}

type DatabaseMutationActorBinding = (required: { readonly principalId: string }, optional?: Record<string, never>) => MutationActor;

/** The migrate card's copy. The `dialog:` arrow below names MIGRATE_TOOL_ID inline: the MCP-UI allowlist
 * completeness scan resolves an exchange's tool id only from an inline dialog spec, never through a call. */
const MIGRATE_FORWARD_DIALOG_COPY = {
  errorCode: "DATABASE",
  title: "Update the database?",
  description: "Moves this site's database forward to the current schema. It affects the whole site.",
  details: [{ label: "Restore point", value: "Taken first" }],
  warning: "A restore point is taken first, so you can go back to how things are now.",
  danger: true,
  confirmLabel: "Update database",
};
export function buildDatabaseRegistrations(
  routeDeps: DatabaseToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
  { mutationActor }: { readonly mutationActor: DatabaseMutationActorBinding },
): ToolRegistration[] {
  return buildWithPorts({ ...routeDeps, surfaces, mutationActor,
    catalog: getDatabaseAgentToolCatalog(), messages: TOVU_DATABASE_MESSAGES, migrateForwardDialog: MIGRATE_FORWARD_DIALOG_COPY,
    gatewayPlan, gatewayConfirm, gatewayExecute, buildMigrateForwardHooks,
    operationLock: { acquireOperationLock, releaseOperationLock }, adaptLegacyAuthorize, refuseUnexpectedKeys, humanConfirmedToolHandler,
  });
}

export function contributeDatabaseTools({ mutationActor }: { mutationActor: DatabaseMutationActorBinding }, _optional = {}): ToolContributor<DatabaseToolDeps, AssistantSurfaceDeps> {
  return { domain: 'database', build: (deps, surfaces) => buildDatabaseRegistrations(deps, surfaces, { mutationActor }), risk: databaseDerivedRisk };
}
