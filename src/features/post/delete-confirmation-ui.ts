import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

/**
 * @file The Posts/Pages half of the MCP-UI confirmation gate: the dialog `content_post_delete`
 * raises on its first call.
 *
 * ## 2026-08-03: this file no longer writes HTML
 *
 * It used to render the whole document by hand — markup, styles, and an inline script that spoke an
 * ad-hoc `postMessage` dialect of its own invention. Two problems, both fatal:
 *
 * 1. **Wrong protocol.** `@jini-ai/ui`'s `useMcpUiHost` runs a real MCP-UI JSON-RPC handshake
 *    (`ui/initialize`, then `tools/call`). The hand-written dialog posted a bare
 *    `{type:'tool', messageId, payload}` object, which no compliant Host answers. The dialog
 *    rendered and its buttons did nothing.
 * 2. **Duplicated a solved problem.** `@jini-ai/ui/mcp-ui/surfaces`'s `buildConfirmationSurface` was
 *    generalized *from this very file*, and carries the parts that are easy to get quietly wrong:
 *    the handshake, `</script`-safe interpolation, focus handling, and status text that reports the
 *    real outcome instead of leaving a spinner up.
 *
 * So this module is now an adapter: it decides what a Posts/Pages deletion should *say*, and Jini
 * owns how a confirmation dialog *behaves*. Anything reusable belongs upstream in
 * `@jini-ai/ui`, not here.
 *
 * ## The security property, restated because it is easy to erode
 *
 * The confirmation token is interpolated into this surface and **nowhere else** — never into the
 * tool's `modelText`, its `_meta`, or an error message. Two independent mechanisms keep it from the
 * model, and both matter:
 *
 * - `@jini-ai/daemon`'s `delegated-tool-bridge.ts` splits UI blocks out of the tool result and emits
 *   them as `mcp-ui` run events, so the resource never reaches the value the model reads.
 * - Per MCP Apps' model, a Host renders the HTML for the human and does not feed it to the model.
 *
 * Before the first of those existed, this file's own doc claimed the second was sufficient. It was
 * not: `@jini-ai/mcp`'s `okResult()` JSON.stringifies a tool result into one text block, so the
 * token arrived as ordinary model-visible context and the model could approve its own deletion.
 * **Do not reintroduce a path that puts the token in the return value.**
 */

/** What the dialog needs to describe the row truthfully. */
export interface DeleteConfirmationSubject {
  id: string;
  kind: "post" | "page";
  title: string;
  slug: string;
  status: "draft" | "published";
  version: number;
}

/** The tool id the dialog asks the Host to call back. Single source of truth for both halves. */
export const CONTENT_POST_DELETE_TOOL_ID = "content_post_delete";

/**
 * Builds the `ui://` URI for one confirmation instance.
 *
 * Keyed by entity id and version, NOT by the token: a URI is an identifier a host may log, cache, or
 * show in a devtools pane, so putting the secret in it would defeat the whole arrangement. Keying by
 * version also means a row edited since the dialog opened yields a different URI, so the stale
 * dialog is never silently treated as the current one.
 */
export function deleteConfirmationUri(subject: DeleteConfirmationSubject): UIResourceUri {
  return `ui://tovu/content-post-delete/${subject.id}/${subject.version}` as UIResourceUri;
}

/**
 * Renders the confirmation dialog as a self-contained MCP-UI resource.
 *
 * @param spec.subject - The row the human is being asked about. Every field is shown, because a
 * dialog that says "delete this?" without naming what "this" is provides no real consent.
 * @param spec.confirmationToken - The single-use secret. **This is the only place it may go.**
 * @returns The `EmbeddedResource` the daemon splits out and renders for the human.
 * @complexity O(n) in the rendered field lengths.
 */
export function buildDeleteConfirmationResource(spec: {
  subject: DeleteConfirmationSubject;
  confirmationToken: string;
}): UIResource {
  const { subject, confirmationToken } = spec;
  const noun = subject.kind === "page" ? "page" : "post";

  return buildConfirmationSurface({
    uri: deleteConfirmationUri(subject),
    title: `Delete this ${noun}?`,
    description: `The ${noun} will be moved to the trash.`,
    details: [
      { label: "Title", value: subject.title },
      { label: "Slug", value: subject.slug },
      { label: "Status", value: subject.status },
    ],
    // Surfaced only when it is actually true — a warning shown unconditionally is one people learn
    // to click past, which is worse than no warning at all.
    ...(subject.status === "published"
      ? { warning: `This ${noun} is currently published. Deleting it removes it from the public site immediately.` }
      : {}),
    danger: true,
    confirm: {
      label: `Delete ${noun}`,
      toolName: CONTENT_POST_DELETE_TOOL_ID,
      params: { id: subject.id, kind: subject.kind, confirmationToken, decision: "confirm" },
    },
    // A tool action, not a bare dismiss: cancelling REDEEMS the token too, burning it server-side.
    // A dialog that just closes leaves a live token behind for its whole TTL, so "cancel" would
    // weaken the gate rather than close it.
    cancel: {
      label: "Cancel",
      toolName: CONTENT_POST_DELETE_TOOL_ID,
      params: { id: subject.id, kind: subject.kind, confirmationToken, decision: "cancel" },
    },
    app: { appName: "tovu-content-post-delete", appVersion: "1" },
    preferredFrameSize: ["100%", "320px"],
  });
}
