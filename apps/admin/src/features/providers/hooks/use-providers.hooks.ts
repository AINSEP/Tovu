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
 * unrelated slow namespace would hold the External MCP panel blank.
 *
 * So this composes only the controller the page genuinely needs, imported from
 * `features/settings/hooks/` rather than copied: `useExternalMcp` reads the `external_mcp_servers`
 * table, not the settings ledger, which is exactly why it was never a `SettingsSlice` even while it
 * lived on the Settings page.
 *
 * ## Known follow-up, stated rather than hidden
 *
 * The External MCP COMPONENTS (`ExternalMcpSettingsPanel.tsx`, its rules/i18n/hook files and
 * tests) still physically live under `features/settings/`, even though the Settings page no longer renders any of them. Moving that
 * ~15-file set into `features/providers/` is the right end state and is deliberately NOT part of
 * this pass: it is a pure rename with no behaviour change, it would collide with other agents
 * working in `apps/admin/src` right now, and doing it separately keeps this restructure reviewable
 * as a restructure. Nothing here depends on the move happening.
 */

export interface ProvidersController {
  /** The External MCP tab's transport, Tovu-specific field specs, and restart-required flag.
   *  Backed by `external_mcp_servers`. See `features/settings/hooks/use-external-mcp.hooks.ts`. */
  externalMcp: ExternalMcpController;
}

/**
 * @complexity O(1) — composes one constant-shaped controller, no iteration and no state of its own.
 */
export function useProviders(): ProvidersController {
  const externalMcp = useExternalMcp();

  return { externalMcp };
}
