# MCP-UI Sandbox Origin Verdict — 2026-09-05

Reviewing commit `d3834ec2` ("fix(admin): stop granting MCP-UI surfaces this admin origin's authority")
Settles two claims left open by a prior (Gemini) audit of the `data:`-URL sandbox change.

**Method: static source analysis only — no browser was needed.** Both claims were settled by tracing
the actual executed code: the real `@mcp-ui/client@7.1.1` bundle Vite pre-built (`apps/admin/node_modules/.vite/deps/@mcp-ui_client.js`,
596KB / 13,420 lines — the npm package folders are empty, but this pre-bundle is the real browser-executed
JS and IS inspectable), plus Jini's own `sandbox-proxy.ts` source and its built `dist/` twin (byte-identical
except for TS→JS transpilation — confirmed no staleness), plus Tovu's `AssistantDock.tsx`/`.hooks.tsx`.

## Verdicts

| Claim | Verdict |
|---|---|
| 1. Self-navigation bypass | **REFUTED** |
| 2. postMessage handshake origin mismatch | **REFUTED** (with one LOW-severity residual noted) |

---

## Claim 1 — Self-navigation bypass

**Claim:** the guest can navigate the iframe away from the `data:` URL to a same-origin location and
thereby regain the admin origin.

**Verdict: REFUTED.** Mechanically, self-navigation to a real same-origin URL *does* work and *does*
produce a real (non-opaque) origin for the destination document — but tracing the exact handoff
sequence shows the attacker gains nothing from it: the one sensitive send (the untrusted HTML itself)
has already completed before attacker code exists to redirect it, and nothing resends it afterward.

### Evidence

1. **Self-navigation is mechanically unblocked, and would produce a real origin.** The iframe's sandbox
   is `sandbox="allow-scripts allow-same-origin allow-forms"` — no `allow-top-navigation`/`allow-popups`,
   but neither is needed to navigate *the frame's own location* (that's unrestricted browsing, not
   "escaping" the frame). Confirmed hardcoded, no override prop, at
   `apps/admin/node_modules/.vite/deps/@mcp-ui_client.js:13110`:
   `n.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms")`.
   Per the URL Standard, a `data:` URL is *unconditionally* opaque-origin regardless of `allow-same-origin`
   (Jini's own doc, `/Users/la/Programming/Jini/packages/ui/src/features/mcp-ui/sandbox-proxy.ts:174-183`,
   states this was verified live against a real Chromium build 2026-09-03). But `allow-same-origin` is
   *not* a no-op for whatever the frame navigates to *next*: if the guest runs
   `window.location.href = 'https://<admin-origin>/mcp-ui/sandbox-proxy.html'` (the OLD route,
   `apps/website/src/assistant/mcp-ui-sandbox-proxy-route.ts`, confirmed **still mounted**, `frame-ancestors 'self'`
   so it doesn't refuse to be framed), the destination is a normal `https:` URL, so the resulting document
   *does* get the real admin origin. This part of the claim's premise is TRUE.

2. **But the one sensitive handoff already happened before attacker code exists.** The exact sequence,
   traced from `apps/admin/node_modules/.vite/deps/@mcp-ui_client.js:13108-13219` (`Jv()` + the `Wv`
   AppFrame component):
   - `Jv()` creates the iframe, sets `src` to the `data:` URL, and waits via a **one-shot** `window`
     message listener (`13111-13127`) for the *first* raw `{method:"ui/notifications/sandbox-proxy-ready"}`
     message from `n.contentWindow`. On match it resolves the promise and **removes itself**
     (`window.removeEventListener("message", s)`, line `13114`, invoked via `u()` inside the resolver).
   - This first ready message comes from Jini's own **pristine, un-navigated** shell script
     (`buildIsolatedSandboxProxyHtml`, baked into the `data:` URL by `buildSandboxProxyDataUrl` /
     `buildAssistantMcpUiSandboxProxyUrl`) — not from any attacker content, because no attacker HTML has
     been written into the document yet.
   - Only *after* that promise resolves does the host call `a.connect(new Nv(Y.contentWindow, Y.contentWindow))`
     (`13193-13195`), and only after `connect()` resolves does a **separate** effect (`13206-13219`, gated
     on `[c, i, a, n.csp]`) call `a.sendSandboxResourceReady({html: i, csp})` — this is the call that hands
     the untrusted MCP-server HTML to whatever is currently in the frame. At the moment this fires, the
     frame still holds the pristine shell (nothing has run any attacker JS yet — the attacker's JS *is*
     the payload this call is about to deliver).
   - The shell's own raw listener (`Jini/packages/ui/src/features/mcp-ui/sandbox-proxy.ts:219-236`, byte-identical
     in `dist/features/mcp-ui/sandbox-proxy.js:219-236`) receives it, does `document.open(); document.write(html); document.close();`
     — **this is the first moment attacker code starts running**, and it is still inside the untouched `data:` document.
   - Only from this point on does attacker JS exist and have the ability to call `window.location.href = ...`.
     By definition, it is too late to redirect a delivery that has already completed.

