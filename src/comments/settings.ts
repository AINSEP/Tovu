import type { ClockPort, IdGeneratorPort, JsonValue, UUID } from "../core/ports";
import type { PrincipalRepoPort } from "../identity/ports";
import type { SettingsRepoPort } from "../features/settings/ports";
import { getEffective, resolveDefinitionRaw } from "../features/settings/settings";
import { SCOPE_BIT, type SettingValueSchema } from "../features/settings/types";
import { registerDefinitions, set, type AuthorizeFn } from "../features/settings/write-service";
import { CommentsSettingsValidationError } from "./errors";
import type { CommentsSettings } from "./types";

/**
 * @file `getCommentsSettings`/`setCommentsSettings`/`ensureCommentsSettingDefinitions` — the
 * ADR-028 Settings Layered Ledger wiring for `CommentsSettings` (ADR-031 §2's own doc on that
 * type: "Stored via the Settings Layered Ledger... under a `comments.*` namespace once that
 * wiring exists — NOT as a comment table"). Namespace is `site.comments` (not a bare `comments`)
 * — the ledger's namespace owner fence requires every `ownerKind: "site"` definition to start
 * with `site.` (see `COMMENTS_NAMESPACE`'s own comment below), mirroring `site.seo`. Mirrors
 * `src/seo/settings.ts`'s exact shape — same idempotent-definitions / getEffective-read /
 * validate-then-set-write structure, applied to Comments' 6 scalar fields instead of SEO's 8.
 *
 * Every `CommentsSettings` field is a plain scalar (boolean/number/nullable-number) — none needs
 * the ledger's `{type:"json"}` escape hatch, which Code Review must keep to its one existing
 * `site.seo.robots_rules` use (see `features/settings/types.ts`'s own doc on that variant).
 */

// ADR-028's namespace owner fence (`features/settings/settings.ts`'s `NAMESPACE_FENCE`) requires
// `ownerKind: "site"` definitions to be namespaced under `site.` — mirrors `site.seo`'s identical
// constraint (`seo/settings.ts`'s own `SEO_NAMESPACE`). A bare `"comments"` namespace fails REQ-02
// validation at the write chokepoint (caught directly by this file's own test suite, not
// theoretical).
const COMMENTS_NAMESPACE = "site.comments";

type CommentsSettingKey =
  | "enabled"
  | "require_moderation"
  | "max_depth"
  | "close_after_days"
  | "spam_auto_reject_score"
  | "max_per_ip_per_hour";

interface CommentsDefinitionSpec {
  key: CommentsSettingKey;
  schema: SettingValueSchema;
  defaultValue: JsonValue;
}

/** Sentinel for `closeAfterDays: null` ("never closes") — every non-secret definition needs a
 * non-null `default_json` (ledger totality, `validateDefinitionInput`'s INV-02), so a literal
 * `null` default is rejected at registration. Mirrors `seo/settings.ts`'s own `""`-means-absent
 * sentinel for its nullable string fields, applied to a nullable NUMBER field instead: -1 is not
 * a valid `closeAfterDays` value (negative day counts are rejected by `validateCommentsSettingsPatch`
 * below), so it can't collide with a real write. */
const CLOSE_AFTER_DAYS_NEVER_SENTINEL = -1;

/** The 6 registered `comments.*` definitions, defaults matching the pre-ledger
 * `DEFAULT_COMMENTS_SETTINGS` constant byte-for-byte, so migrating to the ledger changes no
 * workspace's effective settings on day one. */
const COMMENTS_DEFINITIONS: readonly CommentsDefinitionSpec[] = [
  { key: "enabled", schema: { type: "boolean" }, defaultValue: true },
  { key: "require_moderation", schema: { type: "boolean" }, defaultValue: true },
  { key: "max_depth", schema: { type: "number" }, defaultValue: 5 },
  { key: "close_after_days", schema: { type: "number", nullable: true }, defaultValue: CLOSE_AFTER_DAYS_NEVER_SENTINEL },
  { key: "spam_auto_reject_score", schema: { type: "number" }, defaultValue: 0.5 },
  { key: "max_per_ip_per_hour", schema: { type: "number" }, defaultValue: 20 },
];

export interface EnsureCommentsSettingDefinitionsDeps {
  settingsRepo: SettingsRepoPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  principals: PrincipalRepoPort;
}

export interface EnsureCommentsSettingDefinitionsInput {
  workspaceId: UUID;
  /** The trusted boot-time actor these writes are attributed to (mirrors `seo/settings.ts`'s
   * identical `systemPrincipalId` convention — a fixed, well-known id, not required to resolve to
   * a real `identity` principal row; see that file's `EnsureSeoSettingDefinitionsInput` doc). */
  systemPrincipalId: UUID;
}

