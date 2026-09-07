import type { Express } from "express";

import { sniffContentType } from "#src/features/media/index";
import { readChatAttachmentForOwner } from "#src/features/media/read-chat-attachment";
import { getAuthedPrincipal } from "#src/server/inbound/admin-http/dev-auth";
import { parseRangeHeader } from "#src/server/inbound/admin-http/range";
import {
  DISALLOWED_INLINE_CONTENT_TYPES,
  sendMediaOriginalResponse,
} from "#src/server/inbound/admin-http/routes/media/original";

/**
 * @file `GET /api/attachments/:ref` — serves one staged chat attachment's bytes back to the
 * principal who uploaded it.
 *
 * WHY IT EXISTS. `@jini-ai/http-kit`'s attachment pack mounts only `POST`/`DELETE`, so bytes could
 * be staged and never read again. The admin's attachment preview modal could therefore only show
 * attachments from the current session, out of a client-side `File` cache; anything from an earlier
 * turn, or anything at all after a reload, had no URL to load from. This is that URL.
 *
 * WHERE THE WORK IS. Everything that decides whether these bytes may be served —
 * ownership, sidecar validation, path containment, and the file-identity gate — lives in
 * `features/media/read-chat-attachment.ts`, which states the authorization rule and the path-safety
 * argument in full. This file is the HTTP shell: session gate, one call, safe headers.
 *
 * NOT A PROXY, unlike every other route on this path. `POST`/`DELETE /api/attachments` forward to
 * the agent daemon because the live `AttachmentStore` lives in that process. This route does not,
 * for two reasons: the daemon's `AttachmentStore` port exposes no non-mutating owner-scoped read
 * (see the module doc linked above), and the principal this route authorizes against is minted in
 * THIS process by `requireAdminSession` — comparing it here means no trusted-header hop between
 * the check and the value it checks.
 *
 * AUTHENTICATION is the `app.use("/api/attachments", requireAdminSession(routeDeps))` mounted in
 * `composition/modules/assistant.ts`. Express's `app.use(path, ...)` matches that prefix AND every
 * subpath, so this route is covered by the same gate that covers the upload it reads back — no
 * second mount, which would be a second thing to keep in sync. `get-chat-attachment-route.test.ts`
 * asserts the unauthenticated 401 through a real request rather than assuming that.
 *
 * SECURITY — this route serves attacker-influenced bytes, so it reuses `routes/media/original.ts`'s
 * response writer verbatim rather than hand-rolling headers (the same reuse
 * `routes/site/media-rendition.ts` already makes of it):
 *  - `Content-Type` is ALWAYS `sniffContentType(bytes)`, computed from the bytes this response is
 *    about to send. The `kind` the store recorded at upload is never consulted for it — and could
 *    not be trusted for it anyway: `detectAttachmentKind` classifies a real AVIF as `'file'` today
 *    (`2026-09-06-tovu-f6-outstanding-worklist.md` §A.1), so the stored `kind` is known to be
 *    wrong for at least one real format while the sniffer used here handles it.
 *  - a sniffed `text/html`/`application/xhtml+xml`/`image/svg+xml` is forced to
 *    `application/octet-stream` + `Content-Disposition: attachment`. A chat composer accepts any
 *    file, so an uploaded `.html` or `.svg` is an ordinary occurrence, and either is a same-origin
 *    stored-XSS vector if a browser ever renders it inline.
 *  - `X-Content-Type-Options: nosniff` is always set, without which the defusal above is moot.
 *  - a restrictive `Content-Security-Policy` and `Cross-Origin-Resource-Policy` ride along, and
 *    `Cache-Control: private, no-store` keeps one principal's attachment out of any shared cache.
 *  - `Range` is honored, so a `<video>` attachment can seek instead of buffering the whole file.
 *
 * NO `Content-Disposition: filename`. The stored display name is available but is not put in a
 * header here: `sanitizeAttachmentName`'s allowlist has not been checked against what a
 * `Content-Disposition` value may safely contain, and a header built from an unverified allowlist
 * is exactly the kind of claim this repo's false-comment register exists to stop. A filename can be
 * added once that is checked.
 */

/** The single, deliberately non-disclosing refusal. Every distinct reason
 *  `readChatAttachmentForOwner` can refuse for — unknown ref, malformed ref, another principal's
 *  attachment, a file that changed since upload — produces this exact response, so a caller cannot
 *  probe for which one applies. Mirrors `AttachmentStore.resolveForRun`'s own non-disclosure
 *  contract. The ref is deliberately not echoed back: it is caller-controlled, and there is nothing
 *  to confirm about it. */
const ATTACHMENT_NOT_FOUND_BODY = { error: "attachment was not found", code: "NOT_FOUND" } as const;

export function registerAdminChatAttachmentReadRoute(
  app: Express,
  deps: { readonly uploadDirectory: string }
): void {
  app.get("/api/attachments/:ref", async (req, res) => {
    try {
      const result = await readChatAttachmentForOwner(deps, {
        ref: String(req.params.ref),
        ownerId: getAuthedPrincipal(res).id,
      });
      if (!result.ok) {
        res.status(404).set("Cache-Control", "private, no-store").json(ATTACHMENT_NOT_FOUND_BODY);
        return;
      }

      const sniffed = sniffContentType(result.bytes);
      const forceDownload = DISALLOWED_INLINE_CONTENT_TYPES.has(sniffed);
      sendMediaOriginalResponse(res, result.bytes, parseRangeHeader({ header: req.get("range"), totalLength: result.bytes.byteLength }), {
        safe: forceDownload ? "application/octet-stream" : sniffed,
        forceDownload,
      });
    } catch {
      // `readChatAttachmentForOwner` classifies every expected failure as a refusal rather than
      // throwing, so anything reaching here is genuinely unexpected (a filesystem fault between the
      // identity check and the read, say). Reported without detail — a store failure can carry
      // filesystem paths a caller must not see, the same SEC-005 redaction `attachments.ts` applies.
      res.status(500).json({ error: "internal error" });
    }
  });
}
