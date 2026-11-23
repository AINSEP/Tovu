import { createElement } from "react";
import "../../admin-themes/jini-admin-tokens.css";
import "@jini-ai/admin/screens/dashboard/dashboard.css";
import { Dashboard as DashboardScreen, type DashboardLinks } from "@jini-ai/admin/screens/dashboard/Dashboard";
import { activityRowHref } from "@jini-ai/admin/screens/dashboard/rules";
import { adminHref } from "@jini-ai/admin/shell/lib/router";

import { siteUrl } from "../../lib/site-url";
import { requestPublish } from "../publish-content/hooks/publish-request.store";
import { usePublishToLiveAvailable } from "../publish-content/hooks/publish-availability.store";
import { useWiredDashboard } from "./hooks/use-dashboard.hooks";
import { useRecentActivityDisclosure } from "./hooks/use-recent-activity-disclosure.hooks";

/**
 * @file Public surface of the `dashboard` feature — and its host wiring.
 *
 * `panels.tsx` imports from HERE, never from a file inside this folder. The screen itself lives in
 * `@jini-ai/admin/screens/dashboard`; this module binds this app's hooks, publish request and routes
 * into it, so the lazy panel import keeps one stable path while the package stays host-free.
 */

/** This app's routes for every link the Dashboard renders. Built per render: `siteUrl` and
 *  `adminHref` read the current origin and admin base, same as when they sat inline in the screen. */
function dashboardLinks(): DashboardLinks {
  return {
    posts: "/admin/posts", pages: "/admin/pages", media: "/admin/media", comments: "/admin/comments", themes: "/admin/themes",
    changePassword: adminHref({ routePath: "/users/change-password" }),
    viewSite: siteUrl({ path: "/" }),
    activityRow: activityRowHref,
  };
}

/** Publish All opens the App-level publish request with no pre-set criteria. */
function publishAll(): void {
  void requestPublish({});
}

/** The admin landing screen, bound to this app. */
export function Dashboard() {
  return createElement(DashboardScreen, {
    useDashboardHook: useWiredDashboard,
    // `false` on the live site, which has nowhere to publish to (`publish-availability.store.ts`).
    usePublishToLiveAvailableHook: usePublishToLiveAvailable,
    useRecentActivityDisclosureHook: useRecentActivityDisclosure,
    onPublishAll: publishAll,
    links: dashboardLinks(),
  });
}
