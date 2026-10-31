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
  'page.navigate': {
    displayTitle: "Open a post or page",
    displayDescription: "Lets visitors open a post or page.",
  },
  'page.scroll_to': {
    displayTitle: "Scroll to a post or page",
    displayDescription: "Lets visitors scroll to a post or page.",
  },
  'page.highlight': {
    displayTitle: "Highlight a post or page",
    displayDescription: "Lets visitors highlight a post or page.",
  },
  'page.find_elements': { displayTitle: 'Read the public screen', displayDescription: 'Lets visitors read reviewed public regions and controls.' },
  'page.click': { displayTitle: 'Use public page controls', displayDescription: 'Operates reviewed menus and disclosures. Submitting a form requires confirmation.' },
  'page.fill': { displayTitle: 'Fill public form fields', displayDescription: 'Fills a reviewed field after visitor confirmation.' },
  'page.select_option': { displayTitle: 'Choose public form options', displayDescription: 'Changes a reviewed selection after visitor confirmation.' },
  site_guide: {
    displayTitle: "Site guide",
    displayDescription: "Shows visitors what the assistant can do.",
  },
} as const satisfies Record<string, VisitorToolPresentation>;
