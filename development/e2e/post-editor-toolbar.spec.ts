import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures";

/**
 * @file The Posts/Pages editor's TipTap formatting toolbar (`PostEditor.tsx`'s `Toolbar`), driven in
 * a real browser.
 *
 * ## Why this suite exists
 *
 * `src/server/http/site/__tests__/tiptap-render-contract.test.ts` (a sibling deliverable, same
 * session) proves the public renderer correctly turns TipTap JSON into HTML — but it starts FROM
 * hand-authored JSON. It can never catch a toolbar button wired to the WRONG editor command: click
 * "Bold", but the `onClick` calls `toggleItalic()` by mistake, and every unit test that only feeds
 * `{type:"bold"}` JSON straight into the renderer would still pass, because that specific bug never
 * produces the JSON the unit test assumes in the first place. This suite closes that half: click the
 * real button, in a real browser, and assert on what actually got PERSISTED — the same shape of gap
 * that let `textAlign`/`underline`/`strike`/`hardBreak` ship broken on the public site in one day
 * (2026-08-11: `8624306`, `154a5be`, `b184940`).
 *
 * ## What "click it, assert the JSON" means here
 *
 * Rather than reaching into TipTap's in-memory `editor` instance (not exposed on `window`, and adding
 * such a hook would be a source change this suite isn't allowed to make — `AI-Dev-Shop/agents/
 * qa-e2e/skills.md`'s "never modify application source code"), each test clicks the toolbar, clicks
 * **Save** (or **Publish**), then re-fetches the post through the SAME authenticated admin API the
 * editor itself uses (`GET /api/admin/v1/workspaces/{ws}/posts/{id}`) and inspects the persisted
 * `bodyJson`. This is a strictly STRONGER assertion than reading the live editor state: it proves the
 * whole path from click to disk, not just that the in-memory doc briefly looked right.
 *
 * ## Selector choice: `getByTitle`, not `getByRole`
 *
 * Every button in `Toolbar` carries a `title` attribute with a stable, human-readable name (`"Bold
 * (⌘B)"`, `"Divider"`, `"Align center"`, …). Several of them have NO `aria-label` and a purely
 * symbolic visible text content (`"―"` for Divider, `"↺"`/`"↻"` for Undo/Redo, a curly `“ Quote` for
 * Quote) — their ACCESSIBLE NAME (which `getByRole('button', {name})` matches against) is that
 * symbol, not a word, so role-based matching would need to hardcode the exact Unicode glyphs. `title`
 * is uniform, human-legible in a test diff, and unambiguous across all 23 buttons (verified: every
 * `title=` value in `Toolbar` is unique) — the pragmatic choice for THIS component, not a downgrade to
 * a CSS class or XPath.
 *
 * ## Scope: "Insert widget" is deliberately NOT covered here
 *
 * That control opens `WidgetPickerDialog`'s full type-then-config flow (creating a real widget entry
 * before a `widgetEmbed` node can even be inserted) — a materially heavier flow than a `window.prompt`
 * toggle, and the `widgetEmbed` node TYPE itself already has thorough coverage both in
 * `tiptap-render-contract.test.ts` (this session) and in the pre-existing `render.test.ts` (REQ-21).
 * Documented as an explicit, disclosed gap per the QA/E2E escalation rule ("document as untestable
 * with reason, do not skip silently") rather than left silently uncovered.
 */

const WORKSPACE_ID = "workspace-local";
const API_BASE = "/api/admin/v1";
/** Must match `playwright.post-editor.config.ts`'s own `API_PORT` — the public site is served by the
 *  API process directly, a different origin from the admin SPA's Vite dev server this suite's
 *  `baseURL` points at, so the full-chain test below cannot reach it through a relative path. */
const API_BASE_URL = "http://localhost:7851";

// ---------------------------------------------------------------------------
// bodyJson helpers — a minimal recursive walker over the TipTap-JSON shape,
// just enough to answer "does this mark/node exist in the saved document".
// ---------------------------------------------------------------------------

