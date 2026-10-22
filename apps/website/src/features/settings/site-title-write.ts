import type { JsonValue } from "@jini-ai/core/primitives";
import {
  clear as clearSettingValue, resetNamespace as resetSettingNamespace, ForbiddenError, resolveDefinitionRaw, set as setSettingValue, ValueValidationFailedError,
  type ClearValueRequired, type ResetNamespaceRequired, type SettingsRepoPort, type SetValueRequired,
} from "@jini-ai/core/settings";

import { enforceFormDeliveryBindingsWrite } from "./form-delivery.js";
import { normalizeSiteTitle, SITE_TITLE_KEY, SITE_TITLE_MAX_LENGTH, SITE_TITLE_NAMESPACE } from "./site-title.js";
import { parseVisitorToolPolicy, VISITOR_TOOLS_PERMISSION, VISITOR_TOOLS_SETTING, VISITOR_TOOLS_WRITE_REASON } from "../../contracts/site-assistant/visitor-tools.js";

/**
 * @file SPEC-050 REQ-08: this host's settings write chokepoint. The package's `set` checks a string
 * definition by `typeof` only and leaves length rules to the registering feature, so the `set` this
 * directory's barrel exports is the wrapper below. Every host write that names a setting by namespace
 * and key binds it: the admin settings route, and `RouteDeps.set` in both composition roots (which the
 * agent daemon builds its deps from).
 *
 * Deliberately not routed through here: the package's `settings_set_ui_preference` tool calls the
 * package's own `set`, and its allowlist has no `core.site.title`; the system pin in `site-title.ts`
 * writes the fixed legacy literal.
 */

/** REQ-08's rejection text. The settings route surfaces it as `VALUE_VALIDATION_FAILED`. */
const SITE_TITLE_REJECTION = `value for '${SITE_TITLE_NAMESPACE}.${SITE_TITLE_KEY}' must be 1..${SITE_TITLE_MAX_LENGTH} characters after trimming`;

/**
 * REQ-08 for one write: a string `core.site.title` value becomes its trimmed form, or is rejected
 * when that form is empty or longer than {@link SITE_TITLE_MAX_LENGTH}. Any other setting, and a
 * non-string title (the definition schema rejects that itself), passes through unchanged. Pure.
 *
 * @throws {ValueValidationFailedError} For a string title outside 1..200 characters after trimming.
 * @complexity O(n) in the value's length.
 */
export function enforceSiteTitleWriteBounds(input: SetValueRequired["input"]): SetValueRequired["input"] {
  if (input.namespace !== SITE_TITLE_NAMESPACE || input.key !== SITE_TITLE_KEY || typeof input.value !== "string") {
    return input;
  }
  const title = normalizeSiteTitle(input.value);
  if (title === undefined) throw new ValueValidationFailedError(SITE_TITLE_REJECTION);
  return { ...input, value: title };
}

/**
 * The package's `set` with {@link enforceSiteTitleWriteBounds} applied first, so a rejected title
 * never reaches the ledger. Visitor enable writes additionally require the host's saved-credential
 * policy. Canonical definition resolution prevents an alias from bypassing that policy.
 *
 * @complexity O(n) in the value's length, plus the package `set`'s own cost.
 */
export async function set(required: SetValueRequired, optional: {
  /** Host policy: a public visitor surface requires its own saved, decryptable key and model. */
  canEnablePublicAssistant?: (required: { workspaceId: string }, optional?: Record<string, never>) => Promise<boolean>;
  /** Injected by the theme owner; generic settings has no dependency on theme discovery. */
  preparePreviewSwitcherWrite?: (required: SetValueRequired) => Promise<SetValueRequired>;
} = {}): Promise<{ value: JsonValue; revisionSeq: number }> {
  const definition = await resolveDefinitionRaw({ repo: required.deps.repo }, {
    namespace: required.input.namespace, key: required.input.key,
    workspaceId: required.input.scope === "global" ? null : required.input.workspaceId ?? null,
  });
  if (required.input.value === true && definition?.namespace === "site.assistant" && definition.key === "public_enabled") {
    await requirePublicAssistantReadiness({ workspaceId: required.input.workspaceId }, optional);
  }
  required = refuseDedicatedSettingWrite({ required, definition });
  required = await applyPreviewSwitcherPolicy({ required, definition, prepare: optional.preparePreviewSwitcherWrite });
  // Form delivery bindings are validated here too, so no host write path can store a list that
  // planning would refuse or a secret in a binding's config (`form-delivery.ts`).
  return setSettingValue({ ...required, input: enforceFormDeliveryBindingsWrite(enforceSiteTitleWriteBounds(required.input)) });
}

