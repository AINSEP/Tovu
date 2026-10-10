/** Minimal Content learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "content",
  "title": "Content",
  "summary": "Pages, posts and structured collections are reusable site data.",
  "explanation": "Create content through the content tools; attach forms and widgets rather than embedding a second implementation.",
  "permissions": [
    "content.read"
  ],
  "pointers": [
    {
      "label": "Inspect content",
      "tool": "content_read.content_post",
      "permissions": [
        "content.read"
      ]
    },
    {
      "label": "Content admin",
      "href": "/admin/posts",
      "permissions": [
        "content.read"
      ]
    }
  ],
  "workflows": []
} as const satisfies CapabilityCard;
