import os from "node:os";
import path from "node:path";

/** Exclude disposable plugin imports from tsx's dependency watcher at every storage location, source maps off.
 * The generic glob covers custom roots; the absolute glob also covers paths outside the checkout.
 * @returns tsx CLI arguments. @complexity O(1).
 */
export function apiWatchArgs({ sitesHome }, { homeDir = os.homedir() } = {}) {
  // tsx forwards flags after its own options to node, after its loader: maps-off must follow --exclude.
  return ["tsx", "watch", "--exclude", "**/plugins-runtime/**", "--exclude",
    path.join(path.resolve(sitesHome || homeDir), "**/plugins-runtime/**"),
    "--import", new URL("./dev-source-maps-off.mjs", import.meta.url).href, "apps/website/src/index.ts"];
}
