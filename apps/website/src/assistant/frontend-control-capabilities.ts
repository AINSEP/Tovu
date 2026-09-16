/**
 * @file The capability manifest handed to `agent-daemon-server.ts`'s `createFrontendControl` —
 * split out from that file (rather than inlined at the call site) because it is pure data with no
 * side effects, unlike the rest of that module, which binds a real server and real DB connections
 * on import. Keeping it here lets a unit test assert the filter below without paying for any of
 * that.
 *
 * `PAGE_CAPABILITIES` (`@jini-ai/agentic`) is the existing, already-wired `page.*` verb set.
 * `CHAT_CAPABILITIES` (`@jini-ai/chat/core`) is the seven `chat.*` verbs a chat pane supports —
 * concatenated in here for the first time, filtered as below.
 *
 * ## Why `chat.reset_conversation` is excluded, and why the filter is on the PROPERTY
 *
 * There is no human-confirmation transport wired in this host. `createToolExecutor` is built with
 * NO `ExecutionDelegate` (`agent-daemon-server.ts`), so a capability with `requiresConfirmation:
 * true` parks its execution on a promise only `resumeConfirmation` can settle — and nothing calls
 * it. The park is unbounded, not merely slow: `descriptor.timeoutMs`'s timer is armed only AFTER
 * the confirmation await resolves, so a parked confirming call would hang forever rather than time
 * out. `src/assistant/pending-confirmations.ts`'s own module doc records the identical reasoning
 * for why a bare `requiresConfirmation` boolean is "not a weaker version of this mechanism; it is a
 * hang." Jini's own build-time guard for the equivalent CMS-tool case
 * (`ACTOR_CLASS_RULES_REQUIRING_CONFIRMATION_TRANSPORT`, `@jini-ai/cms`'s `registration-kit.ts`)
 * throws rather than let a confirmation-requiring tool be wired at all, for the same reason.
 *
 * Of `CHAT_CAPABILITIES`'s seven verbs, exactly one — `chat.reset_conversation` — declares
 * `requiresConfirmation: true`. The filter below excludes it by that property, deliberately NOT by
 * id (`c.id !== 'chat.reset_conversation'`): an id-based exclusion only ever knows about the
 * confirming verb that exists today. The moment anyone adds a new `requiresConfirmation: true`
 * capability to this manifest, an id-based filter has no way to know about it and it sails through
 * unfiltered, parking unbounded exactly like `chat.reset_conversation` would have — with nothing in
 * a future diff to flag it. Filtering on `requiresConfirmation` instead is self-maintaining: any
 * confirming capability, present or future, stays excluded automatically until a real confirmation
 * transport exists. This is a deferral of that one verb, not a judgement that confirmation is
 * unnecessary — see the module docs above for why it cannot be safely wired today.
 *
 * ## A risk to know about even for the six verbs that ARE wired
 *
 * `chat.send_message` lets the agent inject a message into the chat pane as if the user had typed
 * it and pressed send — the agent prompting itself, not a human. Not destructive and not blocking
 * this change, but worth naming here since it's the kind of thing the next reader of this file
 * needs to already know rather than rediscover.
 *
 * ## `admin.capture_screenshot` — Tovu-owned, not from either Jini vocabulary
 *
 * Added 2026-08-30 so the assistant can see the admin's OWN rendered pixels rather than only DOM
 * structure (`page.find_elements`) — the gap that forced an operator to screenshot-and-paste by
 * hand. It is not part of `PAGE_CAPABILITIES` or `CHAT_CAPABILITIES` because it is not generic chat/
 * page vocabulary; it belongs to Tovu the way `TOVU_FRONTEND_CAPABILITIES` below is scoped.
 *
 * The browser side (`apps/admin/src/App.hooks.tsx`'s `useAgentPageBridge`) claims it through
 * `createFrontendSessionBridge`'s `executors` map, keyed by the `"admin."` prefix — the SAME
 * extension point this file's header describes `chat.*`/`page.*` using, just exercised for the
 * first time by a Tovu-native verb instead of a Jini one. `apps/admin/src/lib/agent-screenshot.ts`
 * is the executor; its own module doc has the capture design (in-page `html2canvas-pro` rasterization,
 * chosen over a native OS screen-share permission prompt or a server-side headless-Chromium
 * re-render — see that file for why) and the full list of what it cannot see.
 *
 * `risk: 'read'` and `surface: 'session'`: it changes nothing and is meaningless with no live admin
 * tab bound to the run, exactly like `page.find_elements`. It carries no `requiresConfirmation` — it
 * would be filtered out below if it did, same as every other capability in this file.
 *
 * ## `admin.show_site_page` — puts the live published site on the operator's screen
 *
 * Added 2026-09-15 (`ADS-memory/.local-artifacts/handoffs/2026-09-15-view-site-tool-PLAN.md`) so the
 * assistant can say "and here's the published page" as a real, on-screen step — e.g. right after
 * publishing a post — instead of only reporting that it did something. Mounts a same-origin
 * `<iframe>` overlay INSIDE the admin SPA (`apps/admin/src/components/SitePreviewOverlay/`), the same
 * mechanism `PostEditor.tsx`'s own live preview already uses. Deliberately NOT a drive of the desktop
 * shell's "View site" toggle: that toggle navigates the `<webview>` guest the assistant's own dock
 * lives inside, which would unmount the dock, close this very frontend session, and end the run
 * mid-sentence with no reattach (see the plan's §Q6 for the full trace). The overlay never navigates
 * the admin document, so the dock and the run both survive it being open.
 *
 * `risk: 'write'`, not `'read'`, unlike `admin.capture_screenshot` above: this capability puts
 * something new on the operator's screen, which is an observable effect outside the answer — the
 * same stricter reading `apps/desktop/src/sites-mcp-tools.ts` applies to `revealSiteFolder`.
 *
 * The security-critical work — refusing a path under `/api/` or `/admin` so this authenticated,
 * cookie-carrying iframe cannot be pointed at the admin's own API or UI — lives entirely on the
 * browser side, in `apps/admin/src/lib/site-preview-path.ts`, which `App.hooks.tsx`'s executor
 * branch calls before ever building the iframe `src`. This capability only accepts a `path` string;
 * it has no way to express an origin, a host, or a protocol, so there is no allowlist for this layer
 * to get wrong (mirrors `fetch_published_page`'s own "it accepts a path, not a URL" framing).
 */
