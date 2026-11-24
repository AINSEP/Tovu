/**
 * @file Chooses the platform adapter for this host's update tools. Only the host KIND decides; every
 * port it needs is injected. Both kinds produce the same `SiteUpdateRuntime`, so both reach the
 * platform only through `site_update_apply`'s owner card. Nothing here starts a timer, checks a
 * feed or applies anything: building a runtime is inert.
 */
import {
  createDesktopSiteUpdate, createSelfHostedSiteUpdate,
  type DesktopAppUpdaterPort, type DesktopSiteMigratePort, type ImageTagPort, type SiteDataRestorePort, type SiteHealthPort,
} from "@jini-ai/devops/deploy";
import type { SiteUpdateRuntime } from "./tools.js";

/** The host's own ports, by kind. A kind not listed here (or `none`) cannot update itself. */
export type SiteUpdateHost =
  | { kind: "desktop"; app: DesktopAppUpdaterPort; migrate: DesktopSiteMigratePort; health: SiteHealthPort }
  | { kind: "self-hosted"; images: ImageTagPort; health: SiteHealthPort; data?: SiteDataRestorePort; imageTagPrefix?: string }
  | { kind: "none" };

/** The ports every kind shares: release feed, backup, migration gate, error ids, running version. */
export type SiteUpdateSharedPorts = Omit<SiteUpdateRuntime, "site">;

/**
 * @returns The runtime for a known host kind, or null so the update tools are not registered.
 * @complexity O(1); builds adapters without calling them.
 */
export function createSiteUpdateRuntime({ host, shared }: { host: SiteUpdateHost; shared: SiteUpdateSharedPorts }, _optional = {}): SiteUpdateRuntime | null {
  const ids = { ids: shared.ids };
  if (host.kind === "desktop") return { ...shared, site: createDesktopSiteUpdate({ feed: shared.feed, app: host.app, migrate: host.migrate, health: host.health }, ids) };
  if (host.kind === "self-hosted") {
    return { ...shared, site: createSelfHostedSiteUpdate({ feed: shared.feed, images: host.images, health: host.health }, { ...ids, data: host.data, prefix: host.imageTagPrefix }) };
  }
  return null;
}
