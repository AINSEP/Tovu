import type { JsonValue, UUID } from "../core/ports";
import {
  ensureSettingDefinitions,
  type EnsureSettingDefinitionsDeps,
  type SettingDefinitionSpec,
} from "../features/settings/ensure-definitions";
import { getEffective } from "../features/settings/settings";
import type { SettingsRepoPort } from "../features/settings/ports";
import type { AnalyticsConfigPort } from "./ports";
import type { AnalyticsSiteConfig } from "./types";

/**
 * @file Boot-time `core.analytics.*` setting-definition registration plus the
 * `AnalyticsConfigPort` adapter that reads them back — the ADR-028 wiring
 * `server/app.ts`'s former inline stub named as still-owed ("Real config
 * should be backed by ADR-028 settings once that wiring exists"). Mirrors
 * `assistant/execution-mode-settings.ts`'s shape (definitions + registrar +
 * factory in one file); see that file for the worked example this one
 * follows.
 *
 * OWNER KIND: `core`, not `site`. This is first-party analytics
 * COLLECTION policy (whether/how the operator's own site gathers visitor
 * data) — a platform-level capability, same category as
 * `core.execution.*` — not per-site CONTENT, so `workspaceId: null` at the
 * DEFINITION level (`ensureSettingDefinitions`'s namespace-fence
 * requirement), while `scopes: SCOPE_BIT.workspace` (the shared default)
 * still lets each workspace hold its own VALUE row.
 *
 * NOT the same thing as `core.privacy.telemetry.*`
 * (`features/settings/ui-tab-definitions.ts`): that pair is VENDOR
 * telemetry consent (share anonymous usage data with the vendor via a
 * `ForwardingSink`-shaped path) and has no adapter to gate — Tovu has no
 * outbound telemetry sink at all yet. This namespace is the operator's own
 * first-party visitor analytics (pageviews, the operator's own dashboard),
 * gated on THESE settings, never on vendor consent.
 *
 * NO `sink` KEY IS REGISTERED HERE, deliberately. `AnalyticsSinkKind` is
 * `"local" | "forwarding"`, but no `ForwardingSink` adapter exists
 * (`analytics/ports.ts`'s file header: "named-next", not built) — exposing
 * `sink` as a stored choice would let an operator select an adapter that
 * cannot be constructed, which this project has a standing rule against
 * (controls that lie about what they do). `createSettingsAnalyticsConfig`
 * below always returns the `"local"` literal instead.
 *
 * ADR-PIPE-008 DISCLOSURE (`features/settings/types.ts`'s `SettingValueSchema`
 * doc comment): `{type:"json"}` was, until this file, used exactly once in
 * the codebase (`site.seo.robots_rules`), and that comment plus
 * `execution-mode-settings.ts`'s `localCli.model` comment both said so in
 * the singular. `excludedPaths`/`excludedIpRanges` below are a second and
 * third use — deliberately, not by oversight: both are genuinely
 * unbounded, list-shaped data (path globs / IP ranges) with no scalar
 * decomposition available, the same category `robots_rules` itself is the
 * precedent for, not the "scalar field encoded as JSON to skip
 * decomposition work" pattern the rule exists to block. Both stale
 * "exactly one" comments have been corrected alongside this file landing
 * (see `features/settings/types.ts` and `execution-mode-settings.ts`) so no
 * comment in the codebase asserts a count this change makes false. Flagged
 * here for Code Review per ADR-PIPE-008 Enforcement's own instruction.
 */

/** SPEC-007 namespace holding the `core.analytics.*` keys. */
export const ANALYTICS_NAMESPACE = "core.analytics";

type AnalyticsSettingKey =
  | "enabled"
  | "honorDoNotTrack"
  | "honorGlobalPrivacyControl"
  | "rawRetentionDays"
  | "excludedPaths"
  | "excludedIpRanges";

/** Narrows the shared spec's open `key: string` to this namespace's own key
 *  union, so a typo here is a compile error rather than a definition
 *  registered under a key nothing reads. */
interface AnalyticsDefinitionSpec extends SettingDefinitionSpec {
  key: AnalyticsSettingKey;
}

/** The 6 registered `core.analytics.*` definitions. No `sink` key — see this
 *  file's header. Defaults match the values the former `server/app.ts` inline
 *  stub hardcoded, so upgrading to this adapter changes no behavior. */
const ANALYTICS_DEFINITIONS: readonly AnalyticsDefinitionSpec[] = [
  { key: "enabled", schema: { type: "boolean" }, defaultValue: true },
  { key: "honorDoNotTrack", schema: { type: "boolean" }, defaultValue: true },
  { key: "honorGlobalPrivacyControl", schema: { type: "boolean" }, defaultValue: true },
  { key: "rawRetentionDays", schema: { type: "number" }, defaultValue: 30 },
  { key: "excludedPaths", schema: { type: "json" }, defaultValue: [] },
  { key: "excludedIpRanges", schema: { type: "json" }, defaultValue: [] },
];

export type EnsureAnalyticsSettingDefinitionsDeps = EnsureSettingDefinitionsDeps;

export interface EnsureAnalyticsSettingDefinitionsInput {
  /** The trusted boot-time actor these writes are attributed to (mirrors
   *  `execution-mode-settings.ts`'s identical convention). */
  systemPrincipalId: UUID;
}

