import type { JsonValue } from "@jini-ai/cms/core";
import {
  NON_REGISTER_DEFINITION_OPS,
  parseNonRegisterDefinitionOp,
  AliasDepthExceededError,
  DefinitionInvalidError,
  DefinitionTombstonedError,
  ForbiddenError,
  RenameRetypeConflictError,
  SecretNotSupportedError,
  type DefinitionInput,
  type DefinitionOpContext,
  type DefinitionOpRequestItem,
  type SettingOwnerKind,
  type SettingValueSchema,
  registerDefinitions,
} from "#src/features/settings/index";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import type { SettingsRouteRegistrar } from "./deps.js";
import { respondToSettingsError, toWriteServiceDeps, type SettingsErrorMapping } from "./shared.js";

const REGISTER_DEFINITIONS_ERROR_MAPPINGS: readonly SettingsErrorMapping[] = [
  { matches: (e) => e instanceof SecretNotSupportedError, status: 400, code: "SECRET_NOT_SUPPORTED" },
  { matches: (e) => e instanceof DefinitionInvalidError, status: 400, code: "DEFINITION_INVALID" },
  { matches: (e) => e instanceof RenameRetypeConflictError, status: 409, code: "RENAME_RETYPE_CONFLICT" },
  { matches: (e) => e instanceof AliasDepthExceededError, status: 409, code: "ALIAS_DEPTH_EXCEEDED" },
  { matches: (e) => e instanceof DefinitionTombstonedError, status: 409, code: "DEFINITION_TOMBSTONED" },
  { matches: (e) => e instanceof ForbiddenError, status: 403, code: "FORBIDDEN" },
];

/** Coerces a possibly-absent field to a string, matching this route's `?? ""`/`?? "register"`
 *  fallback shape everywhere it reads a field off an untrusted batch item.
 *  @complexity O(1). */
function readString(value: unknown, fallback = ""): string {
  return String(value ?? fallback);
}

/** Body's `definitions` array, or `null` if it's missing or not an array.
 *  @complexity O(1). */
function parseDefinitionItems(body: unknown): unknown[] | null {
  const definitions = (body as { definitions?: unknown } | null)?.definitions;
  return Array.isArray(definitions) ? definitions : null;
}

/** One batch item's outcome: queued for the batched `register` call, or already applied via its
 *  non-register op's write-service call. `unknownOp` carries the rejected op string so the caller
 *  can 400 without this function touching `res`. */
type DefinitionItemOutcome =
  | { readonly applied: { key: string; op: string; status: string } }
  | { readonly unknownOp: string };

/**
 * Normalizes one request item and either queues it for the batched `registerDefinitions` call below
 * (see the module doc for why `register` is not dispatched immediately) or runs its non-register op
 * now via the Phase-2 dispatch table (`NON_REGISTER_DEFINITION_OPS`).
 *
 * @complexity O(1) plus, for non-register ops, one write-service call.
 */
async function applyDefinitionItem(
  raw: unknown,
  opCtx: DefinitionOpContext,
  toRegister: DefinitionInput[]
): Promise<DefinitionItemOutcome> {
  const item = raw as Record<string, unknown>;
  const ownerKind = item.ownerKind as SettingOwnerKind;
  const namespace = readString(item.namespace);
  const key = readString(item.key);
  const op = readString(item.op, "register");
  // Platform defs (core/theme) are workspace_id=null; site-owned defs carry this workspace's
  // id (REQ-02 namespace fence, `settings.ts`'s `NAMESPACE_FENCE`).
  const workspaceId = ownerKind === "site" ? opCtx.authWorkspaceId : null;
  const defaultValue = (item.defaultJson ?? null) as JsonValue | null;

  if (op === "register") {
    toRegister.push({
      namespace,
      key,
      ownerKind,
      workspaceId,
      schema: item.schemaJson as SettingValueSchema,
      defaultValue,
      scopes: Number(item.scopes),
      secret: Boolean(item.secret ?? false),
    });
    return { applied: { key: `${namespace}.${key}`, op, status: "applied" } };
  }

  const parsedOp = parseNonRegisterDefinitionOp(op);
  if (!parsedOp) {
    return { unknownOp: op };
  }
  const opItem: DefinitionOpRequestItem = {
    namespace,
    key,
    ownerKind,
    workspaceId,
    newNamespace: item.newNamespace as string | undefined,
    newKey: item.newKey as string | undefined,
    schemaJson: item.schemaJson as SettingValueSchema,
    defaultJson: defaultValue,
    coercionJson: item.coercionJson as string | { tag?: string } | undefined,
  };
  await NON_REGISTER_DEFINITION_OPS[parsedOp](opCtx, opItem);
  return { applied: { key: `${namespace}.${key}`, op, status: "applied" } };
}

