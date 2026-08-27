import { test, expect, type APIRequestContext } from "@playwright/test";
import { waitForAgentDaemon } from "./daemon-ready.js";

/**
 * @file Owner's own ask, run for real: "run an AI test to create a menu and then also put that in
 * a post and a page. And also a widget." A genuine spawned `claude` CLI drives the assistant's real
 * tool surface (`menus_create_menu`, `widgets_create_instance`, `content_post_create`,
 * `pages_write_html`, `widgets_insert_embed`) over the same `/api/runs` SSE transport
 * `surface-live-agent.spec.ts` uses — nothing here is mocked or simulated.
 *
 * ## What this actually proves, and the one thing it deliberately does NOT pretend to prove
 *
 * Traced against the real code (not inferred) before writing this test, three independent ways:
 *
 * 1. `widgets_insert_embed`'s `hostEntryId` resolves via `EntryRepoPort.findById` against the
 *    generic `entries` table (`src/widgets/embed-service.ts:148-152`). Blog Posts/Pages live in a
 *    separate `posts` table (`src/db/schema.ts`) — a real post id 404s as a host. Disclosed in the
 *    product's own code: `src/server/routes/site/pages.ts:104-111`, "no reachable target on the
 *    live home/post routes yet."
 * 2. The one fallback that WOULD reach a post (a widget bound into a site-wide theme region —
 *    header/footer — via `widgets_bind_region`/`widgets_set_region_placements`) is also dead today:
 *    every shipped `theme.json` under `content/themes/**` was checked and NONE declares a `regions`
 *    field, and `resolvePageWidgets` (`src/widgets/resolver-service.ts`) only ever iterates
 *    `theme.manifest.regions` — with that empty on every theme, nothing bound to a region renders
 *    on ANY live route today, posts included.
 * 3. `menus_assign_location` writes a `nav_location_bindings` row nothing on the public site ever
 *    reads (grepped every site route/renderer — zero consumers of `navLocationBindingRepo`). The
 *    only way a menu is publicly visible at all is wrapped in a `menu`-typed widget instance,
 *    subject to the same #1/#2 constraints as any other widget.
 *
 * So: **a widget/menu cannot currently be placed into a real blog Post through any tool the
 * assistant has** — not a test-authoring gap, a real, disclosed, unfixed product limitation. This
 * test does not fabricate a pass for that half of the ask. Instead it (a) proves the achievable
 * half for real — menu + widget genuinely rendering on the PUBLIC site, embedded in a Page via the
 * `data-embed-type` marker (`src/widgets/html-embeds.ts`) — and (b) proves the Post gap live: the
 * assistant is directed to attempt `widgets_insert_embed` against a real post id, and this test
 * asserts that attempt fails and that the post's public HTML carries no widget markup at all. If a
 * future fix wires a reachable path (an `entries`-backed post/page host, or a theme that declares
 * regions), THIS test's Post-side assertions will start failing — which is the intended trip-wire,
 * not a false alarm; update them once that lands.
 *
 * Modeled on `surface-live-agent.spec.ts`'s transport plumbing (login, SSE parsing, `RunWireEvent`
 * shape) — see that file for the full rationale of each piece copied below.
 *
 * ## THE TRAP THE NEXT PERSON WILL HIT: a widget can render successfully and prove nothing
 *
 * `<div class="widget widget-placeholder" aria-hidden="true"></div>` (`render.ts`'s REQ-28 degrade
 * path) is the SAME trap as yesterday's admin-preview-vs-empty-public-shell bug, one layer down: a
 * page with a broken/unresolved embed still 200s, still has a `<h1>`, still "looks like a page" if
 * you eyeball it or just check the HTTP status. The only way to tell a REAL rendered widget from a
 * silently-degraded one is to check for the widget's own resolved content (a real `<a href>`, a real
 * body string) and separately assert `widget-placeholder` is ABSENT. Every positive assertion below
 * does both; see `MUTATION-VERIFY` below for proof these assertions actually catch it.
 *
 * ## Mutation-verify: every assertion below is red-checked, not assumed
 *
 * `development/scripts/mutation-sweep.mjs` is the unit/integration-level tool for this; there is no
 * equivalent for E2E, so this file does it by hand — the SAME assertion helpers used in the real
 * live-agent test's public-render checks are re-run against deliberately broken states below, over
 * real HTTP against a real running server, and shown to fail:
 *  - `assertMenuWidgetRendered` — red-checked by a page with the menu embed div removed.
 *  - `assertTextWidgetRendered` — red-checked by a page with the text embed div removed.
 *  - Both — red-checked by a page whose embed div points at a widget id that doesn't exist (proves
 *    the resolver having RUN but found nothing is caught too, not just an absent marker).
 *  - `assertNoWidgetMarkup` (the post-gap assertion) — corroborated by a direct HTTP call to the
 *    same underlying route (`POST .../entries/:hostEntryId/widget-embeds`) against a real post id,
 *    independent of what any particular live-agent run happens to attempt.
 * These are fast/deterministic (no live agent, no cost) so they can rerun on every CI pass; the
 * expensive live-agent test above stays the once-in-a-while real-assistant proof.
 *
 * ## Empirical probe: theme regions, checked live not just grepped
 *
 * The claim "no shipped theme declares `regions`, so a region-bound widget renders nowhere on the
 * live site" is a systemic claim about production behavior — worth an actual observation, not just a
 * grep. `EMPIRICAL PROBE` below binds a real widget to the `header` AND `footer` regions via the
 * real admin routes, loads the real public home page AND a real published post over HTTP, and
 * asserts on the actual response body. If a theme ever starts declaring regions, this test's
 * assertions flip from "absent" to expected-present and the failure is the signal to update them.
 */

