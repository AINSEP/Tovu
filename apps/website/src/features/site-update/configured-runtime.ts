/**
 * @file Binds the site-update runtime to a configured release feed. The feed URL comes from host config only
 * (no default URL, ever); the JSON fetcher, host ports and shared ports are all injected, so building a runtime is inert.
 */
import { createGithubReleaseFeed, type GithubReleaseFeedRequired } from "./github-release-feed.js";
import type { ReleaseFeedPort } from "@jini-ai/devops/deploy";
import { createSiteUpdateRuntime, type SiteUpdateHost, type SiteUpdateSharedPorts } from "./host-runtime.js";
import type { SiteUpdateRuntime } from "./tools.js";

export interface ConfiguredSiteUpdateRequired {
  /** `feedUrl` is the configured GitHub releases "latest" URL; absent or blank means updates are not configured. */
  config: { feedUrl?: string | undefined };
  host: SiteUpdateHost;
  /** Every shared port except the feed, which this function builds from `config`. */
  shared: Omit<SiteUpdateSharedPorts, "feed">;
  getJson: GithubReleaseFeedRequired["getJson"];
}

/**
 * @returns The runtime, or null when no feed URL is configured or the host kind cannot update itself, so the
 *   update tools are not registered. Applying still goes only through `site_update_apply`'s owner card.
 * @complexity O(1).
 */
export function composeConfiguredSiteUpdateRuntime({ config, host, shared, getJson }: ConfiguredSiteUpdateRequired, _optional = {}): SiteUpdateRuntime | null {
  const feed = createConfiguredReleaseFeed({ config, getJson });
  if (feed === null) return null;
  return createSiteUpdateRuntime({ host, shared: { ...shared, feed } });
}

/**
 * @returns The configured release feed, or null when no feed URL is configured (there is no default URL, ever).
 * @complexity O(1); builds the feed without calling it.
 */
export function createConfiguredReleaseFeed({ config, getJson }: Pick<ConfiguredSiteUpdateRequired, "config" | "getJson">, _optional = {}): ReleaseFeedPort | null {
  const feedUrl = config.feedUrl?.trim() ?? "";
  if (feedUrl === "") return null;
  return createGithubReleaseFeed({ feedUrl, getJson });
}
