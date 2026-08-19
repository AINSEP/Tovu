import type { ClockPort, IdGeneratorPort, JsonValue, UUID } from "@jini-ai/cms/core";
import type { PrincipalRepoPort } from "@jini-ai/cms/identity";
import { type SettingsRepoPort, type SettingValueSchema, type AuthorizeFn } from "../features/settings.js";

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
 * Structural signatures matching `features/settings`'s real settings-engine functions/constants
 * (`@jini-ai/cms/settings`, re-exported unchanged by `features/settings/index.ts`). Redeclared
 * locally and injected via the deps bags below, rather than imported as VALUES — importing them as
 * values here is exactly the edge that would close an `[assistant, features/settings]` module cycle
 * once `settings` converts to the standard `registerToolContributor` pattern (which adds a
 * `features/settings -> assistant` edge), since this file already sits inside `assistant/`. Same
 * Option-B-style technique `vendor-credentials/store.ts`'s `extractGitHubLogin`, `dual-read.ts`'s
 * legacy-table imports, and `assistant/site/*`'s `listPublishedPosts` already use elsewhere in this
 * rollout. Each type here mirrors only the slice of the real function's signature this file actually
 * calls — see each deps field's own doc for how the real implementation reaches this file despite the
 * type living here instead of being imported.
 */
type ResolveDefinitionRaw = (
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; workspaceId: string | null },
) => Promise<unknown>;

type GetEffective = (
  deps: { repo: SettingsRepoPort },
  input: { namespace: string; key: string; scopeContext: { workspaceId: UUID } },
) => Promise<{ value: JsonValue | null } | null>;

type RegisterDefinitions = (required: {
  deps: {
    repo: SettingsRepoPort;
    clock: ClockPort;
    ids: IdGeneratorPort;
    authorize: AuthorizeFn;
    principals: PrincipalRepoPort;
  };
  input: {
    // NOT `readonly` — the real `registerDefinitions`'s own `DefinitionInput[]` is mutable, and a
    // `readonly` array type here is not assignable to a mutable one for the composition root's
    // assignment of the real function into this deps slot (contravariant parameter check).
    definitions: {
      namespace: string;
      key: string;
      ownerKind: "site";
      workspaceId: UUID;
      schema: SettingValueSchema;
      defaultValue: JsonValue;
      scopes: number;
      secret: boolean;
    }[];
    callerPrincipalId: UUID;
    authWorkspaceId: UUID;
  };
}) => Promise<{ registered: string[] }>;

type SetSettingValue = (required: {
  deps: {
    repo: SettingsRepoPort;
    clock: ClockPort;
    ids: IdGeneratorPort;
    authorize: AuthorizeFn;
    principals: PrincipalRepoPort;
  };
  input: {
    namespace: string;
    key: string;
    scope: "workspace";
    value: JsonValue;
    workspaceId: UUID;
    authWorkspaceId: UUID;
    callerPrincipalId: UUID;
    requiredPermissionOverride?: string;
  };
}) => Promise<{ value: JsonValue; revisionSeq: number }>;

/**
 * Structural signature matching `features/settings`'s real `SCOPE_BIT` export — a plain bitmask
 * CONSTANT, not a function. Injected for uniformity with the 4 function types above rather than
 * relocated to a new shared module: this file's deps bags already inject every other engine value it
 * needs from `features/settings`, and `features/settings/index.ts`'s own header states this host
 * deliberately funnels every consumer through its barrel rather than deep-importing
 * `@jini-ai/cms/settings` submodules directly (mirrors `identity`'s/`media`'s identical shim
 * pattern) — sourcing `SCOPE_BIT` straight from the package here to dodge the graph would reopen
 * exactly that deep-import bypass for two call sites, trading one prose-guarded exception for
 * another instead of removing it. A constant carries no reimplementation risk the way a function
 * would, so injecting it is pure ceremony, not a safety measure — but the ceremony buys one pattern
 * for this file's whole deps surface instead of two.
 */
type ScopeBit = { readonly global: number; readonly workspace: number; readonly user: number };

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
  /** The real `features/settings`'s own `resolveDefinitionRaw` — injected rather than statically
   *  imported; see this file's header. Wired to the real implementation at the composition root. */
  resolveDefinitionRaw: ResolveDefinitionRaw;
  /** The real `features/settings`'s own `registerDefinitions` — injected rather than statically
   *  imported; see this file's header. Wired to the real implementation at the composition root. */
  registerDefinitions: RegisterDefinitions;
  /** The real `features/settings`'s own `SCOPE_BIT` — injected rather than statically imported; see
   *  the `ScopeBit` type's own doc for why a constant is injected here too. */
  scopeBit: ScopeBit;
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
    const existing = await deps.resolveDefinitionRaw(
      { repo: deps.settingsRepo },
      { namespace: ASSISTANT_NAMESPACE, key: def.key, workspaceId: input.workspaceId }
    );
    if (existing) continue;

    await deps.registerDefinitions({
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
            scopes: deps.scopeBit.workspace,
            secret: false,
          },
        ],
      },
    });
  }
}

export interface GetPublicAssistantSettingsDeps {
  settingsRepo: SettingsRepoPort;
  /** The real `features/settings`'s own `getEffective` — injected rather than statically imported;
   *  see this file's header. Wired to the real implementation at the composition root. */
  getEffective: GetEffective;
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
  const resolved = await deps.getEffective(
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
  /** The real `features/settings`'s own `set` — injected rather than statically imported; see this
   *  file's header. Wired to the real implementation at the composition root. */
  set: SetSettingValue;
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
    await deps.set({
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

  return getPublicAssistantSettings(
    { settingsRepo: deps.settingsRepo, getEffective: deps.getEffective },
    { workspaceId: input.workspaceId }
  );
}
