import { buildSandboxProxyDataUrl } from "@jini-ai/ui/mcp-ui/surfaces";


/**
 * Builds the MCP-UI sandbox proxy's iframe URL as a same-document `data:` URL, in place of a route
 * served from this admin app's own origin (`GET /mcp-ui/sandbox-proxy.html`, `apps/website`'s
 * `mcp-ui-sandbox-proxy-route.ts`). `@mcp-ui/client`'s `AppFrame` hardcodes `sandbox="allow-scripts
 * allow-same-origin allow-forms"` on the iframe it creates — not configurable away by this app or by
 * `@jini-ai/ui` — so a same-origin route means any third-party MCP server's HTML, once
 * `document.write`-n into that iframe by the proxy script, gets this admin origin's cookies, storage,
 * and same-origin fetches. A `data:` URL's origin is opaque under the URL Standard's own origin
 * algorithm regardless of `allow-same-origin` (verified live against a real Chromium build,
 * 2026-09-03 — see `@jini-ai/ui`'s `sandbox-proxy.ts` module doc), so switching to one closes that gap
 * without needing a second host, DNS entry, or CORS change: `buildSandboxProxyDataUrl` bakes this
 * admin app's own origin into the served script as a literal (never read back from the iframe's own
 * URL), so the ready/resource-ready handshake still only accepts messages from this window's real
 * parent.
 *
 * The old same-origin route stays mounted server-side (harmless, and it may still have other
 * consumers), but this admin dock no longer points an iframe at it.
 *
 * @param input.hostOrigin - This admin app's own real origin — `globalThis.location.origin`, always, never
 *   a value parsed back out of this document's own URL.
 */
export function buildAssistantMcpUiSandboxProxyUrl({ hostOrigin }: { hostOrigin: string }, _options: Record<string, never> = {}): URL {
  return new URL(buildSandboxProxyDataUrl({ hostOrigin }));
}

/**
 * `useMcpUiHost`'s `onOpenLink` implementation for this admin dock (S-G1b, memory
 * `links_open_new_tab` — generic, not Supabase-specific: any bundled or third-party plugin's
 * rendered MCP-UI card gets the same "links open in a new tab" behavior). `McpUiHostOptions`'s own
 * doc is explicit that omitting this option makes the Host refuse every `ui/open-link` request, so
 * before this existed a link inside a rendered card did nothing at all — not a broken link, an
 * inert one.
 *
 * `https:` only, on purpose: a View is untrusted content (a third-party MCP server's own HTML,
 * `@mcp-ui/client`'s whole reason for existing), and `window.open` will happily hand a
 * `javascript:` URL a same-tab execution context, or hand a `file:`/`data:` URL more than a chat
 * card should ever be able to reach. Rejecting everything except `https:` is a strict allowlist,
 * not a denylist of the schemes seen so far. A URL that fails to parse at all (`new URL` throwing)
 * is treated the same as a wrong scheme — refused, not surfaced as an error to the View.
 *
 * One exception, a root-relative path (`/admin/…`, never protocol-relative `//host`): owner
 * 2026-10-08, every chat link opens a new tab, in-app links included. A View's `<a href>` reaches
 * here unresolved — Jini's sandbox proxy forwards link clicks as `ui/open-link`, and its opaque
 * `data:` document has no base to resolve a path against — so the path is resolved against this
 * admin's own origin, the only page it can mean. That opens this app itself, whatever its scheme.
 *
 * `noopener,noreferrer` on the `window.open` call itself closes `window.opener` back-reference
 * access (the tab-nabbing vector `rel="noopener"` exists for on a plain `<a>`) and withholds the
 * `Referer` header, matching how this app already opens every other off-site link — see memory
 * `links_open_new_tab`.
 *
 * @param input.url - The View's requested target, exactly as `useMcpUiHost` receives it from the
 *   `ui/open-link` request — not yet validated.
 * @complexity O(1) — one `URL` parse, at most one `window.open` call.
 */
export function openMcpUiLink({ url }: { url: string }, _options: Record<string, never> = {}): void {
  if (/^\/(?!\/)/.test(url)) {
    window.open(new URL(url, window.location.origin).href, "_blank", "noopener,noreferrer");
    return;
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("This link is not a valid https:// address, so it was not opened.");
  }
  if (parsed.protocol !== "https:") throw new Error("This link is not a valid https:// address, so it was not opened.");
  window.open(url, "_blank", "noopener,noreferrer");
}

