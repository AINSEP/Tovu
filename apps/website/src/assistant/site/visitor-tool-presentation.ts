import type { VisitorToolPresentation } from "../../contracts/site-assistant/visitor-tools-management.js";

/** Plain admin copy shared by the reviewed visitor contracts and their management catalog.
 * Keep this separate from model instructions: the admin translates these English dictionary keys.
 *
 * MOVE from the panel CSS (the old presentation workaround):
 * Server titles are snake_case ids spelled out ("list categories"); capitalise like a label.
 * Descriptions are the model-facing text and can run a paragraph; two lines here, full text on hover.
 * The display fields replace both workarounds; model descriptions stay unchanged.
 */
export const VISITOR_TOOL_PRESENTATION = {
  search_published_entries: {
    displayTitle: "Search posts and pages",
    displayDescription: "Lets visitors find your posts and pages.",
  },
  get_published_entry: {
    displayTitle: "Read a post or page",
    displayDescription: "Lets visitors read a post or page.",
  },
  list_categories: {
    displayTitle: "List categories",
    displayDescription: "Lets visitors see your post categories.",
  },
  navigate_to_entry: {
    displayTitle: "Open a post or page",
    displayDescription: "Lets visitors open a post or page.",
  },
  scroll_to_entry: {
    displayTitle: "Scroll to a post or page",
    displayDescription: "Lets visitors scroll to a post or page.",
  },
  highlight_entry: {
    displayTitle: "Highlight a post or page",
    displayDescription: "Lets visitors highlight a post or page.",
  },
  site_guide: {
    displayTitle: "Site guide",
    displayDescription: "Shows visitors what the assistant can do.",
  },
} as const satisfies Record<string, VisitorToolPresentation>;
