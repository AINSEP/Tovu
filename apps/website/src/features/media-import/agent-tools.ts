import type { AgentToolSideEffect } from "@jini-ai/cms/core";

/**
 * @file Agent-tool catalog for `features/media-import` — closes the "the assistant is holding a URL
 * to an image and cannot save it" gap, found live 2026-09-06.
 *
 * The incident, in the assistant's own words after generating a real 2048x1152 PNG through an
 * external MCP server and being handed a CloudFront URL for it: "`media_upload_asset` needs base64
 * bytes I'm holding, `media_promote_chat_attachment` needs a chat attachment, and there is no
 * import-by-URL tool." The catalog could accept raw base64, and it could promote something a human
 * had already attached to a chat. Nothing accepted a URL — so a human had to bridge it by hand,
 * fetching the bytes in a browser and POSTing them to the admin API.
 *
 * ONE tool, `media_import_from_url`. That is the entire domain, deliberately: this is not a general
 * "fetch a URL" primitive (`custom_credential_make_request` is the tool for talking to an API), it
 * is specifically "the bytes at this URL are an image, put them in the media library".
 *
 * A new domain rather than a 5th entry on `media`'s catalog, for the same reason
 * `features/media-generation` is one: `media`'s 4-tool catalog is `@jini-ai/cms`-owned (shared across
 * every host of that package, with its own "wire the ENTIRE catalog" tripwire test on both sides),
 * while this tool's pipeline — Tovu's `platform/http` SSRF-guarded client, built by Tovu's own
 * composition root from Tovu's own `EgressPolicy` — is host-specific glue. Same category
 * `custom-credentials`/`site-inspection`/`site-evidence`/`media-generation` already established.
 *
 * `media.upload`-gated — the same permission `media_upload_asset` and `media_generate_asset` use,
 * not a new one. What this tool durably DOES is create exactly the kind of row a human upload
 * creates; only the byte source differs. Reusing the existing permission also means no seed or role
 * change is needed for an existing grant to cover it.
 *
 * Architectural role: `features/media-import` domain declaration. No imports beyond the shared
 * side-effect type — reference data, not I/O.
 */

/** Local declaration, not shared — same "duplicate the tiny type, never share across
 *  features/files" convention `media-generation`/`custom-credentials`' own catalogs follow. */
export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

const IMPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["url"],
  properties: {
    url: {
      type: "string",
      description:
        "The absolute https URL of the image to import, including the scheme — for example " +
        "'https://cdn.example.com/generated/fox.png'. The server fetches it; you do not need to " +
        "download it yourself or hold its bytes. http, data:, file: and relative URLs are rejected, " +
        "as are URLs that resolve to a private, loopback, link-local or cloud-metadata address. " +
        "Signed or time-limited vendor URLs expire fast — import promptly rather than saving the URL for later.",
    },
    filename: {
      type: "string",
      description:
        "Optional. A name for the asset, used to derive its title in the media library. Defaults to " +
        "the last path segment of the URL, which is often a meaningless hash — pass something " +
        "descriptive when you know what the image is. The file extension is always set from the " +
        "image's real format and cannot be overridden here.",
    },
    alt: { type: "string", description: "Optional accessibility alt text for the imported asset." },
    caption: { type: "string", description: "Optional display caption for the imported asset." },
    credit: { type: "string", description: "Optional attribution/credit line for the imported asset — e.g. the vendor or photographer the image came from." },
  },
} as const;

/**
 * This domain's fixed agent-tool catalog.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const mediaImportAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "media_import_from_url",
    description:
      "THIS IS HOW TO SAVE AN IMAGE YOU ONLY HAVE A URL FOR — the missing third way into the media library, alongside media_upload_asset (which needs base64 bytes you are already holding) and media_promote_chat_attachment (which needs a file a human attached to this chat). Call this whenever you have a link to an image and want it in the media library: an image another tool or an external MCP server just generated and returned a URL for, an image on a page you are working from, a stock/CDN image the human pointed you at. You do NOT need to download the image, read it, or convert it to base64 first — pass the URL and the server fetches the bytes itself. Requires an absolute https URL; the fetch is size-bounded, time-bounded, and blocked from reaching private/internal addresses. The image's real format is detected from its actual bytes, not from what the server claims, and only PNG, JPEG, GIF, WebP and AVIF are accepted — a URL that returns HTML, a PDF, a video, or an SVG is rejected rather than saved as a broken asset. On success the returned `media` object (id, title, alt, caption, credit, sha256, status, version, publicUrl) is the SAME shape media_upload_asset/media_generate_asset/media_list_assets return, so the id can go straight into media_update_metadata/media_trash_asset and `publicUrl` (when present) can be used to embed the image in a post or page immediately. Importing the same image twice is safe and cheap — identical bytes are de-duplicated to one stored blob. A 403 or 404 usually means a signed URL has already expired: ask for a fresh URL instead of retrying the same one.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "media.upload" },
    inputSchema: IMPORT_SCHEMA,
  },
];
