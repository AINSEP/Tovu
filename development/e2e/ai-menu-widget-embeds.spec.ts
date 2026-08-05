import { test, expect, type APIRequestContext } from "@playwright/test";
import { waitForAgentDaemon } from "./daemon-ready";

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
 *    every shipped `theme.json` under `src/themes/**` was checked and NONE declares a `regions`
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
 * `data-widget-embed` marker (`src/widgets/html-embeds.ts`) — and (b) proves the Post gap live: the
 * assistant is directed to attempt `widgets_insert_embed` against a real post id, and this test
 * asserts that attempt fails and that the post's public HTML carries no widget markup at all. If a
 * future fix wires a reachable path (an `entries`-backed post/page host, or a theme that declares
 * regions), THIS test's Post-side assertions will start failing — which is the intended trip-wire,
 * not a false alarm; update them once that lands.
 *
 * Modeled on `surface-live-agent.spec.ts`'s transport plumbing (login, SSE parsing, `RunWireEvent`
 * shape) — see that file for the full rationale of each piece copied below.
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
5. pages_write_html with { "id": "<the page id returned by step 4>", "html": "<!doctype html><html><body><h1>QA E2E Page</h1><div data-widget-embed=\\"<the widget instance id returned by step 2>\\"></div><div data-widget-embed=\\"<the widget instance id returned by step 3>\\"></div></body></html>" }
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

  // The menu widget resolved to REAL rendered content, not the REQ-28 placeholder.
  expect(pageHtml.includes('class="widget widget-menu"'), `public page HTML missing the rendered menu widget:\n${pageHtml}`).toBe(true);
  expect(pageHtml.includes(`>${MENU_LINK_LABEL}</a>`), "menu item did not render as a real resolved link").toBe(true);
  expect(pageHtml.includes(MENU_LINK_HREF), "menu item's href did not resolve to the real target URL").toBe(true);

  // The text widget resolved to REAL rendered content.
  expect(pageHtml.includes('class="widget widget-text"'), `public page HTML missing the rendered text widget:\n${pageHtml}`).toBe(true);
  expect(pageHtml.includes(TEXT_WIDGET_MARKER), "text widget's body did not render on the public page").toBe(true);

  // Neither embed degraded to the safe-but-empty placeholder — a placeholder passing would mean the
  // page LOOKED fine while actually serving nothing, the exact admin-vs-public trap this test exists
  // to catch.
  expect(pageHtml.includes("widget-placeholder"), "a widget on the page degraded to the unresolved placeholder instead of real content").toBe(false);

  const postRes = await fetch(`${baseURL}/${postSlug}`);
  expect(postRes.status, `public post GET should succeed`).toBe(200);
  const postHtml = await postRes.text();

  // The post itself is real and published...
  expect(postHtml.includes("QA E2E Post"), "public post HTML missing the post's own title").toBe(true);
  // ...but carries NO widget markup at all — the failed embed left no trace, confirming the gap is a
  // clean rejection, not a silent no-op that half-wrote something.
  expect(postHtml.includes('class="widget'), `public post HTML unexpectedly contains widget markup despite the embed attempt failing:\n${postHtml}`).toBe(false);
});
