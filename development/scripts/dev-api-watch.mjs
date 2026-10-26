import os from "node:os";
import path from "node:path";

/** Exclude disposable plugin imports from tsx's dependency watcher at every storage location.
 * The generic glob covers custom roots; the absolute glob also covers paths outside the checkout.
 * @returns tsx CLI arguments. @complexity O(1).
 */
export function apiWatchArgs({ sitesHome }, { homeDir = os.homedir() } = {}) {
  return ["tsx", "watch", "--exclude", "**/plugins-runtime/**", "--exclude",
    path.join(path.resolve(sitesHome || homeDir), "**/plugins-runtime/**"), "apps/website/src/index.ts"];
}
