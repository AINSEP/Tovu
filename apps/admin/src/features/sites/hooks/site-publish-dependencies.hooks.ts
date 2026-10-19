import { api, type AdminPublishDestination } from "@/lib/api";

/**
 * @file The Sites Export tab's Publish list port: the destinations read and the viewer's
 * permissions. Publishing itself goes through the existing static-publish and publish-content
 * ports, so this port never starts anything.
 */
export interface SitePublishPort {
  /** `system.read`. Newest first; peer rows only when the viewer may read publish content. */
  listDestinations(): Promise<AdminPublishDestination[]>;
  me(): Promise<{ effectivePermissions?: string[] }>;
}

export const defaultSitePublishPort: SitePublishPort = {
  listDestinations: () => api.listPublishDestinations(),
  me: () => api.me(),
};

/** An in-memory {@link SitePublishPort} for tests. */
export function createFakeSitePublishPort(overrides: Partial<SitePublishPort> = {}): SitePublishPort {
  return {
    listDestinations: overrides.listDestinations ?? (() => Promise.resolve([])),
    me: overrides.me ?? (() => Promise.resolve({ effectivePermissions: ["system.publish", "publish_content.apply"] })),
  };
}
