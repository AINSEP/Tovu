import type { JsonValue, UUID } from "@jini-ai/cms/core";
// From the package, not `./index.js`: the barrel's `set` comes from `site-title-write.ts`, which
// imports this file.
import {
  ensureSettingDefinitions,
  type EnsureSettingDefinitionsDeps,
  getEffective,
  resolveDefinitionRaw,
  SCOPE_BIT,
  set,
  type AuthorizeFn,
  type SettingsRepoPort,
} from "@jini-ai/cms/settings";
import type { WorkspaceRecord } from "@jini-ai/cms/workspace";

/**
 * @file SPEC-050 (`core.site.title`): the public site title as a per-workspace setting, the one
 * resolver every render call site reads it through (REQ-02), and the one-time pin that keeps every
 * site that existed before this setting on the title it always rendered (REQ-06).
 *
 * The "no owner-set title" value has two tiers (NC-1 = A):
 * - A workspace the marker migration recorded as pre-existing (NC-3 = A) is pinned to
 *   {@link LEGACY_SITE_TITLE} at the workspace layer, through the settings chokepoint. Until that pin
 *   lands the workspace is pending, and renders the legacy title anyway (REQ-07).
 * - Every other workspace renders the site display name: `config.json` `name`, else
 *   `workspaces.name` when there is no site directory (NC-2 = B).
 *
 * Only a workspace-layer value counts as a title. The definition default stays the legacy literal,
 * and a default-layer read means "no owner-set title".
 *
 * `ownerKind: "core"` is forced, not chosen. The settings namespace fence (`@jini-ai/cms/settings`
 * `NAMESPACE_FENCE`) admits a `core.*` namespace only for a core definition, and requires such a
 * definition to be platform-wide (`workspaceId: null`). Its VALUES stay per-workspace through
 * `scopes: SCOPE_BIT.workspace`, which is REQ-01's shape.
 */

export const SITE_TITLE_NAMESPACE = "core.site";
export const SITE_TITLE_KEY = "title";

/** The title every site rendered before this setting existed (formerly `pages.ts`'s `SITE_TITLE`). */
export const LEGACY_SITE_TITLE = "Tovu Demo Site";

/** REQ-08's upper bound, mirroring `init-site.ts`'s limit for site display names. */
export const SITE_TITLE_MAX_LENGTH = 200;

export interface EnsureSiteTitleSettingDefinitionInput {
  /** The trusted boot-time actor the registration is attributed to (same convention as every other boot registrar). */
  systemPrincipalId: UUID;
}

/**
 * Idempotently registers the `core.site.title` definition. Safe to call on every boot:
 * `ensureSettingDefinitions` skips a registered definition and reconciles a changed core default.
 *
 * @complexity O(1), one definition.
 */
export async function ensureSiteTitleSettingDefinition(
  deps: EnsureSettingDefinitionsDeps,
  input: EnsureSiteTitleSettingDefinitionInput
): Promise<void> {
  await ensureSettingDefinitions(deps, {
    namespace: SITE_TITLE_NAMESPACE,
    definitions: [
      { key: SITE_TITLE_KEY, schema: { type: "string" }, defaultValue: LEGACY_SITE_TITLE, scopes: SCOPE_BIT.workspace },
    ],
    systemPrincipalId: input.systemPrincipalId,
  });
}

/**
 * The renderable form of a stored title or name: trimmed, 1..{@link SITE_TITLE_MAX_LENGTH}
 * characters. Anything else is `undefined`, so a caller falls back instead of rendering an empty or
 * unbounded `<title>` (REQ-08, REQ-09, INV-04). Pure.
 *
 * @complexity O(n) in the value's length.
 */
export function normalizeSiteTitle(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= SITE_TITLE_MAX_LENGTH ? trimmed : undefined;
}

/**
 * The pre-existing-workspace marker (REQ-06, NC-3 = A). A workspace is recorded once, by the schema
 * migration, and stays pending until the pin writes or skips it. The SQLite adapter reads the
 * migration's table; the in-memory composition root has no pre-existing workspaces (EC-03).
 */
export interface SiteTitlePreservationStorePort {
  /** Recorded workspaces whose pin has not landed yet, sorted by id. */
  listPendingWorkspaceIds(): Promise<UUID[]>;
  /** True only for a recorded workspace whose pin has not landed yet. */
  isPending(workspaceId: UUID): Promise<boolean>;
  /** Resolves one pending workspace. A no-op for an unrecorded or already resolved id. */
  markPreserved(required: { workspaceId: UUID; preservedAt: string }): Promise<void>;
}

