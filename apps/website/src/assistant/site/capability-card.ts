import type { CapabilityCard } from "#src/features/site-guide/contracts";

/** Shared by the visitor prompt and guide so tool results cannot become internal jargon in replies. */
export const VISITOR_REPLY_GUIDANCE = "Never name internal tools or expose tool or topic identifiers to visitors, including when an action is unavailable or refused. Describe what you can or cannot do in plain visitor-friendly language; do not quote internal errors.";

/** Anonymous guidance has a different contract from admin content: published reads and page
 * navigation only. It has no plugin, member, form-submission or configuration read ports. */
export const publicCapabilityCard: CapabilityCard = {
  id: "content", title: "Published content", summary: "Find published entries and navigate this site.",
  explanation: "The visitor assistant can search and read published entries and propose navigation, scrolling and highlighting. Drafts, private configuration and administrator tools are unavailable to this caller. Ask the site operator to plan or build features requiring those permissions. " + VISITOR_REPLY_GUIDANCE,
  permissions: [], workflows: [],
  pointers: [
    { label: "Search published entries", permissions: [] },
    { label: "Read a published entry", permissions: [] },
  ],
};
