import type { ClockPort, IdGeneratorPort, JsonValue, UUID } from "../core/ports";
import type { PrincipalRepoPort } from "../identity/ports";
import type { SettingsRepoPort } from "../features/settings/ports";
import { getEffective, resolveDefinitionRaw } from "../features/settings/settings";
import { SCOPE_BIT, type SettingValueSchema } from "../features/settings/types";
import { registerDefinitions, set, type AuthorizeFn } from "../features/settings/write-service";

/**
 * @file The master on/off switch for the VISITOR-FACING assistant, on the ADR-028 Settings Layered
 * Ledger. Mirrors `src/seo/settings.ts` and `src/comments/settings.ts` exactly — same idempotent
 * boot-time definition registration, same `getEffective` read, same validate-then-`set()` write —
 * applied to one boolean instead of SEO's 8 fields or Comments' 6.
 *
 * SCOPE. This file owns the SETTING and nothing else. The public site's own consumption of it (not
 * shipping the bundle, not mounting the endpoint) is a separate piece of work under
 * `server/http/site/**`. What this file owes that work is a read path it can call without ceremony,
 * which is {@link isPublicAssistantEnabled}: one `settingsRepo`, one `workspaceId`, one boolean out.
 *
 * THE CONTRACT THE CONSUMER MUST HONOR — write it down here because getting it wrong is the whole
 * reason the switch exists. `publicEnabled: false` means the public page ships NO assistant bundle
 * and exposes NO assistant endpoint. It does not mean a hidden widget, a `display: none`, or a
 * client-side early return. The operator reaching for this switch is doing so because something is
 * wrong — a permissions leak, a broken deploy, runaway token spend — and every one of those failure
 * modes is still live if the code merely stops being visible. Concretely, a correct consumer:
 *   - decides server-side, per request, whether to emit the assistant's <script>/markup at all; and
 *   - registers the visitor-facing assistant route(s) conditionally, or has them 404 when off, so a
 *     caller with the URL cannot reach the assistant by skipping the page.
 * A CSS or JavaScript-level hide is a defect against this contract, not a shortcut.
 *
 * DEFAULT IS OFF, and that is a decision rather than a convenience. Comments defaults `enabled` to
 * `true` and SEO defaults `sitemap_enabled` to `true`, because both were pre-existing behaviors
 * being migrated onto the ledger and flipping them would have changed every live site on upgrade.
 * There is no pre-existing public assistant to preserve: a brand-new site must not put an
 * LLM-backed, cost-bearing surface in front of the public internet because someone installed a CMS.
 * Turning it on is a deliberate act.
 *
 * NOT the admin assistant. The admin dock (`apps/admin`'s `AssistantDock`, proxied by
 * `server/modules/assistant.ts` to the agent daemon) sits behind `requireAdminSession` and is
 * unaffected by this switch — an operator who disables the public assistant keeps their own. The key
 * is named `public_enabled` rather than `enabled` precisely so that boundary is legible at the call
 * site.
 */

/**
 * ADR-028's namespace owner fence (`features/settings/settings.ts`'s `NAMESPACE_FENCE`) requires
 * every `ownerKind: "site"` definition to live under `site.` — the same constraint `site.seo` and
 * `site.comments` carry, and the same one a bare `"assistant"` would fail at the write chokepoint.
 */
const ASSISTANT_NAMESPACE = "site.assistant";

export type PublicAssistantSettingKey = "public_enabled";

/** The read model. An object rather than a bare boolean because this is the shape the admin route
 * returns and the shape the next control (a budget cap, a rate limit — see the admin section's own
 * roadmap accordion) extends, without either becoming a breaking change. */
export interface PublicAssistantSettings {
  /** `false` means the public site ships no assistant bundle and exposes no assistant endpoint —
   * see this file's header for the full contract this word carries. */
  publicEnabled: boolean;
}

/** The single registered `site.assistant.*` definition. */
const ASSISTANT_DEFINITIONS: readonly { key: PublicAssistantSettingKey; schema: SettingValueSchema; defaultValue: JsonValue }[] = [
  { key: "public_enabled", schema: { type: "boolean" }, defaultValue: false },
];

export interface EnsurePublicAssistantSettingDefinitionsDeps {
  settingsRepo: SettingsRepoPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  principals: PrincipalRepoPort;
}

export interface EnsurePublicAssistantSettingDefinitionsInput {
  workspaceId: UUID;
  /** The trusted boot-time actor these writes are attributed to (mirrors `seo/settings.ts`'s and
   * `comments/settings.ts`'s identical `systemPrincipalId` convention). */
  systemPrincipalId: UUID;
}

/** Boot-time infra work is trusted by construction — mirrors `seo/settings.ts`'s identical shim, and
 * for the identical reason: this runs before any request-scoped principal exists to authorize. */
const alwaysAllowBoot: AuthorizeFn = async () => ({ allowed: true, reason: "system_boot" });

function bootWriteServiceDeps(deps: EnsurePublicAssistantSettingDefinitionsDeps) {
  return { repo: deps.settingsRepo, clock: deps.clock, ids: deps.ids, authorize: alwaysAllowBoot, principals: deps.principals };
}

/**
 * Idempotently registers the `site.assistant.public_enabled` definition. Safe to call on every boot
 * (skip-if-already-registered, mirroring `ensureSeoSettingDefinitions`/
 * `ensureCommentsSettingDefinitions`).
 *
 * @complexity O(1) — one definition.
 * @overallScore 100
 */
