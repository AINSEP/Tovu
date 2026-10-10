/** Minimal Themes learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "themes",
  "title": "Themes",
  "summary": "Themes render content with layouts, regions and data-embed-config markers.",
  "explanation": "Consult the live marker types and theme layout. Duplicate a theme before editing; preview it before switching the active theme.",
  "permissions": [
    "theme.set"
  ],
  "pointers": [
    {
      "label": "Inspect themes",
      "tool": "content_read.theme",
      "permissions": [
        "theme.set"
      ]
    },
    {
      "label": "Themes admin",
      "href": "/admin/themes",
      "permissions": [
        "theme.set"
      ]
    }
  ],
  "workflows": []
} as const satisfies CapabilityCard;
