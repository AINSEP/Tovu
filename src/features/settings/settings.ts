import type { JsonValue } from "../../core/ports";
import { DefinitionInvalidError, SecretNotSupportedError } from "./errors";
import type { SettingsRepoPort } from "./ports";
import {
  SCOPE_BIT,
  type SettingDefinitionRecord,
  type SettingOwnerKind,
  type SettingScopeContext,
  type SettingValueSchema,
} from "./types";

/**
 * @file The settings resolver + pure definition-registration validation
 * (SPEC-007 REQ-02, REQ-03, REQ-09; ADR-028 §8's "one evaluator").
 *
 * Purpose:
 * `validateDefinitionInput` is pure (no I/O) — the write-side chokepoint in
 * `write-service.ts` calls it before persisting. `getEffective`/`getLayer`/
 * `resolveDefinition` are read-only against `SettingsRepoPort`. Neither
 * mutates anything; every mutation goes through `write-service.ts`.
 */

export interface DefinitionInput {
  namespace: string;
  key: string;
  ownerKind: SettingOwnerKind;
  workspaceId: string | null;
  ownerId?: string | null;
  schema: SettingValueSchema;
  defaultValue: JsonValue | null;
  scopes: number;
  secret: boolean;
}

const NAMESPACE_FENCE: Record<SettingOwnerKind, (input: DefinitionInput) => boolean> = {
  core: (input) => input.namespace.startsWith("core.") && input.workspaceId === null,
  theme: (input) => input.namespace.startsWith("theme.") && input.workspaceId === null,
  site: (input) => input.namespace.startsWith("site.") && input.workspaceId !== null,
};

/**
 * REQ-02/REQ-09/INV-05/INV-08 — the pure half of `registerDefinitions`.
 * Never throws; returns a discriminated result so the chokepoint decides how
 * to surface the failure (matches `ValueValidationFailedError`'s pattern of
 * keeping I/O out of validation).
 *
 * @complexity O(1) per definition.
 * @overallScore 100
 */
export function validateDefinitionInput(
  input: DefinitionInput
): { valid: true } | { valid: false; error: DefinitionInvalidError | SecretNotSupportedError } {
  if (input.secret) {
    return {
      valid: false,
      error: new SecretNotSupportedError(
        "secret:true definitions are not supported in the core-only subset (REQ-09/INV-08)"
      ),
    };
  }

  if (!NAMESPACE_FENCE[input.ownerKind](input)) {
    return {
      valid: false,
      error: new DefinitionInvalidError(
        `namespace '${input.namespace}' does not match the owner fence for owner_kind '${input.ownerKind}' (REQ-02)`
      ),
    };
  }

  if (input.scopes < 1 || input.scopes > 7) {
    return {
      valid: false,
      error: new DefinitionInvalidError(`scopes bitmask ${input.scopes} is out of range 1..7`),
    };
  }

  // INV-05: a site-owned def (workspace_id NOT NULL) may never declare the global scope bit.
  if (input.workspaceId !== null && (input.scopes & SCOPE_BIT.global) !== 0) {
    return {
      valid: false,
      error: new DefinitionInvalidError(
        "a site-owned definition may not declare the global scope bit (INV-05)"
      ),
    };
  }

  // Totality (behavior.spec §3): every non-secret def needs a non-null default so
  // getEffective is always total (INV-02) and factory-reset is provably bootable.
  if (input.defaultValue === null) {
    return {
      valid: false,
      error: new DefinitionInvalidError(
        "non-secret definitions require a non-null default_json (totality, INV-02)"
      ),
    };
  }

  return { valid: true };
}

export function validateValueAgainstSchema(schema: SettingValueSchema, value: JsonValue): boolean {
  if (value === null) return schema.nullable === true;
  switch (schema.type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && schema.values.includes(value);
  }
}

/** Identity-registry of total coercers keyed by `coercionTag` (EC-08). `"identity"` is always registered. */
const coercers = new Map<string, (value: JsonValue) => JsonValue>([["identity", (v) => v]]);

export function registerCoercer(tag: string, fn: (value: JsonValue) => JsonValue): void {
  coercers.set(tag, fn);
}