const RUNS_PATH = "/api/runs";
const MENU_SLUG = "qa-e2e-menu";
const PAGE_SLUG = "qa-e2e-page";
const POST_SLUG = "qa-e2e-post";
const MENU_LINK_LABEL = "Example Link";
const MENU_LINK_HREF = "https://example.com/qa-e2e";
const TEXT_WIDGET_MARKER = "QA-E2E-TEXT-WIDGET-MARKER-8f21c";

async function login(request: APIRequestContext): Promise<void> {
  const res = await request.post("/api/admin/v1/auth/login", { data: { username: "admin", password: "tovu-dev" } });
  expect(res.status()).toBe(200);
}

/** Same wire envelope as `surface-live-agent.spec.ts`'s `RunWireEvent` — see that file's own doc for
 * why this is hand-mirrored rather than imported from `@jini-ai/protocol` (not yet a resolvable
 * Tovu dependency). `input` added here (absent in the delete-only test) because this test needs to
 * discriminate BETWEEN calls to the same tool name (two `widgets_create_instance` calls, two
 * `content_post_create` calls) by their arguments, not just by name. */
interface RunWireEvent {
  kind: string;
  payload?: {
    type?: string;
    id?: string;
    name?: string;
    input?: unknown;
    toolUseId?: string;
    content?: string;
    isError?: boolean;
    status?: string;
  };
}

function describeEvent(event: RunWireEvent): string {
  if (event.kind === "agent" && event.payload?.type === "tool_use") return `agent:tool_use(${event.payload.name})`;
  if (event.kind === "agent" && event.payload?.type === "tool_result") return `agent:tool_result(err=${Boolean(event.payload.isError)})`;
  return event.kind === "agent" ? `agent:${event.payload?.type ?? "?"}` : event.kind;
}

