import type { Page } from "@playwright/test";

/**
 * @file Shared driving helpers for the four `site-assistant-*.spec.ts` files. Not a spec itself —
 * `playwright.site-assistant.config.ts`'s `testMatch` (`/site-assistant-.*\.spec\.ts/`) does not
 * collect this file.
 *
 * ## Why the SSE replay below is evidence, not a shortcut
 *
 * `mockAssistantTurn` intercepts the widget's own `POST /api/site-assistant/chat` in the browser and
 * fulfils it with the exact two-line `event:`/`data:` framing `src/server/modules/site-assistant.ts`'s
 * `sse()` writes. Read on its own that looks like "the test wrote the answer it wanted." It is not,
 * and the reason is a specific, permanent artifact: commit `7de3297` added a route-level integration
 * test that drives the REAL route with only the outbound Gemini call stubbed and asserts the RAW SSE
 * BYTES it writes — event name, JSON envelope, D-1's `auto` flag, and REQ-6's server-resolved
 * `target` (the mocked model call supplies a bare slug and never a path). That test owns the server
 * half of this contract and fails if the wire format drifts.
 *
 * These browser specs own the other half: that the real built bundle, on a real themed page, parses
 * that exact shape off a real `fetch` stream and does the right thing with it. Splitting the stack at
 * the wire — with a byte-level test on each side of the same seam — is what makes both halves
 * verifiable without hanging a nondeterministic, quota-shared, paid model call on every CI run. The
 * one property genuinely lost is "the model chose to call the tool at all," which is not a property
 * of any code in `apps/site-chat`.
 *
 * `site-assistant-limits.spec.ts` deliberately uses none of this: it exercises the real endpoint and
 * the real rate limiter with no interception whatsoever.
 */

const CHAT_ROUTE_GLOB = "**/api/site-assistant/chat";

/** Mirrors `apps/site-chat/src/client-directives.ts`'s `ResolvedPublicTarget`. Every field here is
 *  server-computed in production (REQ-6) — nothing in the browser bundle ever builds a `path`. */
export interface ResolvedTarget {
  readonly slug: string;
  readonly title: string;
  readonly path: string;
}

/** The seeded post these specs navigate to and highlight. `slug`/`title` come from
 *  `src/server/seed.ts`; `path` is `/${slug}`, the single convention `resolvePublicTarget` uses. */
export const ABOUT_TARGET: ResolvedTarget = { slug: "about", title: "What Is Tovu?", path: "/about" };

/** A second published seeded post, so a spec can prove a navigation actually MOVED rather than
 *  reloading the page it started on. */
export const THEMES_TARGET: ResolvedTarget = { slug: "how-themes-work", title: "How Themes Work", path: "/how-themes-work" };

export type DirectiveAction =
  | { readonly type: "navigate"; readonly target: ResolvedTarget; readonly auto: boolean }
  | { readonly type: "scroll_to"; readonly target: ResolvedTarget }
  | { readonly type: "highlight"; readonly target: ResolvedTarget };

/**
 * Serializes one assistant turn into the SSE body the route produces: some `text` deltas, zero or
 * more `client_directive` frames, then the `end` frame.
 *
 * Frame order matters and is not arbitrary — `executeTool` writes a `client_directive` the moment a
 * capability resolves one, which in a real turn is BEFORE the model's closing prose. Emitting the
 * directive between text deltas here keeps that ordering rather than tidying it to the end, so a
 * client that only ever coped with trailing directives would fail this the way it would fail live.
 */
export function sseBody(input: { readonly text: string; readonly directives?: readonly DirectiveAction[] }): string {
  const frames: string[] = [`event: text\ndata: ${JSON.stringify({ delta: input.text })}\n\n`];
  for (const action of input.directives ?? []) {
    frames.push(`event: client_directive\ndata: ${JSON.stringify({ kind: "page_action", action })}\n\n`);
  }
  frames.push(`event: text\ndata: ${JSON.stringify({ delta: "" })}\n\n`);
  frames.push(`event: end\ndata: ${JSON.stringify({ reason: "stop" })}\n\n`);
  return frames.join("");
}

/**
 * Installs a one-shot-per-page interception of the chat endpoint. Registered per `Page`, so it
 * survives nothing: a navigation to a new document keeps `page.route` handlers (they are bound to
 * the page, not the document), which is what lets a navigation spec assert what happens on the
 * DESTINATION page without re-arming anything.
 */
export async function mockAssistantTurn(
  page: Page,
  input: { readonly text: string; readonly directives?: readonly DirectiveAction[] },
): Promise<void> {
  await page.route(CHAT_ROUTE_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform" },
      body: sseBody(input),
    });
  });
}

/**
 * Navigates to a public page and waits for the widget's FAB to exist.
 *
 * `domcontentloaded`, never `networkidle`: this app holds streams open, and `networkidle` never
 * resolves against it — it fails by timing out with a misleading message rather than by saying the
 * wait was wrong (measured, SPEC-046 verification 2026-08-04). The real readiness signal is the FAB,
 * because the bundle is `<script defer>` and self-mounting: a visible `.chat-fab` proves the script
 * downloaded, executed without throwing, and React committed — which no load-state event does.
 */
export async function openSitePage(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".tovu-site-assistant .chat-fab", { state: "visible" });
}

/** Opens the chat panel if it is closed. The panel is toggled with the `hidden` attribute rather
 *  than unmounted (`SiteAssistantWidget.tsx`), so "open" is an attribute state, not existence. */
export async function openChatPanel(page: Page): Promise<void> {
  const panel = page.locator(".tovu-site-assistant__panel");
  if (await panel.isVisible()) return;
  await page.locator(".tovu-site-assistant .chat-fab").click();
  await panel.waitFor({ state: "visible" });
}

/** Types a visitor message and sends it. Waits for the send button to become enabled first —
 *  `ChatPane` disables it until `composer.canSubmit`, and clicking a disabled button is a silent
 *  no-op that would surface later as an unexplained "no reply arrived." */
export async function sendVisitorMessage(page: Page, message: string): Promise<void> {
  await page.locator(".tovu-site-assistant .jini-composer-input").fill(message);
  const send = page.locator(".tovu-site-assistant .jini-composer-send");
  await send.waitFor({ state: "visible" });
  await send.click();
}

/** The `{ open, messages }` envelope under `tovu.site-assistant.transcript.v1`, read straight out of
 *  the page's own `sessionStorage`. Returns `null` when nothing is persisted. */
export async function readPersistedState(page: Page): Promise<{ open: boolean; messages: { id: string; role: string }[] } | null> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("tovu.site-assistant.transcript.v1");
    return raw === null ? null : (JSON.parse(raw) as { open: boolean; messages: { id: string; role: string }[] });
  });
}