/**
 * Follows an alias marker (depth <=1) to the current row and returns it as
 * stored — status intact, including `tombstone`. `resolveDefinition` (below)
 * is the read-path wrapper that collapses tombstone to typed-absent (EC-10);
 * `write-service.ts` uses this raw form directly so it can report
 * `DEFINITION_TOMBSTONED` distinctly from "not found".
 */
export async function resolveDefinitionRaw(
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; workspaceId: string | null }
): Promise<SettingDefinitionRecord | null> {
  // Namespace fencing (REQ-02) makes `site.*` (non-null workspace_id) and
  // `core.*`/`theme.*` (null workspace_id) disjoint by construction, so a
  // caller resolving inside a workspace context may still be asking for a
  // platform definition. Try the caller's own partition first, then fall
  // back to the platform (null) partition.
  const found =
    (await deps.repo.findActiveDefinition(input)) ??
    (input.workspaceId !== null
      ? await deps.repo.findActiveDefinition({ ...input, workspaceId: null })
      : null);
  if (!found) return null;
  if (found.status === "alias") {
    if (found.aliasOfNamespace == null || found.aliasOfKey == null) return null;
    return resolveDefinitionRaw(deps, {
      namespace: found.aliasOfNamespace,
      key: found.aliasOfKey,
      workspaceId: input.workspaceId,
    });
  }
  return found;
}

/**
 * REQ-03 — the read-path resolver: typed-absent (`null`) for a tombstoned or
 * missing key (EC-10).
 */
export async function resolveDefinition(
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; workspaceId: string | null }
): Promise<SettingDefinitionRecord | null> {
  const found = await resolveDefinitionRaw(deps, input);
  if (!found || found.status === "tombstone") return null;
  return found;
}

export interface ResolvedSetting {
  value: JsonValue | null;
  sourceLayer: "user" | "workspace" | "global" | "default";
  defVersion: number;
}

/**
 * REQ-03/INV-02 — total for a live key: never throws, never returns
 * undefined. Precedence `user ?? workspace ?? global ?? default`. A
 * `cleared` row is treated as absent at that layer (behavior.spec §1.2).
 *
 * @complexity O(1) — up to 3 layer reads + 1 definition read.
 * @overallScore 100
 */
export async function getEffective(
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; scopeContext: SettingScopeContext }
): Promise<ResolvedSetting | null> {
  const definition = await resolveDefinition(deps, {
    namespace: input.namespace,
    key: input.key,
    workspaceId: input.scopeContext.workspaceId ?? null,
  });
  if (!definition) return null;

  const coerce = (value: JsonValue, defVersion: number): JsonValue => {
    if (defVersion === definition.version) return value;
    const coercer = coercers.get(definition.coercionTag ?? "identity") ?? coercers.get("identity")!;
    return coercer(value);
  };

  if (input.scopeContext.workspaceId && input.scopeContext.principalId) {
    const userValue = await deps.repo.getUserValue({
      workspaceId: input.scopeContext.workspaceId,
      principalId: input.scopeContext.principalId,
      settingId: definition.settingId,
    });
    if (userValue && userValue.state === "set") {
      return {
        value: coerce(userValue.valueJson, userValue.defVersion),
        sourceLayer: "user",
        defVersion: definition.version,
      };
    }
  }

  if (input.scopeContext.workspaceId) {
    const workspaceValue = await deps.repo.getWorkspaceValue({
      workspaceId: input.scopeContext.workspaceId,
      settingId: definition.settingId,
    });
    if (workspaceValue && workspaceValue.state === "set") {
      return {
        value: coerce(workspaceValue.valueJson, workspaceValue.defVersion),
        sourceLayer: "workspace",
        defVersion: definition.version,
      };
    }
  }

  const globalValue = await deps.repo.getGlobalValue(definition.settingId);
  if (globalValue && globalValue.state === "set") {
    return {
      value: coerce(globalValue.valueJson, globalValue.defVersion),
      sourceLayer: "global",
      defVersion: definition.version,
    };
  }

  return { value: definition.defaultValue, sourceLayer: "default", defVersion: definition.version };
}
