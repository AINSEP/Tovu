import type { MediaRepoPort } from "@jini-ai/cms/media";
import type { OriginRegistryPort } from "@jini-ai/http-kit/verified-origin";
import { findMediaByIdOrSlug } from "@jini-ai/cms/media";
import { mediaPublicPath } from "../media/public-path.js";
import { resolveContentTypes, type ContentTypeDeps } from "../media/content-type-resolution.js";

export interface ExportMediaUrlDeps extends ContentTypeDeps {
  mediaRepo: MediaRepoPort;
  originRegistry: OriginRegistryPort;
}

// Match complete local media paths in HTML, CSS, XML and JSON, retaining query/fragment tails.
// Check absolute URLs against the configured origin: another site's /m/ namespace is not ours.
const ORIGINAL_URL = /(?<![\w/.:%-])((?:https?:)?\/\/[^/\s"'<>\\()]+)?\/m\/([^/\s"'<>\\()?#]+)\/original(?=[\s"'<>\\()?#,;]|$)/g;

/** Local paths need no origin lookup; absolute references must belong to the configured site. */
async function localOriginalPaths({ body, deps }: { body: string; deps: ExportMediaUrlDeps }): Promise<Map<string, string>> {
  const matches = [...body.matchAll(ORIGINAL_URL)];
  const paths = new Map<string, string>();
  let origin: string | undefined;
  for (const match of matches) {
    if (match[1]) {
      if (!origin) {
        const configured = await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId });
        origin = `${configured.scheme}://${configured.host}`;
      }
      if (new URL(match[0], origin).origin !== origin) continue;
    }
    paths.set(match[0], match[2]!);
  }
  return paths;
}

/** Upgrade stored URLs using the same lookup and read-path type backfill as the media library.
 * O(text length + distinct media keys) work, one batched type lookup; legacy bytes read only
 * when their type was never recorded. Missing/private documents retain their existing URLs.
 */
export async function rewriteMediaOriginalUrls(
  { body, deps }: { body: string; deps: ExportMediaUrlDeps }, _options = {},
): Promise<string> {
  const paths = await localOriginalPaths({ body, deps });
  if (paths.size === 0) return body;
  const records = new Map<string, NonNullable<Awaited<ReturnType<typeof findMediaByIdOrSlug>>>>();
  for (const [url, key] of paths) {
    const record = await findMediaByIdOrSlug({ deps, input: { workspaceId: deps.workspaceId, idOrSlug: decodeURIComponent(key) } });
    if (record && record.status === "active" && record.kind !== "document") records.set(url, record);
  }
  const contentTypes = await resolveContentTypes(deps, [...records.values()]);
  const replacements = new Map<string, string>();
  for (const [url, record] of records) {
    const contentType = contentTypes.get(record.source.sha256);
    if (contentType) replacements.set(url, mediaPublicPath(decodeURIComponent(paths.get(url)!), { kind: "original", contentType }));
  }
  return body.replace(ORIGINAL_URL, url => replacements.get(url) ?? url);
}

/** Rewrite textual responses before the existing exporter writes AND crawls them. Binary responses
 * stay streaming and untouched. Response headers remain authoritative except for the byte length,
 * which must be recalculated after a text rewrite. No extra HTTP requests or renderer are used.
 */
export async function rewriteExportMediaResponse(
  { response, deps }: { response: Response; deps: ExportMediaUrlDeps }, _options = {},
): Promise<Response> {
  if (response.body === null) return response;
  if (!/^(?:text\/(?:html|css|plain)|application\/(?:[\w.+-]*\+)?(?:json|xml))\b/i.test(response.headers.get("content-type") ?? "")) return response;
  const body = await rewriteMediaOriginalUrls({ body: await response.text(), deps });
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
