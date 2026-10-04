import { createElement } from "react";
import { Media } from "./features/media";
// PARKED 2026-10-03 (owner): Jini media at parity; re-enable to switch over
// import { ModulePanel } from "./integrations/jini-admin/ModulePanel";
import type { PanelRouteContext } from "./panels";

// Keep render dispatch outside the JSX-only panel registry. Both screens use App's host chrome.
export function renderMediaPanel(ctx: PanelRouteContext, _optional: Record<string, never> = {}) {
  switch (ctx.view) {
    // PARKED 2026-10-03 (owner): Jini media at parity; re-enable to switch over
    // case "jini-media":
    //   // `?tab=<id>` picks the initially-active tab and stays in sync as the operator switches tabs
    //   // (via `ModulePanel`'s route query) — same `?tab=` deep-linking convention as `deployment`'s and
    //   // `settings`'s own entries elsewhere in the panel registry.
    //   return createElement(ModulePanel, { moduleId: "media", pageId: "library", route: ctx });
    default:
      // Legacy Media owns `/admin/media` in every build until owner visual-parity sign-off.
      // Pass its existing tab prop through so direct links and its tab buttons use the same URL.
      return createElement(Media, { tabId: ctx.query.get("tab") });
  }
}
