import type { ClockPort, IdGeneratorPort, JsonValue, UUID } from "../../core/ports";
import type { PrincipalRepoPort } from "../../identity/ports";
import {
  DefinitionNotFoundError,
  DefinitionTombstonedError,
  ForbiddenError,
  PrincipalNotFoundError,
  ScopeNotAllowedError,
  ValueValidationFailedError,
} from "./errors";
import type { SettingsRepoPort } from "./ports";
import {
  type DefinitionInput,
  resolveDefinitionRaw,
  validateDefinitionInput,
  validateValueAgainstSchema,
} from "./settings";
import { SCOPE_BIT, type SettingScope } from "./types";

/**
 * @file `SettingsWriteService` — the single write chokepoint (SPEC-007 REQ-04;
 * ADR-028 §4; ADR-PIPE-007).
 *
 * Purpose:
 * The ONLY value/definition-mutation path. Repo write methods
 * (`saveDefinition`/`save*Value`/`appendRevision`/`delete*Value`) must never
 * be called from outside this file (Code Review enforces this as a file-
 * boundary check, ADR-PIPE-007 Enforcement).
 *
 * Every export here: `authorize()` first (fail-closed, INV-07) -> validate ->
 * write value/definition row + revision in one transaction (INV-01).
 *
 * `deriveRequiredPermission` is the sole source of truth for the self-vs-
 * other permission rule (behavior.spec.md §1.3) — closes Red-Team RT-003.
 * REQ-13's target-principal check reuses `identity.PrincipalRepoPort`
 * directly — no new port (closes RT-001/RT-002 at the implementation level).
 */

/** Matches `core/commands/command.ts`'s `AuthorizeFn` shape structurally — no import, kept decoupled. */
export type AuthorizeFn = (params: {
  principalId: UUID;
  permission: string;
  workspaceId: UUID;
  entityType?: string;
  entityId?: UUID;
}) => Promise<{ allowed: boolean; reason: string }>;

export interface SettingsWriteServiceDeps {
  repo: SettingsRepoPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  authorize: AuthorizeFn;
  /** REQ-13 — reused directly from `identity`, not duplicated (ADR-PIPE-007 Pattern Evaluation). */
  principals: PrincipalRepoPort;
}

/**
 * behavior.spec.md §1.3 / REQ-06 `[internal-invariant]` — the self-vs-other
 * permission derivation. `targetPrincipalId` omitted or equal to the caller
 * -> `settings.user.self.write`; any other principal -> `settings.user.write`.
 * A divergence between this function and any other implementation of the
 * rule is a fail-open authorization bug (Red-Team RT-003) — this is the only
 * place the rule may be encoded.
 *
 * @complexity O(1), pure.
 * @overallScore 100
 */
export function deriveRequiredPermission(input: {
  scope: SettingScope;
  targetPrincipalId?: UUID;
  callerPrincipalId: UUID;
}): string {
  if (input.scope === "global") return "settings.global.write";
  if (input.scope === "workspace") return "settings.workspace.write";
  const isSelf = input.targetPrincipalId == null || input.targetPrincipalId === input.callerPrincipalId;
  return isSelf ? "settings.user.self.write" : "settings.user.write";
}

export interface RegisterDefinitionsRequired {
  deps: SettingsWriteServiceDeps;
  input: {
    definitions: DefinitionInput[];
    callerPrincipalId: UUID;
    /** The workspace the caller is authorizing in (always required — even platform-def registration is authorized within a workspace context). */
    authWorkspaceId: UUID;
  };
}

/** REQ-02/REQ-09 chokepoint write: authorize `settings.definitions.manage` -> validate -> write + revision, one per definition, each its own tx. */
export async function registerDefinitions(
  required: RegisterDefinitionsRequired
): Promise<{ registered: string[] }> {
  const { deps, input } = required;

  const authResult = await deps.authorize({
    principalId: input.callerPrincipalId,
    permission: "settings.definitions.manage",
    workspaceId: input.authWorkspaceId,
    entityType: "setting-definition",
  });
  if (!authResult.allowed) {
    throw new ForbiddenError(
      `principal '${input.callerPrincipalId}' is not authorized for 'settings.definitions.manage' (${authResult.reason})`
    );
  }

  const registered: string[] = [];
  for (const definitionInput of input.definitions) {
    const validation = validateDefinitionInput(definitionInput);
    if (!validation.valid) throw validation.error;

    await deps.repo.transaction(async () => {
      const now = deps.clock.nowIso();
      const settingId = deps.ids.newId();
      await deps.repo.saveDefinition({
        settingId,
        version: 1,
        workspaceId: definitionInput.workspaceId,
        namespace: definitionInput.namespace,
        key: definitionInput.key,
        ownerKind: definitionInput.ownerKind,
        ownerId: definitionInput.ownerId ?? null,
        schema: definitionInput.schema,
        defaultValue: definitionInput.defaultValue,
        scopes: definitionInput.scopes,
        secret: false,
        status: "active",
        aliasOfNamespace: null,
        aliasOfKey: null,
        coercionTag: null,
        createdAt: now,
        updatedAt: now,
      });
      await deps.repo.appendRevision({
        entityKind: "definition",
        settingId,
        scope: null,
        workspaceId: definitionInput.workspaceId,
        principalId: null,
        op: "register",
        beforeJson: null,
        afterJson: null,
        defVersion: 1,
        actor: input.callerPrincipalId,
        originPluginId: null,
        changeSetId: null,
        createdAt: now,
      });
      registered.push(settingId);
    });
  }

  return { registered };
}

