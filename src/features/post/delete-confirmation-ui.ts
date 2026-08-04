import { buildConfirmationSurface, type UIResource, type UIResourceUri } from "@jini-ai/ui/mcp-ui/surfaces";

import { SURFACE_EXCHANGE_ID_PARAM } from "../../assistant/surface-exchanges";

/**
 * @file The Posts/Pages half of the MCP-UI confirmation gate: the dialog `content_post_delete`
 * raises on its (single, held-open) call.
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
 * ## 2026-08-04: the confirmation token is gone (ADR-055 Decision 2/3)
 *
 * This dialog used to carry a single-use secret (`assistant/pending-confirmations.ts`) that only the
 * rendered HTML held, because the delete used to be a SECOND tool call the model could otherwise
 * make itself, and the secret was what stood between "the model asks" and "the model completes it."
 *
 * `content_post_delete` now holds its call open (`assistant/surface-exchanges.ts`) instead of
 * returning and waiting for a second call. There is no second call to guard: the model's one call to
 * this tool parks, and the ONLY way to make it resolve is a browser POST to
 * `mcp-ui-tool-calls-route.ts`'s exchange-delivery path — a channel the model has no access to
 * (that route sits behind the daemon's bearer gate plus the admin-session check one hop upstream in
 * `server/modules/assistant.ts`, neither of which a model-issued tool call can satisfy). So this
 * surface now carries an **exchange id** instead of a token — a correlation handle, not a secret
 * (`surface-exchanges.ts`'s own header explains why the distinction is deliberate). It is still
 * interpolated into this surface and **nowhere else** — never into the tool's `modelText`, its
 * `_meta`, or an error message — but that placement now protects correctness (a human's answer
 * reaching the right in-flight call), not secrecy: leaking an exchange id lets a caller *name* a
 * pending call, not act on it, since only the browser can deliver to it.
 *
 * `pending-confirmations.ts`'s TTL/staleness property (a row edited between the dialog rendering and
 * the click invalidates the confirmation) is NOT implied by this change and is not this module's
 * job — `tool-registrations.ts`'s handler re-checks the entity's version explicitly, right before
 * writing, now that there is no token binding to carry that check for it.
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
 * @param spec.exchangeId - The held-open call's correlation handle (`SurfaceExchange.id`). **This is
 * the only place it may go** — not because it is secret (it is not, see this file's header), but
 * because a copy anywhere else would misleadingly suggest a second, independent path back to the
 * call, and there is none.
 * @returns The `EmbeddedResource` the daemon splits out and renders for the human.
 * @complexity O(n) in the rendered field lengths.
 */
export function buildDeleteConfirmationResource(spec: {
  subject: DeleteConfirmationSubject;
  exchangeId: string;
}): UIResource {
  const { subject, exchangeId } = spec;
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
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "confirm" },
    },
    // A tool action, not a bare dismiss: cancelling posts back and resolves the parked call
    // immediately. A dialog that just closes would strand the agent's call open until the idle
    // deadline instead of reporting the human's actual answer.
    cancel: {
      label: "Cancel",
      toolName: CONTENT_POST_DELETE_TOOL_ID,
      params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, decision: "cancel" },
    },
    app: { appName: "tovu-content-post-delete", appVersion: "1" },
    preferredFrameSize: ["100%", "320px"],
  });
}
