/**
 * @file The host's projector for the template-preview embed inspection route
 * (`@jini-ai/cms/admin-http/routes/posts/template-preview-embeds`): turns the rendered preview's
 * ordered iframe `src` strings into validated YouTube video ids for the Page Preview links.
 *
 * Why only ids: the JSON endpoint sees the same authorized draft render the sandboxed HTML preview
 * serves, but the admin frame must never read that document (no `allow-same-origin`). Returning a
 * validated 11-character id — and discarding every other part of each URL — gives the editor its
 * "Watch on YouTube" links without exposing any rendered HTML, query string or third-party URL.
 * Pure string work: no redirects, network calls or script execution.
 */

/** Exact origins (scheme + host + default port) that may contribute an id, and the path shape each allows. */
const LONG_HOSTS: ReadonlySet<string> = new Set(["youtube.com", "www.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"]);
const SHORT_HOST = "youtu.be";
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** The id in one source, or `undefined` when the source is not an exact allowed embed URL.
 * @complexity O(n) in the source length (one URL parse). */
function youtubeIdOf({ source }: { source: string }, _optional: Record<string, never> = {}): string | undefined {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return undefined;
  }
  // `URL` drops a default `:443`, so any remaining port is nonstandard; credentials are refused outright.
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.port !== "") return undefined;
  const segments = url.pathname.split("/");
  if (url.hostname === SHORT_HOST) return segments.length === 2 && VIDEO_ID.test(segments[1] ?? "") ? segments[1] : undefined;
  if (!LONG_HOSTS.has(url.hostname) || segments.length !== 3 || segments[1] !== "embed") return undefined;
  return VIDEO_ID.test(segments[2] ?? "") ? segments[2] : undefined;
}

/** Validated YouTube ids from the preview's iframe sources, deduplicated in first-seen order.
 * @complexity O(total source length). */
export function projectPreviewYoutubeIds(
  { iframeSources }: { iframeSources: readonly string[] },
  _optional: Record<string, never> = {},
): { youtubeIds: string[] } {
  const seen = new Set<string>();
  for (const source of iframeSources) {
    const id = youtubeIdOf({ source });
    if (id !== undefined) seen.add(id);
  }
  return { youtubeIds: [...seen] };
}
