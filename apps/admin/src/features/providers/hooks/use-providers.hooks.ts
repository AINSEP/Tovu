import { useWiredComposioConfig, type ComposioConfigController } from "../../settings/hooks/use-composio-config.hooks";
import { useExternalMcp, type ExternalMcpController } from "../../settings/hooks/use-external-mcp.hooks";

/**
 * @file `Providers`'s controller, so `Providers.tsx` is only markup and tab wiring.
 *
 * ## Why this is a NEW hook and not `useSettingsUi()`
 *
 * The three tabs on this page used to be three of `SettingsUi`'s thirteen, so the obvious move when
 * they were promoted to their own page (2026-09-10) would have been to keep calling
 * `hooks/use-settings-ui.hooks.ts` and read the two fields off it. That would have been wrong in a
 * way worth stating: `useSettingsUi` mounts SIX `useSettingsSlice` instances (execution,
 * instructions, notifications, privacy, appearance, language), each of which issues its own load
 * against the settings ledger and owns its own debounce/save chain. None of the three tabs here
 * reads any of them. Reusing it would have made opening Providers fetch five namespaces this page
 * never displays, and — worse — put this page's own render behind `areAnySlicesLoading`, so an
 * unrelated slow namespace would hold the Composio key field blank.
 *
 * So this composes only the two controllers the page genuinely needs. Both are imported from
 * `features/settings/hooks/` rather than copied: they are the SAME hooks, unchanged, and neither is
 * settings-ledger-backed in the first place — `useWiredComposioConfig` reads its own sealed
 * `composio_config` row and `useExternalMcp` the `external_mcp_servers` table, which is exactly why
 * they were never `SettingsSlice`s even while they lived on the Settings page.
 *
 * ## Known follow-up, stated rather than hidden
 *
 * The External MCP and Composio COMPONENTS (`ExternalMcpSettingsPanel.tsx`, `ComposioKeyField.tsx`,
 * `connectors-port.ts`, their rules/i18n/hook files and tests) still physically live under
 * `features/settings/`, even though the Settings page no longer renders any of them. Moving that
 * ~15-file set into `features/providers/` is the right end state and is deliberately NOT part of
 * this pass: it is a pure rename with no behaviour change, it would collide with other agents
 * working in `apps/admin/src` right now, and doing it separately keeps this restructure reviewable
 * as a restructure. Nothing here depends on the move happening.
 */

export interface ProvidersController {
  /** The Composio tab's project API key — its own sealed `composio_config` row, not a settings
   *  slice. See `features/settings/hooks/use-composio-config.hooks.ts`. */
  composio: ComposioConfigController;
  /** The External MCP tab's transport, Tovu-specific field specs, and restart-required flag.
   *  Backed by `external_mcp_servers`. See `features/settings/hooks/use-external-mcp.hooks.ts`. */
  externalMcp: ExternalMcpController;
}

/**
 * @complexity O(1) — composes two constant-shaped controllers, no iteration and no state of its own.
 */
export function useProviders(): ProvidersController {
  const composio = useWiredComposioConfig();
  const externalMcp = useExternalMcp();

  return { composio, externalMcp };
}
