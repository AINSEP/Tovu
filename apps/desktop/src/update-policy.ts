/** Tovu's supported release platforms and operator-facing updater reasons. */
import { updaterSkipReason as evaluateUpdaterEnvironment } from "@jini-ai/desktop-host/electron/updates";
import type { UpdaterEnvironment } from "@jini-ai/desktop-host/electron/updates";

/** Bind launch eligibility to Tovu's release policy and wording. @complexity O(1). */
function updaterSkipReason(environment: UpdaterEnvironment): string | null {
  return evaluateUpdaterEnvironment({
    environment,
    supportedPlatforms: ["darwin", "win32"],
    reasons: {
      notPackaged: "not packaged (dev launch)",
      windowsStore: "Microsoft Store build (the Store updates it)",
      unsupportedPlatform: ({ platform }) => `no published build for ${platform}`,
      disabled: "TOVU_DESKTOP_DISABLE_UPDATER=1",
      selftest: "self-test launch",
    },
  });
}

export { updaterSkipReason };
// Update/install rationale: Jini/packages/desktop-host/src/electron/updates/update-policy.ts.
