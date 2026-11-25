/**
 * @file The self-hosted side of a site update, check-only this wave: the running version comes from the environment
 * and the release feed is the configured one. There is no update driver, so nothing here records a target tag or
 * restarts anything. A target tag is an instruction, not an observation: writing one without a driver that acts on
 * it and observes the replacement boot would only leave a marker nobody honours.
 */
import type { IdGenerator } from "@jini-ai/core/primitives";
import { createConfiguredReleaseFeed, type ConfiguredSiteUpdateRequired } from "./configured-runtime.js";
import type { SiteUpdateCheckRuntime } from "./tools.js";

export interface SelfHostedCheckRequired {
  /** `TOVU_VERSION`/`TOVU_IMAGE_TAG` describe THIS process for the check only; never evidence a replacement booted. */
  runningVersion: string;
  config: ConfiguredSiteUpdateRequired["config"];
  getJson: ConfiguredSiteUpdateRequired["getJson"];
  ids: IdGenerator;
}

/**
 * @returns A check-only runtime (feed, ids, running version: no apply port at all), or null when no feed is configured.
 * @complexity O(1); builds ports without calling them.
 */
export function createSelfHostedCheckRuntime({ runningVersion, config, getJson, ids }: SelfHostedCheckRequired, _optional = {}): SiteUpdateCheckRuntime | null {
  const feed = createConfiguredReleaseFeed({ config, getJson });
  if (feed === null) return null;
  return { feed, ids, runningVersion: async () => runningVersion };
}