/**
 * POST register/rename/retype/deprecate/tombstone setting definitions
 * (SPEC-007 api.spec.md `SETTINGS_REGISTER_DEFINITIONS`, tasks.md T038).
 *
 * Path deviation: api.spec.md §1 lists the literal path
 * `/api/v1/admin/settings/definitions` (no workspace segment). Every other
 * admin route registrar in this codebase mounts under
 * `/api/admin/v1/workspaces/:workspaceId/...` (see `presentation/get.ts`,
 * `menus/create.ts`, etc.) and validates `:workspaceId` against
 * `deps.workspaceId` — this route follows that established convention
 * instead, since v1 is single-workspace and every sibling admin route already
 * does the same 404-on-mismatched-workspace check.
 *
 * Each item's `op` (default `"register"`) routes to the matching Phase-2
 * write-service function. All five share the `settings.definitions.manage`
 * gate — each function re-checks it internally (chokepoint discipline), but
 * this route also pre-checks it once up front for a fast, structured 403
 * (mirrors `presentation/patch-active-theme.ts`'s explicit-authorize-then-call
 * pattern) rather than parsing a thrown `ForbiddenError`'s message.
 *
 * Deviation: `coercionJson` (api.spec.md's field name for `retype`) is
 * declared as an opaque `object` there, but `retypeDefinition` needs a string
 * `coercionTag` naming an already-registered coercer (`settings.ts`'s
 * `registerCoercer` registry). This route accepts either a bare string or an
 * object with a `tag` field, falling back to `"identity"` — smallest
 * reasonable bridge between the two shapes, disclosed here rather than
 * silently guessing.
 */
export const registerAdminSettingsRegisterDefinitionsRoute: SettingsRouteRegistrar = (app, deps) => {
  app.post("/api/admin/v1/workspaces/:workspaceId/settings/definitions", async (req, res) => {
    if (String(req.params.workspaceId ?? "") !== deps.workspaceId) {
      res.status(404).json({ error: "workspace was not found" });
      return;
    }

    try {
      await deps.settingsReady;
      const principal = getAuthedPrincipal(res);

      const authResult = await deps.authorize({
        principalId: principal.id,
        permission: "settings.definitions.manage",
        workspaceId: deps.workspaceId,
        entityType: "setting-definition",
      });
      if (!authResult.allowed) {
        res.status(403).json({
          error: `principal '${principal.id}' is not authorized for 'settings.definitions.manage' (${authResult.reason})`,
          code: "FORBIDDEN",
          details: { permission: "settings.definitions.manage", reason: authResult.reason },
        });
        return;
      }

      const items = parseDefinitionItems(req.body);
      if (!items) {
        res.status(400).json({ error: "'definitions' must be an array", code: "VALIDATION_ERROR" });
        return;
      }

      const writeDeps = toWriteServiceDeps(deps);
      const opCtx: DefinitionOpContext = { deps: writeDeps, callerPrincipalId: principal.id, authWorkspaceId: deps.workspaceId };
      const applied: Array<{ key: string; op: string; status: string }> = [];
      const toRegister: DefinitionInput[] = [];

      for (const raw of items) {
        const outcome = await applyDefinitionItem(raw, opCtx, toRegister);
        if ("unknownOp" in outcome) {
          res.status(400).json({ error: `unknown op '${outcome.unknownOp}'`, code: "VALIDATION_ERROR" });
          return;
        }
        applied.push(outcome.applied);
      }

      if (toRegister.length > 0) {
        await registerDefinitions({
          deps: writeDeps,
          input: { definitions: toRegister, callerPrincipalId: principal.id, authWorkspaceId: deps.workspaceId },
        });
      }

      res.json({ applied });
    } catch (err) {
      respondToSettingsError(res, err, REGISTER_DEFINITIONS_ERROR_MAPPINGS);
    }
  });
};
