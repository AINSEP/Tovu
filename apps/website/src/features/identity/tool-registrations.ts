/**
 * @file Identity's agent-tool registrations — built by `@jini-ai/cms/identity`, with Tovu's human
 * confirmation added on top.
 *
 * A shim rather than a rewrite of the one importer, deliberately.
 * `assistant/tool-registrations.ts` imports every not-yet-converted domain as a single uniform block
 * of `../<domain>/tool-registrations` lines. Pointing only identity somewhere else would make the
 * one ported domain the odd line out, and would invite the next reader to "restore consistency" by
 * reaching past a barrel rather than through it. When more domains move, this file and its
 * siblings retire together.
 *
 * 2026-08-17 (Stage 2 of the registry rollout): converted to `assistant/tool-contribution-registry.ts`'s
 * explicit-call registry, same as `comments`/`newsletter` — see that file's header for why. Safe to
 * convert first among Stage 2's batch: nothing outside `server/*` imports `identity/tool-registrations`
 * by name, so there is no sibling domain still statically wired through `assistant` that could route
 * back through identity and close a new cycle.
 *
 * 2026-09-24 (tool-design audit, F3): three tools now ask the human first. The confirm transport
 * (`SurfaceExchangeStore` + `mcp-ui-tool-calls-route.ts`) is Tovu's, so the gate wraps Jini's
 * handlers here instead of living in Jini:
 * - `identity_role_delete` / `identity_policy_delete` delete for good — the owner's standing rule
 *   is that only permanent deletes hold up an in-chat confirm. (`identity_role_assign` /
 *   `identity_policy_attach` were gated too for one day, 2026-09-24, then backed out the same day:
 *   granting a role/policy isn't a delete, even though there is no unassign/detach tool.)
 * - `identity_user_create` no longer takes a password from the model. The human types the first
 *   password into the dialog; it goes browser -> route -> this parked call and never enters the
 *   model's context or the chat transcript (same path `custom_credential_set_token` uses).
 */
