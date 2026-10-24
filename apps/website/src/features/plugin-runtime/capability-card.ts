/** Minimal Plugins learning card, maintained beside its owning code. Live registries supply current types. */
import type { CapabilityCard } from "#src/features/site-guide/contracts";

export const capabilityCard = {
  "id": "plugins",
  "title": "Plugins",
  "summary": "Site plugins and agent plugins extend different host surfaces.",
  "explanation": "Inspect installed plugins, including those switched off. Agent plugins may provide mail, account tools, skills and guide topics. Before saying a provider is unavailable, call search_agent_plugin_local for it, then load_agent_plugin for its setup guidance. Enable it with plugins_set_enabled only with the person's approval; discovery does not authorize its tools.",
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
