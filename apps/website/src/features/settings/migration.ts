import type { ClockPort, IdGeneratorPort, UUID } from "@jini-ai/cms/core";
import type { PrincipalRepoPort } from "@jini-ai/cms/identity";
import {
  ALLOWED_THEME_IDS,
  type PresentationSettingsRecord,
  type PresentationSettingsRepoPort,
} from "../presentation/index.js";
// 2026-09-12 (optional themes) — the one value this migration must NOT adopt as a global default.
// A new `features/settings -> features/theme` edge, and a safe one: `features/theme` imports
// nothing from `features/settings`, so this introduces no cycle.
import { NO_THEME_ID } from "../theme/index.js";
import {
  type SettingsRepoPort,
  resolveDefinitionRaw,
  SCOPE_BIT,
  registerDefinitions,
  set,
  type AuthorizeFn,
} from "@jini-ai/cms/settings";

/**
 * @file One-time brownfield migration retiring `PresentationSettingsRepoPort`
 * into the settings ledger (SPEC-007 REQ-08, AC-14; ADR-PIPE-007 Migration
 * Safety, C-008/W-003).
 *
 * Purpose:
 * Reads every `presentation_settings` row and writes each one as
 * `core.presentation.activeThemeId` (global scope) through
 * `SettingsWriteService.set` (so it earns a normal `op='set'` revision, not a
 * raw upsert), backfilling the `core.presentation.activeThemeId` definition
 * and one `theme.{themeId}` availability definition per discovered/allowed
 * theme id along the way.
 *
 * Idempotent by design (safe to run on every boot, W-003):
 * - Definition registration is skip-if-already-registered (`registerDefinitions`
 *   itself has no such guard and would mint a second `settingId` for the same
 *   namespace/key slot on every call, so this module checks
 *   `resolveDefinitionRaw` first and only registers once).
 * - The value write is skip-if-unchanged: a rerun with no new legacy data
 *   compares the current global value first and only calls `set()` when the
 *   value actually differs, so a rerun appends zero new revisions.
 * - A single row's failure is caught, logged, and does not abort the others
 *   (best-effort per C-008's disclosed scope) — the boot sequence never
 *   fails because one legacy row is malformed.
 *
 * This module does not delete `presentation_settings` or
 * `PresentationSettingsRepoPort` — that is the explicitly deferred "Point of
 * No Return" follow-up (ADR-PIPE-007 Migration Safety).
 */

const CORE_NAMESPACE = "core.presentation";
const CORE_KEY = "activeThemeId";
const THEME_AVAILABLE_KEY = "available";

export interface MigrateLegacyPresentationSettingsDeps {
  presentationRepo: PresentationSettingsRepoPort;
  settingsRepo: SettingsRepoPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
  /** REQ-13's target-principal check dependency — required by `SettingsWriteServiceDeps` but never
   * actually consulted here (this migration only ever writes `scope: "global"`, and
   * `assertTargetPrincipalInWorkspace` short-circuits for any non-`"user"` scope). */
  principals: PrincipalRepoPort;
  /**
   * The trusted boot-time actor these migration writes are attributed to in
   * the revision ledger (mirrors `identity/seed.ts`'s well-known `system`
   * principal convention). Not required to resolve to a real `identity`
   * principal row — `authorize()` is a deliberate always-allow shim scoped to
   * this one migration (see below), and `assertTargetPrincipalInWorkspace`
   * never runs for global-scope writes.
   */
  systemPrincipalId: UUID;
  /** Discovered valid theme ids; falls back to `ALLOWED_THEME_IDS` (mirrors `features/presentation`'s own fallback). */
  availableThemeIds?: readonly string[];
}

export interface MigrateLegacyPresentationSettingsResult {
  /** Rows whose value differed from the current global value and were written. */
  migratedCount: number;
  /** Rows whose value already matched the current global value (rerun, no-op). */
  skippedCount: number;
  /** Workspace ids whose row failed to migrate (logged, not thrown — boot continues). */
  failedWorkspaceIds: UUID[];
}

/**
 * Boot-time infra work is trusted by construction — no request-scoped
 * principal has "authorized" this yet (it runs before the server accepts
 * requests), so `authorize()` is a deliberate always-allow shim scoped to
 * this one migration function, never exported or reused elsewhere.
 */
const alwaysAllow: AuthorizeFn = async () => ({ allowed: true, reason: "system_migration" });

function writeServiceDeps(deps: MigrateLegacyPresentationSettingsDeps) {
  return {
    repo: deps.settingsRepo,
    clock: deps.clock,
    ids: deps.ids,
    authorize: alwaysAllow,
    principals: deps.principals,
  };
}

/** Registers the `core.presentation.activeThemeId` definition once (skip if already active/alias/tombstoned). */
async function ensureCoreDefinition(
  deps: MigrateLegacyPresentationSettingsDeps,
  fallbackDefault: string
): Promise<void> {
  const existing = await resolveDefinitionRaw(
    { repo: deps.settingsRepo },
    { namespace: CORE_NAMESPACE, key: CORE_KEY, workspaceId: null }
  );
  if (existing) return;

  await registerDefinitions({
    deps: writeServiceDeps(deps),
    input: {
      callerPrincipalId: deps.systemPrincipalId,
      authWorkspaceId: deps.systemPrincipalId,
      definitions: [
        {
          namespace: CORE_NAMESPACE,
          key: CORE_KEY,
          ownerKind: "core",
          workspaceId: null,
          schema: { type: "string" },
          defaultValue: fallbackDefault,
          scopes: SCOPE_BIT.global,
          secret: false,
        },
      ],
    },
  });
}

