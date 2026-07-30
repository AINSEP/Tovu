/**
 * @file Identity's half of ADR-049 Decision 4 (ADR-021): maps `agent-tools.ts`'s ten catalog
 * entries onto the users/roles transitions `grant-service.ts`/`admin-crud-service.ts` export, plus
 * the two repo-backed reads, as `ToolRegistration`s.
 *
 * `ToolPolicy.authorize` is a pass-through for all ten (see `buildDomainRegistrations`) for the
 * ADR-021 §2 "one evaluator" reason: the gate is the domain layer's, reached identically by both
 * tool kinds — mutations through their own service function, which opens with the check, and reads
 * through {@link assertIdentityReadAllowed}, which calls the domain's own exported
 * `assertCallerHasAnyPermission` rather than re-deriving an OR gate. A second check here would be a
 * duplicate evaluator, and one any non-tool caller of the same service function would bypass. See
 * `assistant/__tests__/tool-registrations.identity-authorization.test.ts`.
 */
import {
  buildDomainRegistrations,
  indexCatalogById,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "../assistant/tool-registration-kit";
import { identityServiceDepsFrom } from "../server/routes/admin/users/deps";
import type { RouteDeps } from "../server/routes/types";
import { parseIdentityToolInput } from "./agent-tool-input";
import { identityAgentToolCatalog, type AgentToolDefinition as IdentityAgentToolDefinition } from "./agent-tools";
import { assertCallerHasAnyPermission, assignRole, createRole, createUser } from "./grant-service";
import { deleteRole, disablePrincipal, enablePrincipal, updateRole, updateUser } from "./admin-crud-service";
import type { PrincipalRecord, PrincipalRoleRecord, RoleRecord, UserRecord } from "./types";

const CATALOG_BY_ID = indexCatalogById(identityAgentToolCatalog);

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const identityDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> authorize() + repo reads only; no save on any path.
  ["identity_user_list", "none"],
  ["identity_role_list", "none"],
  // -> createUser (grant-service.ts): saves a principal row AND a users row (credential).
  ["identity_user_create", "mutates-durable-state"],
  // -> updateUser (admin-crud-service.ts): users.save, email field only.
  ["identity_user_update_email", "mutates-durable-state"],
  // -> disablePrincipal (admin-crud-service.ts): status flip, guarded by the INV-08 owner floor.
  ["identity_user_disable", "mutates-durable-state"],
  // -> enablePrincipal (admin-crud-service.ts): status flip back to active.
  ["identity_user_enable", "mutates-durable-state"],
  // -> createRole (grant-service.ts): roles.save, always isBuiltin=false.
  ["identity_role_create", "mutates-durable-state"],
  // -> assignRole (grant-service.ts): principalRoles.save behind the INV-07 grant clamp. The one
  //    identity tool that confers permissions, hence the heaviest of these.
  ["identity_role_assign", "mutates-durable-state"],
  // -> updateRole (admin-crud-service.ts): roles.save, refuses built-ins.
  ["identity_role_rename", "mutates-durable-state"],
  // -> deleteRole (admin-crud-service.ts): roles.delete, refuses built-ins and referenced roles.
  ["identity_role_delete", "mutates-durable-state"],
]);

/**
 * Upper bound on the roster `identity_user_list` will fan out over.
 *
 * `routes/admin/users/list.ts` does the same O(n) per-user fan-out uncapped, on the documented
 * "operator-managed roster, not member/content scale" assumption. That assumption is fine for a
 * human screen and NOT fine here for a different reason than scale: this result is spent as model
 * context, so an unexpectedly large roster would silently consume the run's context window. The
 * cap truncates and SAYS SO in the payload rather than failing, so a caller that hits it can still
 * work with what it got and knows not to treat the list as complete.
 */
const IDENTITY_USER_LIST_MAX = 200;

