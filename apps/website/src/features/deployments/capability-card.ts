/** Minimal Deploy learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "deploy",
  "title": "Deploy",
  "summary": "Publishing content, exporting a static site and deploying the server are separate workflows.",
  "explanation": "Inspect the target and saved configuration. Use the enabled deploy plugin for host-specific instructions and review a preview before publishing.",
  "permissions": [
    "system.read"
  ],
  "pointers": [
    {
      "label": "Inspect deploy",
      "tool": "deployment_get_export_status",
      "permissions": [
        "system.read"
      ]
    },
    {
      "label": "Deploy admin",
      "href": "/admin/deployment",
      "permissions": [
        "system.read"
      ]
    }
  ],
  "workflows": []
} as const satisfies CapabilityCard;
