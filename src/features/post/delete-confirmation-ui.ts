import {
  createUIResource,
  escapeHtml,
  escapeJsString,
  type UIResource,
  type UIResourceUri,
} from "../../assistant/mcp-ui";

/**
 * @file The Posts/Pages half of the MCP-UI confirmation gate: the actual interactive dialog
 * `content_post_delete` returns on its first call.
 *
 * Split out of `tool-registrations.ts` because it is a genuinely different job — this file writes
 * HTML and the protocol message an iframe posts back, that file wires handlers to domain functions
 * — and because keeping the HTML isolated makes the one security-critical property easy to check by
 * eye: **the confirmation token is interpolated into this file's output and nowhere else.**
 *
 * ## The protocol shape, end to end
 *
 * 1. Agent calls `content_post_delete { id, kind }`. The handler resolves the row, mints a pending
 *    confirmation bound to (tool, workspace, principal, entity, entity VERSION), and returns
 *    `{ content: [ textBlock, uiResource ] }` — an MCP-UI `EmbeddedResource` with a `ui://` URI and
 *    the `text/html;profile=mcp-app` MIME type. NOTHING IS DELETED. The text block tells the model
 *    a dialog is open and that it cannot proceed on its own; the token appears only in the HTML.
 * 2. The host renders that HTML in a sandboxed iframe for the HUMAN. Per MCP Apps' security model
 *    the HTML is not fed to the model, which is what keeps the token out of the agent's reach.
 * 3. The human clicks. The iframe posts a real mcp-ui `UIActionResult` of type `"tool"` —
 *    `{ type: "tool", messageId, payload: { toolName: "content_post_delete", params: { id, kind,
 *    confirmationToken, decision } } }` — to `window.parent`.
 * 4. The host's `onUIAction` turns that into a second `content_post_delete` call. Because the
 *    action carries a `messageId`, mcp-ui's client answers the iframe with `ui-message-received`
 *    and then `ui-message-response`; this dialog listens for both so the human sees the outcome
 *    rather than a dialog that appears to do nothing.
 * 5. The handler redeems the token (single-use, TTL-bounded, binding-checked, version-checked) and
 *    only then calls `deletePost` through the command gateway.
 *
 * A `decision: "cancel"` click redeems the token too — burning it — and returns without deleting,
 * so "cancel" genuinely closes the window rather than leaving a live token behind.
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

/** The tool id the dialog asks the host to call back. Single source of truth for both halves. */
export const CONTENT_POST_DELETE_TOOL_ID = "content_post_delete";

/**
 * Builds the `ui://` URI for one confirmation instance.
 *
 * Keyed by entity id and version, NOT by the token: a URI is an identifier a host may log, cache,
 * or show in a devtools pane, so putting the secret in it would defeat the whole arrangement.
 */
export function deleteConfirmationUri(subject: DeleteConfirmationSubject): UIResourceUri {
  return `ui://tovu/content-post-delete/${subject.id}/${subject.version}`;
}

/**
 * Renders the confirmation dialog as a self-contained MCP-UI resource.
 *
 * @param spec.subject - The row the human is being asked about. Every field is shown, because a
 * dialog that says "delete this?" without naming what "this" is provides no real consent.
 * @param spec.confirmationToken - The single-use secret. **This is the only place it may go.** It
 * is interpolated into the inline script, which the host renders for the human and does not feed
 * to the model.
 * @returns The `EmbeddedResource` to place in the tool result's `content` array.
 * @complexity O(n) in the rendered field lengths.
 * @overallScore 100
 */