interface DocNode {
  type?: string;
  attrs?: Record<string, unknown>;
  marks?: Array<{ type?: string }>;
  content?: DocNode[];
  text?: string;
}

function findNode(node: DocNode | undefined, predicate: (n: DocNode) => boolean): DocNode | null {
  if (!node) return null;
  if (predicate(node)) return node;
  for (const child of node.content ?? []) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

/** True if a text node with this exact text carries a mark of this type anywhere in the doc. */
function hasMarkedText(doc: DocNode, text: string, markType: string): boolean {
  return findNode(doc, (n) => n.type === "text" && n.text === text && (n.marks ?? []).some((m) => m.type === markType)) !== null;
}

/** The first node of this type anywhere in the doc, or `null`. */
function findNodeOfType(doc: DocNode, type: string): DocNode | null {
  return findNode(doc, (n) => n.type === type);
}

// ---------------------------------------------------------------------------
// Page-driving helpers
// ---------------------------------------------------------------------------

/** Clicks "New Post", waits for the editor route, and returns the new post's id (from the URL) and
 *  its auto-assigned slug (read off the slug field once the post has loaded). */
async function openFreshPost(page: Page): Promise<{ id: string; slug: string }> {
  await page.goto("/admin/posts");
  await page.getByRole("button", { name: "New Post" }).click();
  await expect(page).toHaveURL(/\/admin\/posts\/[^/]+$/);
  const id = page.url().split("/").pop()!;
  const slug = await page.getByLabel("URL slug").inputValue();
  return { id, slug };
}

/** The single starter paragraph below the (non-deletable) title node — see `post-title-extension.ts`.
 *  A fresh post's body is exactly this one empty `<p>`, so it is the reliable place to click to start
 *  typing into the BODY rather than the title. `.ProseMirror` is TipTap's own stable root class, not
 *  an app styling class that a redesign could rename. */
function bodyParagraph(page: Page) {
  return page.locator('[data-agent-element="post-body"] .ProseMirror p').last();
}

async function clickToolbar(page: Page, title: string): Promise<void> {
  await page.getByTitle(title, { exact: true }).click();
}

/**
 * Selects an entire (one-word) paragraph with a TRIPLE CLICK and clicks a toolbar button — every
 * word this suite marks lives alone on its own paragraph (see the two tests below), so "select the
 * whole line" is exactly "select the word".
 *
 * Two other selection strategies were tried and rejected live, in order, before this one — recorded
 * here so nobody re-discovers the same dead ends:
 *
 * 1. **`dblclick()` then click the toolbar immediately.** Applied NO mark to four or five of five
 *    words in a row, every run. `Toolbar`'s buttons carry no `onMouseDown={e => e.preventDefault()}`
 *    guard (the conventional rich-text-editor precaution against a button's own mousedown disturbing
 *    the editor's selection before its `onClick` runs), so this looked like exactly that race.
 * 2. **Same, plus `waitForFunction` on `window.getSelection()!.toString() === word` before clicking**
 *    (to confirm the race theory). This TIMED OUT outright: `window.getSelection()` inside this
 *    ProseMirror `contenteditable` never reported the double-clicked word's text at all, so whatever
 *    `dblclick()` selects here is not what the native Selection API reflects.
 * 3. **`Home` then `Shift+End`** (keyboard-only, to sidestep both unknowns above). `window.
 *    getSelection()` now correctly showed each word alone — but the SAVED document still showed
 *    every mark from every PRIOR word compounding onto every later one (Delta ended up bold+italic+
 *    strike+underline, only the last of which was its own button). The visible/DOM selection was
 *    right; whatever ProseMirror itself used to decide "add vs. remove this mark" was not reading it.
 *
 * A triple click is a single, real, synchronous mouse event ProseMirror's own click handling
 * intercepts directly (unlike two independent key presses whose effects the DOM Selection API and
 * ProseMirror's internal selection apparently didn't agree on in this editor) — confirmed live: every
 * mark below lands on exactly the word it was applied to, nothing more, nothing less, across repeated
 * runs.
 */
async function selectWordAndToggleMark(page: Page, word: string, toolbarTitle: string): Promise<void> {
  await page.getByText(word, { exact: true }).click({ clickCount: 3 });
  await clickToolbar(page, toolbarTitle);
}

async function saveAndWaitForConfirmation(page: Page, label: "Saved" | "Published" = "Saved"): Promise<void> {
  await page.getByRole("button", { name: label === "Published" ? "Publish" : /^Save/ }).click();
  // Scoped to `.save-ok` (`PostEditorHeader`'s own status span), not a bare `getByText` — the status
  // select ALSO has a literal `<option value="published">Published</option>`, and `getByText`
  // without that scope is a strict-mode violation the moment the label is "Published" (confirmed
  // live). `.save-ok` is the app's own semantic class for this exact feedback message, not a
  // brittle styling hook — there is no ARIA live-region role on it to prefer instead.
  await expect(page.locator(".save-ok")).toContainText(label, { timeout: 10_000 });
}

/** Re-fetches the post through the real authenticated admin API — the strongest available proof that
 *  a toolbar click's effect actually persisted, not just that the in-memory editor briefly showed it. */
async function fetchBodyJson(page: Page, id: string): Promise<DocNode> {
  const bodyJson = await page.evaluate(
    async ({ url }) => {
      const res = await fetch(url, { credentials: "same-origin" });
      const data = await res.json();
      return data.post.bodyJson;
    },
    { url: `${API_BASE}/workspaces/${WORKSPACE_ID}/posts/${id}` }
  );
  return bodyJson as DocNode;
}

test.describe("Post editor toolbar — click-to-persisted-JSON contract", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test("Bold, Italic, Strike, Underline, Code and Link marks apply to the selected word and persist", async ({ page }) => {
    const { id } = await openFreshPost(page);

    // Two phases, deliberately never interleaved. PHASE 1 is pure typing: one word per paragraph
    // (Enter between each — `getByText(word, {exact:true})` needs an ELEMENT whose own normalized
    // text equals `word` exactly, so each word gets its own paragraph rather than sharing one run-on
    // line). PHASE 2 is pure mark-toggling, with no Enter anywhere near it. Confirmed live why they
    // can't mix: toggling a mark on a selected word does not collapse that selection, and immediately
    // following it with Enter (even after an explicit `ArrowRight`/`End` collapse attempt) raced
    // ProseMirror's own selection sync often enough to delete the just-formatted word and leak its
    // mark forward as a stored mark onto everything typed afterward — observed compounding across
    // three separate runs (one word losing its text and a later word gaining 2-4 unintended marks
    // each time, a different word each run). Finishing all the typing FIRST removes Enter from the
    // picture entirely once marks start getting applied, which is the actual fix, not a particular
    // collapse key.
    await bodyParagraph(page).click();
    await page.keyboard.type("Alpha");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Bravo");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Charlie");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Delta");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Echo");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Foxtrot");

    await selectWordAndToggleMark(page, "Alpha", "Bold (⌘B)");
    await selectWordAndToggleMark(page, "Bravo", "Italic (⌘I)");
    await selectWordAndToggleMark(page, "Charlie", "Strikethrough");
    await selectWordAndToggleMark(page, "Delta", "Underline (⌘U)");
    await selectWordAndToggleMark(page, "Echo", "Inline code");

    page.once("dialog", (dialog) => dialog.accept("https://example.com/plugins"));
    await selectWordAndToggleMark(page, "Foxtrot", "Link");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    expect(hasMarkedText(doc, "Alpha", "bold"), "Bold button must produce a bold mark").toBe(true);
    expect(hasMarkedText(doc, "Bravo", "italic"), "Italic button must produce an italic mark").toBe(true);
    expect(hasMarkedText(doc, "Charlie", "strike"), "Strikethrough button must produce a strike mark").toBe(true);
    expect(hasMarkedText(doc, "Delta", "underline"), "Underline button must produce an underline mark").toBe(true);
    expect(hasMarkedText(doc, "Echo", "code"), "Inline code button must produce a code mark").toBe(true);

    const linkNode = findNode(doc, (n) => n.type === "text" && n.text === "Foxtrot" && (n.marks ?? []).some((m) => m.type === "link"));
    expect(linkNode, "Link button must produce a link mark").not.toBeNull();
    const linkMark = linkNode!.marks!.find((m) => m.type === "link") as { attrs?: { href?: string } };
    expect(linkMark.attrs?.href).toBe("https://example.com/plugins");
  });

  test("H1, H2 and H3 create heading nodes at the correct level, each ending Enter back at a plain paragraph", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Heading One");
    await clickToolbar(page, "Heading 1");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Heading Two");
    await clickToolbar(page, "Heading 2");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Heading Three");
    await clickToolbar(page, "Heading 3");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    for (const [text, level] of [
      ["Heading One", 1],
      ["Heading Two", 2],
      ["Heading Three", 3],
    ] as const) {
      const heading = findNode(doc, (n) => n.type === "heading" && n.attrs?.level === level && (n.content ?? []).some((c) => c.text === text));
      expect(heading, `"${text}" must be a level-${level} heading, not any other level`).not.toBeNull();
    }
  });

  test("the bullet-list and numbered-list buttons produce the correct list node, not each other's", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Item A");
    await clickToolbar(page, "Bullet list");
    // Enter continues the list with a new empty item; Enter again on an empty item is TipTap/
    // ProseMirror's standard "lift out of the list" behavior — exercised here as a real user action,
    // not asserted directly (the persisted JSON below is the actual proof).
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Item B");
    await clickToolbar(page, "Numbered list");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    const bulletList = findNodeOfType(doc, "bulletList");
    expect(bulletList, "the Bullet list button must produce a bulletList node").not.toBeNull();
    expect(findNode(bulletList!, (n) => n.text === "Item A"), "Item A's text must live inside the bulletList").not.toBeNull();

    const orderedList = findNodeOfType(doc, "orderedList");
    expect(orderedList, "the Numbered list button must produce an orderedList node, not a second bulletList").not.toBeNull();
    expect(findNode(orderedList!, (n) => n.text === "Item B"), "Item B's text must live inside the orderedList").not.toBeNull();
  });

  test("the Quote button produces a blockquote and the Code block button produces a codeBlock", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Quoted text");
    await clickToolbar(page, "Quote");
    // Exit the blockquote the same way a real author would (Enter on an empty trailing paragraph
    // lifts out of the block), then start the code block fresh.
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("const x = 1;");
    await clickToolbar(page, "Code block");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    const quote = findNodeOfType(doc, "blockquote");
    expect(quote, "the Quote button must produce a blockquote node").not.toBeNull();
    expect(findNode(quote!, (n) => n.text === "Quoted text")).not.toBeNull();

    const codeBlock = findNode(doc, (n) => n.type === "codeBlock" && (n.content ?? []).some((c) => c.text === "const x = 1;"));
    expect(codeBlock, "the Code block button must produce a codeBlock node, not an inline code mark").not.toBeNull();
  });

  test("the Divider button inserts a horizontalRule node between two paragraphs", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Before");
    await page.keyboard.press("Enter");
    await clickToolbar(page, "Divider");
    await page.keyboard.type("After");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    expect(findNodeOfType(doc, "horizontalRule"), "the Divider button must produce a horizontalRule node").not.toBeNull();
    expect(findNode(doc, (n) => n.text === "Before")).not.toBeNull();
    expect(findNode(doc, (n) => n.text === "After")).not.toBeNull();
  });

  test("each align button sets the current paragraph's textAlign attr to its own value, not a neighbor's", async ({ page }) => {
    const { id } = await openFreshPost(page);

    await bodyParagraph(page).click();
    await page.keyboard.type("Aligned text");

    for (const [title, align] of [
      ["Align center", "center"],
      ["Align right", "right"],
      ["Justify", "justify"],
    ] as const) {
      await clickToolbar(page, title);
      await saveAndWaitForConfirmation(page);
      const doc = await fetchBodyJson(page, id);
      const paragraph = findNode(doc, (n) => n.type === "paragraph" && (n.content ?? []).some((c) => c.text === "Aligned text"));
      expect(paragraph?.attrs?.textAlign, `"${title}" must set textAlign to "${align}"`).toBe(align);
    }

    await clickToolbar(page, "Align left");
    await saveAndWaitForConfirmation(page);
    const finalDoc = await fetchBodyJson(page, id);
    const finalParagraph = findNode(finalDoc, (n) => n.type === "paragraph" && (n.content ?? []).some((c) => c.text === "Aligned text"));
    // "left" is the CSS default the public renderer never emits as an explicit style
    // (`tiptap-render-contract.test.ts`'s own "paragraph, textAlign left" row) — what matters here is
    // only that it is no longer "center"/"right"/"justify", not the exact stored representation.
    expect(["left", null, undefined]).toContain(finalParagraph?.attrs?.textAlign ?? null);
  });

  test("Insert image by URL writes an image node carrying the exact URL and alt text typed into the prompts", async ({ page }) => {
    const { id } = await openFreshPost(page);
    const imageUrl = "https://example.com/cat.png";
    const altText = "A cat";

    page.on("dialog", (dialog) => {
      if (dialog.message().startsWith("Image URL")) void dialog.accept(imageUrl);
      else void dialog.accept(altText);
    });

    await bodyParagraph(page).click();
    await clickToolbar(page, "Insert image by URL");

    await saveAndWaitForConfirmation(page);
    const doc = await fetchBodyJson(page, id);

    const image = findNode(doc, (n) => n.type === "image" && n.attrs?.src === imageUrl);
    expect(image, "the image node must carry exactly the URL typed into the prompt").not.toBeNull();
    expect(image!.attrs?.alt).toBe(altText);
  });

  test("full chain: formatting applied through the toolbar, published, is present in the served public HTML", async ({ page, request }) => {
    const { id, slug } = await openFreshPost(page);

    // Two words, each alone on its own paragraph — same reasoning as the marks test above:
    // `getByText(word, {exact:true})` needs an element whose own text is exactly that word. Typing
    // finishes COMPLETELY before any mark gets toggled — see the marks test above for why Enter can
    // never safely follow a mark toggle in this editor.
    await bodyParagraph(page).click();
    await page.keyboard.type("Bold");
    await page.keyboard.press("Enter");
    await page.keyboard.type("link");

    await selectWordAndToggleMark(page, "Bold", "Bold (⌘B)");

    page.once("dialog", (dialog) => dialog.accept("https://example.com/full-chain"));
    await selectWordAndToggleMark(page, "link", "Link");

    // Centers whichever paragraph the cursor is in — "link", since it's the one just edited. The
    // assertion below only checks the STYLE exists in the served HTML, not which paragraph carries
    // it, so this is enough to prove the Align center button's own wiring.
    await clickToolbar(page, "Align center");

    // Publish (not Save): the public site only serves published posts — see
    // `PostEditorHeader`'s own "Publish" button, which saves and sets status in one action.
    await saveAndWaitForConfirmation(page, "Published");

    // Fetched via `request` (Playwright's own HTTP client, not `page.evaluate`/`fetch`): the public
    // site is served by the API server directly, a different origin from the admin SPA's Vite dev
    // server in this config, and `APIRequestContext` is not subject to the browser's same-origin
    // policy the way an in-page `fetch` would be.
    const publicUrl = `${API_BASE_URL}/${slug}`;
    const res = await request.get(publicUrl);
    expect(res.status(), `expected the published post to be publicly reachable at ${publicUrl}`).toBe(200);
    const html = await res.text();

    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain('<a href="https://example.com/full-chain">link</a>');
    expect(html).toMatch(/style="text-align:center"/);
  });
});
