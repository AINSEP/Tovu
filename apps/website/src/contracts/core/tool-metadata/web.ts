import type { ToolMetadataById } from '@jini-ai/core';
import type { ToolApprovalPolicy } from '../../headless/assistant-tool-approval-policy.js';

/** web registration declarations; shared placement rationale is in ./index.ts. */
export const toolMetadata = {
  // A credential-free GET with no durable effect: classified 'read' like fetch_live_url. FTS unicode61
  // does not stem, so singular/plural and verb forms are listed separately.
  "web_fetch_page": {
    search: {
      keywords: "web webpage webpages page pages website websites site url urls link internet online public external remote fetch fetching read reading open visit browse scrape scraping crawl download get view html markdown text sitemap sitemaps robots css stylesheet import copy migrate existing competitor reference",
      queries: [
        "Fetch a web page.",
        "Read a website.",
        "Open this URL and tell me what it says.",
        "Turn this existing website into pages and posts.",
        "Read the sitemap.xml of another site.",
        "Copy the content and theme of a site at this link.",
      ],
    },
    approval: { class: 'read', confirmation: 'direct' },
  },
} as const satisfies ToolMetadataById<ToolApprovalPolicy>;