import type { ToolContributor } from "#src/assistant/index";
import { notConfirmedResult, requireHumanConfirm } from "#src/contracts/core/human-confirm";
import {
  askThenReport,
  createSurfaceExchangeStore,
  SURFACE_DISMISSED_PARAM,
  SURFACE_EXCHANGE_ID_PARAM,
  type AssistantSurfaceDeps,
  type ConfirmationOutcome,
} from "#src/contracts/core/tool-surface-exchanges";
import { buildIdentityRegistrations, identityDerivedRisk, parseIdentityToolInput, type IdentityToolDeps } from "@jini-ai/cms/identity";
import { ToolInputError, type ToolExecutionContext, type ToolHandler, type ToolRegistration } from "@jini-ai/core";
import { buildFormSurface, buildOutcomeSurface, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

export { buildIdentityRegistrations, identityDerivedRisk, type IdentityToolDeps };

const ROLE_DELETE_TOOL_ID = "identity_role_delete";
const POLICY_DELETE_TOOL_ID = "identity_policy_delete";
const USER_CREATE_TOOL_ID = "identity_user_create";

const USER_CREATE_DESCRIPTION_SUFFIX =
  " The user types the new user's first password into a form this tool shows; never pass a password, and never ask for one in chat.";

/**
 * Validates `input` against the tool's published schema BEFORE any dialog is drawn, with the same
 * schema-bearing message Jini's own handlers give, so a malformed call never reaches the human.
 */
function validated(toolId: string, schema: unknown, input: unknown): Readonly<Record<string, string>> {
  const parsed = parseIdentityToolInput({ schema: schema as Record<string, unknown>, input });
  if (!parsed.ok) {
    throw new ToolInputError(
      `${parsed.error.message}. Fix the input and retry — this will not resolve on retry without an input change. ` +
        `Schema for '${toolId}': ${JSON.stringify(schema)}`,
    );
  }
  return parsed.value;
}

/**
 * Wraps `inner` so it runs only after `confirm` says yes. `flag` is the key the tool's success
 * result already uses (`assigned`, `attached`, `deleted`), so a "no" reads as `{ flag: false, ... }`.
 */
function gated(
  registration: ToolRegistration,
  flag: string,
  confirm: (ctx: ToolExecutionContext, input: Readonly<Record<string, string>>) => Promise<ConfirmationOutcome>,
): ToolRegistration {
  const { descriptor, handler } = registration;
  return {
    ...registration,
    handler: async (ctx) => {
      const outcome = await confirm(ctx, validated(descriptor.id, descriptor.inputSchema, ctx.input));
      if (!outcome.confirmed) return { [flag]: false, ...notConfirmedResult(outcome) };
      return handler(ctx);
    },
  };
}

/** The model-facing schema for `identity_user_create`: Jini's, minus `password`. */
function withoutPassword(schema: unknown): unknown {
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
  routeDeps: IdentityToolDeps,
  surfaces: AssistantSurfaceDeps = { surfaceExchanges: createSurfaceExchangeStore() },
): ToolRegistration[] {
  const scope = { workspaceId: routeDeps.workspaceId };

  const roleLabel = async (id: string) => (await routeDeps.roleRepo.findById({ ...scope, id }))?.name ?? `${id} (not found)`;
  const policyLabel = async (id: string) => (await routeDeps.policyRepo.findById({ ...scope, id }))?.name ?? `${id} (not found)`;

  const confirmRoleDelete = async (ctx: ToolExecutionContext, input: Readonly<Record<string, string>>) => {
    const role = await roleLabel(input["roleId"]!);
    return requireHumanConfirm(ctx, surfaces, {
      toolId: ROLE_DELETE_TOOL_ID,
      errorCode: "IDENTITY",
      title: `Delete the role ${role}?`,
      details: [{ label: "Role", value: role }],
      warning: "The role is deleted for good. This can't be undone.",
      danger: true,
      confirmLabel: "Delete role",
    });
  };

  const confirmPolicyDelete = async (ctx: ToolExecutionContext, input: Readonly<Record<string, string>>) => {
    const policy = await policyLabel(input["policyId"]!);
    return requireHumanConfirm(ctx, surfaces, {
      toolId: POLICY_DELETE_TOOL_ID,
      errorCode: "IDENTITY",
      title: `Delete the policy ${policy}?`,
      details: [{ label: "Policy", value: policy }],
      warning: "The policy is deleted for good. This can't be undone.",
      danger: true,
      confirmLabel: "Delete policy",
    });
  };

  const createUserWithHumanPassword = (inner: ToolHandler, publishedSchema: unknown): ToolHandler => async (ctx) => {
    if (typeof ctx.input === "object" && ctx.input !== null && "password" in ctx.input) {
      throw new ToolInputError(
        `IDENTITY_PASSWORD_NOT_ACCEPTED: ${USER_CREATE_TOOL_ID}: do not pass a password. The user types the new ` +
          "user's first password into the form this tool shows. Nothing was created.",
      );
    }
    const input = validated(USER_CREATE_TOOL_ID, publishedSchema, ctx.input);
    const username = input["username"]!;
    if (!ctx.emitSurface) {
      throw new ToolInputError(
        `IDENTITY_NO_CONFIRMATION_CHANNEL: ${USER_CREATE_TOOL_ID}: this execution context has no interactive ` +
          "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.",
      );
    }

    const exchange = surfaces.surfaceExchanges.open({ toolId: USER_CREATE_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface);
    const uri = `ui://tovu/identity-user-create/${exchange.id}` as UIResourceUri;
    const email = input["email"] ? ` (${input["email"]})` : "";
    const form = buildFormSurface({
      uri,
      title: `Create the user ${username}?`,
      description: `A new login named ${username}${email} will be created with no roles. Type their first password below.`,
      submitLabel: "Create user",
      toolName: USER_CREATE_TOOL_ID,
      baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id },
      fields: [
        { kind: "string", name: "password", label: "Password", hint: "Typed here only, never shown to the assistant.", required: true, secret: true },
      ],
      cancel: { label: "Cancel", toolName: USER_CREATE_TOOL_ID, params: { [SURFACE_EXCHANGE_ID_PARAM]: exchange.id, [SURFACE_DISMISSED_PARAM]: true } },
      app: { appName: "tovu-identity-user-create", appVersion: "1" },
      preferredFrameSize: ["100%", "360px"],
    });
    const report = (state: "success" | "failure", message: string) => ({
      channel: "mcp-ui",
      payload: {
        resource: buildOutcomeSurface({
          uri,
          title: state === "success" ? "User created" : "User not created",
          details: [{ label: "Username", value: username }],
          state,
          message,
          app: { appName: "tovu-identity-user-create-outcome", appVersion: "1" },
          preferredFrameSize: ["100%", "240px"],
        }),
      },
    });

    let failure: unknown;
    const closeOnAbort = () => exchange.close();
    ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
    try {
      const result = await askThenReport<Record<string, unknown> | undefined>(exchange, { channel: "mcp-ui", payload: { resource: form } }, async (answer) => {
        if (answer.status !== "received") return { result: { created: false, ...notConfirmedResult({ confirmed: false, reason: answer.status }) } };
        if (answer.params[SURFACE_DISMISSED_PARAM] === true) {
          return { result: { created: false, ...notConfirmedResult({ confirmed: false, reason: "declined" }) } };
        }
        const password = typeof answer.params["password"] === "string" ? answer.params["password"] : "";
        if (password === "") {
          return {
            result: { created: false, cancelled: false, note: "The user submitted no password. Nothing was created." },
            outcome: report("failure", "No password was entered. Nothing was created."),
          };
        }
        try {
          const created = (await inner({ ...ctx, input: { ...input, password } })) as Record<string, unknown>;
          return { result: { created: true, ...created }, outcome: report("success", `${username} can now sign in with the password you typed.`) };
        } catch (error) {
          failure = error;
          return { result: undefined, outcome: report("failure", error instanceof Error ? error.message : "The user was not created.") };
        }
      });
      if (failure !== undefined) throw failure;
      return result;
    } finally {
      ctx.signal.removeEventListener("abort", closeOnAbort);
    }
  };

  return buildIdentityRegistrations(routeDeps).map((registration): ToolRegistration => {
    switch (registration.descriptor.id) {
      case ROLE_DELETE_TOOL_ID:
        return gated(registration, "deleted", confirmRoleDelete);
      case POLICY_DELETE_TOOL_ID:
        return gated(registration, "deleted", confirmPolicyDelete);
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
