/** Host bus/signature adapter; the settings lifecycle is owned by @jini-ai/ui/panel-kit. */
import {
  useSettingsSlice as useSlice, mergeSaveStates as mergeStates, commitQueuedSave as commitSave,
  type SettingsSliceOptions as JiniOptions, type SettingsSliceRefreshPort, type SettingsSlice, type SaveState,
} from "@jini-ai/ui/panel-kit";
import { publishSettingsRefresh, subscribeToSettingsRefresh } from "../lib/settings-refresh-bus";
export { SAVE_DEBOUNCE_MS, canAcceptRefresh } from "@jini-ai/ui/panel-kit";
export type { SettingsSliceRefreshPort, SettingsSlice, SaveState } from "@jini-ai/ui/panel-kit";
/** Existing tabs share the host bus; an injected port can scope another settings surface. */
const defaultRefreshPort: SettingsSliceRefreshPort = {
  publish: ({ namespaces }) => publishSettingsRefresh(namespaces),
  subscribe: ({ listener }) => subscribeToSettingsRefresh(listener),
};
export interface SettingsSliceOptions<T> extends Omit<JiniOptions<T>, "load" | "save" | "reconcileRefresh" | "refreshPort"> {
  load: () => Promise<T>;
  save: (next: T, previous: T) => Promise<readonly string[]>;
  reconcileRefresh?: (current: T, loaded: T) => T;
  refreshPort?: SettingsSliceRefreshPort;
}
/** Keep existing tab adapters while crossing the package boundary with two objects. */
export function useSettingsSlice<T>(input: SettingsSliceOptions<T>, _options = {}): SettingsSlice<T> {
  return useSlice({
    ...input,
    load: () => input.load(),
    save: ({ next, previous }) => input.save(next, previous),
    reconcileRefresh: input.reconcileRefresh ? ({ current, loaded }) => input.reconcileRefresh!(current, loaded) : undefined,
    refreshPort: input.refreshPort ?? defaultRefreshPort,
  }, {});
}
/** Existing page chrome supplies an array; the package owns precedence. */
export function mergeSaveStates(states: readonly SaveState[], _options = {}): SaveState {
  return mergeStates({ states }, {});
}
/** Compatibility seam for the existing direct save-ticket tests. */
export function commitQueuedSave(ticket: number, deps: Parameters<typeof commitSave>[0]["deps"]): Promise<void> {
  return commitSave({ ticket, deps }, {});
}