export async function ensurePublicAssistantSettingDefinitions(
  deps: EnsurePublicAssistantSettingDefinitionsDeps,
  input: EnsurePublicAssistantSettingDefinitionsInput
): Promise<void> {
  for (const def of ASSISTANT_DEFINITIONS) {
    const existing = await resolveDefinitionRaw(
      { repo: deps.settingsRepo },
      { namespace: ASSISTANT_NAMESPACE, key: def.key, workspaceId: input.workspaceId }
    );
    if (existing) continue;

    await registerDefinitions({
      deps: bootWriteServiceDeps(deps),
      input: {
        callerPrincipalId: input.systemPrincipalId,
        authWorkspaceId: input.workspaceId,
        definitions: [
          {
            namespace: ASSISTANT_NAMESPACE,
            key: def.key,
            ownerKind: "site",
            workspaceId: input.workspaceId,
            schema: def.schema,
            defaultValue: def.defaultValue,
            scopes: SCOPE_BIT.workspace,
            secret: false,
          },
        ],
      },
    });
  }
}

export interface GetPublicAssistantSettingsDeps {
  settingsRepo: SettingsRepoPort;
}

/**
 * Reads the workspace's public-assistant settings.
 *
 * FAILS CLOSED on anything that is not literally `true`: a missing definition (the boot registration
 * has not run yet), a null, a string `"true"` written by some future careless caller. For a switch
 * whose whole job is to keep a cost-bearing public surface off, "I could not read the setting" must
 * mean off, never on.
 *
 * @param deps.settingsRepo - The ledger repo.
 * @param input.workspaceId - The workspace to read for.
 * @complexity O(1) — one `getEffective` resolution.
 * @overallScore 100
 */
export async function getPublicAssistantSettings(
  deps: GetPublicAssistantSettingsDeps,
  input: { workspaceId: UUID }
): Promise<PublicAssistantSettings> {
  const resolved = await getEffective(
    { repo: deps.settingsRepo },
    { namespace: ASSISTANT_NAMESPACE, key: "public_enabled", scopeContext: { workspaceId: input.workspaceId } }
  );
  return { publicEnabled: resolved?.value === true };
}

/**
 * The one-call read path the public site is meant to use — see this file's header for the contract
 * a `false` here obliges the caller to honor.
 *
 * A named function rather than "call `getPublicAssistantSettings` and read `.publicEnabled`",
 * because the call site that matters is a render/route-registration decision on the public path, and
 * the shorter the thing that decision has to reach for, the less likely it is to be replaced by
 * something cheaper and wrong.
 *
 * @complexity O(1).
 * @overallScore 100
 */
export async function isPublicAssistantEnabled(
  deps: GetPublicAssistantSettingsDeps,
  input: { workspaceId: UUID }
): Promise<boolean> {
  const settings = await getPublicAssistantSettings(deps, input);
  return settings.publicEnabled;
}

export class PublicAssistantSettingsValidationError extends Error {}

export interface PublicAssistantSettingsWriteDeps extends GetPublicAssistantSettingsDeps {
  clock: ClockPort;
  ids: IdGeneratorPort;
  authorize: AuthorizeFn;
  principals: PrincipalRepoPort;
}

export interface SetPublicAssistantSettingsInput {
  workspaceId: UUID;
  patch: Partial<PublicAssistantSettings>;
  callerPrincipalId: UUID;
}

/** The permission the admin routes gate on, and the override the ledger write below carries.
 * Follows the frozen `admin.<section>.<action>` convention `admin.seo.manage`'s own doc comment
 * names as the shape new admin sections should register under. */
export const ADMIN_ASSISTANT_PERMISSION = "admin.assistant.manage";

/**
 * Validate-then-write chokepoint, mirroring `setSeoSettings`/`setCommentsSettings`.
 *
 * An omitted field is left alone (partial patch), an explicitly non-boolean field is a rejection
 * before ANY write — with one field that all-or-nothing rule is trivially satisfied, but it is kept
 * in the same shape so adding the second control (a budget cap) does not have to reintroduce it.
 *
 * `requiredPermissionOverride` is set for the same disclosed reason SEO's identical call sets it:
 * without it the chokepoint runs a SECOND, scope-derived `settings.workspace.write` check that a
 * principal holding only `admin.assistant.manage` would fail, surfacing as a masked 500 rather than
 * either success or a clear 403.
 *
 * @returns The settings as they now read, so a caller need not issue a follow-up GET.
 * @throws {PublicAssistantSettingsValidationError} If `publicEnabled` is present and not a boolean.
 * @complexity O(1) — at most one ledger write.
 * @overallScore 100
 */
export async function setPublicAssistantSettings(
  deps: PublicAssistantSettingsWriteDeps,
  input: SetPublicAssistantSettingsInput
): Promise<PublicAssistantSettings> {
  if (input.patch.publicEnabled !== undefined && typeof input.patch.publicEnabled !== "boolean") {
    throw new PublicAssistantSettingsValidationError("publicEnabled must be a boolean");
  }

  if (input.patch.publicEnabled !== undefined) {
    await set({
      deps: {
        repo: deps.settingsRepo,
        clock: deps.clock,
        ids: deps.ids,
        authorize: deps.authorize,
        principals: deps.principals,
      },
      input: {
        namespace: ASSISTANT_NAMESPACE,
        key: "public_enabled",
        scope: "workspace",
        value: input.patch.publicEnabled,
        workspaceId: input.workspaceId,
        authWorkspaceId: input.workspaceId,
        callerPrincipalId: input.callerPrincipalId,
        requiredPermissionOverride: ADMIN_ASSISTANT_PERMISSION,
      },
    });
  }

  return getPublicAssistantSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: input.workspaceId });
}