function requireIdentityCatalogEntry(toolId: string): IdentityAgentToolDefinition {
  const entry = CATALOG_BY_ID.get(toolId);
  if (!entry) throw new Error(`identity/tool-registrations.ts: catalog has no entry named '${toolId}' — identity/agent-tools.ts drifted`);
  return entry;
}

/**
 * Validates `input` through the tool's OWN published `inputSchema` (interpreted by
 * `agent-tool-input.ts`), then re-throws any rejection with that schema appended.
 *
 * Identity is the one domain whose published schema is ALSO the enforcing parser, so this does not
 * use the kit's `withSchemaOnRejection`: there is no domain call to wrap, the rejection is produced
 * here. Same error-recovery contract either way — a model that gets back only "'roleId' is
 * required" must guess the rest of the shape, whereas one that gets the schema with it can correct
 * the call in a single turn.
 *
 * @complexity O(p) in the tool's declared property count.
 * @overallScore 100
 */
function identityInput(toolId: string, input: unknown): Readonly<Record<string, string>> {
  const entry = requireIdentityCatalogEntry(toolId);
  const parsed = parseIdentityToolInput({ schema: entry.inputSchema, input });
  if (parsed.ok) return parsed.value;
  const recovery = "Fix the input and retry — this will not resolve on retry without an input change.";
  throw new Error(`${parsed.error.message}. ${recovery} Schema for '${toolId}': ${JSON.stringify(entry.inputSchema)}`);
}

/** The permission set a tool's catalog entry declares — both halves when the gate is an OR. */
function identityPermissionsFor(toolId: string): string[] {
  const { authorization } = requireIdentityCatalogEntry(toolId);
  return authorization.orPermission ? [authorization.permission, authorization.orPermission] : [authorization.permission];
}

/**
 * The gate for the two READ tools.
 *
 * The mutating tools need no equivalent: their domain function opens with this same
 * `assertCallerHasAnyPermission` call itself. Reads have no service-layer function to inherit it
 * from — `identity` exports grant-writing transitions, not read wrappers, which is why
 * `routes/admin/users/list.ts` also gates in the route and then reads the repo ports directly.
 * This calls the domain's own exported helper rather than re-deriving an OR gate (and rather than
 * the kit's generic `requireToolPermission`, which cannot express an OR), so ADR-021 §2's single
 * evaluator is reached by an identical path from both tool kinds.
 */
async function assertIdentityReadAllowed(routeDeps: RouteDeps, toolId: string, callerPrincipalId: string): Promise<void> {
  await assertCallerHasAnyPermission({
    deps: identityServiceDepsFrom(routeDeps),
    workspaceId: routeDeps.workspaceId,
    callerPrincipalId,
    permissions: identityPermissionsFor(toolId),
  });
}

/** What an identity user tool returns to the model — see {@link toIdentityUserView}. */
interface IdentityUserToolView {
  principalId: string;
  username: string;
  status: PrincipalRecord["status"];
  roleIds: string[];
  email?: string;
}

/**
 * Projects a principal + its credential row into the explicit model-facing shape.
 *
 * The load-bearing omission is `UserRecord.passwordHash`: INV-05 keeps hashed secrets server-side,
 * and this view has no field for one, so there is nothing to forward by accident even if a future
 * `UserRecord` field is added. `workspaceId` is dropped for the same reason content-types'
 * `toContentTypeView` drops it — the agent is scoped to one workspace it cannot change, so echoing
 * the id spends model attention on a value that can never inform a decision.
 *
 * @param record.roleIds - The principal's role assignments, passed in rather than resolved here so
 * the projection stays pure and the caller decides whether the extra repo read is worth it.
 * @returns The model-facing view. `email` is present only when set, so a user without one carries
 * no always-undefined key.
 * @complexity O(r) in the role count (the array is copied so the caller cannot alias domain state).
 * @overallScore 100
 */
