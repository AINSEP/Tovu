import type { UUID } from "../core/ports";
import {
  ensureSettingDefinitions,
  type EnsureSettingDefinitionsDeps,
  type SettingDefinitionSpec,
} from "../features/settings/ensure-definitions";

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

/** Narrows the shared spec's open `key: string` to this namespace's own key
 *  union, so a typo here is a compile error rather than a definition
 *  registered under a key nothing reads. */
interface ExecutionDefinitionSpec extends SettingDefinitionSpec {
  key: ExecutionSettingKey;
}

/** The 8 registered `core.execution.*` definitions. No `byok.apiKey` — see
 *  this file's header. Scope is the shared default (workspace): one operator's
 *  endpoint choice doesn't silently become every workspace's. */
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
  // persisted as a map here, and deliberately so: storing it would need
  // another `{type:"json"}` definition, and ADR-PIPE-008 Enforcement is
  // normative that this variant is reserved for genuinely unbounded,
  // list-shaped data with no scalar decomposition available (as of this
  // comment: `site.seo.robots_rules`, `core.analytics.excludedPaths`,
  // `core.analytics.excludedIpRanges` — see `features/settings/types.ts`'s
  // `SettingValueSchema` doc comment) — a per-agent map keyed by an operator's
  // own agent ids is not that; it is a scalar-decomposable field encoded as
  // JSON to skip the decomposition work, which is exactly what the rule
  // blocks. Encoding the map as a JSON *string* would be the same escape
  // hatch with the type check laundered off, which is worse, not better.
  //
  // Consequence, stated rather than hidden: the per-agent map is live for as
  // long as the tab is open, but a reload restores only the selected agent's
  // model. Picking a different agent then shows that agent's own first
  // reported model rather than a previously-saved pick for it. Persisting the
  // full map needs either a scalar-per-agent scheme (unbounded keys) or an
  // ADR-PIPE-008 amendment; neither belongs in this pass.
  { key: "localCli.model", schema: { type: "string" }, defaultValue: "" },
];

export type EnsureExecutionSettingDefinitionsDeps = EnsureSettingDefinitionsDeps;

export interface EnsureExecutionSettingDefinitionsInput {
  /** The trusted boot-time actor these writes are attributed to (mirrors
   *  `seo/settings.ts`'s/`comments/settings.ts`'s identical convention). */
  systemPrincipalId: UUID;
}

/**
 * Idempotently registers the 8 `core.execution.*` definitions. Safe to call on
 * every boot. The skip-if-registered loop, the `ownerKind: "core"` /
 * `workspaceId: null` namespace-fence handling, and the boot-trust shim all
 * live in `features/settings/ensure-definitions.ts` — this module owns only
 * the definition list above.
 *
 * @complexity O(1) — 8 definitions, each a skip-if-registered check plus at
 * most one `registerDefinitions` call.
 * @overallScore 100
 */
export async function ensureExecutionSettingDefinitions(
  deps: EnsureExecutionSettingDefinitionsDeps,
  input: EnsureExecutionSettingDefinitionsInput
): Promise<void> {
  await ensureSettingDefinitions(deps, {
    namespace: EXECUTION_NAMESPACE,
    definitions: EXECUTION_DEFINITIONS,
    systemPrincipalId: input.systemPrincipalId,
  });
}
