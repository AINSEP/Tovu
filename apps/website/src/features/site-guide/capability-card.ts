/** Minimal Jini packages learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "jini-packages",
  "title": "Jini packages",
  "summary": "Shared platform capabilities belong to @jini-ai packages.",
  "explanation": "Tovu keeps site-specific cards and adapters. Jini owns the generic agent, CMS, chat, MCP, authentication and platform capabilities; inspect the actual package contract before writing generic code.",
  "permissions": [
    "admin.assistant.use"
  ],
  "pointers": [
    {
      "label": "Inspect jini packages",
      "tool": "site_describe_capabilities",
      "permissions": [
        "admin.assistant.use"
      ]
    }
  ],
  "workflows": []
} as const satisfies CapabilityCard;
