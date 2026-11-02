import type { RunnerInventoryBridge } from './runner-api.js';

/**
 * The desktop-bridge lookup every bridge-reading hook below takes as an optional port, defaulted to
 * `runnerInventoryBridge` (`window.tovuRunner`). A LOOKUP rather than the bridge itself so each hook
 * still reads the bridge exactly when it did before — inside the effect, the callback, or the
 * once-per-lifetime memo — and a test hands in a fake without touching `window`. Each hook narrows
 * it to the slice of the bridge it actually calls.
 */
export type BridgeLookup<K extends keyof RunnerInventoryBridge> = () => Pick<RunnerInventoryBridge, K> | undefined;