/**
 * Idempotently registers the 6 `core.analytics.*` definitions. Safe to call
 * on every boot. The skip-if-registered loop, the `ownerKind: "core"` /
 * `workspaceId: null` namespace-fence handling, and the boot-trust shim all
 * live in `features/settings/ensure-definitions.ts` — this module owns only
 * the definition list above.
 *
 * @complexity O(1) — 6 definitions, each a skip-if-registered check plus at
 * most one `registerDefinitions` call.
 * @overallScore 100
 */
export async function ensureAnalyticsSettingDefinitions(
  deps: EnsureAnalyticsSettingDefinitionsDeps,
  input: EnsureAnalyticsSettingDefinitionsInput
): Promise<void> {
  await ensureSettingDefinitions(deps, {
    namespace: ANALYTICS_NAMESPACE,
    definitions: ANALYTICS_DEFINITIONS,
    systemPrincipalId: input.systemPrincipalId,
  });
}

/**
 * Fallback used ONLY when `getEffective` reports a `core.analytics.*`
 * definition as unregistered (`null`) — per `getEffective`'s own contract
 * (`features/settings/settings.ts`) that state means a boot-ordering bug
 * (this file's registrar has not run yet), never an operator choice: an
 * operator can only ever produce a *stored* value, and `getEffective` is
 * total over the stored/workspace/global/default layers once a definition
 * exists. Deliberately re-declared here rather than derived from
 * `ANALYTICS_DEFINITIONS` — `honorDoNotTrack`/`honorGlobalPrivacyControl`
 * are hardcoded `true` regardless of what that array declares, so an
 * unrelated future default-value edit there can never accidentally loosen
 * this fail-safe (fail toward privacy).
 */
const BOOT_ORDERING_FALLBACK: Omit<AnalyticsSiteConfig, "workspaceId"> = {
  enabled: true,
  honorDoNotTrack: true,
  honorGlobalPrivacyControl: true,
  rawRetentionDays: 30,
  excludedPaths: [],
  excludedIpRanges: [],
  sink: "local",
};

/** Total narrowing for the two `{type:"json"}` array fields: keeps only
 *  string entries, never casts. A non-array or mixed-type stored value
 *  (should not happen — the ledger schema only accepts a JSON value, not a
 *  shape) degrades to `[]` rather than throwing. */
function toStringArray(value: JsonValue): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

export interface CreateSettingsAnalyticsConfigDeps {
  settingsRepo: SettingsRepoPort;
}

/**
 * Builds the real `AnalyticsConfigPort` adapter over the settings ledger,
 * replacing `server/app.ts`'s former hardcoded stub. `get()` reads all 6
 * keys via `getEffective` (total, cached, never throws) and recomposes
 * `AnalyticsSiteConfig`; `sink` is always the `"local"` literal (see this
 * file's header — no `sink` key is registered).
 *
 * @complexity O(1) per call — 6 independent, parallel `getEffective` reads
 * (each itself O(1): cached layer lookups, no scan).
 * @overallScore 100
 */
export function createSettingsAnalyticsConfig(deps: CreateSettingsAnalyticsConfigDeps): AnalyticsConfigPort {
  return {
    async get({ workspaceId }): Promise<AnalyticsSiteConfig> {
      const scopeContext = { workspaceId };
      const read = (key: AnalyticsSettingKey) =>
        getEffective({ repo: deps.settingsRepo }, { namespace: ANALYTICS_NAMESPACE, key, scopeContext });

      const [enabled, honorDoNotTrack, honorGlobalPrivacyControl, rawRetentionDays, excludedPaths, excludedIpRanges] =
        await Promise.all([
          read("enabled"),
          read("honorDoNotTrack"),
          read("honorGlobalPrivacyControl"),
          read("rawRetentionDays"),
          read("excludedPaths"),
          read("excludedIpRanges"),
        ]);

      // All 6 keys are registered atomically by `ensureAnalyticsSettingDefinitions`, so a null
      // resolution on ANY of them means the whole namespace is still unregistered (boot ordering —
      // see `BOOT_ORDERING_FALLBACK`'s doc comment), not a per-field gap. Fall back together rather
      // than mixing partially-resolved live values with fallback ones.
      if (
        enabled === null ||
        honorDoNotTrack === null ||
        honorGlobalPrivacyControl === null ||
        rawRetentionDays === null ||
        excludedPaths === null ||
        excludedIpRanges === null
      ) {
        return { workspaceId, ...BOOT_ORDERING_FALLBACK };
      }

      return {
        workspaceId,
        enabled: enabled.value === true,
        honorDoNotTrack: honorDoNotTrack.value === true,
        honorGlobalPrivacyControl: honorGlobalPrivacyControl.value === true,
        rawRetentionDays:
          typeof rawRetentionDays.value === "number" ? rawRetentionDays.value : BOOT_ORDERING_FALLBACK.rawRetentionDays,
        excludedPaths: toStringArray(excludedPaths.value ?? []),
        excludedIpRanges: toStringArray(excludedIpRanges.value ?? []),
        // No `sink` key is registered (see this file's header) — `ForwardingSink` does not exist,
        // so exposing sink selection as a stored choice would let an operator pick an adapter that
        // can't be constructed.
        sink: "local",
      };
    },
  };
}