/** Boot-time infra work is trusted by construction (mirrors `seo/settings.ts`'s identical shim). */
const alwaysAllowBoot: AuthorizeFn = async () => ({ allowed: true, reason: "system_boot" });

function bootWriteServiceDeps(deps: EnsureCommentsSettingDefinitionsDeps) {
  return {
    repo: deps.settingsRepo,
    clock: deps.clock,
    ids: deps.ids,
    authorize: alwaysAllowBoot,
    principals: deps.principals,
  };
}

/** Idempotently registers the 6 `comments.*` definitions (skip if already registered, mirrors
 * `ensureSeoSettingDefinitions`'s identical pattern). Safe to call on every boot. */
export async function ensureCommentsSettingDefinitions(
  deps: EnsureCommentsSettingDefinitionsDeps,
  input: EnsureCommentsSettingDefinitionsInput
): Promise<void> {
  for (const def of COMMENTS_DEFINITIONS) {
    const existing = await resolveDefinitionRaw(
      { repo: deps.settingsRepo },
      { namespace: COMMENTS_NAMESPACE, key: def.key, workspaceId: input.workspaceId }
    );
    if (existing) continue;

    await registerDefinitions({
      deps: bootWriteServiceDeps(deps),
      input: {
        callerPrincipalId: input.systemPrincipalId,
        authWorkspaceId: input.workspaceId,
        definitions: [
          {
            namespace: COMMENTS_NAMESPACE,
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

async function readKey(
  settingsRepo: SettingsRepoPort,
  workspaceId: UUID,
  key: CommentsSettingKey
): Promise<JsonValue | null> {
  const resolved = await getEffective(
    { repo: settingsRepo },
    { namespace: COMMENTS_NAMESPACE, key, scopeContext: { workspaceId } }
  );
  return resolved ? resolved.value : null;
}

export interface GetCommentsSettingsDeps {
  settingsRepo: SettingsRepoPort;
}

/** Reads all 6 `comments.*` values via `getEffective`. Falls back to the pre-ledger default for
 * any key that isn't set yet (e.g. `ensureCommentsSettingDefinitions` hasn't run in this
 * composition — mirrors `getSeoSettings`'s identical defensive-default shape). */
export async function getCommentsSettings(
  deps: GetCommentsSettingsDeps,
  input: { workspaceId: UUID }
): Promise<CommentsSettings> {
  const [enabled, requireModeration, maxDepth, closeAfterDays, spamAutoRejectScore, maxPerIpPerHour] = await Promise.all([
    readKey(deps.settingsRepo, input.workspaceId, "enabled"),
    readKey(deps.settingsRepo, input.workspaceId, "require_moderation"),
    readKey(deps.settingsRepo, input.workspaceId, "max_depth"),
    readKey(deps.settingsRepo, input.workspaceId, "close_after_days"),
    readKey(deps.settingsRepo, input.workspaceId, "spam_auto_reject_score"),
    readKey(deps.settingsRepo, input.workspaceId, "max_per_ip_per_hour"),
  ]);

  return {
    enabled: enabled !== false,
    requireModeration: requireModeration !== false,
    maxDepth: typeof maxDepth === "number" ? maxDepth : 5,
    // Unwraps this file's own sentinel (see `CLOSE_AFTER_DAYS_NEVER_SENTINEL`'s doc comment).
    closeAfterDays: typeof closeAfterDays === "number" && closeAfterDays !== CLOSE_AFTER_DAYS_NEVER_SENTINEL ? closeAfterDays : null,
    spamAutoRejectScore: typeof spamAutoRejectScore === "number" ? spamAutoRejectScore : 0.5,
    maxPerIpPerHour: typeof maxPerIpPerHour === "number" ? maxPerIpPerHour : 20,
  };
}

export interface SetCommentsSettingsDeps extends GetCommentsSettingsDeps {
  clock: ClockPort;
  ids: IdGeneratorPort;
  authorize: AuthorizeFn;
  principals: PrincipalRepoPort;
}

export interface SetCommentsSettingsInput {
  workspaceId: UUID;
  patch: Partial<CommentsSettings>;
  callerPrincipalId: UUID;
}

const MAX_DEPTH_CEILING = 20;
const MAX_PER_IP_PER_HOUR_CEILING = 1000;

function validateCommentsSettingsPatch(patch: Partial<CommentsSettings>): void {
  if (patch.enabled !== undefined && typeof patch.enabled !== "boolean") {
    throw new CommentsSettingsValidationError("enabled must be a boolean");
  }
  if (patch.requireModeration !== undefined && typeof patch.requireModeration !== "boolean") {
    throw new CommentsSettingsValidationError("requireModeration must be a boolean");
  }
  if (patch.maxDepth !== undefined) {
    if (typeof patch.maxDepth !== "number" || !Number.isInteger(patch.maxDepth) || patch.maxDepth < 0) {
      throw new CommentsSettingsValidationError("maxDepth must be a non-negative integer");
    }
    if (patch.maxDepth > MAX_DEPTH_CEILING) {
      throw new CommentsSettingsValidationError(`maxDepth must be at most ${MAX_DEPTH_CEILING}`);
    }
  }
  if (patch.closeAfterDays !== undefined && patch.closeAfterDays !== null) {
    if (typeof patch.closeAfterDays !== "number" || !Number.isInteger(patch.closeAfterDays) || patch.closeAfterDays < 0) {
      throw new CommentsSettingsValidationError("closeAfterDays must be a non-negative integer or null");
    }
  }
  if (patch.spamAutoRejectScore !== undefined) {
    if (typeof patch.spamAutoRejectScore !== "number" || patch.spamAutoRejectScore < 0 || patch.spamAutoRejectScore > 1) {
      throw new CommentsSettingsValidationError("spamAutoRejectScore must be a number in [0,1]");
    }
  }
  if (patch.maxPerIpPerHour !== undefined) {
    if (typeof patch.maxPerIpPerHour !== "number" || !Number.isInteger(patch.maxPerIpPerHour) || patch.maxPerIpPerHour < 1) {
      throw new CommentsSettingsValidationError("maxPerIpPerHour must be a positive integer");
    }
    if (patch.maxPerIpPerHour > MAX_PER_IP_PER_HOUR_CEILING) {
      throw new CommentsSettingsValidationError(`maxPerIpPerHour must be at most ${MAX_PER_IP_PER_HOUR_CEILING}`);
    }
  }
}

/** Validate ALL fields (all-or-nothing) -> N ledger `set()` calls (mirrors `setSeoSettings`). */
export async function setCommentsSettings(
  deps: SetCommentsSettingsDeps,
  input: SetCommentsSettingsInput
): Promise<CommentsSettings> {
  validateCommentsSettingsPatch(input.patch);

  const writes: Array<{ key: CommentsSettingKey; value: JsonValue }> = [];
  if (input.patch.enabled !== undefined) writes.push({ key: "enabled", value: input.patch.enabled });
  if (input.patch.requireModeration !== undefined) writes.push({ key: "require_moderation", value: input.patch.requireModeration });
  if (input.patch.maxDepth !== undefined) writes.push({ key: "max_depth", value: input.patch.maxDepth });
  if (input.patch.closeAfterDays !== undefined) {
    // Wraps this file's own sentinel on write (see `CLOSE_AFTER_DAYS_NEVER_SENTINEL`'s doc comment).
    writes.push({ key: "close_after_days", value: input.patch.closeAfterDays ?? CLOSE_AFTER_DAYS_NEVER_SENTINEL });
  }
  if (input.patch.spamAutoRejectScore !== undefined) writes.push({ key: "spam_auto_reject_score", value: input.patch.spamAutoRejectScore });
  if (input.patch.maxPerIpPerHour !== undefined) writes.push({ key: "max_per_ip_per_hour", value: input.patch.maxPerIpPerHour });

  for (const write of writes) {
    await set({
      deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.ids, authorize: deps.authorize, principals: deps.principals },
      input: {
        namespace: COMMENTS_NAMESPACE,
        key: write.key,
        scope: "workspace",
        value: write.value,
        workspaceId: input.workspaceId,
        authWorkspaceId: input.workspaceId,
        callerPrincipalId: input.callerPrincipalId,
        // Round-1 external audit (2026-07-16, TM-adr046-phase3-comments-audit-001, codex
        // codex-r1-B-001, independently verified): the PUT route already authorizes
        // "comments.configure" before calling this function -- that IS the permission the admin
        // UI advertises as sufficient to change Comments settings. Without this override, the
        // chokepoint's default scope-derived "settings.workspace.write" check ran a SECOND,
        // unrelated authz check that a comments.configure-only principal would fail, surfacing as
        // a masked 500 rather than either success or a clear 403.
        requiredPermissionOverride: "comments.configure",
      },
    });
  }

  return getCommentsSettings({ settingsRepo: deps.settingsRepo }, { workspaceId: input.workspaceId });
}