/** `core.comments/provider` hides or shows every stored comment, so it is written only by the comments
 * selection store (`features/comments/provider-selection.ts`: confirmation card, revision CAS,
 * `comments.configure`). The generic settings route would otherwise reach it with the workspace-settings
 * permission alone. Resolved by canonical definition, so an alias cannot bypass it. */
export const COMMENTS_PROVIDER_SETTING = { namespace: "core.comments", key: "provider" } as const;

/** Why every generic path refuses the provider; the agent's settings tools quote it too. */
export const COMMENTS_PROVIDER_WRITE_REASON = "Change the comments provider with comments_set_provider; it confirms first and keeps stored comments.";

/** Every generic path uses the same canonical coordinates, including aliases and namespace reset.
 * MOVE: Clearing restores defaults, so dedicated writers make explicit choices instead of clearing.
 */
export const DEDICATED_SETTINGS_WRITERS: readonly {
  readonly namespace: string; readonly key: string; readonly permissionOverride: string; readonly reason: string;
  readonly normalize?: (required: { required: SetValueRequired }, optional?: Record<string, never>) => SetValueRequired;
}[] = [
  { ...COMMENTS_PROVIDER_SETTING, permissionOverride: "comments.configure", reason: COMMENTS_PROVIDER_WRITE_REASON },
  { ...VISITOR_TOOLS_SETTING, permissionOverride: VISITOR_TOOLS_PERMISSION, reason: VISITOR_TOOLS_WRITE_REASON, normalize: validateVisitorToolsWrite },
];

type ResolvedDefinition = Awaited<ReturnType<typeof resolveDefinitionRaw>>;

/** Match only canonical definitions; settings resolution owns alias traversal. @complexity O(1). */
function dedicatedWriter({ definition }: { definition: ResolvedDefinition }, _options = {}) {
  return DEDICATED_SETTINGS_WRITERS.find(rule => rule.namespace === definition?.namespace && rule.key === definition.key);
}

/** Refuse writes without the dedicated permission, then apply the owner's normalization hook.
 * @throws ForbiddenError or the owner's validation error. @complexity O(1) plus normalization.
 */
function refuseDedicatedSettingWrite({ required, definition }: {
  required: SetValueRequired; definition: ResolvedDefinition;
}, _options = {}): SetValueRequired {
  const writer = dedicatedWriter({ definition });
  if (writer && required.input.requiredPermissionOverride !== writer.permissionOverride) {
    throw new ForbiddenError(writer.reason);
  }
  return writer?.normalize?.({ required }) ?? required;
}

/** A dedicated permission cannot authorize a personal/global policy or invalid stored JSON. */
function validateVisitorToolsWrite({ required }: { required: SetValueRequired }, _options = {}): SetValueRequired {
  if (required.input.scope !== "workspace") throw new ForbiddenError(VISITOR_TOOLS_WRITE_REASON);
  try {
    const policy = parseVisitorToolPolicy({ value: required.input.value });
    return { ...required, input: { ...required.input, value: policy as unknown as JsonValue } };
  } catch {
    throw new ValueValidationFailedError("Invalid visitor-tools policy.");
  }
}

/**
 * Clearing a dedicated setting restores defaults: it can re-enable comments or visitor tools
 * the owner switched Off. Dedicated writers store explicit choices. Resolved through aliases.
 *
 * @throws {ForbiddenError} When the coordinate resolves to a dedicated writer's setting.
 * @complexity O(1) definition lookups (one alias hop).
 */
