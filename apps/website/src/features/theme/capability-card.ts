/** Minimal Themes learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "themes",
  "title": "Themes",
  "summary": "Themes render content with layouts, regions and data-embed-config markers.",
  "explanation": "Consult the live marker types and theme layout. Duplicate a theme before editing; preview it before switching the active theme. The header and footer render the site menus through menu markers (links written inside a marker are only its fallback), not the page list: change navigation with menus_update_menu_tree and describe it from menus_list_menus.",
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
