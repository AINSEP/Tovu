import { createA2uiActionPoster as createPoster } from "@jini-ai/chat/transports/http";
import type { CreateA2uiActionPosterOptions } from "@jini-ai/chat/transports/http";
export type { CreateA2uiActionPosterOptions, A2uiActionDeliveryOutcome } from "@jini-ai/chat/transports/http";
/** Host route/cookie wiring; Jini owns exchange addressing and delivery outcomes. */
export function createA2uiActionPoster(baseUrl: string, options: CreateA2uiActionPosterOptions = {}) {
 return createPoster({ baseUrl, path: options.path ?? "/api/admin/v1/a2ui/actions", fetch: (url, init) => fetch(url, init),
  reportFailure: ({ args }) => console.error(...args),
 }, { timeoutMs: options.timeoutMs, headers: options.headers });
}