export interface SetValueRequired {
  deps: SettingsWriteServiceDeps;
  input: {
    namespace: string;
    key: string;
    scope: SettingScope;
    value: JsonValue;
    workspaceId?: UUID;
    principalId?: UUID;
    callerPrincipalId: UUID;
  };
}

async function resolveScopedDefinitionOrThrow(
  deps: SettingsWriteServiceDeps,
  input: { namespace: string; key: string; scope: SettingScope; workspaceId?: UUID }
) {
  const definitionWorkspaceId = input.scope === "global" ? null : (input.workspaceId ?? null);
  const definition = await resolveDefinitionRaw(deps, {
    namespace: input.namespace,
    key: input.key,
    workspaceId: definitionWorkspaceId,
  });
  if (!definition) {
    throw new DefinitionNotFoundError(`setting '${input.namespace}.${input.key}' was not found`);
  }
  if (definition.status === "tombstone") {
    throw new DefinitionTombstonedError(`setting '${input.namespace}.${input.key}' has been tombstoned`);
  }
  if ((definition.scopes & SCOPE_BIT[input.scope]) === 0) {
    throw new ScopeNotAllowedError(
      `setting '${input.namespace}.${input.key}' does not allow scope '${input.scope}'`
    );
  }
  return definition;
}

/**
 * REQ-13/INV-09 — for scope=user writes targeting another principal, verify
 * that principal resolves to an active user whose own `workspace_id` equals
 * the request's `workspaceId` (ADR-007 structural scoping — a principal
 * belongs to exactly one workspace, not a membership join).
 */
async function assertTargetPrincipalInWorkspace(
  deps: SettingsWriteServiceDeps,
  input: { scope: SettingScope; workspaceId?: UUID; principalId?: UUID; callerPrincipalId: UUID }
): Promise<void> {
  if (input.scope !== "user") return;
  if (!input.principalId || input.principalId === input.callerPrincipalId) return;
  if (!input.workspaceId) return;

  const principal = await deps.principals.findById({ workspaceId: input.workspaceId, id: input.principalId });
  if (!principal || principal.status === "disabled") {
    throw new PrincipalNotFoundError(
      `principal '${input.principalId}' was not found in workspace '${input.workspaceId}'`,
      input.principalId,
      input.workspaceId
    );
  }
}

/** REQ-04/REQ-13 chokepoint write: authorize -> validate -> value + revision, same tx. */
export async function set(required: SetValueRequired): Promise<{ value: JsonValue; revisionSeq: number }> {
  const { deps, input } = required;

  const permission = deriveRequiredPermission({
    scope: input.scope,
    targetPrincipalId: input.principalId,
    callerPrincipalId: input.callerPrincipalId,
  });
  const authWorkspaceId = input.workspaceId ?? input.callerPrincipalId;
  const authResult = await deps.authorize({
    principalId: input.callerPrincipalId,
    permission,
    workspaceId: authWorkspaceId,
    entityType: "setting-value",
  });
  if (!authResult.allowed) {
    throw new ForbiddenError(
      `principal '${input.callerPrincipalId}' is not authorized for '${permission}' (${authResult.reason})`
    );
  }

  const definition = await resolveScopedDefinitionOrThrow(deps, input);

  if (!validateValueAgainstSchema(definition.schema, input.value)) {
    throw new ValueValidationFailedError(
      `value for '${input.namespace}.${input.key}' does not match the definition schema`
    );
  }

  await assertTargetPrincipalInWorkspace(deps, input);

  return deps.repo.transaction(async () => {
    const now = deps.clock.nowIso();
    const revisionSeq = await deps.repo.appendRevision({
      entityKind: "value",
      settingId: definition.settingId,
      scope: input.scope,
      workspaceId: input.scope === "global" ? null : (input.workspaceId ?? null),
      principalId: input.scope === "user" ? (input.principalId ?? input.callerPrincipalId) : null,
      op: "set",
      beforeJson: null,
      afterJson: input.value,
      defVersion: definition.version,
      actor: input.callerPrincipalId,
      originPluginId: null,
      changeSetId: null,
      createdAt: now,
    });

    const base = {
      settingId: definition.settingId,
      scope: input.scope,
      valueJson: input.value,
      state: "set" as const,
      defVersion: definition.version,
      seq: revisionSeq,
      updatedBy: input.callerPrincipalId,
      updatedAt: now,
      originPluginId: null,
    };

    if (input.scope === "global") {
      await deps.repo.saveGlobalValue({ ...base, workspaceId: null, principalId: null });
    } else if (input.scope === "workspace") {
      await deps.repo.saveWorkspaceValue({
        ...base,
        workspaceId: input.workspaceId ?? null,
        principalId: null,
      });
    } else {
      await deps.repo.saveUserValue({
        ...base,
        workspaceId: input.workspaceId ?? null,
        principalId: input.principalId ?? input.callerPrincipalId,
      });
    }

    return { value: input.value, revisionSeq };
  });
}

