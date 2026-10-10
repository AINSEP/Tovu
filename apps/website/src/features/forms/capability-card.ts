/** Minimal Forms learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "forms",
  "title": "Forms",
  "summary": "Collect submissions with native form definitions and rendered embeds.",
  "explanation": "Ask for the live fieldTypes before choosing fields. HTML-authored forms and definition-based forms have different authoring contracts; consult the forms tools for the supported schema.",
  "permissions": [
    "admin.forms.manage"
  ],
  "pointers": [
    {
      "label": "Inspect forms",
      "tool": "content_read.form_definition",
      "permissions": [
        "admin.forms.manage"
      ]
    },
    {
      "label": "Forms admin",
      "href": "/admin/forms",
      "permissions": [
        "admin.forms.manage"
      ]
    }
  ],
  "workflows": []
} as const satisfies CapabilityCard;
