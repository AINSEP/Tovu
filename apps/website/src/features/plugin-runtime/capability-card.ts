/** Minimal Plugins learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "plugins",
  "title": "Plugins",
  "summary": "Site plugins and agent plugins extend different host surfaces.",
  "explanation": "Inspect installed and enabled plugins. Agent plugins may provide skills and guide topics; discovery does not authorize their tools.",
  "permissions": [
    "admin.plugins.read"
  ],
  "pointers": [
    {
      "label": "Inspect plugins",
      "tool": "content_read.plugin",
      "permissions": [
        "admin.plugins.read"
      ]
    },
    {
      "label": "Plugins admin",
      "href": "/admin/addons/plugins",
      "permissions": [
        "admin.plugins.read"
      ]
    }
  ],
  "workflows": []
} as const satisfies CapabilityCard;
