import type { AdminCreatedSite, AdminSiteActivation, AdminSitesSnapshot } from "@/lib/api";

/**
 * @file What `use-sites.hooks.ts` needs from the outside world, as an interface rather than a direct
 * `lib/api` import — the `useX(dependencies)` / `useWiredX()` split documented on
 * `assistant-chats-port.hooks.ts` and followed by every other feature in this app.
 *
 * One port for all three routes rather than one per operation: they read and write the same
 * `sites/` resource, and a test double for one is a double for the resource.
 *
 * `siteRowState`/`activationOutlook`/`siteNameErrorKey` (`rules.ts`) are deliberately NOT here —
 * they are pure rules with no I/O, and per the pattern a hook imports rules directly rather than
 * having them injected.
 */
export interface SitesPort {
  listSites(): Promise<AdminSitesSnapshot>;
  createSite(input: { name: string }): Promise<{ site: AdminCreatedSite }>;
  activateSite(name: string): Promise<AdminSiteActivation>;
}