export interface ClearValueRequired {
  deps: SettingsWriteServiceDeps;
  input: {
    namespace: string;
    key: string;
    scope: SettingScope;
    workspaceId?: UUID;
    principalId?: UUID;
    callerPrincipalId: UUID;
    /** Set by `resetNamespace` when looping `clear()` in its own reset-authorized context (ADR-028 §7 R3-01) — bypasses the inner authorize() re-check, still writes a normal revision. */
    skipAuthorize?: boolean;
  };
}

/** REQ-04/REQ-13 chokepoint write: authorize -> value + revision (state='cleared'), same tx. */
export async function clear(required: ClearValueRequired): Promise<{ revisionSeq: number }> {
  const { deps, input } = required;

  if (!input.skipAuthorize) {
    const permission = deriveRequiredPermission({
      scope: input.scope,
      targetPrincipalId: input.principalId,
      callerPrincipalId: input.callerPrincipalId,
    });
    const authWorkspaceId = input.workspaceId ?? input.callerPrincipalId;
    const authResult = await deps.authorize({
      principalId: input.callerPrincipalId,
      permission,
      workspaceId: authWorkspaceId,
      entityType: "setting-value",
    });
    if (!authResult.allowed) {
      throw new ForbiddenError(
        `principal '${input.callerPrincipalId}' is not authorized for '${permission}' (${authResult.reason})`
      );
    }
  }

  const definition = await resolveScopedDefinitionOrThrow(deps, input);
  await assertTargetPrincipalInWorkspace(deps, input);

  return deps.repo.transaction(async () => {
    const now = deps.clock.nowIso();
    const revisionSeq = await deps.repo.appendRevision({
      entityKind: "value",
      settingId: definition.settingId,
      scope: input.scope,
      workspaceId: input.scope === "global" ? null : (input.workspaceId ?? null),
      principalId: input.scope === "user" ? (input.principalId ?? input.callerPrincipalId) : null,
      op: "clear",
      beforeJson: null,
      afterJson: null,
      defVersion: definition.version,
      actor: input.callerPrincipalId,
      originPluginId: null,
      changeSetId: null,
      createdAt: now,
    });

    const base = {
      settingId: definition.settingId,
      scope: input.scope,
      valueJson: null,
      state: "cleared" as const,
      defVersion: definition.version,
      seq: revisionSeq,
      updatedBy: input.callerPrincipalId,
      updatedAt: now,
      originPluginId: null,
    };

    if (input.scope === "global") {
      await deps.repo.saveGlobalValue({ ...base, workspaceId: null, principalId: null });
    } else if (input.scope === "workspace") {
      await deps.repo.saveWorkspaceValue({
        ...base,
        workspaceId: input.workspaceId ?? null,
        principalId: null,
      });
    } else {
      await deps.repo.saveUserValue({
        ...base,
        workspaceId: input.workspaceId ?? null,
        principalId: input.principalId ?? input.callerPrincipalId,
      });
    }

    return { revisionSeq };
  });
}

export interface ResetNamespaceRequired {
  deps: SettingsWriteServiceDeps;
  input: {
    namespace: string;
    scope: Exclude<SettingScope, never>;
    workspaceId?: UUID;
    principalId?: UUID;
    callerPrincipalId: UUID;
  };
}

/**
 * EC-09/ADR-028 §7 R3-01 — an explicit, human-invoked orchestrator: authorize
 * the matching `settings.reset.*` permission once, then loop `clear()` for
 * every setting in the namespace in the reset-authorized internal context
 * (`skipAuthorize: true`) — the outer reset permission is sufficient on its
 * own; each inner clear still emits its own `op='clear'` revision.
 */
export async function resetNamespace(
  required: ResetNamespaceRequired,
  keysInNamespace: string[]
): Promise<{ clearedCount: number }> {
  const { deps, input } = required;

  const resetPermission = `settings.reset.${input.scope}`;
  const authWorkspaceId = input.workspaceId ?? input.callerPrincipalId;
  const authResult = await deps.authorize({
    principalId: input.callerPrincipalId,
    permission: resetPermission,
    workspaceId: authWorkspaceId,
    entityType: "setting-namespace",
  });
  if (!authResult.allowed) {
    throw new ForbiddenError(
      `principal '${input.callerPrincipalId}' is not authorized for '${resetPermission}' (${authResult.reason})`
    );
  }

  let clearedCount = 0;
  for (const key of keysInNamespace) {
    await clear({
      deps,
      input: {
        namespace: input.namespace,
        key,
        scope: input.scope,
        workspaceId: input.workspaceId,
        principalId: input.principalId,
        callerPrincipalId: input.callerPrincipalId,
        skipAuthorize: true,
      },
    });
    clearedCount++;
  }

  return { clearedCount };
}