export async function refuseDedicatedSettingClear(required: {
  repo: SettingsRepoPort; input: Pick<ClearValueRequired["input"], "namespace" | "key" | "scope" | "workspaceId">;
}, _optional = {}): Promise<void> {
  const { repo, input } = required;
  const definition = await resolveDefinitionRaw({ repo }, {
    namespace: input.namespace, key: input.key, workspaceId: input.scope === "global" ? null : input.workspaceId ?? null,
  });
  const writer = dedicatedWriter({ definition });
  if (writer) throw new ForbiddenError(writer.reason);
}

/**
 * A namespace reset loops `clear` over every key its scope's partition lists for the namespace, alias
 * rows included, without this host's chokepoint, so the same keys are resolved here first and the
 * whole reset is refused before any write when one has a dedicated writer. The partition rule is the
 * CMS adapter's own (Jini `packages/core/src/settings/express/cms-adapter.ts`).
 *
 * @throws {ForbiddenError} When a key the reset would clear has a dedicated writer.
 * @complexity O(d) over the partition's definitions, plus one bounded alias resolution per namespace key.
 */
export async function refuseDedicatedSettingReset(required: {
  repo: SettingsRepoPort; input: Pick<ResetNamespaceRequired["input"], "namespace" | "scope" | "workspaceId" | "authWorkspaceId">;
}, _optional = {}): Promise<void> {
  const { repo, input } = required;
  const workspaceId = input.scope === "global" ? null : input.workspaceId ?? input.authWorkspaceId ?? null;
  const definitions = await repo.listActiveDefinitions({ workspaceId });
  for (const definition of definitions.filter((d) => d.namespace === input.namespace)) {
    await refuseDedicatedSettingClear({ repo, input: { namespace: definition.namespace, key: definition.key, scope: input.scope, workspaceId: workspaceId ?? undefined } });
  }
}

/**
 * The package's `clear` behind the canonical dedicated-writer guard: callers cannot restore
 * comments-provider or visitor-tool defaults through generic settings writes.
 *
 * @complexity As the package `clear`, plus one bounded alias resolution.
 */
export async function clear(required: ClearValueRequired, _optional = {}): Promise<{ revisionSeq: number }> {
  await refuseDedicatedSettingClear({ repo: required.deps.repo, input: required.input });
  return clearSettingValue(required);
}

/** Refuse the whole reset before the ledger clears any dedicated writer's key. Keys are part of
 * the required object; this thin host adapter passes them to Jini's existing two-argument API.
 * @complexity O(d) preflight (partition definitions), followed by the settings owner's transaction.
 */
export async function resetNamespace(required: ResetNamespaceRequired & { keysInNamespace: string[] }, _optional = {}): ReturnType<typeof resetSettingNamespace> {
  await refuseDedicatedSettingReset({ repo: required.deps.repo, input: required.input });
  return resetSettingNamespace(required, required.keysInNamespace);
}

// Keep existing host imports compatible while the one table guards both dedicated settings.
export { refuseDedicatedSettingClear as refuseCommentsProviderClear, refuseDedicatedSettingReset as refuseCommentsProviderReset };

/** Resolve aliases before dispatching the theme-owned policy; uncomposed writers fail closed. */
async function applyPreviewSwitcherPolicy({ required, definition, prepare }: {
  required: SetValueRequired; definition: ResolvedDefinition;
  prepare: NonNullable<Parameters<typeof set>[1]>["preparePreviewSwitcherWrite"];
}, _options = {}): Promise<SetValueRequired> {
  if (definition?.namespace !== "core.theme" || definition.key !== "previewSwitcher") return required;
  if (!prepare) throw new ValueValidationFailedError("Theme preview write policy is unavailable.");
  return prepare(required);
}

/** Host readiness is independent of the generic settings writer's scope authorization. */
async function requirePublicAssistantReadiness({ workspaceId }: { workspaceId: string | undefined },
  optional: NonNullable<Parameters<typeof set>[1]>): Promise<void> {
  // Missing policy fails closed, including direct callers outside the composed HTTP server.
  if (!workspaceId || !await optional.canEnablePublicAssistant?.({ workspaceId })) {
    throw new ValueValidationFailedError("Save a usable provider key and a model in AI Assistant before enabling the public assistant.");
  }
}
