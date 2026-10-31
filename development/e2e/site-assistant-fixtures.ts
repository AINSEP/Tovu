import type { Page } from "@playwright/test";

/** Shared prose/transcript driving helpers. Page tools use the scoped frontend-session fixture
 * in visitor-page-tools.journey.ts; this helper supplies ordinary text turns only. */

const CHAT_ROUTE_GLOB = "**/api/site-assistant/chat";

/** Published fixture data retained for transcript and no-replay assertions. */
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

export function sseBody(input: { readonly text: string }): string {
  const frames: string[] = [`event: text\ndata: ${JSON.stringify({ delta: input.text })}\n\n`];
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
  input: { readonly text: string },
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
 * Navigates to a public page and waits for a usable chat control.
 * `domcontentloaded`, never `networkidle`: the app holds streams open. For built lazy assets,
 * the loader-ready attribute proves activation listeners are installed before the first click;
 * for the eager dev/fallback bundle, the FAB proves React committed.
 */
export async function openSitePage(page: Page, path: string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await page.locator(".tovu-site-assistant .chat-fab, [data-jini-chat-loader][data-loader-ready='true']").first().waitFor({ state: "visible" });
}

/** Opens the chat panel if it is closed. The panel is toggled with the `hidden` attribute rather
 *  than unmounted (`SiteAssistantWidget.tsx`), so "open" is an attribute state, not existence. */
export async function openChatPanel(page: Page): Promise<void> {
  const panel = page.locator(".tovu-site-assistant__panel");
  if (await panel.isVisible()) return;
  const loader = page.locator("[data-jini-chat-loader]");
  if (await loader.isVisible()) {
    await page.locator("[data-jini-chat-loader][data-loader-ready='true']").click();
  } else {
    await page.locator(".tovu-site-assistant .chat-fab").click();
  }
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
export async function readPersistedState(page: Page): Promise<{ open: boolean; messages: { id: string; role: string; content?: string }[] } | null> {
  return page.evaluate(() => {
    const raw = sessionStorage.getItem("tovu.site-assistant.transcript.v1");
    return raw === null ? null : (JSON.parse(raw) as { open: boolean; messages: { id: string; role: string; content?: string }[] });
  });
}