function toIdentityUserView(record: { principal: PrincipalRecord; user: UserRecord; roleIds: readonly string[] }): IdentityUserToolView {
  const view: IdentityUserToolView = {
    principalId: record.principal.id,
    username: record.user.username,
    status: record.principal.status,
    roleIds: [...record.roleIds],
  };
  if (record.user.email) view.email = record.user.email;
  return view;
}

/** What an identity role tool returns to the model. `isBuiltin` is kept because it is what predicts a rename/delete refusal. */
function toIdentityRoleView(role: RoleRecord): { id: string; name: string; isBuiltin: boolean } {
  return { id: role.id, name: role.name, isBuiltin: role.isBuiltin };
}

/** Read a principal's role-assignment ids. Shared by every tool that returns a user view. */
async function roleIdsFor(routeDeps: RouteDeps, principalId: string): Promise<string[]> {
  const links = await routeDeps.principalRoleRepo.listByPrincipalId({ workspaceId: routeDeps.workspaceId, principalId });
  return links.map((link) => link.roleId);
}

/**
 * Load the `UserRecord` paired with a principal the domain just returned.
 *
 * Every `kind='user'` principal has one by construction (CREATE_USER's atomicity guarantee), so
 * the miss is defensive rather than an expected path — the same reasoning `routes/admin/users/
 * disable.ts` records for its identical second lookup.
 */
async function requireUserRecord(routeDeps: RouteDeps, principalId: string): Promise<UserRecord> {
  const user = await routeDeps.userRepo.findByPrincipalId({ workspaceId: routeDeps.workspaceId, principalId });
  if (!user) throw new Error(`user '${principalId}' was not found`);
  return user;
}

