import type { AgentToolDefinition } from "@jini-ai/core";
import { webFetchPageToolDefinition } from "@jini-ai/platform/web";

/**
 * @file The `web` domain's agent-tool catalog: the `web_fetch_page` definition from
 * `@jini-ai/platform/web`, bound to this app's permission, origin scope and sibling tools.
 *
 * `web_fetch_page` exists because only the Claude Code CLI ships its own WebFetch: BYOK chats and
 * other vendors' CLIs had no way to read a page (owner, 2026-10-08, importing an existing site).
 * Admin assistant only: the visitor assistant's tool set is a fixed literal allowlist
 * (`modules/site-assistant.ts`), so a catalog tool never reaches it.
 */

/** Visibility floor and gate: any admin who may use the assistant may read public pages through it.
 *  Reused rather than invented — what `site_describe_capabilities` and `assistant_admin_screen_link` use. */
export const WEB_READ_PERMISSION = "admin.assistant.use";

export const webAgentToolCatalog: readonly AgentToolDefinition[] = [
  webFetchPageToolDefinition({
    permission: WEB_READ_PERMISSION,
    urlDescription: "Absolute http(s) URL of a public page or this site's exact configured origin (including its localhost port), e.g. https://example.com/about or https://example.com/sitemap.xml.",
    destinationNote: "Public internet and THIS site's exact configured origin: its own localhost URL is allowed only with the configured scheme, hostname and port. Other localhost origins, private-network and cloud-metadata addresses are refused on every redirect. No cookies or logins are sent. Render mode permits bounded XHR/fetch POST/PUT/PATCH through the same destination guard; document/form posts and beacons are blocked. Text formats only (HTML, text, XML, JSON, CSS); for images use media_import_from_url. For THIS site's own pages you can also use fetch_published_page or fetch_live_url.",
  }),
];
