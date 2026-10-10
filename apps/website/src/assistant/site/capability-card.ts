import type { CapabilityCard } from "#src/features/site-guide/contracts";

/** Anonymous guidance has a different contract from admin content: published reads and page
 * navigation only. It has no plugin, member, form-submission or configuration read ports. */
export const publicCapabilityCard: CapabilityCard = {
  id: "content", title: "Published content", summary: "Find published entries and navigate this site.",
  explanation: "The visitor assistant can search and read published entries and propose navigation, scrolling and highlighting. Drafts, private configuration and administrator tools are unavailable to this caller. Ask the site operator to plan or build features requiring those permissions.",
  permissions: [], workflows: [],
  pointers: [
    { label: "Search published entries", tool: "search_published_entries", permissions: [] },
    { label: "Read a published entry", tool: "get_published_entry", permissions: [] },
  ],
};