export function buildIdentityRegistrations(routeDeps: RouteDeps): ToolRegistration[] {
  /** Assembled per call, not per handler, because every mutating handler needs the identical bag. */
  const serviceDeps = () => identityServiceDepsFrom(routeDeps);

  const handlers: Record<string, ToolHandler> = {
    identity_user_list: async (ctx) => {
      identityInput("identity_user_list", ctx.input);
      await assertIdentityReadAllowed(routeDeps, "identity_user_list", ctx.principal.id);

      const principals = await routeDeps.principalRepo.list({ workspaceId: routeDeps.workspaceId });
      // Humans only — `system`/`agent`/`api_key` principals (including the disabled `user-local`
      // seed row) are not what "users" means on this surface, matching `routes/.../list.ts`.
      const humans = principals.filter((principal) => principal.kind === "user");
      const page = humans.slice(0, IDENTITY_USER_LIST_MAX);

      const users = await Promise.all(
        page.map(async (principal) => {
          const user = await routeDeps.userRepo.findByPrincipalId({ workspaceId: routeDeps.workspaceId, principalId: principal.id });
          if (!user) return null;
          return toIdentityUserView({ principal, user, roleIds: await roleIdsFor(routeDeps, principal.id) });
        }),
      );

      const listed = users.filter((user): user is IdentityUserToolView => user !== null);
      return humans.length > page.length
        ? { users: listed, truncated: true, totalCount: humans.length }
        : { users: listed };
    },

    identity_role_list: async (ctx) => {
      identityInput("identity_role_list", ctx.input);
      await assertIdentityReadAllowed(routeDeps, "identity_role_list", ctx.principal.id);

      const roles = await routeDeps.roleRepo.list({ workspaceId: routeDeps.workspaceId });
      return { roles: roles.map(toIdentityRoleView) };
    },

    identity_user_create: async (ctx) => {
      const input = identityInput("identity_user_create", ctx.input);
      const { principal, user } = await createUser({
        deps: serviceDeps(),
        input: {
          workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id,
          username: input.username,
          email: input.email,
          password: input.password,
        },
      });
      // A brand-new principal has no assignments yet, so this is [] by construction, not a read.
      return { user: toIdentityUserView({ principal, user, roleIds: [] }) };
    },

    identity_user_update_email: async (ctx) => {
      const input = identityInput("identity_user_update_email", ctx.input);
      const { user } = await updateUser({
        deps: serviceDeps(),
        input: {
          workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id,
          principalId: input.principalId,
          // Absent stays absent: `updateUser` treats a falsy email as "clear", which is exactly
          // what this tool's description tells the model omitting it does.
          email: input.email,
        },
      });
      const principal = await routeDeps.principalRepo.findById({ workspaceId: routeDeps.workspaceId, id: input.principalId });
      if (!principal) throw new Error(`principal '${input.principalId}' was not found`);
      return { user: toIdentityUserView({ principal, user, roleIds: await roleIdsFor(routeDeps, principal.id) }) };
    },

    identity_user_disable: async (ctx) => {
      const input = identityInput("identity_user_disable", ctx.input);
      const { principal } = await disablePrincipal({
        deps: serviceDeps(),
        input: {
          workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id,
          principalId: input.principalId,
          // Resolved by the caller, per `disablePrincipal`'s own contract — the same
          // `await deps.ownerPrincipalId` the human disable route performs.
          seededOwnerPrincipalId: await routeDeps.ownerPrincipalId,
        },
      });
      const user = await requireUserRecord(routeDeps, principal.id);
      return { user: toIdentityUserView({ principal, user, roleIds: await roleIdsFor(routeDeps, principal.id) }) };
    },

    identity_user_enable: async (ctx) => {
      const input = identityInput("identity_user_enable", ctx.input);
      const { principal } = await enablePrincipal({
        deps: serviceDeps(),
        input: { workspaceId: routeDeps.workspaceId, callerPrincipalId: ctx.principal.id, principalId: input.principalId },
      });
      const user = await requireUserRecord(routeDeps, principal.id);
      return { user: toIdentityUserView({ principal, user, roleIds: await roleIdsFor(routeDeps, principal.id) }) };
    },

    identity_role_create: async (ctx) => {
      const input = identityInput("identity_role_create", ctx.input);
      const { role } = await createRole({
        deps: serviceDeps(),
        input: { workspaceId: routeDeps.workspaceId, callerPrincipalId: ctx.principal.id, name: input.name },
      });
      return { role: toIdentityRoleView(role) };
    },

    identity_role_assign: async (ctx) => {
      const input = identityInput("identity_role_assign", ctx.input);
      const { assignment }: { assignment: PrincipalRoleRecord } = await assignRole({
        deps: serviceDeps(),
        input: {
          workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id,
          principalId: input.principalId,
          roleId: input.roleId,
        },
      });
      // The join row's own id is not addressable by any other tool, so it is dropped; what the
      // model needs back is confirmation of WHICH pair is now linked.
      return { assigned: { principalId: assignment.principalId, roleId: assignment.roleId } };
    },

    identity_role_rename: async (ctx) => {
      const input = identityInput("identity_role_rename", ctx.input);
      const { role } = await updateRole({
        deps: serviceDeps(),
        input: { workspaceId: routeDeps.workspaceId, callerPrincipalId: ctx.principal.id, roleId: input.roleId, name: input.name },
      });
      return { role: toIdentityRoleView(role) };
    },

    identity_role_delete: async (ctx) => {
      const input = identityInput("identity_role_delete", ctx.input);
      await deleteRole({
        deps: serviceDeps(),
        input: { workspaceId: routeDeps.workspaceId, callerPrincipalId: ctx.principal.id, roleId: input.roleId },
      });
      // `deleteRole` resolves void; an empty tool result would read to the model as "nothing
      // happened", so the deleted id is echoed as the acknowledgement.
      return { deleted: { roleId: input.roleId } };
    },
  };

  // No `unwiredToolIds`: identity wires its ENTIRE catalog (which is why its own
  // `AgentToolDefinition` makes `inputSchema` required rather than optional).
  return buildDomainRegistrations({
    domain: "identity",
    catalogModule: "identity/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: identityDerivedRisk,
  });
}
