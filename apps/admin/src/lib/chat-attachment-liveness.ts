import { createChatAttachmentValidator as createValidator } from "@jini-ai/chat/transports/http";
import type { ChatAttachmentValidatorOptions } from "@jini-ai/chat/transports/http";
export type { ChatAttachmentValidatorOptions } from "@jini-ai/chat/transports/http";
export const MAX_PROBED_ATTACHMENTS = 20;
/** Host read-back route and capability-reference grammar; Jini owns bounded probing. */
export function createChatAttachmentValidator(options: ChatAttachmentValidatorOptions = {}) {
 return createValidator({
  fetch: options.fetchImpl ?? globalThis.fetch.bind(globalThis),
  endpoint: ({ ref }) => `/api/attachments/${encodeURIComponent(ref)}`,
  isSupportedRef: ({ ref }) => /^attachment:[A-Za-z0-9-]+$/u.test(ref),
  maxProbedAttachments: MAX_PROBED_ATTACHMENTS,
 }, { concurrency: options.concurrency, timeoutMs: options.timeoutMs });
}