3. **Nothing resends the sensitive HTML after a self-navigation, for two independent, stacked reasons —
   either one alone is sufficient:**
   - **The one-shot listener is gone.** Already established in point 2 — it fires once, deregisters, done.
     A second `sandbox-proxy-ready` announcement from a re-navigated frame has no listener left to catch it
     via this path.
   - **The persistent protocol listener would drop it anyway.** The ongoing MCP-UI protocol connection uses
     a *different* listener, `Nv`'s `messageListener` (`@mcp-ui_client.js:12934-12942`), which filters by
     `event.source === this.eventSource` (unaffected by navigation — the frame's `window` reference is
     stable across a same-frame navigation) and then requires the message to parse as a valid JSON-RPC
     message via `JSONRPCMessageSchema.safeParse(a.data)`. That schema's every branch requires a literal
     `jsonrpc: "2.0"` field (`@mcp-ui_client.js:4498,4504,4509,4526`, `jsonrpc: literal(JSONRPC_VERSION)`,
     `JSONRPC_VERSION = "2.0"` at `4426`). The raw ready notification Jini's shell sends is
     `{method: "ui/notifications/sandbox-proxy-ready", params: {}}` — **no `jsonrpc` field** (see the
     literal script text at `sandbox-proxy.ts:235`/`sandbox-proxy.js:235`) — so it fails every union
     branch and is silently ignored (`@mcp-ui_client.js:12941`, the `"Ignoring non-JSON-RPC message"` branch).
   - **Even setting both of those aside**, the React effect that calls `sendSandboxResourceReady` (`13206-13219`)
     only re-fires when its dependency array `[c, i, a, n.csp]` changes. `c` (readyForHtml) is set `true`
     exactly once per mount, inside the connect flow at `13196` (`p(true)`), and nothing in the traced code
     resets it to `false` and back to re-trigger the effect from a guest-side event. A second ready signal,
     even if it were parsed, has no wired path back to `p(true)`.

4. **Even in the best case for an attacker, the destination holds nothing sensitive.** The old
   `/mcp-ui/sandbox-proxy.html` route is documented and confirmed as "a static, content-free shell: it
   holds no data, reads no request state" (`apps/website/src/assistant/mcp-ui-sandbox-proxy-route.ts:43-46`).
   Reaching it with the real admin origin buys the attacker a page with nothing to steal and no mechanism
   left (per point 3) to have anything handed to it.

**What was NOT separately investigated:** whether some OTHER admin-origin URL (not this proxy route)
could be navigated to and would itself do something dangerous purely from an authenticated GET (e.g. an
open redirect, a GET-based state change, or reflected content). That is a general web-security question
about the admin app's broader URL surface, independent of this commit, and out of scope for "does this
sandbox change leak admin authority to third-party MCP content."

---

## Claim 2 — postMessage handshake origin mismatch

**Claim:** does either side of the host↔guest postMessage handshake use a permissive target origin
(`"*"`) or a spoofable origin check, undoing the isolation the `data:` URL is meant to provide?

**Verdict: REFUTED** for the security-critical handoff, **with one LOW-severity vendor-library
observation** noted for completeness (not independently exploitable today).

### Evidence

1. **`@mcp-ui/client`'s generic transport (`Nv`) does send with wildcard `"*"`, confirmed:**
   `apps/admin/node_modules/.vite/deps/@mcp-ui_client.js:12948`:
   `this.eventTarget.postMessage(i, "*")`. This is used for the ongoing MCP-UI JSON-RPC protocol in
   both directions (tool input/result, size-changed, host-context, `ui/initialize`, etc.) — this part of
   the claim's premise (a permissive target origin exists in the codebase) is TRUE.

2. **`Nv`'s own receive-side check is source-identity only, not origin, confirmed:**
   `@mcp-ui_client.js:12934-12939` — `messageListener` checks only `a.source !== this.eventSource`
   (skipped entirely if no `eventSource` was given). It never inspects `event.origin`. Also TRUE as stated.

