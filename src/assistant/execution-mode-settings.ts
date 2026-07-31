import type { ClockPort, IdGeneratorPort, UUID } from "../core/ports";
import type { PrincipalRepoPort } from "../identity/ports";
import type { SettingsRepoPort } from "../features/settings/ports";
import { resolveDefinitionRaw } from "../features/settings/settings";
import { SCOPE_BIT, type SettingValueSchema } from "../features/settings/types";
import { registerDefinitions, type AuthorizeFn } from "../features/settings/write-service";

/**
 * @file Boot-time `core.execution.*` setting-definition registration for the
 * admin "Execution mode" tab (Local CLI vs. BYOK — `@jini-ai/ui`'s
 * `ExecutionTab`, mounted by `apps/admin/src/sections/SettingsUi.tsx`).
 *
 * This is deliberately the ONLY piece of custom server code the execution
 * tab's ledger persistence needs. Unlike `comments/settings.ts` /
 * `seo/settings.ts` / `assistant/public-assistant-settings.ts`, there is no
 * bespoke `getExecutionModeSettings`/`setExecutionModeSettings` pair and no
 * dedicated `admin.execution.manage` permission here: `apps/admin/src/lib/
 * execution-settings.ts` reads and writes these keys directly through the
 * generic SPEC-007 ledger routes (`getSettingsEffective`/`setSetting`), the
 * same "raw ledger browser" surface every namespace already exposes, gated
 * by the ledger's own scope-derived `settings.workspace.write` check. The
 * curated tab is a nicer UI over that same generic store, not a second one —
 * matching that file's own header comment. All this module owns is making
 * sure the namespace has registered definitions to write into, since SPEC-007
 * rejects a value for any key with none (the bug this file fixes: saving
 * previously failed with "setting 'core.execution.byok.model' was not found").
 *
 * OWNER KIND: `core`, not `site`. Execution mode is a platform-level
 * capability (which agent runtime backs the ADMIN's own assistant), not
 * per-site content — mirrors `features/settings/migration.ts`'s
 * `core.presentation.activeThemeId` (the one other `ownerKind: "core"`
 * registration in this codebase): `workspaceId: null` at the DEFINITION
 * level (the namespace-fence CHECK requires this for `owner_kind='core'`),
 * while `scopes: SCOPE_BIT.workspace` still lets each workspace hold its own
 * VALUE row — the same split `core.presentation.activeThemeId` uses with
 * `SCOPE_BIT.global` instead. Execution mode picks the workspace bit (not
 * global) because the pre-existing canary already scoped its writes to
 * `"workspace"` ("one operator's endpoint choice doesn't silently become
 * every workspace's" — `execution-settings.ts`'s own prior comment) and nothing
 * in this pass had reason to widen that.
 *
 * WHAT IS DELIBERATELY NOT REGISTERED HERE: `byok.apiKey`. ADR-028 §6 is
 * normative — "until the secret-store ADR lands, `registerDefinitions`
 * REJECTS any `secret:true` definition" — so a `secret:true` key cannot be
 * registered at all, and registering the raw key as a plain (non-secret)
 * string definition would be worse: every ledger write goes through the
 * append-only `setting_revisions` table (ADR-028 §4), which has no
 * redaction path for a non-secret value, so the key would sit in plaintext
 * in the revision history and in any future settings export forever. Per the
 * dispatch brief's explicit instruction, this does NOT invent a new
 * server-side secret store to work around that gate either. The API key
 * instead lives in the admin browser's own localStorage, exactly mirroring
 * Open Design's real BYOK security model (trace §1: `state/config.ts`'s
 * `STORAGE_KEY = 'open-design:config'`, a plaintext `localStorage` blob the
 * daemon never persists server-side) — see `execution-settings.ts` for the
 * client-side half of this split.
 */

/** SPEC-007 namespace holding the non-secret execution-mode keys. */
export const EXECUTION_NAMESPACE = "core.execution";

/**
 * Sentinel for `maxTokens: undefined` ("use the model's own default").
 * `validateDefinitionInput` (`features/settings/settings.ts`) rejects a null
 * `default_json` for EVERY non-secret definition, full stop — there is no
 * nullable-schema carve-out in the actual write-service check, whatever the
 * ADR-028 §6 prose says about "may be JSON null iff nullable" (confirmed by
 * `features/settings/__tests__/settings.registration.test.ts`'s own
 * "rejects a null default for a non-secret definition (totality)" case).
 * Mirrors `comments/settings.ts`'s identical `CLOSE_AFTER_DAYS_NEVER_SENTINEL`
 * pattern; `0` is the natural sentinel here because `@jini-ai/ui`'s
 * `parseMaxTokens` (`tabs/execution/rules.ts`) already treats 0 as
 * meaningless — it rejects zero, negatives, and non-integers alike as
 * `undefined` rather than storing them — so `0` can never collide with a
 * real user-entered cap.
 */
const MAX_TOKENS_UNSET_SENTINEL = 0;

type ExecutionSettingKey =
  | "mode"
  | "byok.protocol"
  | "byok.providerId"
  | "byok.baseUrl"
  | "byok.model"
  | "byok.maxTokens"
  | "localCli.agentId"
  | "localCli.model";

interface ExecutionDefinitionSpec {
  key: ExecutionSettingKey;
  schema: SettingValueSchema;
  /** Every non-secret definition needs a non-null default (totality) — see
   *  `MAX_TOKENS_UNSET_SENTINEL`'s doc comment for why none of these six use
   *  a literal `null`, even for the one nullable-in-spirit field. */
  defaultValue: string | number | boolean;
}

