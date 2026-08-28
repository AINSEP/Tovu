/**
 * @file `toAdminPluginResponse()` — DTO mapping for `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` (SPEC-005
 * REQ-10, api.spec.md §5; C-017).
 *
 * Purpose:
 * Projects a `PluginDiscoveryRecord` plus its (possibly absent) `PluginActivationRecord` into the
 * exact `api.spec.md` §5 wire shape — `enabled` is the one field discovery itself does not know
 * (state.spec.md §2: "enabled: boolean # projected from plugin_activations"); this function is
 * where that projection happens (discovery.ts stays activation-ignorant by design). Mirrors
 * `admin/posts.ts`'s `toAdminPostResponse()` shape.
 *
 * Lives in `features/plugin-runtime` rather than `server/http/admin` (where it used to be): pure
 * projection over this module's own `PluginDiscoveryRecord`/`PluginActivationRecord` types, and
 * `tool-registrations.ts` (this same module) reuses it verbatim for the agent-tool response — a
 * feature reaching into its host's HTTP layer for its own domain's DTO, the same "domain importing
 * its host's transport module" misplacement `widgets/where-used.ts` was relocated for.
 * `server/http/admin/plugins.ts` re-exports this symbol so its own consumers
 * (`routes/admin/plugins/list.ts`/`set-enabled.ts`) keep their existing import site.
 *
 * Architectural role:
 * TDD-certified implementation (implementation outline C-017). Signature and JSDoc are
 * design-frozen; `toAdminPluginResponse()` is a pure projection — no I/O — that folds discovery's
 * `tier`/`status`/`errors` with activation's `enabled`/quarantine fields into the wire envelope.
 * Verified against `server/http/admin/__tests__/unit/plugins-dto.unit.test.ts`.
 */
import type { PluginActivationRecord } from "./activation.js";
import type { PluginDiscoveryRecord } from "./discovery.js";

/** api.spec.md §5 `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` per-plugin wire shape. */
export interface AdminPluginEnvelope {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly source: "built-in" | "site";
  /** (1.1.2, REQ-10/REQ-18) Projected verbatim from `PluginDiscoveryRecord.tier`, itself projected
   * verbatim from the plugin's already-required `PluginManifest.tier` (REQ-01/ADR-024 §1) — the
   * same additive-field mechanism REQ-10's revision note describes ("mirroring how `enabled` is
   * already projected"). Required at this wire-contract layer (api.spec.md §5 lists it as a plain,
   * always-present field, consumed by REQ-18's per-row badge, AC-26). */
  readonly tier: "tier-1" | "tier-2" | "tier-3";
  readonly status: "valid" | "invalid" | "incompatible";
  readonly enabled: boolean;
  readonly quarantine: null | {
    readonly at: string;
    readonly reason: string;
    readonly consecutiveFailures: number;
  };
  readonly errors: readonly { code: string; file: string | null; message: string }[];
}

/**
 * Projects one discovery record + its (possibly absent, meaning "never enabled") activation
 * record into the wire shape. Pure — no I/O.
 *
 * @param discovery - One plugin's discovery-time record (source/status/errors).
 * @param activation - That plugin's persisted activation row, or `null` when it has never been
 * enabled (treated as disabled — `enabled: false`, not an error).
 */
export function toAdminPluginResponse(
  discovery: PluginDiscoveryRecord,
  activation: PluginActivationRecord | null
): AdminPluginEnvelope {
  return {
    id: discovery.id,
    name: discovery.name,
    version: discovery.version,
    source: discovery.source,
    tier: (discovery.tier ?? "tier-3") as AdminPluginEnvelope["tier"],
    status: discovery.status,
    enabled: activation?.enabled ?? false,
    quarantine:
      activation?.quarantinedAt !== undefined &&
      activation.quarantineReason !== undefined &&
      activation.quarantineFailureCount !== undefined
        ? {
            at: activation.quarantinedAt,
            reason: activation.quarantineReason,
            consecutiveFailures: activation.quarantineFailureCount,
          }
        : null,
    errors: discovery.errors,
  };
}
