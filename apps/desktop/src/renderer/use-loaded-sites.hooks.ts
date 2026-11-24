/**
 * Settings › Loaded sites: the saved limit on live site guests, read once from main and then
 * followed (the native Settings menu changes it too), saved through the shell's write channel.
 * `use-live-views.hooks.ts` follows the same change event, so a save applies to the tabs at once.
 * The optimistic save and rollback are `@jini-ai/ui/number-stepper`'s; this binds them to the
 * desktop bridge, the 1–5 policy, and the desktop's copy and log line.
 */
import { useOptimisticNumberSetting, type NumberSetting } from '@jini-ai/ui/number-stepper';
import { LIVE_SITE_VIEWS } from '../contracts/site-view-preference.js';
import { useSiteViewPreference } from './use-site-view-preference.hooks.js';
import { runnerInventoryBridge, type BridgeLookup } from './runner-api.js';

type LoadedSitesBridge = BridgeLookup<'getMaximumLiveSiteViews' | 'setMaximumLiveSiteViews' | 'onMaximumLiveSiteViewsChanged'>;

export const LOADED_SITES_SAVE_ERROR = 'Loaded sites could not be saved.';

/** Logs a failed save on the desktop's own console prefix; the row shows {@link LOADED_SITES_SAVE_ERROR}. */
function logSaveFailure({ failure }: { failure: unknown }, _options = {}): void {
  console.error(`[tovu-desktop] save loaded sites: ${failure instanceof Error ? failure.message : String(failure)}`);
}

/**
 * The shown value moves at once on a save; a failed save puts the last value back and says so.
 * An older preload with no save channel reports `available: false`.
 * @complexity O(1) per save, one IPC request.
 */
export function useLoadedSites(
  _input: Record<string, never> = {},
  { getBridge = runnerInventoryBridge }: { getBridge?: LoadedSitesBridge } = {},
): NumberSetting {
  const { value, setValue } = useSiteViewPreference({ getBridge });
  const setMaximum = getBridge()?.setMaximumLiveSiteViews;
  const write = setMaximum && (({ next }: { next: number }) => setMaximum({ maximum: next }));
  return useOptimisticNumberSetting(
    { value, setValue, write, bounds: LIVE_SITE_VIEWS, saveError: LOADED_SITES_SAVE_ERROR },
    { onSaveFailure: logSaveFailure },
  );
}