import { PAGE_CAPABILITIES, type CapabilityDef } from "@jini-ai/agentic";
import { CHAT_CAPABILITIES } from "@jini-ai/chat/core";

/** Must equal the `id` `apps/admin/src/App.hooks.tsx`'s `buildAdminCapabilityExecutors` dispatches
 *  on for this capability — duplicated there rather than imported for the same cross-boundary-string
 *  reason `ADMIN_CAPTURE_SCREENSHOT_CAPABILITY_ID` documents (apps/admin and apps/website are
 *  separate builds with no shared-types package for this). */
export const ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID = "admin.show_site_page";

/**
 * Tovu-native capabilities that reach the admin's own browser tab through the same frontend-session
 * channel as `page.*`/`chat.*`, but describe verbs neither Jini vocabulary knows about. See this
 * file's header ("`admin.capture_screenshot` — Tovu-owned, not from either Jini vocabulary") for why
 * this lives here rather than being folded into an upstream package.
 */
const TOVU_FRONTEND_CAPABILITIES: readonly CapabilityDef[] = [
  {
    id: "admin.capture_screenshot",
    description:
      "Captures a picture of what the operator's admin browser tab actually looks like RIGHT NOW — " +
      "current scroll position, open panels, in-progress edits — as a real image, not a description. " +
      "Use this whenever a request is about how something LOOKS (cramped, misaligned, overlapping, " +
      "clipped, ugly, 'does this look right') rather than what the markup contains; page.find_elements " +
      "only reports DOM structure and cannot answer a visual question. " +
      "FIDELITY LIMITS, read before trusting what is or is not in the image: this is an in-page " +
      "rasterization of the admin's main content area (not the assistant panel itself), not a real " +
      "screen capture. Cross-origin iframes render as BLANK space — this includes every MCP-UI surface " +
      "the assistant itself has rendered, so a blank rectangle where a rendered UI card should be is " +
      "NOT evidence that nothing is there. Cross-origin images without permissive CORS headers, " +
      "<canvas>/WebGL content, and <video> frames may also render blank or wrong. Only what is " +
      "currently visible within that content area is captured — content scrolled out of view is not " +
      "included. Capture can fail or be refused if the admin tab is not currently attached, or if the " +
      "rendered view is too large to encode within this tool's size budget; either case is reported as " +
      "a text explanation rather than a partial or corrupted image.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    risk: "read",
    surface: "session",
  },
  {
    id: ADMIN_SHOW_SITE_PAGE_CAPABILITY_ID,
    description:
      "Puts one route of THIS site's own published surface on the operator's screen right now, in a preview " +
      "panel over the admin, and reports what their browser got for it. " +
      "Use this after publishing or changing something, when the operator should SEE the result — e.g. right " +
      "after publishing a post, follow up by showing the published page. " +
      "It does not navigate the admin (page.navigate moves between admin SCREENS only, and is unaffected by " +
      "this call) and it does not return the page's content — call fetch_published_page for headers, cookies " +
      "and body. " +
      "FIDELITY LIMIT: this loads in the operator's own browser, with their admin session — a page only an " +
      "authenticated operator can see will display fine here while a real visitor gets a 404. When the " +
      "question is what a VISITOR receives, call fetch_published_page instead; it fetches unauthenticated. " +
      "Takes a root-relative path on this site (e.g. '/' or '/blog/hello'), never a URL — a remote host, a " +
      "protocol-relative path, a '..' segment, anything under '/api/', or the admin app itself ('/admin' or " +
      "'/admin/...') is refused by name, not silently rewritten. " +
      "Returns { path, shown, status, ok, note? }. A 404 is a RESULT the call reports, not an error — the " +
      "page was shown and the status says what came back.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "A root-relative path on THIS site, e.g. '/' or '/blog/hello'." },
      },
      required: ["path"],
      additionalProperties: false,
    },
    risk: "write",
    surface: "session",
  },
];

/**
 * The full set of capabilities `createFrontendControl` gates and exposes to a run's agent —
 * `page.*` plus every `chat.*` verb except the one that requires a confirmation transport this
 * host does not have.
 *
 * @complexity O(n) once at module load (array concat + filter over `CHAT_CAPABILITIES`'s fixed
 * seven entries); O(1) thereafter, since the result is a module-level constant.
 * @overallScore 100
 */
export const FRONTEND_CONTROL_CAPABILITIES: readonly CapabilityDef[] = [
  ...PAGE_CAPABILITIES,
  ...CHAT_CAPABILITIES.filter((capability) => capability.requiresConfirmation !== true),
  ...TOVU_FRONTEND_CAPABILITIES,
];