/** {@link SiteTitlePreservationStorePort} over a process-local set. */
export class InMemorySiteTitlePreservationStore implements SiteTitlePreservationStorePort {
  private readonly pending: Set<UUID>;

  constructor(pendingWorkspaceIds: readonly UUID[] = []) {
    this.pending = new Set(pendingWorkspaceIds);
  }

  async listPendingWorkspaceIds(): Promise<UUID[]> {
    return [...this.pending].sort();
  }

  async isPending(workspaceId: UUID): Promise<boolean> {
    return this.pending.has(workspaceId);
  }

  async markPreserved(required: { workspaceId: UUID; preservedAt: string }): Promise<void> {
    this.pending.delete(required.workspaceId);
  }
}

export interface PreserveLegacySiteTitlesDeps extends EnsureSettingDefinitionsDeps {
  preservationStore: SiteTitlePreservationStorePort;
}

/** REQ-11's report: every pending workspace lands in exactly one list. */
export interface PreserveLegacySiteTitlesResult {
  pinnedWorkspaceIds: UUID[];
  skippedWorkspaceIds: UUID[];
  failedWorkspaceIds: UUID[];
}

/** Always-allow shim scoped to this one system write, the same shape `migration.ts` uses for its own. */
const allowSystemPin: AuthorizeFn = async () => ({ allowed: true, reason: "system_migration" });

type PinOutcome = "pinned" | "skipped" | "failed";

/**
 * REQ-06/REQ-11: pins every pending pre-existing workspace to {@link LEGACY_SITE_TITLE} with one
 * workspace-layer `set`, attributed to `systemPrincipalId`.
 *
 * - Skips a workspace that already has a workspace-layer row in any state (`set` or `cleared`), so an
 *   explicit owner action always wins (INV-02).
 * - Resolves the marker only AFTER the write. A crash between the two leaves a value row, which the
 *   next run skips, never a second pin.
 * - Logs a failed workspace and leaves it pending for the next boot. It never aborts the others or boot.
 *
 * Safe on every boot: with nothing pending it costs one marker read.
 *
 * @complexity O(p) sequential ledger writes for p pending workspaces, once per database.
 */
export async function preserveLegacySiteTitles(
  deps: PreserveLegacySiteTitlesDeps,
  input: { systemPrincipalId: UUID }
): Promise<PreserveLegacySiteTitlesResult> {
  const result: PreserveLegacySiteTitlesResult = { pinnedWorkspaceIds: [], skippedWorkspaceIds: [], failedWorkspaceIds: [] };
  const pendingWorkspaceIds = await deps.preservationStore.listPendingWorkspaceIds();
  if (pendingWorkspaceIds.length === 0) return result;

  const definition = await resolveDefinitionRaw(
    { repo: deps.settingsRepo },
    { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, workspaceId: null }
  );
  for (const workspaceId of pendingWorkspaceIds) {
    const outcome: PinOutcome = definition
      ? await pinOneWorkspace(deps, { settingId: definition.settingId, workspaceId, systemPrincipalId: input.systemPrincipalId })
      : logPinFailure(workspaceId, "core.site/title is not registered");
    if (outcome === "pinned") result.pinnedWorkspaceIds.push(workspaceId);
    else if (outcome === "skipped") result.skippedWorkspaceIds.push(workspaceId);
    else result.failedWorkspaceIds.push(workspaceId);
  }

  // eslint-disable-next-line no-console
  console.info(
    `preserveLegacySiteTitles: pinned=${result.pinnedWorkspaceIds.length} skipped=${result.skippedWorkspaceIds.length} failed=${result.failedWorkspaceIds.length}`
  );
  return result;
}

/** One workspace of {@link preserveLegacySiteTitles}. Catch-log-continue is this function's contract. */
async function pinOneWorkspace(
  deps: PreserveLegacySiteTitlesDeps,
  required: { settingId: UUID; workspaceId: UUID; systemPrincipalId: UUID }
): Promise<PinOutcome> {
  const { workspaceId } = required;
  try {
    const existing = await deps.settingsRepo.getWorkspaceValue({ workspaceId, settingId: required.settingId });
    if (!existing) {
      await set({
        deps: { repo: deps.settingsRepo, clock: deps.clock, ids: deps.ids, authorize: allowSystemPin, principals: deps.principals },
        input: {
          namespace: SITE_TITLE_NAMESPACE,
          key: SITE_TITLE_KEY,
          scope: "workspace",
          workspaceId,
          authWorkspaceId: workspaceId,
          value: LEGACY_SITE_TITLE,
          callerPrincipalId: required.systemPrincipalId,
        },
      });
    }
    await deps.preservationStore.markPreserved({ workspaceId, preservedAt: deps.clock.nowIso() });
    return existing ? "skipped" : "pinned";
  } catch (err) {
    return logPinFailure(workspaceId, (err as Error).message);
  }
}