async function* streamRunEvents(baseURL: string, runId: string, cookieHeader: string): AsyncGenerator<RunWireEvent> {
  const response = await fetch(`${baseURL}/api/runs/${runId}/events`, {
    headers: { accept: "text/event-stream", cookie: cookieHeader },
  });
  if (!response.body) throw new Error("no response body for SSE stream");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawEvent = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const dataLines = rawEvent
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());
        if (dataLines.length === 0) continue;
        try {
          yield JSON.parse(dataLines.join("\n")) as RunWireEvent;
        } catch {
          // Non-JSON control frames — skip rather than fail the whole read on one bad frame.
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

function cookieHeaderFrom(setCookie: string[]): string {
  return setCookie.map((raw) => raw.split(";")[0]).join("; ");
}

/** One recorded tool_use/tool_result pair, JSON-parsed content where possible. `content` on the wire
 * is always a plain string (`agent-executor.ts`'s `asString` coercion) — usually the tool handler's
 * JSON-stringified result, but a thrown domain error's message on failure, which is why `parsed` is
 * optional rather than assumed. */
interface ToolCallRecord {
  name: string;
  input: unknown;
  content: string;
  isError: boolean;
  parsed?: Record<string, unknown>;
}

function tryParseJson(content: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(content) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function inputObj(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

test("LIVE AGENT: create a menu, a menu-widget, and a text widget; embed both into a real Page and verify on the public site; prove a Post embed cannot resolve", async ({ request, baseURL }) => {
  test.setTimeout(9 * 60_000);

  await waitForAgentDaemon();

  const loginRes = await fetch(`${baseURL}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  expect(loginRes.status).toBe(200);
  const setCookie = loginRes.headers.getSetCookie?.() ?? [];
  expect(setCookie.length).toBeGreaterThan(0);
  const cookieHeader = cookieHeaderFrom(setCookie);
  await login(request);

  // ---- Direct, ordered, narrow prompt — same philosophy as surface-live-agent.spec.ts's own: this
  // test is not evaluating prompt-following generally, only that the transport and tools work once
  // called. Every argument is spelled out so a real model has nothing to guess. Step 7 is expected
  // to FAIL — the model is told so explicitly, so a real failure there doesn't derail the run. ----
  const prompt = `Call the following tools in this exact order, using the id returned by each call where a
later step needs one. Do not call any other tools. Do not ask the user anything in text — just
execute the sequence, then stop.

1. menus_create_menu with { "title": "QA E2E Menu", "slug": "${MENU_SLUG}", "items": [ { "id": "item-1", "label": "${MENU_LINK_LABEL}", "target": { "kind": "url", "href": "${MENU_LINK_HREF}" } } ] }
2. widgets_create_instance with { "widgetType": "menu", "title": "QA E2E Menu Widget", "config": { "menuRef": "<the menu id returned by step 1>" } }
3. widgets_create_instance with { "widgetType": "text", "title": "QA E2E Text Widget", "config": { "body": "${TEXT_WIDGET_MARKER}" } }
4. content_post_create with { "kind": "page", "title": "QA E2E Page", "slug": "${PAGE_SLUG}", "status": "published" }
5. pages_write_html with { "id": "<the page id returned by step 4>", "html": "<!doctype html><html><body><h1>QA E2E Page</h1><div data-embed-type=\\"widget\\" data-embed-id=\\"<the widget instance id returned by step 2>\\"></div><div data-embed-type=\\"widget\\" data-embed-id=\\"<the widget instance id returned by step 3>\\"></div></body></html>" }
6. content_post_create with { "kind": "post", "title": "QA E2E Post", "slug": "${POST_SLUG}", "status": "published" }
7. widgets_insert_embed with { "hostEntryId": "<the post id returned by step 6>", "baseVersion": 1, "widgetEntryId": "<the widget instance id returned by step 3>" }. This call is expected to fail because a real blog post cannot host a widget embed today — that is fine and expected. If it fails, report the error in your final message and do NOT retry it.`;

  const runRes = await request.post(RUNS_PATH, {
    data: { contextRef: JSON.stringify({ prompt }), agentId: "claude" },
  });
  expect(runRes.status(), `run start should succeed: ${await runRes.text().catch(() => "")}`).toBe(201);
  const runBody = await runRes.json();
  const runId: string = runBody.run.id;

  // ---- Stream the WHOLE run (no human-confirmation park/resume needed here, unlike
  // surface-live-agent.spec.ts's content_post_delete) — collect every tool_use/tool_result pair. ----
  const pendingToolUses = new Map<string, { name: string; input: unknown }>();
  const calls: ToolCallRecord[] = [];
  const seenTypes: string[] = [];

  for await (const event of streamRunEvents(baseURL!, runId, cookieHeader)) {
    seenTypes.push(describeEvent(event));
    if (event.kind === "agent" && event.payload?.type === "tool_use") {
      const id = event.payload.id ?? "";
      pendingToolUses.set(id, { name: event.payload.name ?? "", input: event.payload.input });
    } else if (event.kind === "agent" && event.payload?.type === "tool_result") {
      const toolUseId = event.payload.toolUseId ?? "";
      const use = pendingToolUses.get(toolUseId);
      const content = event.payload.content ?? "";
      calls.push({
        name: use?.name ?? "(unknown)",
        input: use?.input,
        content,
        isError: Boolean(event.payload.isError),
        parsed: tryParseJson(content),
      });
    } else if (event.kind === "end" || event.kind === "error") {
      break;
    }
  }

  const diag = () => `tool calls seen: ${calls.map((c) => `${c.name}${c.isError ? "(error)" : ""}`).join(", ") || "(none)"}; events: ${seenTypes.join(", ")}`;

  // ---- Locate each expected call by name + discriminating input, not by position — tolerant of the
  // model interleaving extra read-only calls (e.g. widgets_list_regions) around the required ones. ----
  const menuCreate = calls.find((c) => c.name === "menus_create_menu" && !c.isError);
  expect(menuCreate, `expected a successful menus_create_menu call. ${diag()}`).toBeTruthy();
  const menuId = String((menuCreate!.parsed?.menu as Record<string, unknown> | undefined)?.id ?? "");
  expect(menuId, `menus_create_menu result had no menu.id: ${menuCreate!.content}`).toBeTruthy();

  const menuWidgetCreate = calls.find((c) => c.name === "widgets_create_instance" && inputObj(c.input).widgetType === "menu" && !c.isError);
  expect(menuWidgetCreate, `expected a successful widgets_create_instance(menu) call. ${diag()}`).toBeTruthy();
  const menuWidgetId = String((menuWidgetCreate!.parsed?.instance as Record<string, unknown> | undefined)?.id ?? "");
  expect(menuWidgetId, `widgets_create_instance(menu) result had no instance.id: ${menuWidgetCreate!.content}`).toBeTruthy();

  const textWidgetCreate = calls.find((c) => c.name === "widgets_create_instance" && inputObj(c.input).widgetType === "text" && !c.isError);
  expect(textWidgetCreate, `expected a successful widgets_create_instance(text) call. ${diag()}`).toBeTruthy();
  const textWidgetId = String((textWidgetCreate!.parsed?.instance as Record<string, unknown> | undefined)?.id ?? "");
  expect(textWidgetId, `widgets_create_instance(text) result had no instance.id: ${textWidgetCreate!.content}`).toBeTruthy();

  const pageCreate = calls.find((c) => c.name === "content_post_create" && inputObj(c.input).kind === "page" && !c.isError);
  expect(pageCreate, `expected a successful content_post_create(page) call. ${diag()}`).toBeTruthy();
  const pagePost = pageCreate!.parsed?.post as Record<string, unknown> | undefined;
  const pageId = String(pagePost?.id ?? "");
  const pageSlug = String(pagePost?.slug ?? PAGE_SLUG);
  expect(pageId, `content_post_create(page) result had no post.id: ${pageCreate!.content}`).toBeTruthy();

  const pagesWrite = calls.find((c) => c.name === "pages_write_html" && !c.isError);
  expect(pagesWrite, `expected a successful pages_write_html call. ${diag()}`).toBeTruthy();
  expect(pagesWrite!.parsed?.written, `pages_write_html did not report written:true: ${pagesWrite!.content}`).toBe(true);

  const postCreate = calls.find((c) => c.name === "content_post_create" && inputObj(c.input).kind === "post" && !c.isError);
  expect(postCreate, `expected a successful content_post_create(post) call. ${diag()}`).toBeTruthy();
  const postPost = postCreate!.parsed?.post as Record<string, unknown> | undefined;
  const postId = String(postPost?.id ?? "");
  const postSlug = String(postPost?.slug ?? POST_SLUG);
  expect(postId, `content_post_create(post) result had no post.id: ${postCreate!.content}`).toBeTruthy();

  // ---- The gap, proven live: the attempted embed into the real post must fail, not silently
  // succeed. Matched by hostEntryId so a model retry with different args doesn't get confused for a
  // different, unrelated call. ----
  const embedAttempt = calls.find((c) => c.name === "widgets_insert_embed" && inputObj(c.input).hostEntryId === postId);
  expect(embedAttempt, `expected the assistant to attempt widgets_insert_embed against the post. ${diag()}`).toBeTruthy();
  expect(embedAttempt!.isError, `widgets_insert_embed against a real post should fail (no reachable host) — it succeeded instead: ${embedAttempt!.content}`).toBe(true);

  await request.post(`${RUNS_PATH}/${runId}/cancel`, { data: {} }).catch(() => undefined);

  // ==== PUBLIC-SITE VERIFICATION — the whole point per the brief: the admin/tool layer reporting
  // success proves nothing about what a visitor actually sees. Every assertion below reads the
  // PUBLIC (unauthenticated) route, not an admin preview or API response. ====

  const pageRes = await fetch(`${baseURL}/${pageSlug}`);
  expect(pageRes.status, `public page GET should succeed`).toBe(200);
  const pageHtml = await pageRes.text();

  // Shared helpers (defined below, re-run against deliberately broken states in the
  // MUTATION-VERIFY section) — using the SAME functions here as in the red-checks is the whole
  // point: this is not two independently-written checks that might quietly diverge.
  assertMenuWidgetRendered(pageHtml, { linkLabel: MENU_LINK_LABEL, linkHref: MENU_LINK_HREF });
  assertTextWidgetRendered(pageHtml, { marker: TEXT_WIDGET_MARKER });
  assertNoPlaceholder(pageHtml);

  const postRes = await fetch(`${baseURL}/${postSlug}`);
  expect(postRes.status, `public post GET should succeed`).toBe(200);
  const postHtml = await postRes.text();

  // The post itself is real and published...
  expect(postHtml.includes("QA E2E Post"), "public post HTML missing the post's own title").toBe(true);
  // ...but carries NO widget markup at all — the failed embed left no trace, confirming the gap is a
  // clean rejection, not a silent no-op that half-wrote something.
  assertNoWidgetMarkup(postHtml);
});

// ============================================================================================
// SHARED ASSERTION HELPERS — used by the live-agent test above AND red-checked by the
// MUTATION-VERIFY tests below against deliberately broken states. Each `include`s a UNIQUE
// string this file controls (a specific href, a specific marker) — not a generic tag name — so
// an unrelated widget/theme element elsewhere on the page cannot accidentally satisfy it. Every
// exact string emitted below is single-sourced in `src/server/http/site/render.ts` (verified by
// direct grep before this file was written — no shipped theme's CSS/JS emits any of them either).
// ============================================================================================

function assertMenuWidgetRendered(html: string, opts: { linkLabel: string; linkHref: string }): void {
  expect(html.includes('class="widget widget-menu"'), `missing the rendered menu widget:\n${html}`).toBe(true);
  expect(html.includes(`>${opts.linkLabel}</a>`), "menu item did not render as a real resolved link").toBe(true);
  expect(html.includes(opts.linkHref), "menu item's href did not resolve to the real target URL").toBe(true);
}

function assertMenuWidgetAbsent(html: string): void {
  expect(html.includes('class="widget widget-menu"'), `expected NO rendered menu widget, but found one:\n${html}`).toBe(false);
}

function assertTextWidgetRendered(html: string, opts: { marker: string }): void {
  expect(html.includes('class="widget widget-text"'), `missing the rendered text widget:\n${html}`).toBe(true);
  expect(html.includes(opts.marker), "text widget's body did not render").toBe(true);
}

function assertTextWidgetAbsent(html: string): void {
  expect(html.includes('class="widget widget-text"'), `expected NO rendered text widget, but found one:\n${html}`).toBe(false);
}

/** Neither embed degraded to the safe-but-empty REQ-28 placeholder — a placeholder passing would
 * mean the page LOOKED fine while actually serving nothing, the exact admin-vs-public trap this
 * whole file exists to catch. `renderWidgetPlaceholder()` (`render.ts`) is the ONLY emitter of
 * this exact string in the entire codebase (grepped, including every theme's CSS/JS). */
function assertNoPlaceholder(html: string): void {
  expect(html.includes("widget-placeholder"), "a widget degraded to the unresolved placeholder instead of real content").toBe(false);
}

/** No widget-shaped markup anywhere — every widget render function in `render.ts` (text,
 * social-links, recent-entries, menu, contact-form, placeholder) shares the `class="widget `
 * prefix, confirmed by direct grep, so this one substring check covers all of them. */
function assertNoWidgetMarkup(html: string): void {
  expect(html.includes('class="widget'), `unexpectedly contains widget markup:\n${html}`).toBe(false);
}

// ============================================================================================
// MUTATION-VERIFY — fast, deterministic, HTTP-only (no live agent, no cost). These construct the
// exact same shapes the live agent constructs above, directly via the admin HTTP routes the AI
// tools themselves call into, then deliberately break one mechanism at a time and confirm the
// SAME assertion helpers above go red. This is the E2E-layer equivalent of
// `development/scripts/mutation-sweep.mjs` for this feature: proof the assertions discriminate
// "the feature works" from "the page loaded", not an assumption.
// ============================================================================================

interface AdminWidget {
  id: string;
}
interface AdminMenu {
  id: string;
}
interface AdminPost {
  id: string;
  slug: string;
}
interface AdminArea {
  version: number;
}

const WS = "workspace-local";

async function createMenuHttp(request: APIRequestContext, body: { title: string; slug: string; items?: unknown[] }): Promise<AdminMenu> {
  const res = await request.post(`/api/admin/v1/workspaces/${WS}/menus`, { data: body });
  expect(res.status(), `menu create failed: ${await res.text().catch(() => "")}`).toBe(201);
  return (await res.json()).menu as AdminMenu;
}

async function createWidgetHttp(request: APIRequestContext, body: { widgetType: string; title: string; config: unknown }): Promise<AdminWidget> {
  const res = await request.post(`/api/admin/v1/workspaces/${WS}/widgets`, { data: body });
  expect(res.status(), `widget create failed: ${await res.text().catch(() => "")}`).toBe(201);
  return (await res.json()).widget as AdminWidget;
}

async function createPageHttp(request: APIRequestContext, body: { title: string; slug: string; status: string }): Promise<AdminPost> {
  const res = await request.post(`/api/admin/v1/workspaces/${WS}/pages`, { data: body });
  expect(res.status(), `page create failed: ${await res.text().catch(() => "")}`).toBe(201);
  return (await res.json()).post as AdminPost;
}

async function createPostHttp(request: APIRequestContext, body: { title: string; slug: string; status: string }): Promise<AdminPost> {
  const res = await request.post(`/api/admin/v1/workspaces/${WS}/posts`, { data: body });
  expect(res.status(), `post create failed: ${await res.text().catch(() => "")}`).toBe(201);
  return (await res.json()).post as AdminPost;
}

async function writePageHtmlHttp(request: APIRequestContext, pageId: string, html: string): Promise<void> {
  const res = await request.put(`/api/admin/v1/workspaces/${WS}/pages/${pageId}/html`, { data: { html } });
  expect(res.status(), `pages/html write failed: ${await res.text().catch(() => "")}`).toBe(200);
}

async function bindRegionHttp(request: APIRequestContext, regionKey: string): Promise<AdminArea> {
  const res = await request.post(`/api/admin/v1/workspaces/${WS}/widgets/regions`, { data: { regionKey } });
  expect(res.status(), `region bind failed: ${await res.text().catch(() => "")}`).toBe(201);
  return (await res.json()).area as AdminArea;
}

async function setRegionPlacementsHttp(request: APIRequestContext, regionKey: string, baseVersion: number, widgetEntryId: string): Promise<void> {
  const res = await request.put(`/api/admin/v1/workspaces/${WS}/widgets/regions/${regionKey}`, {
    data: { baseVersion, placements: [{ placementId: `probe-${regionKey}`, widgetEntryId, enabled: true }] },
  });
  expect(res.status(), `region placement write failed: ${await res.text().catch(() => "")}`).toBe(200);
}

test.describe("MUTATION-VERIFY: menu/widget-in-Page render assertions, red-checked", () => {
  test.beforeEach(async ({ request }) => {
    await login(request);
  });

  test("positive control: menu widget + text widget both render for real when both embeds are present", async ({ request, baseURL }) => {
    const menu = await createMenuHttp(request, {
      title: "Mutation Positive Menu",
      slug: "mutation-positive-menu",
      items: [{ id: "item-1", label: "Positive Link", target: { kind: "url", href: "https://example.com/mutation-positive" } }],
    });
    const menuWidget = await createWidgetHttp(request, { widgetType: "menu", title: "Mutation Positive Menu Widget", config: { menuRef: menu.id } });
    const textWidget = await createWidgetHttp(request, { widgetType: "text", title: "Mutation Positive Text Widget", config: { body: "MUTATION-POSITIVE-TEXT-MARKER" } });
    const page = await createPageHttp(request, { title: "Mutation Positive Page", slug: "mutation-positive-page", status: "published" });
    await writePageHtmlHttp(
      request,
      page.id,
      `<html><body><h1>Positive</h1><div data-embed-type="widget" data-embed-id="${menuWidget.id}"></div><div data-embed-type="widget" data-embed-id="${textWidget.id}"></div></body></html>`
    );

    const html = await (await fetch(`${baseURL}/mutation-positive-page`)).text();
    assertMenuWidgetRendered(html, { linkLabel: "Positive Link", linkHref: "https://example.com/mutation-positive" });
    assertTextWidgetRendered(html, { marker: "MUTATION-POSITIVE-TEXT-MARKER" });
    assertNoPlaceholder(html);
  });

  test("RED-CHECK: removing the menu embed div makes assertMenuWidgetRendered fail (the text widget still renders, isolating the break)", async ({ request, baseURL }) => {
    const textWidget = await createWidgetHttp(request, { widgetType: "text", title: "No-Menu Text Widget", config: { body: "NO-MENU-TEXT-MARKER" } });
    const page = await createPageHttp(request, { title: "No Menu Embed", slug: "mutation-no-menu-embed", status: "published" });
    // Deliberately no data-embed-type div for a menu widget at all — the mechanism under test is
    // literally absent from the authored page.
    await writePageHtmlHttp(request, page.id, `<html><body><h1>No Menu</h1><div data-embed-type="widget" data-embed-id="${textWidget.id}"></div></body></html>`);

    const html = await (await fetch(`${baseURL}/mutation-no-menu-embed`)).text();
    // Proves the break is isolated to the menu assertion, not a broken page/route/resolver overall.
    assertTextWidgetRendered(html, { marker: "NO-MENU-TEXT-MARKER" });
    // THE RED-CHECK: the exact same helper the live-agent test relies on must fail here.
    expect(() => assertMenuWidgetRendered(html, { linkLabel: "Positive Link", linkHref: "https://example.com/mutation-positive" })).toThrow();
    assertMenuWidgetAbsent(html);
  });

  test("RED-CHECK: removing the text widget embed div makes assertTextWidgetRendered fail (the menu still renders, isolating the break)", async ({ request, baseURL }) => {
    const menu = await createMenuHttp(request, {
      title: "No-Text Menu",
      slug: "mutation-no-text-menu",
      items: [{ id: "item-1", label: "No Text Link", target: { kind: "url", href: "https://example.com/no-text" } }],
    });
    const menuWidget = await createWidgetHttp(request, { widgetType: "menu", title: "No-Text Menu Widget", config: { menuRef: menu.id } });
    const page = await createPageHttp(request, { title: "No Text Embed", slug: "mutation-no-text-embed", status: "published" });
    // Deliberately no data-embed-type div for the text widget at all.
    await writePageHtmlHttp(request, page.id, `<html><body><h1>No Text</h1><div data-embed-type="widget" data-embed-id="${menuWidget.id}"></div></body></html>`);

    const html = await (await fetch(`${baseURL}/mutation-no-text-embed`)).text();
    assertMenuWidgetRendered(html, { linkLabel: "No Text Link", linkHref: "https://example.com/no-text" });
    // THE RED-CHECK — the marker here is unused deliberately: no text widget was ever embedded, so
    // no marker value could satisfy this; the assertion must fail regardless of what's asked for.
    expect(() => assertTextWidgetRendered(html, { marker: "UNUSED-MARKER-NO-TEXT-WIDGET-EXISTS" })).toThrow();
    assertTextWidgetAbsent(html);
  });

  test("RED-CHECK: an embed pointing at a nonexistent widget id degrades to the placeholder — proves the resolver having RUN with nothing to resolve is caught too, not just an absent marker", async ({ request, baseURL }) => {
    const page = await createPageHttp(request, { title: "Bogus Embed", slug: "mutation-bogus-embed", status: "published" });
    await writePageHtmlHttp(request, page.id, `<html><body><h1>Bogus</h1><div data-embed-type="widget" data-embed-id="00000000-0000-0000-0000-000000000000"></div></body></html>`);

    const html = await (await fetch(`${baseURL}/mutation-bogus-embed`)).text();
    // The page still 200s and still has its own heading — a status/title check alone would pass
    // here despite the widget being completely unresolved. Only the placeholder check catches it.
    expect(html.includes("<h1>Bogus</h1>")).toBe(true);
    expect(() => assertNoPlaceholder(html)).toThrow();
    expect(html.includes("widget-placeholder")).toBe(true);
    assertMenuWidgetAbsent(html);
    assertTextWidgetAbsent(html);
  });

  test("CORROBORATION: embedding a widget into a real post fails at the same HTTP route the AI tool calls into (independent of what any one live-agent run happens to attempt)", async ({ request }) => {
    const textWidget = await createWidgetHttp(request, { widgetType: "text", title: "Embed Gap Text Widget", config: { body: "EMBED-GAP-MARKER" } });
    const post = await createPostHttp(request, { title: "Embed Gap Post", slug: "mutation-embed-gap-post", status: "published" });

    const res = await request.post(`/api/admin/v1/workspaces/${WS}/entries/${post.id}/widget-embeds`, {
      data: { baseVersion: 1, widgetEntryId: textWidget.id },
    });
    // 404 WIDGETS_INSTANCE_NOT_FOUND — `embed-service.ts`'s `loadHostEntry` resolves `hostEntryId`
    // against the `entries` table, and a real post id is never a row there. Same underlying route
    // `widgets_insert_embed` (the AI tool) calls into, so this is not testing a different mechanism.
    expect(res.status(), `expected the embed attempt to be rejected, got ${res.status()}: ${await res.text().catch(() => "")}`).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("WIDGETS_INSTANCE_NOT_FOUND");
  });

  test("RED-CHECK (post side): assertNoWidgetMarkup is not vacuously satisfied by every post render — it actually fails when the response body contains genuine widget markup", async ({ request, baseURL }) => {
    const post = await createPostHttp(request, { title: "Widget Markup Sanity Post", slug: "mutation-post-widget-markup-sanity", status: "published" });
    const realHtml = await (await fetch(`${baseURL}/mutation-post-widget-markup-sanity`)).text();

    // Sanity control: the real, untouched post render (no widget was ever attached) correctly
    // passes today — this is what `assertNoWidgetMarkup` sees in the live-agent test.
    expect(() => assertNoWidgetMarkup(realHtml)).not.toThrow();

    // Now splice in EXACTLY the byte sequence `renderWidgetIr`'s "text" case emits for a genuinely
    // resolved widget (`render.ts`: `<div class="widget widget-text">...</div>`) — simulating "the
    // embed had worked" without needing the actually-unreachable resolution path to succeed for
    // real. `assertNoWidgetMarkup` is a pure substring check over the response body, so it cannot
    // distinguish this splice's position from a real render's — this is a faithful proxy for "what
    // this exact check sees the day a real widget's markup lands in a post's HTML", and it answers
    // the coordinator's question directly: if Post embeds ever become reachable and actually
    // render, THIS assertion is the one that starts failing (which is the trip-wire behaving
    // correctly), not one that stays green no matter what the response body contains.
    const withSyntheticWidget = realHtml.replace("</body>", '<div class="widget widget-text">SYNTHETIC-PROOF-WIDGET</div></body>');
    expect(withSyntheticWidget).not.toBe(realHtml); // guard: the splice must have actually landed
    expect(() => assertNoWidgetMarkup(withSyntheticWidget)).toThrow();
  });
});

test.describe("EMPIRICAL PROBE: theme regions — observed, not just grepped", () => {
  test.beforeEach(async ({ request }) => {
    await login(request);
  });

  test("a widget bound to the header/footer regions and placed does not render on the live public home page or a live public post", async ({ request, baseURL }) => {
    const widget = await createWidgetHttp(request, { widgetType: "text", title: "Region Probe Widget", config: { body: "REGION-PROBE-MARKER" } });

    for (const regionKey of ["header", "footer"]) {
      const area = await bindRegionHttp(request, regionKey);
      await setRegionPlacementsHttp(request, regionKey, area.version, widget.id);
    }

    const post = await createPostHttp(request, { title: "Region Probe Post", slug: "mutation-region-probe-post", status: "published" });

    const homeHtml = await (await fetch(`${baseURL}/`)).text();
    const postHtml = await (await fetch(`${baseURL}/mutation-region-probe-post`)).text();

    // THE OBSERVATION (not an inference): with the widget genuinely bound AND placed in both
    // regions a theme commonly declares, it appears on NEITHER the home page NOR a real post. This
    // pins the current, empirically-confirmed behavior — every shipped `theme.json` under
    // `content/themes/**` was independently checked and none declares a `regions` field, so
    // `resolvePageWidgets` (`src/widgets/resolver-service.ts`) never has anything to iterate. If a
    // theme ever starts declaring regions, THESE assertions are the ones that will flip and need
    // updating — that is the intended trip-wire, not flakiness.
    expect(homeHtml.includes("REGION-PROBE-MARKER"), "region-bound widget unexpectedly rendered on the home page — theme-regions may no longer be dead; re-verify before treating this as fixed").toBe(false);
    expect(postHtml.includes("REGION-PROBE-MARKER"), "region-bound widget unexpectedly rendered on a post page — theme-regions may no longer be dead; re-verify before treating this as fixed").toBe(false);
    expect(homeHtml.includes('class="widget'), "unexpected widget markup on the home page").toBe(false);
    expect(postHtml.includes('class="widget'), "unexpected widget markup on the post page").toBe(false);
  });
});
