import { toolMetadata } from '../../contracts/core/tool-metadata/identity.js';
import { withToolMetadata } from '@jini-ai/core';
import { SECRET_FORM_CARD_DEFINITIONS } from "../../contracts/headless/secret-form-cards.js";
import { assertUserAccountAction, SelfDeleteError } from "./delete-user-service.js";
import { IdentityConflictError, OwnerRequiredError } from "@jini-ai/user-management";
/**
 * @file Identity tools built by Jini, with host human-confirmation and password-entry adapters.
 * The host owns SurfaceExchangeStore/tool-calls transport, so it wraps the domain handlers here.
 * identity_role_delete and identity_policy_delete permanently delete and require human approval,
 * consistent with the owner's trash/delete/restore-over-existing/publish policy. Granting a role
 * or attaching a policy is not a delete and does not need that gate.
 * identity_user_create takes the first password through the human dialog, browser -> route ->
 * parked handler, so it never enters model context or chat. The composition root installs tools;
 * importing this feature must not register them or create an assistant runtime cycle.
 */
import type { ToolContributor } from "#src/assistant/index";
import { approvalToolHandler, notConfirmedResult } from "#src/contracts/core/human-confirm";
import {
  askThenReport,
  createSurfaceExchangeStore,
  type AssistantSurfaceDeps,
} from "@jini-ai/daemon/surface-exchanges";
import { buildIdentityRegistrations, identityDerivedRisk, type IdentityToolDeps } from "@jini-ai/user-management/server";
import { assertCallerHasAnyPermission, normalizeUsername, parseIdentityToolInput } from "@jini-ai/user-management/server";
import { ToolInputError, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import type { Clock } from "@jini-ai/core/primitives";
import { defineSecretCardTool } from "@jini-ai/ui/mcp-ui/secret-card";
import { createSystemClock, createRandomUuidGenerator } from "@jini-ai/core/primitives";
import { createTimeoutScheduler } from "@jini-ai/daemon/scheduler";


export { buildIdentityRegistrations, identityDerivedRisk, type IdentityToolDeps };

/** Tovu keeps its ISO clock ABI at this adapter; shared service/rationale live in user-management/server. */
type TovuIdentityToolDeps = Omit<IdentityToolDeps, "clock"> & { clock: Clock | { nowIso(): string } };

const ROLE_DELETE_TOOL_ID = "identity_role_delete";
const POLICY_DELETE_TOOL_ID = "identity_policy_delete";
const USER_CREATE_TOOL_ID = "identity_user_create";

/** Exported for the same reason {@link withoutPassword} is — see its doc comment. */
export const USER_CREATE_DESCRIPTION_SUFFIX =
  " The user types the new user's first password into a form this tool shows; never pass a password, and never ask for one in chat.";

/**
 * Validates `input` against the tool's published schema BEFORE any dialog is drawn, with the same
 * schema-bearing message Jini's own handlers give, so a malformed call never reaches the human.
 */
function validated(toolId: string, schema: unknown, input: unknown): Readonly<Record<string, string>> {
  const parsed = parseIdentityToolInput({ schema: schema as Record<string, unknown>, input });
  if (!parsed.ok) {
    throw new ToolInputError({ message: `${parsed.error.message}. Fix the input and retry — this will not resolve on retry without an input change. ` +
        `Schema for '${toolId}': ${JSON.stringify(schema)}` });
  }
  return parsed.value;
}

/**
 * The model-facing schema for `identity_user_create`: Jini's, minus `password`. Exported so
 * `assistant/__tests__/tool-registrations.contracts.test.ts` can assert the wired registration's
 * published schema against a real derivation of the Jini catalog entry instead of either a second,
 * hand-copied expectation (which could silently drift from this function) or a blind id-based skip
 * (which would stop catching a real regression, e.g. `password` ceasing to be stripped).
 */
export function withoutPassword(schema: unknown): unknown {
  const { properties, required, ...rest } = schema as { properties: Record<string, unknown>; required?: string[] };
  const { password: _password, ...kept } = properties;
  return { ...rest, required: (required ?? []).filter((key) => key !== "password"), properties: kept };
}

/**
 * Jini's identity registrations with `identity_role_delete`/`identity_policy_delete`/
 * `identity_user_create` gated behind the human; every other tool passes through unchanged.
 *
 * @complexity O(n) in the registration count; each gate adds one or two repo reads per call.
 */
export function buildGatedIdentityRegistrations(
  routeDeps: TovuIdentityToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore({ scheduler: createTimeoutScheduler({}), clock: createSystemClock(), idGenerator: createRandomUuidGenerator(), defaultChannel: "mcp-ui" }) },
): ToolRegistration[] {
  /** Each family supplies its own label and service permission; Jini owns the asking sequence.
   * The inner service reauthorizes at write time; the snapshot prevents callback input retargeting. */
  const confirmedDelete = (registration: ToolRegistration, kind: "role" | "policy"): ToolRegistration => ({
    ...registration,
    handler: approvalToolHandler({ surfaces,
      prepare: async ({ ctx }) => {
        const input = validated(registration.descriptor.id, registration.descriptor.inputSchema, ctx.input);
        await assertCallerHasAnyPermission({ deps: identity, workspaceId: routeDeps.workspaceId,
          // Jini owns both role and policy deletion under role.manage.
          callerPrincipalId: ctx.principal.id, permissions: ["role.manage"] });
        const id = input[`${kind}Id`]!;
        const repo = kind === "role" ? routeDeps.roleRepo : routeDeps.policyRepo;
        return { label: (await repo.findById({ workspaceId: routeDeps.workspaceId, id }))?.name ?? `${id} (not found)` };
      },
      describe: ({ prepared: { label } }) => ({
        toolId: registration.descriptor.id, errorCode: "IDENTITY", title: `Delete the ${kind} ${label}?`,
        details: [{ label: kind === "role" ? "Role" : "Policy", value: label }],
        warning: `The ${kind} is deleted for good. This can't be undone.`, danger: true, confirmLabel: `Delete ${kind}`,
      }),
      run: ({ ctx }, options) => registration.handler(ctx, options),
    }, { flag: "deleted" }),
  });

  const createUserWithHumanPassword = (inner: ToolHandler, publishedSchema: unknown): ToolHandler => async (ctx, options = {}) => {
    if (typeof ctx.input === "object" && ctx.input !== null && "password" in ctx.input) {
      throw new ToolInputError({ message: `IDENTITY_PASSWORD_NOT_ACCEPTED: ${USER_CREATE_TOOL_ID}: do not pass a password. The user types the new ` +
          "user's first password into the form this tool shows. Nothing was created." });
    }
    const input = validated(USER_CREATE_TOOL_ID, publishedSchema, ctx.input);
    const username = input["username"]!;
    let failureMessage: string | undefined;
    const card = defineSecretCardTool<Readonly<Record<string, string>>, Record<string, unknown>, Record<string, unknown> | undefined>({
      toolId: USER_CREATE_TOOL_ID,
      prepare: async () => {
        // Use the service's own permission rule before opening; createUser checks it again at save.
        await assertCallerHasAnyPermission({ deps: identity, workspaceId: routeDeps.workspaceId,
          callerPrincipalId: ctx.principal.id, permissions: ["user.manage"] });
        return input;
      },
      form: () => ({
        title: `Create the user ${username}?`,
        description: `A new login named ${username}${input["email"] ? ` (${input["email"]})` : ""} will be created with no roles. Type their first password below.`,
        submitLabel: "Create user",
        fields: [{ kind: "string", name: "password", label: "Password", hint: "Typed here only, never shown to the assistant.", required: true,
          ...SECRET_FORM_CARD_DEFINITIONS.identity_user_create.secretField }],
        cancelLabel: "Cancel", app: { appName: "tovu-identity-user-create", appVersion: "1" },
        preferredFrameSize: ["100%", "360px"],
      }),
      save: async ({ values, prep, signal }) => (await inner({ ...ctx, signal, input: { ...prep, password: values.password } }, options)) as Record<string, unknown>,
      result: ({ run }) => {
        if (run.status === "saved") return { created: true, ...run.saved };
        if (run.status === "blank") return { created: false, cancelled: false, note: "The user submitted no password. Nothing was created." };
        if (run.status === "failed") { failureMessage = run.safeMessage; return undefined; }
        return { created: false, ...notConfirmedResult({ confirmed: false, reason: run.status === "cancelled" ? "declined" : run.status }) };
      },
      outcome: ({ run }) => {
        if (run.status !== "saved" && run.status !== "blank" && run.status !== "failed") return undefined;
        return {
          title: run.status === "saved" ? "User created" : "User not created",
          details: [{ label: "Username", value: username }], state: run.status === "saved" ? "success" : "failure",
          message: run.status === "saved" ? `${username} can now sign in with the password you typed.`
            : run.status === "blank" ? "No password was entered. Nothing was created." : run.safeMessage,
          app: { appName: "tovu-identity-user-create-outcome", appVersion: "1" }, preferredFrameSize: ["100%", "240px"],
        };
      },
    }, {
      uriHost: "tovu",
      text: { noEmitter: `IDENTITY_NO_CONFIRMATION_CHANNEL: ${USER_CREATE_TOOL_ID}: this execution context has no interactive ` +
        "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.", saveFailure: "The user was not created." },
      // Rebuild the known conflict from public input; hasher/repository exceptions can contain the password.
      safeError: error => error instanceof IdentityConflictError ? `username '${normalizeUsername({ raw: username })}' is already in use` : undefined,
    });
    const result = await card.handler({ surfaceExchanges: surfaces.surfaceExchanges, askThenReport })(ctx, options);
    // Preserve the domain's rejection contract after the engine has delivered the safe failure card.
    if (failureMessage !== undefined) throw new ToolInputError({ message: failureMessage });
    return result;
  };

  const hostClock = routeDeps.clock;
  const clock: Clock = "nowMs" in hostClock ? hostClock : { nowMs: () => Date.parse(hostClock.nowIso()) };
  const identity = {
    repos: { transactions: routeDeps.transactions, principals: routeDeps.principalRepo, users: routeDeps.userRepo,
      sessions: routeDeps.sessionRepo, roles: routeDeps.roleRepo, policies: routeDeps.policyRepo,
      policyPermissions: routeDeps.policyPermissionRepo, rolePolicies: routeDeps.rolePolicyRepo,
      principalRoles: routeDeps.principalRoleRepo, principalPolicies: routeDeps.principalPolicyRepo },
    hasher: routeDeps.passwordHasher, clock, idGen: routeDeps.idGen, tokens: routeDeps.tokens,
  };
  return withToolMetadata({ registrations: buildIdentityRegistrations({ ...routeDeps, clock }), metadata: toolMetadata }).map((registration): ToolRegistration => {
    switch (registration.descriptor.id) {
      case "identity_user_disable":
        return { ...registration, handler: async (ctx, options = {}) => {
          const input = validated(registration.descriptor.id, registration.descriptor.inputSchema, ctx.input);
          try {
            return await routeDeps.transactions.run({ workspaceId: routeDeps.workspaceId, execute: async () => {
              await assertUserAccountAction({ deps: identity, workspaceId: routeDeps.workspaceId, principalId: input["principalId"]!, action: "disable" },
                { callerPrincipalId: ctx.principal.id, seededOwnerPrincipalId: await routeDeps.ownerPrincipalId });
              return registration.handler(ctx, options);
            } });
          } catch (error) {
            if (error instanceof SelfDeleteError || error instanceof OwnerRequiredError) {
              const code = error instanceof SelfDeleteError ? "SELF_DELETE" : "OWNER_REQUIRED";
              throw new ToolInputError({ message: `identity_user_disable: ${code}: ${error.message}. Nothing was changed.` });
            }
            throw error;
          }
        } };

      case ROLE_DELETE_TOOL_ID:
        return confirmedDelete(registration, "role");
      case POLICY_DELETE_TOOL_ID:
        return confirmedDelete(registration, "policy");
      case USER_CREATE_TOOL_ID: {
        const inputSchema = withoutPassword(registration.descriptor.inputSchema);
        return {
          ...registration,
          descriptor: {
            ...registration.descriptor,
            description: `${registration.descriptor.description ?? ""}${USER_CREATE_DESCRIPTION_SUFFIX}`,
            inputSchema,
          },
          handler: createUserWithHumanPassword(registration.handler, inputSchema),
        };
      }
      default:
        return registration;
    }
  });
}

/**
 * Contributes Identity's AI tools to the assistant's catalog — called once by
 * `server/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`, not by importing this
 * module. `assistant/tool-registrations.ts` no longer imports `buildIdentityRegistrations`/
 * `identityDerivedRisk` by name; this is the seam that replaced it.
 */
export function contributeIdentityTools(): ToolContributor {
  return { domain: "identity", build: buildGatedIdentityRegistrations, risk: identityDerivedRisk };
}