export function buildDeleteConfirmationResource(spec: {
  subject: DeleteConfirmationSubject;
  confirmationToken: string;
}): UIResource {
  const { subject, confirmationToken } = spec;
  const noun = subject.kind === "page" ? "page" : "post";
  const publishedWarning =
    subject.status === "published"
      ? `<p class="warn">This ${escapeHtml(noun)} is currently <strong>published</strong>. Deleting it removes it from the public site immediately.</p>`
      : "";

  // Self-contained by necessity: a sandboxed iframe has no bundler, no network, and no shared
  // stylesheet. Everything the dialog needs is inline.
  const htmlString = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Confirm deletion</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 16px; font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { margin: 0 0 4px; font-size: 16px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 12px 0; }
  dt { font-weight: 600; opacity: 0.7; }
  dd { margin: 0; overflow-wrap: anywhere; }
  .warn { padding: 8px 10px; border-radius: 6px; background: rgba(200, 60, 40, 0.12); }
  .note { opacity: 0.75; }
  .actions { display: flex; gap: 8px; margin-top: 16px; }
  button { font: inherit; padding: 7px 14px; border-radius: 6px; border: 1px solid currentColor; background: transparent; cursor: pointer; }
  button.danger { border-color: transparent; background: #c1392b; color: #fff; }
  button[disabled] { opacity: 0.5; cursor: default; }
  #outcome { margin-top: 12px; min-height: 1.5em; }
</style>
</head>
<body>
  <h1>Delete this ${escapeHtml(noun)}?</h1>
  <dl>
    <dt>Title</dt><dd>${escapeHtml(subject.title)}</dd>
    <dt>Slug</dt><dd>/${escapeHtml(subject.slug)}</dd>
    <dt>Kind</dt><dd>${escapeHtml(subject.kind)}</dd>
    <dt>Status</dt><dd>${escapeHtml(subject.status)}</dd>
    <dt>ID</dt><dd>${escapeHtml(subject.id)}</dd>
  </dl>
  ${publishedWarning}
  <p class="note">This is a soft delete: the ${escapeHtml(noun)} is moved to the trash and hidden everywhere, but it is retained and can be restored by reverting the resulting change set.</p>
  <div class="actions">
    <button type="button" id="confirm" class="danger">Delete ${escapeHtml(noun)}</button>
    <button type="button" id="cancel">Cancel</button>
  </div>
  <p id="outcome" role="status" aria-live="polite"></p>
<script>
(function () {
  var TOKEN = ${escapeJsString(confirmationToken)};
  var TOOL = ${escapeJsString(CONTENT_POST_DELETE_TOOL_ID)};
  var ID = ${escapeJsString(subject.id)};
  var KIND = ${escapeJsString(subject.kind)};
  var outcome = document.getElementById("outcome");
  var buttons = [document.getElementById("confirm"), document.getElementById("cancel")];
  var pendingMessageId = null;

  function send(decision) {
    buttons.forEach(function (b) { b.disabled = true; });
    outcome.textContent = decision === "confirm" ? "Deleting…" : "Cancelling…";
    // A real mcp-ui UIActionResult of type "tool" — the host's onUIAction turns this into the
    // second content_post_delete call. messageId is what makes the host answer with
    // ui-message-received / ui-message-response so this dialog can report the outcome.
    pendingMessageId = "content-post-delete-" + ID + "-" + decision;
    window.parent.postMessage({
      type: "tool",
      messageId: pendingMessageId,
      payload: {
        toolName: TOOL,
        params: { id: ID, kind: KIND, confirmationToken: TOKEN, decision: decision }
      }
    }, "*");
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    if (!data || typeof data !== "object") return;
    if (data.messageId && data.messageId !== pendingMessageId) return;
    if (data.type === "ui-message-received") {
      outcome.textContent = "Sent — waiting for the server…";
      return;
    }
    if (data.type === "ui-message-response") {
      outcome.textContent = data.payload && data.payload.error
        ? "Failed: " + String(data.payload.error)
        : "Done.";
    }
  });

  document.getElementById("confirm").addEventListener("click", function () { send("confirm"); });
  document.getElementById("cancel").addEventListener("click", function () { send("cancel"); });
}());
</script>
</body>
</html>`;

  return createUIResource({
    uri: deleteConfirmationUri(subject),
    htmlString,
    // mcp-ui's own resource metadata namespace (`UI_METADATA_PREFIX` + `preferred-frame-size`),
    // so a host that honors it sizes the dialog instead of guessing.
    meta: { "mcpui.dev/ui-preferred-frame-size": ["420px", "440px"] },
  });
}
