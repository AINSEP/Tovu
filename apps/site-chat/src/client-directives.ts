/**
 * SPEC-046 REQ-4/REQ-6: Jini owns the shared page-action protocol and its trust boundaries.
 * This standalone app cannot import the server tree. The server still resolves every path;
 * browser parsing drops unknown ui_surface payloads and the host separately authorizes URLs.
 * Queued actions remain unknown until narrowed; no path is constructed from a slug or title.
 */
export { extractPageActions, splitPageActions, isPageActionDirective, isQueuedPageAction } from '@jini-ai/chat/browser/page-actions';
export type { PageAction, NavigateAction, NonNavigateAction, SplitPageActions, ResolvedPageTarget as ResolvedPublicTarget } from '@jini-ai/chat/browser/page-actions';