function logPinFailure(workspaceId: UUID, reason: string): "failed" {
  // eslint-disable-next-line no-console
  console.error(`preserveLegacySiteTitles: workspace '${workspaceId}' stays pending, pin failed: ${reason}`);
  return "failed";
}

/**
 * REQ-13: the served site's display name, read when a render needs it rather than captured once at
 * boot, so a `config.json` rename shows on the next render with no restart.
 */
export interface SiteDisplayNameSource {
  /**
   * The display name as it stands now, or `undefined` when there is none. The resolver normalizes it.
   * Should not throw; a throw renders {@link LEGACY_SITE_TITLE} (REQ-09).
   */
  read(): string | undefined;
}

export interface ResolveSiteTitleDeps {
  settingsRepo: SettingsRepoPort;
  preservationStore: Pick<SiteTitlePreservationStorePort, "isPending">;
  workspaceRepo: { findById(id: UUID): Promise<WorkspaceRecord | null> };
  /**
   * `config.json` `name` of the site directory this process serves (NC-2 = B), read at each
   * resolution that reaches it (REQ-13). A config rename and a `workspaces.name` rename both show on
   * the next render (OQ-01, EC-01). Reads `undefined` when there is no site directory.
   */
  siteDisplayName: SiteDisplayNameSource;
}

/**
 * The site title a public render shows for `workspaceId` (REQ-03). Reads without a principal, so the
 * user layer never applies (INV-03). In order:
 * 1. a usable workspace-layer value (an owner title, or the pin);
 * 2. {@link LEGACY_SITE_TITLE} while the workspace's pin is pending, or while the definition is not
 *    registered yet (REQ-07);
 * 3. the site display name, else `workspaces.name` (REQ-05);
 * 4. {@link LEGACY_SITE_TITLE}.
 *
 * Never throws. Any failed read renders {@link LEGACY_SITE_TITLE} rather than guess the tier, because
 * a pinned site that loses its settings read must not flip (REQ-09, INV-01).
 *
 * @complexity O(1) repo reads per call, at most one of them a workspace lookup, plus one bounded
 * display-name read on step 3 only (REQ-13).
 */
export async function resolveSiteTitle(deps: ResolveSiteTitleDeps, input: { workspaceId: UUID }): Promise<string> {
  try {
    // The marker is read BEFORE the value. The pin writes the value first and resolves the marker
    // second, so a pending marker can only be followed by no value or the pin, and both render the
    // legacy title. In the other order, a pin landing between the two reads would render the
    // display name for that request.
    const pending = await deps.preservationStore.isPending(input.workspaceId);
    const resolved = await getEffective(
      { repo: deps.settingsRepo },
      { namespace: SITE_TITLE_NAMESPACE, key: SITE_TITLE_KEY, scopeContext: { workspaceId: input.workspaceId } }
    );
    if (resolved === null) return LEGACY_SITE_TITLE;
    const workspaceTitle = resolved.sourceLayer === "workspace" ? normalizeSiteTitle(resolved.value) : undefined;
    if (workspaceTitle !== undefined) return workspaceTitle;
    if (pending) return LEGACY_SITE_TITLE;
    return (await resolveSiteDisplayName(deps, input.workspaceId)) ?? LEGACY_SITE_TITLE;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`resolveSiteTitle: falling back to the legacy title for workspace '${input.workspaceId}': ${(err as Error).message}`);
    return LEGACY_SITE_TITLE;
  }
}

/** NC-2 = B: the configured display name as it stands now (REQ-13), else the workspace row's name, each only if renderable. */
async function resolveSiteDisplayName(deps: ResolveSiteTitleDeps, workspaceId: UUID): Promise<string | undefined> {
  const configured = normalizeSiteTitle(deps.siteDisplayName.read());
  if (configured !== undefined) return configured;
  const workspace = await deps.workspaceRepo.findById(workspaceId);
  return normalizeSiteTitle(workspace?.name);
}
