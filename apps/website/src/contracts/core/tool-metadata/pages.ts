import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** pages registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  // Movers use order/position vocabulary only; edit verbs belong to section writers.
  "pages_move_region": {
    search: {
      keywords: "move moving reorder reordering rearrange rearranging reposition order ordering sequence position swap places above below before after higher lower up down earlier later top bottom first last",
      queries: [
        "Swap the order of two sections on our landing page.",
        "Move the testimonials above the pricing on this page.",
        "Can you put the FAQ right after the hero instead of at the bottom?",
        "Rearrange the blocks on this page into a different order.",
        "Shift the contact block up so it comes first.",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  // Opposed whole/entire/rewrite vs one/section vocabulary distinguishes full-body writes
  // from section edits. Questions keep those contracts apart as well.
  "pages_read_html": {
    search: {
      // Index the read result, not a later edit: prerequisite wording otherwise competes with writers.
      keywords: "page html source code view read existing content current markup body regions region handles sections what is on the page show current version",
      queries: [
        "Read this page's stored HTML source.",
        "Show the current markup and body content for the page.",
        "List this page's editable regions.",
        "Read the section handles available in the page HTML.",
        "Return the current page version number.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
  "pages_write_html": {
    search: {
      keywords: "custom page html code write create new design page build a page landing page whole entire full complete rewrite rewriting redo start over from scratch replace the page restructure add a section remove a section",
      queries: [
        "Build me a landing page for our new product.",
        "Replace this page's whole body with a completely new design.",
        "Start this page over from scratch — throw away what's there.",
        "I want to restructure the page and add two new sections.",
        "Create the full HTML for a bespoke page on our site.",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
  "pages_write_region": {
    search: {
      keywords: "section sections region regions part parts piece block chunk area one single just the only the " +
        "hero headline heading title banner cta call to action pricing faq testimonial footer text copy " +
        "edit editing change changing update updating tweak adjust revise reword swap replace fix amend " +
        "without rewriting not the whole page leave the rest keep the rest surgical targeted in place " +
        "handle data-agent-element",
      queries: [
        "Just change the headline on our landing page, leave the rest alone.",
        "Update the pricing section of this page without touching anything else.",
        "Can you reword the call to action but keep the page as it is?",
        "Edit one section of a page instead of rewriting the whole thing.",
        "I want to edit just the hero copy on this page and nothing more.",
      ],
    },
    approval: { class: 'edit', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