/** The 8 registered `core.execution.*` definitions. No `byok.apiKey` — see
 *  this file's header. */
const EXECUTION_DEFINITIONS: readonly ExecutionDefinitionSpec[] = [
  { key: "mode", schema: { type: "enum", values: ["local-cli", "byok"] }, defaultValue: "local-cli" },
  {
    key: "byok.protocol",
    schema: { type: "enum", values: ["anthropic", "openai", "azure", "google"] },
    defaultValue: "anthropic",
  },
  // `null` selects the custom/manual endpoint rather than a preset (mirrors
  // `@jini-ai/ui`'s `ByokConfig.providerId` contract) — nullable, but the
  // registered default is the non-null string "anthropic" (ADR-028 totality).
  { key: "byok.providerId", schema: { type: "string", nullable: true }, defaultValue: "anthropic" },
  { key: "byok.baseUrl", schema: { type: "string" }, defaultValue: "https://api.anthropic.com" },
  { key: "byok.model", schema: { type: "string" }, defaultValue: "" },
  // See `MAX_TOKENS_UNSET_SENTINEL`'s doc comment for why this is a plain
  // (non-nullable) number definition defaulting to the sentinel rather than
  // a nullable schema defaulting to `null`.
  { key: "byok.maxTokens", schema: { type: "number" }, defaultValue: MAX_TOKENS_UNSET_SENTINEL },
  // Which detected CLI runs the admin assistant's prompts. Empty string is
  // "none picked yet" — `@jini-ai/ui` models that as `agentId: null`, but a
  // non-null default is required (ADR-028 totality), and `""` is not a legal
  // agent id, so it cannot collide with a real selection.
  { key: "localCli.agentId", schema: { type: "string" }, defaultValue: "" },
  // The model for the SELECTED agent only.
  //
  // `@jini-ai/ui`'s `LocalCliConfig.modelByAgentId` is a per-agent MAP, so
  // switching agents and back preserves each one's own pick. That map is not
  // persisted as a map here, and deliberately so: storing it would need a
  // second `{type:"json"}` definition, and ADR-PIPE-008 Enforcement is
  // normative that this ledger has exactly ONE such definition in the whole
  // codebase (`site.seo.robots_rules`) — a JSON value is not a general escape
  // hatch for fields that can be scalar-decomposed. Encoding the map as a JSON
  // *string* would be the same escape hatch with the type check laundered off,
  // which is worse, not better.
  //
  // Consequence, stated rather than hidden: the per-agent map is live for as
  // long as the tab is open, but a reload restores only the selected agent's
  // model. Picking a different agent then shows that agent's own first
  // reported model rather than a previously-saved pick for it. Persisting the
  // full map needs either a scalar-per-agent scheme (unbounded keys) or an
  // ADR-PIPE-008 amendment; neither belongs in this pass.
  { key: "localCli.model", schema: { type: "string" }, defaultValue: "" },
];

export interface EnsureExecutionSettingDefinitionsDeps {
  settingsRepo: SettingsRepoPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  principals: PrincipalRepoPort;
}

export interface EnsureExecutionSettingDefinitionsInput {
  /** The trusted boot-time actor these writes are attributed to (mirrors
   *  `seo/settings.ts`'s/`comments/settings.ts`'s identical convention). */
  systemPrincipalId: UUID;
}

/** Boot-time infra work is trusted by construction — mirrors every other
 *  `ensure*SettingDefinitions`'s identical shim. */
const alwaysAllowBoot: AuthorizeFn = async () => ({ allowed: true, reason: "system_boot" });

function bootWriteServiceDeps(deps: EnsureExecutionSettingDefinitionsDeps) {
  return { repo: deps.settingsRepo, clock: deps.clock, ids: deps.ids, authorize: alwaysAllowBoot, principals: deps.principals };
}

/**
 * Idempotently registers the 8 `core.execution.*` definitions (skip if
 * already registered, mirrors `ensureSeoSettingDefinitions`/
 * `ensureCommentsSettingDefinitions`/`ensurePublicAssistantSettingDefinitions`).
 * Safe to call on every boot.
 *
 * Unlike those three (all `ownerKind: "site"`), this registers `ownerKind:
 * "core"` definitions, so — per the namespace-fence CHECK — `workspaceId` is
 * `null` at the DEFINITION level regardless of which workspace is booting;
 * `resolveDefinitionRaw`'s own lookup below passes `workspaceId: null` to
 * match (a per-workspace lookup would never find a platform definition).
 *
 * @complexity O(1) — 8 definitions, each a skip-if-registered check plus at
 * most one `registerDefinitions` call.
 * @overallScore 100
 */
export async function ensureExecutionSettingDefinitions(
  deps: EnsureExecutionSettingDefinitionsDeps,
  input: EnsureExecutionSettingDefinitionsInput
): Promise<void> {
  for (const def of EXECUTION_DEFINITIONS) {
    const existing = await resolveDefinitionRaw(
      { repo: deps.settingsRepo },
      { namespace: EXECUTION_NAMESPACE, key: def.key, workspaceId: null }
    );
    if (existing) continue;

    await registerDefinitions({
      deps: bootWriteServiceDeps(deps),
      input: {
        callerPrincipalId: input.systemPrincipalId,
        // Platform (core) definitions aren't scoped to any one workspace, but
        // `registerDefinitions`'s authorization check still needs a workspace
        // context to authorize against — the seeded workspace mirrors every
        // other boot-time registrar's identical `authWorkspaceId` shape.
        authWorkspaceId: input.systemPrincipalId,
        definitions: [
          {
            namespace: EXECUTION_NAMESPACE,
            key: def.key,
            ownerKind: "core",
            workspaceId: null,
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
