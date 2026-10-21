import type { JsonValue } from "@jini-ai/core/primitives";
import { resolveDefinitionRaw, set as setSettingValue, ValueValidationFailedError, type SetValueRequired } from "@jini-ai/core/settings";

import { enforceFormDeliveryBindingsWrite } from "./form-delivery.js";
import { normalizeSiteTitle, SITE_TITLE_KEY, SITE_TITLE_MAX_LENGTH, SITE_TITLE_NAMESPACE } from "./site-title.js";

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
  refuseUncardedCommentsProviderWrite({ required, definition });
  required = await applyPreviewSwitcherPolicy({ required, definition, prepare: optional.preparePreviewSwitcherWrite });
  // Form delivery bindings are validated here too, so no host write path can store a list that
  // planning would refuse or a secret in a binding's config (`form-delivery.ts`).
  return setSettingValue({ ...required, input: enforceFormDeliveryBindingsWrite(enforceSiteTitleWriteBounds(required.input)) });
}

/** `core.comments/provider` hides or shows every stored comment, so it is written only by the comments
 * selection store (`features/comments/provider-selection.ts`: confirmation card, revision CAS,
 * `comments.configure`). The generic settings route would otherwise reach it with the workspace-settings
 * permission alone. Resolved by canonical definition, so an alias cannot bypass it. @complexity O(1). */
function refuseUncardedCommentsProviderWrite({ required, definition }: {
  required: SetValueRequired; definition: Awaited<ReturnType<typeof resolveDefinitionRaw>>;
}, _options = {}): void {
  if (definition?.namespace !== "core.comments" || definition.key !== "provider") return;
  if (required.input.requiredPermissionOverride !== "comments.configure") {
    throw new ValueValidationFailedError("Change the comments provider with comments_set_provider; it confirms first and keeps stored comments.");
  }
}

/** Resolve aliases before dispatching the theme-owned policy; uncomposed writers fail closed. */
async function applyPreviewSwitcherPolicy({ required, definition, prepare }: {
  required: SetValueRequired; definition: Awaited<ReturnType<typeof resolveDefinitionRaw>>;
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
