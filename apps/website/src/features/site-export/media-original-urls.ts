import { exportUrlLocations } from "@jini-ai/devops/static-export";
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

/** Same origin as the configured site; an unparsable URL is never ours. */
function sameOrigin({ url, origin }: { url: string; origin: string }): boolean {
  try { return new URL(url, origin).origin === origin; } catch { return false; }
}

/** Local paths need no origin lookup; absolute references must belong to the configured site.
 * With no verified origin, absolute references stay as written: a link must never fail the export. */
async function localOriginalPaths({ body, deps, contentType }: { body: string; deps: ExportMediaUrlDeps; contentType: string }, _optional = {}): Promise<Map<string, { prefix: string; key: string }>> {
  const matches = exportUrlLocations({ body, contentType }).flatMap(({ start, end }) => [...body.slice(start, end).matchAll(ORIGINAL_URL)]);
  const paths = new Map<string, { prefix: string; key: string }>();
  let origin: string | null | undefined;
  for (const match of matches) {
    if (match[1]) {
      origin ??= await deps.originRegistry.canonicalOrigin({ workspaceId: deps.workspaceId })
        .then(configured => `${configured.scheme}://${configured.host}`, () => null);
      if (!origin || !sameOrigin({ url: match[0], origin })) continue;
    }
    let key: string;
    try { key = decodeURIComponent(match[2]!); } catch { continue; } // Malformed escapes are not media keys.
    // Absolute URLs stay absolute (sitemaps and og:image require them); only the path is upgraded.
    paths.set(match[0], { prefix: match[1] ?? "", key });
  }
  return paths;
}

/** Upgrade stored URLs using the same lookup and read-path type backfill as the media library.
 * O(text length + URL positions log URL positions + distinct media keys) work, one batched type lookup; legacy bytes read only
 * when their type was never recorded. Missing/private documents retain their existing URLs.
 */
export async function rewriteMediaOriginalUrls(
  { body, deps }: { body: string; deps: ExportMediaUrlDeps }, { contentType = "text/html" }: { contentType?: string } = {},
): Promise<string> {
  const paths = await localOriginalPaths({ body, deps, contentType });
  if (paths.size === 0) return body;
  const records = new Map<string, NonNullable<Awaited<ReturnType<typeof findMediaByIdOrSlug>>>>();
  for (const [url, { key }] of paths) {
    const record = await findMediaByIdOrSlug({ deps, input: { workspaceId: deps.workspaceId, idOrSlug: key } });
    if (record && record.status === "active" && record.kind !== "document") records.set(url, record);
  }
  const contentTypes = await resolveContentTypes(deps, [...records.values()]);
  const replacements = new Map<string, string>();
  for (const [url, record] of records) {
    const contentType = contentTypes.get(record.source.sha256);
    const { prefix, key } = paths.get(url)!;
    if (contentType) replacements.set(url, prefix + mediaPublicPath(key, { kind: "original", contentType }));
  }
  const output: string[] = [];
  let offset = 0;
  for (const { start, end } of exportUrlLocations({ body, contentType })) {
    const value = body.slice(start, end).replace(ORIGINAL_URL, url => replacements.get(url) ?? url);
    output.push(body.slice(offset, start), value);
    offset = end;
  }
  output.push(body.slice(offset));
  return output.join('');
}

/** Rewrite textual responses before the existing exporter writes AND crawls them. Binary responses
 * stay streaming and untouched. Response headers remain authoritative except for the byte length,
 * which must be recalculated after a text rewrite. No extra HTTP requests or renderer are used.
 */
export async function rewriteExportMediaResponse(
  { response, deps }: { response: Response; deps: ExportMediaUrlDeps }, _options = {},
): Promise<Response> {
  if (response.body === null) return response;
  if (!/^(?:text\/(?:html|css)|application\/(?:[\w.+-]*\+)?(?:json|xml))\b/i.test(response.headers.get("content-type") ?? "")) return response;
  const body = await rewriteMediaOriginalUrls({ body: await response.text(), deps }, { contentType: response.headers.get("content-type") ?? "" });
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}
