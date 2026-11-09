/**
 * @file `toAdminPluginResponse()` — DTO mapping for `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` (SPEC-005
 * REQ-10, api.spec.md §5; C-017). Thin positional shim: the pure projection lives in
 * `@jini-ai/plugins/host` (`toAdminPluginResponse({ discovery, activation }, { conflicts })`,
 * EXTRACT-S6 L1c); this module keeps the old positional signature and import site.
 *
 * Lives in `features/plugin-runtime` rather than `server/http/admin` (where it used to be): pure
 * projection over this module's own `PluginDiscoveryRecord`/`PluginActivationRecord` types, and
 * `tool-registrations.ts` (this same module) reuses it verbatim for the agent-tool response — a
 * feature reaching into its host's HTTP layer for its own domain's DTO, the same "domain importing
 * its host's transport module" misplacement `Jini/packages/cms/src/widgets/where-used.ts` was relocated for.
 * `server/http/admin/plugins.ts` re-exports this symbol so its own consumers
 * (`routes/admin/plugins/list.ts`/`set-enabled.ts`) keep their existing import site. The
 * `providerSettings` flag drives the settings card served by `routes/plugins/provider-settings.ts`.
 * Verified against `server/inbound/admin-http/http/__tests__/unit/plugins-dto.unit.test.ts`.
 */
import { toAdminPluginResponse as toAdminPluginEnvelope } from "@jini-ai/plugins/host";
import type { AdminPluginEnvelope, PluginActivationRecord, PluginConflict } from "@jini-ai/plugins/host";
import type { PluginDiscoveryRecord } from "@jini-ai/plugins/host/node";

export type { AdminPluginEnvelope } from "@jini-ai/plugins/host";

/**
 * Projects one discovery record + its (possibly absent, meaning "never enabled") activation
 * record into the wire shape. Pure — no I/O.
 *
 * @param discovery - One plugin's discovery-time record (source/status/errors).
 * @param activation - That plugin's persisted activation row, or `null` when it has never been
 * enabled (treated as disabled — `enabled: false`, not an error).
 * @param optional.conflicts - This plugin's entry from `listPluginConflicts()`, if any.
 */
export function toAdminPluginResponse(
  discovery: PluginDiscoveryRecord,
  activation: PluginActivationRecord | null,
  optional: { readonly conflicts?: readonly PluginConflict[] } = {}
): AdminPluginEnvelope {
  return toAdminPluginEnvelope({ discovery, activation }, optional);
}
