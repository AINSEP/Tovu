/** Minimal Widgets learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "widgets",
  "title": "Widgets",
  "summary": "Reusable widgets appear inline or in theme regions.",
  "explanation": "Discover widget types and region placements before building a custom block. Widget instances reuse existing content and form definitions.",
  "permissions": [
    "widgets.read"
  ],
  "pointers": [
    {
      "label": "Inspect widgets",
      "tool": "content_read.widget_instance",
      "permissions": [
        "widgets.read"
      ]
    },
    {
      "label": "Inspect regions",
      "tool": "content_read.widget_region",
      "permissions": ["widgets.read"]
    },
    {
      "label": "Widgets admin",
      "href": "/admin/widgets",
      "permissions": [
        "widgets.read"
      ]
    }
  ],
  "workflows": []
} as const satisfies CapabilityCard;