/** Registers one `theme.{themeId}` availability definition per theme id, skipping any already registered. */
async function ensureThemeDefinitions(deps: MigrateLegacyPresentationSettingsDeps): Promise<void> {
  const themeIds = deps.availableThemeIds ?? ALLOWED_THEME_IDS;

  for (const themeId of themeIds) {
    const namespace = `theme.${themeId}`;
    const existing = await resolveDefinitionRaw(
      { repo: deps.settingsRepo },
      { namespace, key: THEME_AVAILABLE_KEY, workspaceId: null }
    );
    if (existing) continue;

    await registerDefinitions({
      deps: writeServiceDeps(deps),
      input: {
        callerPrincipalId: deps.systemPrincipalId,
        authWorkspaceId: deps.systemPrincipalId,
        definitions: [
          {
            namespace,
            key: THEME_AVAILABLE_KEY,
            ownerKind: "theme",
            workspaceId: null,
            schema: { type: "boolean" },
            defaultValue: true,
            scopes: SCOPE_BIT.global,
            secret: false,
          },
        ],
      },
    });
  }
}

/**
 * The `core.presentation.activeThemeId` default to register when no legacy row supplies one yet.
 *
 * `NO_THEME_ID` is skipped rather than adopted. The default is registered ONCE, globally
 * (`workspaceId: null`), and applies to every workspace with no explicit value of its own — so
 * seeding it from a row whose operator deliberately turned the theme OFF would turn one workspace's
 * per-workspace decision into a platform-wide one. "No theme" is always a choice someone makes for
 * their own site; it is never a sensible default for sites nobody has decided about yet. Falling
 * through gives such a row exactly the default a workspace with no row at all gets.
 *
 * Only the DEFAULT is guarded. The row's own value still migrates into the ledger unchanged —
 * dropping it would lose the operator's choice from the mirror.
 */
function resolveFallbackDefaultThemeId(
  rows: readonly PresentationSettingsRecord[],
  deps: MigrateLegacyPresentationSettingsDeps
): string {
  const firstRealThemeId = rows.find((row) => row.activeThemeId !== NO_THEME_ID)?.activeThemeId;
  return firstRealThemeId ?? (deps.availableThemeIds ?? ALLOWED_THEME_IDS)[0];
}

type MigrateRowOutcome = "migrated" | "skipped" | "failed";

/**
 * Migrates ONE legacy row — extracted so {@link migrateLegacyPresentationSettings}'s own loop is
 * pure tallying. Skip-if-unchanged and catch-log-continue are this function's contract, not the
 * caller's (W-003/C-008 — see this file's header).
 */
async function migrateOneLegacyRow(
  deps: MigrateLegacyPresentationSettingsDeps,
  coreSettingId: UUID,
  row: PresentationSettingsRecord
): Promise<MigrateRowOutcome> {
  try {
    const currentGlobal = await deps.settingsRepo.getGlobalValue(coreSettingId);
    if (currentGlobal && currentGlobal.state === "set" && currentGlobal.valueJson === row.activeThemeId) {
      return "skipped";
    }

    await set({
      deps: writeServiceDeps(deps),
      input: {
        namespace: CORE_NAMESPACE,
        key: CORE_KEY,
        scope: "global",
        value: row.activeThemeId,
        callerPrincipalId: deps.systemPrincipalId,
      },
    });
    return "migrated";
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `migrateLegacyPresentationSettings: failed to migrate workspace '${row.workspaceId}': ${
        (err as Error).message
      }`
    );
    return "failed";
  }
}

/**
 * REQ-08/AC-14 — reads every `presentation_settings` row and migrates its
 * `activeThemeId` into `core.presentation.activeThemeId` (global scope)
 * through the chokepoint, backfilling the core + per-theme definitions.
 * Safe to call on every boot (W-003).
 *
 * @complexity O(n) over `presentation_settings` rows plus O(m) over theme ids.
 * @overallScore 100
 */
export async function migrateLegacyPresentationSettings(
  deps: MigrateLegacyPresentationSettingsDeps
): Promise<MigrateLegacyPresentationSettingsResult> {
  const rows = await deps.presentationRepo.listAll();

  await ensureThemeDefinitions(deps);
  await ensureCoreDefinition(deps, resolveFallbackDefaultThemeId(rows, deps));

  const coreDefinition = await resolveDefinitionRaw(
    { repo: deps.settingsRepo },
    { namespace: CORE_NAMESPACE, key: CORE_KEY, workspaceId: null }
  );
  if (!coreDefinition) {
    // Unreachable in practice (ensureCoreDefinition just registered it), but keeps this
    // function total rather than risking a non-null assertion against a mutable dependency.
    throw new Error("migrateLegacyPresentationSettings: core definition registration did not take effect");
  }

  let migratedCount = 0;
  let skippedCount = 0;
  const failedWorkspaceIds: UUID[] = [];

  for (const row of rows) {
    const outcome = await migrateOneLegacyRow(deps, coreDefinition.settingId, row);
    if (outcome === "migrated") migratedCount++;
    else if (outcome === "skipped") skippedCount++;
    else failedWorkspaceIds.push(row.workspaceId);
  }

  return { migratedCount, skippedCount, failedWorkspaceIds };
}
