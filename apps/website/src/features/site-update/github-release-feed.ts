/**
 * @file The release feed for desktop and self-hosted updates: a configured GitHub releases URL. The URL and the
 * JSON fetcher are injected by the host's composition; nothing here names a repository or touches the network.
 */
import type { ReleaseFeedPort, SiteRelease } from "@jini-ai/devops/deploy";

export interface GithubReleaseFeedRequired {
  /** The configured `.../releases/latest` URL; there is deliberately no default. */
  feedUrl: string;
  /** Fetches and parses JSON through the host's guarded HTTP client; throws on a non-2xx answer. */
  getJson: (required: { url: string }, optional?: { signal?: AbortSignal | undefined }) => Promise<unknown>;
}

function asRelease(body: unknown): SiteRelease | null {
  if (typeof body !== "object" || body === null) return null;
  const { tag_name: tag, body: notes, draft, prerelease } = body as { tag_name?: unknown; body?: unknown; draft?: unknown; prerelease?: unknown };
  if (typeof tag !== "string" || tag.trim() === "" || draft === true || prerelease === true) return null;
  return { version: tag.trim().replace(/^v(?=\d)/, ""), notes: typeof notes === "string" ? notes : "" };
}

/**
 * @param required.feedUrl - The configured GitHub releases "latest" URL.
 * @param required.getJson - Injected JSON fetcher.
 * @returns A `ReleaseFeedPort`; the newest published, non-draft, non-prerelease release, or null.
 * @throws Error when `feedUrl` is blank, so a missing config can never fall back to a built-in URL.
 */
export function createGithubReleaseFeed(required: GithubReleaseFeedRequired, _optional: Record<string, never> = {}): ReleaseFeedPort {
  const url = required.feedUrl.trim();
  if (url === "") throw new Error("A release feed URL must be configured before the site can check for updates.");
  return { latestRelease: async (_required, optional) => asRelease(await required.getJson({ url }, { signal: optional?.signal })) };
}
