/** Product adapter: preserve the host HTTP signature and request identity around Jini's reader. */
import {
  fetchWebPage as fetchJiniWebPage,
  type WebFetchPorts as JiniWebFetchPorts, type WebFetchInput, type WebFetchResult,
} from "@jini-ai/platform/web";
import type { HttpClientPort } from "#src/platform/http/index";

export {
  readWebFetchInput, WEB_FETCH_FORMATS, DEFAULT_MAX_CHARS, MAX_MAX_CHARS,
  MAX_URL_LENGTH, DEFAULT_TIMEOUT_MS, UNTRUSTED_NOTICE,
} from "@jini-ai/platform/web";
export type { WebFetchInput, WebFetchResult, WebFetchFormat, WebFetchEvent } from "@jini-ai/platform/web";
export const WEB_FETCH_USER_AGENT = "Tovu/0.1 (web_fetch_page; site assistant page reader)";
export interface WebFetchPorts extends Omit<JiniWebFetchPorts, "httpClient" | "userAgent"> {
  httpClient: HttpClientPort;
}

/**
 * Adapt the guarded host port; Jini owns the fetch lifecycle and model-facing projection.
 * The guard still owns DNS, pinned peers and redirect checks: this adapter never makes raw HTTP.
 * @returns The existing page result; caller-safe errors propagate from the shared reader.
 * @complexity O(1) adapter work, plus the shared reader's response parsing.
 */
export function fetchWebPage(
  { input, ports, rateLimitScope }: { input: WebFetchInput; ports: WebFetchPorts; rateLimitScope: string },
  optional: Parameters<typeof fetchJiniWebPage>[1] = {},
): Promise<WebFetchResult> {
  return fetchJiniWebPage({
    input, rateLimitScope,
    ports: {
      ...ports,
      userAgent: WEB_FETCH_USER_AGENT,
      httpClient: { send: ({ request }) => ports.httpClient.send(request) },
    },
  }, optional);
}