3. **But the actual trust boundary — deciding whether to `document.write` untrusted HTML with the
   admin's authority — is NOT gated by `Nv` at all.** It is a separate, hand-written, minimal listener
   embedded directly in the served/`data:`-URL page itself (Jini's `sandbox-proxy.ts`, not `@mcp-ui/client`),
   which performs its own independent, two-part check before ever acting:
   `Jini/packages/ui/src/features/mcp-ui/sandbox-proxy.ts:219-223` (identical in built `dist/features/mcp-ui/sandbox-proxy.js:219-221`
   and in the deployed literal-`hostOrigin` variant used for the `data:` URL):
   ```js
   function isFromHost(event) {
     return event.source === host && event.origin === hostOrigin;
   }
   ```
   `event.origin` here is a browser-computed field reflecting the **actual** origin of the sender's
   window — it is set by the browser and **cannot be forged or influenced by the sender's choice of
   `targetOrigin` argument**. `@mcp-ui/client`'s permissive `"*"` on the *send* side only controls who
   the browser is willing to *deliver* to; it has no effect on what origin the *receiver* observes the
   message as having come from. So even though the host library sends with `"*"`, Jini's own
   `isFromHost` check on the receiving (guest) side correctly and unspoofably verifies the message
   really came from the real admin origin.

4. **`hostOrigin` is sourced correctly, confirmed end-to-end:**
   `apps/admin/src/components/AssistantDock/AssistantDock.tsx:137`:
   `buildAssistantMcpUiSandboxProxyUrl(globalThis.location.origin)` → `AssistantDock.hooks.tsx:1256-1257`
   forwards it verbatim to `buildSandboxProxyDataUrl` (`@jini-ai/ui`) → baked into the `data:` URL as a
   JSON-stringified literal (`sandbox-proxy.ts:196,216-218`), never read back from the document's own
   URL/query/fragment (which an attacker who controls the guest's HTML cannot influence, since it's
   computed by the embedder before the guest ever runs).

5. **Timing closes the remaining gap.** As established in Claim 1's evidence (point 2), the ONE message
   this `isFromHost`-gated listener ever acts on (`sandbox-resource-ready`, carrying the untrusted HTML)
   is sent by the host exactly once, while the frame still holds the pristine, un-navigated shell — so
   there is no window in which `Nv`'s wildcard-target sends could be mis-delivered to some other,
   wrong-origin document and still pass Jini's own origin check (a wrong-origin document's `document.write`
   listener isn't even present — only Jini's own served shell has this exact code).

### Residual, LOW severity, not part of either claim
`@mcp-ui/client`'s own `Nv` transport (point 2 above) relies solely on `source`-identity for its OWN
receive-side authentication, never `event.origin`, for the *ongoing* JSON-RPC channel (tool input/result,
host context, etc.) after the initial handoff. This is not independently exploitable in Tovu's current
setup: `source` is a browser-enforced, unforgeable reference to one specific iframe's `contentWindow`,
and the host only ever talks to the one frame it created — no other window can present itself as that
`source`. It is a defense-in-depth gap in the **vendor library itself**, worth remembering if a future
`@mcp-ui/client` upgrade changes how `eventTarget`/`eventSource` are scoped (e.g. any change that shares
one listener across multiple iframes) — not a finding that requires action today.

---

## Summary for Leona

Both of Gemini's open claims are **REFUTED** by direct code tracing, not by intuition:
- **Self-navigation bypass**: mechanically possible to reach a real-origin document, but the one
  sensitive handoff (delivering the untrusted HTML) has always already completed before attacker code
  exists to redirect it, and no code path resends it afterward (verified three independent ways: the
  one-shot listener is torn down, the raw ready-notification fails the persistent listener's required
  `jsonrpc:"2.0"` schema check, and the React effect that would resend is gated on state that never
  flips again).
- **postMessage handshake origin mismatch**: `@mcp-ui/client`'s own transport genuinely does use a
  permissive `"*"` target-origin and a source-only receive check — but the actual trust decision (whether
  to execute untrusted HTML with real origin) is made by Jini's own separate script, which performs a
  correct, browser-enforced, unspoofable `event.origin === hostOrigin` check that the wildcard sends
  cannot undermine.

No browser session was needed — this repo's `apps/admin/node_modules/.vite/deps/@mcp-ui_client.js` Vite
pre-bundle made the vendor library's actual executed code fully inspectable, and Tovu's `node_modules/@jini-ai/*`
symlink into the Jini checkout made the other side directly readable and confirmed non-stale (`dist/` byte-matches `src/`).

**Nothing for Leona to click.** This was fully resolved via static reading; no live reproduction step is needed.
