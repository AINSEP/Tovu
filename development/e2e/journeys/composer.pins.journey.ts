// Todo 11: original bug pins consolidated by area. Browser execution is pending.
import { test } from "../support/bug-pin-fixtures.js";
import { PUBLIC_URL as PIN_PUBLIC_URL } from "../support/bug-pin-fixtures.js";
import { JOURNEY_ADMIN_PASSWORD as PIN_PASSWORD } from "../support/bug-pin-fixtures.js";
import { expect } from "../support/bug-pin-fixtures.js";
import { type Page } from "../support/bug-pin-fixtures.js";
import { type Route } from "../support/bug-pin-fixtures.js";
import { loginAsAdmin } from "../support/bug-pin-auth.js";
import { createAdminChatDriver } from "../support/admin-chat-driver.js";
import { type AdminChatDriver } from "../support/admin-chat-driver.js";
import assert from "node:assert/strict";
import { rm, truncate, writeFile } from "node:fs/promises";
import { type Locator } from "../support/bug-pin-fixtures.js";

// Preserve the retired configs' effective Chromium viewport (Desktop Chrome or browser default).
// Nested test.use and explicit resizes still win.
test.use({ viewport: { width: 1280, height: 720 } });

// Migrated from admin-composer-agent-plugin-chip.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-composer-agent-plugin-chip", () => {
/**
 * @file Deterministic, self-asserting proof that "the operator pins the UI/UX Design Agent Plugin
 * from the composer's '+' menu -> its real ref reaches the agent" actually works end to end on the
 * CLIENT side, without ever depending on what a model replies.
 *
 * Split deliberately into two halves that meet in the middle (this dispatch's own design
 * guidance): this file is HALF 1, the browser half. HALF 2
 * (`src/server/agent-daemon/__tests__/plugin-prompt-prefix.unit.test.ts`) proves the SERVER half —
 * that a resolved `pluginRefIds` array really does get turned into the real installed SKILL.md
 * text and prepended onto the prompt. Together they prove the whole chain without a single
 * assertion on generated model output, which would be non-deterministic and worthless as a gate.
 *
 * Three deterministic claims, all client-observable, none of them "what did the agent say back":
 *
 * 1. Selecting "UI/UX Design (Agent Plugin)" from the "+" menu renders a removable chip
 *    (`.jini-attachment-chip`, `SelectedAgentPluginTray.tsx`) and does NOT type anything into the
 *    composer textarea — `resolveComposerDiscoveryOutcome` (`AssistantDock.hooks.tsx:884-887`)
 *    returns before ever touching the draft for a `pluginRefId` capability.
 * 2. Clicking the chip's × (`button[aria-label="Remove UI/UX Design (Agent Plugin)"]`) removes it.
 * 3. On send, the REAL outbound `POST /api/runs` body's `contextRef` (a JSON string,
 *    `assistant-transport.ts`'s `buildLocalCliContextRef`) contains `pluginRefIds: ["ui-ux-design"]`
 *    — intercepted via `page.route`, asserted directly against the parsed request body, never
 *    against a rendered reply.
 *
 * The `POST /api/runs` request is intercepted and fulfilled with a synthetic run id rather than
 * allowed to reach the real agent daemon: per this repo's own architecture (`ADR-049` — Tovu
 * launches real coding-agent CLI subprocesses, not an API), letting the request through would
 * spawn a real CLI process on whatever machine runs this suite, which is exactly the
 * non-deterministic dependency this split is designed to avoid. Capturing the request body BEFORE
 * fulfilling it proves the browser really sent the right payload, independent of whether a daemon
 * or CLI is even installed on the runner.
 */
async function openDock(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("button.chat-fab").click();
  const dock = page.locator(".admin-chat-dock");
  await expect(dock).not.toHaveAttribute("hidden", "");
}

/** The row's visible LABEL — `SelectedAgentPluginTray`'s chip renders exactly this text, and its
 *  `Remove ${label}` aria-label is an exact match on it. The menu ROW itself is a different story
 *  (see {@link pinAgentPluginChip}'s own comment): its accessible NAME is not this string alone. */
const AGENT_PLUGIN_MENU_ITEM_NAME = "UI/UX Design (Agent Plugin)";
const AGENT_PLUGIN_REF_ID = "ui-ux-design";

async function openAddContextMenu(page: Page): Promise<void> {
  await page.locator('button[aria-label="Add context"]').click();
  await expect(page.locator(".jini-composer-discovery-menu")).toBeVisible();
}

async function pinAgentPluginChip(page: Page): Promise<void> {
  await openAddContextMenu(page);
  // NOT an exact-name match: `ComposerDiscoveryMenu.tsx` renders this row's description in a child
  // `<small aria-describedby=...>`, and because that text is a CHILD of the button (not merely
  // referenced from outside it), the accname algorithm folds it into the button's own accessible
  // NAME — confirmed live via this test's own first failed run, whose page snapshot showed the row's
  // real accessible name as "UI/UX Design (Agent Plugin) UI/UX Design Agent Plugin bundled with
  // Tovu — pins its skill as context for the agent", not the bare label. A substring match on the
  // label alone is still unambiguous: the sibling "UI/UX Design (Skill)" row's full name does not
  // contain this string.
  await page.getByRole("menuitem", { name: AGENT_PLUGIN_MENU_ITEM_NAME }).click();
}

/**
 * The OTHER selection path — typing `/` directly into the composer textarea — proven separately
 * from {@link pinAgentPluginChip}'s "+" menu because `Composer.tsx` resolves the two through
 * different functions that used to disagree: `selectPlusItem` guards on `item.insertText ? ... :
 * composer.draft` (falsy either way when `insertText` is absent, draft untouched), but
 * `selectSlashItem` calls `replaceComposerSlashTrigger(draft, match.item.insertText ??
 * match.item.label)` — an absent `insertText` fell back to `label`, typing the literal
 * "UI/UX Design (Agent Plugin)" string into the draft. This is the regression the "+" menu test
 * above never caught, because it never exercises this function.
 *
 * "design" is a safe filter word: while the command word is still being typed (no space yet),
 * `filterComposerDiscovery` fuzzy-matches every item's `label`/`description`/`kind`/`keywords`
 * (`composer-discovery.ts`'s `matchesFuzzyCommand`), and only two bundled items contain "design"
 * anywhere in that text — this row and the sibling "UI/UX Design (Skill)" row — so both surface
 * and the same unambiguous label substring `pinAgentPluginChip` already relies on disambiguates
 * them here too.
 */
async function pinAgentPluginChipViaSlash(page: Page): Promise<void> {
  const textarea = page.locator("textarea.jini-composer-input");
  await textarea.click();
  await textarea.pressSequentially("/design");
  await expect(page.locator("#jini-composer-slash-menu")).toBeVisible();
  await page.getByRole("option", { name: AGENT_PLUGIN_MENU_ITEM_NAME }).click();
  // A fuzzy command selection completes the trigger; the exact command invokes on selection.
  await expect(textarea).toHaveValue("/ui-ux-design");
  await page.getByRole("option", { name: AGENT_PLUGIN_MENU_ITEM_NAME }).click();
}

test.describe("admin composer — Agent Plugin chip pin/remove/send wiring", () => {
  test("pinning the Agent Plugin row renders a removable chip and types nothing into the draft", async ({ page }) => {
    await openDock(page);
    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.waitFor({ state: "visible" });
    await expect(textarea).toHaveValue("");

    await pinAgentPluginChip(page);

    const chip = page.locator(".jini-attachment-chip", { hasText: AGENT_PLUGIN_MENU_ITEM_NAME });
    await expect(chip).toBeVisible();
    await expect(chip.locator(".jini-attachment-chip-name")).toHaveText(AGENT_PLUGIN_MENU_ITEM_NAME);

    // The load-bearing negative: the old behavior typed the label into the draft as inert text.
    // This is the regression this whole feature chain replaced — the chip must be the only effect.
    await expect(textarea).toHaveValue("");
  });

  test("the chip's remove button clears the pinned plugin ref", async ({ page }) => {
    await openDock(page);
    await pinAgentPluginChip(page);

    const chip = page.locator(".jini-attachment-chip", { hasText: AGENT_PLUGIN_MENU_ITEM_NAME });
    await expect(chip).toBeVisible();

    await page.getByRole("button", { name: `Remove ${AGENT_PLUGIN_MENU_ITEM_NAME}` }).click();

    await expect(chip).toHaveCount(0);
    const captured = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/runs");
    await page.route("**/api/runs", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ run: { id: "removed-plugin-run", state: "running" } }) });
    });
    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.fill("send after removing the plugin");
    await textarea.press("Enter");
    const context = JSON.parse((await captured).postDataJSON().contextRef) as Record<string, unknown>;
    expect(context).not.toHaveProperty("pluginRefIds");
  });

  test("sending with the chip pinned puts pluginRefIds on the real outbound /api/runs request body", async ({ page }) => {
    await openDock(page);
    await pinAgentPluginChip(page);
    await pinAgentPluginChip(page);
    const chip = page.locator(".jini-attachment-chip", { hasText: AGENT_PLUGIN_MENU_ITEM_NAME });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveCount(1);

    let capturedContextRef: Record<string, unknown> | null = null;
    let resolveCaptured!: () => void;
    const captured = new Promise<void>((resolve) => {
      resolveCaptured = resolve;
    });

    // Intercepts ONLY the exact `/api/runs` POST that starts a run — the trailing-segment routes
    // (`/api/runs/:id/events`, `/api/runs/:id/cancel`) do not match this glob (it requires the URL
    // to END at "/api/runs"), so this leaves this test's own SSE reattach path alone.
    let runNumber = 0;
    await page.route("**/api/runs/*/events", (route) => route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: 'event: end\ndata: {"status":"succeeded","code":0}\n\n',
    }));
    // An SSE end finishes an attempt; the durable saved message now finishes the logical run.
    await page.route("**/api/runs/e2e-fake-run-*/recover", (route) => {
      const runId = new URL(route.request().url()).pathname.split("/").at(-2)!;
      return route.fulfill({ json: { message: {
        id: `message-${runId}`, role: "assistant", content: "", events: [],
        runId, runStatus: "succeeded",
      } } });
    });
    await page.route("**/api/runs", async (route: Route) => {
      const request = route.request();
      if (request.method() !== "POST") {
        await route.continue();
        return;
      }
      const body = request.postDataJSON() as { contextRef: string; agentId?: string };
      capturedContextRef = JSON.parse(body.contextRef) as Record<string, unknown>;
      resolveCaptured();
      // Fulfilled with a synthetic run rather than let the real daemon start a real agent CLI
      // subprocess — see this file's own module doc for why.
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ run: { id: `e2e-fake-run-${++runNumber}`, state: "running" } }),
      });
    });

    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.click();
    await textarea.pressSequentially("does the pinned plugin ref reach the outbound request?");
    await page.locator('button[aria-label="Send"]').click();

    await captured;
    expect(capturedContextRef).not.toBeNull();
    expect((capturedContextRef as unknown as Record<string, unknown>)["pluginRefIds"]).toEqual([AGENT_PLUGIN_REF_ID]);
    await expect(chip).toHaveCount(1);
    await textarea.fill("does the same pinned plugin reach the next turn?");
    await expect(page.locator('button[aria-label="Send"]')).toBeEnabled();
    const secondRequest = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/runs");
    await textarea.press("Enter");
    const secondBody = (await secondRequest).postDataJSON() as { contextRef: string };
    expect(JSON.parse(secondBody.contextRef).pluginRefIds).toEqual([AGENT_PLUGIN_REF_ID]);
    await expect.poll(() => runNumber).toBe(2);
  });

  test("selecting the Agent Plugin row via the SLASH trigger pins the chip and leaves the draft empty", async ({
    page,
  }) => {
    await openDock(page);
    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.waitFor({ state: "visible" });
    await expect(textarea).toHaveValue("");

    await pinAgentPluginChipViaSlash(page);

    const chip = page.locator(".jini-attachment-chip", { hasText: AGENT_PLUGIN_MENU_ITEM_NAME });
    await expect(chip).toBeVisible();

    // The load-bearing regression assertion: `selectSlashItem` (Jini's `Composer.tsx`) falls back
    // to `match.item.label` when `insertText` is absent, so this specific path — untested by the
    // "+" menu tests above — is the one that actually typed "UI/UX Design (Agent Plugin)" into the
    // draft before this fix (`composer-capabilities.ts`'s `insertText: ""` on this row).
    await expect(textarea).toHaveValue("");
  });
});
});

// Migrated from admin-composer-attachment-picker.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-composer-attachment-picker", () => {
/**
 * @file Regression coverage for "certain files, `.md` in particular, won't upload as chat
 * attachments" — the admin composer's "+" file picker used to pass `attachmentAccept="image/*"`
 * down to `<ChatPane>`, so the "+" button's native OS file dialog filtered out (greyed out, or on
 * some platforms hid outright) any file whose MIME type didn't start with `image/`. macOS reports
 * an EMPTY MIME type for `.md`, so a MIME-only `accept` matched nothing and the file was
 * unselectable — not a server rejection, not a size problem, just the native dialog offering no
 * way to pick it. The fix removed the prop entirely rather than growing an allowlist, because the
 * upload pipeline is kind-agnostic end to end: `@jini-ai/http-kit`'s `attachments.ts` sniffs
 * `detectAttachmentKind` from the leading bytes and stores `'image' | 'file'`, never rejecting on
 * MIME or extension.
 *
 * ## Why this spec drives the FILE-INPUT path, not drag-and-drop
 *
 * `accept` never applies to drag-and-drop, in any browser, and there is no MIME/extension
 * filtering anywhere in the drop path either. A `.md` dragged onto the composer already worked
 * throughout the entire bug — a drag-drop-only test would have been green the whole time this was
 * broken. Every case below drives the composer's real `<input type="file">` via `setInputFiles`,
 * the actual file-picker code path.
 *
 * ## Why the `accept`-attribute check is the ONLY assertion that can catch THIS regression
 *
 * Playwright's `setInputFiles` sets a `<input type="file">`'s file list directly over CDP — it
 * never opens a native OS dialog, so it bypasses `accept` filtering entirely, on every browser and
 * platform. Verified live for this spec (a throwaway `page.setContent` with `accept="image/*"`
 * followed by `setInputFiles(".md")`): the browser accepted the file anyway. That means every
 * upload-succeeds test in this file — the whole kind matrix below included — would have passed
 * throughout this bug's entire lifetime too, because none of them exercise the native-dialog gate
 * that was actually broken. The one assertion that is load-bearing for THIS bug is "the composer's
 * file input carries no accept filter", which reads the real rendered `accept` attribute instead.
 * That attribute always belongs to the REAL composer's own input — every case here drives it
 * through the shared driver's `ui.fileInput`, never a synthetic input built for this test.
 *
 * ## Selector durability
 *
 * The composer's file input, its attachment tray, and its per-attachment chips carry real test
 * hooks: `data-testid="composer-attachment-input"` on the input (both of Jini's two composer render
 * branches, since which one is live depends on `hasDiscoveryItems` — Tovu's admin dock takes the
 * discovery branch, but the hook is on both so this spec doesn't care which), `data-testid=
 * "attachment-chip"` plus `data-attachment-kind` (the raw `'image' | 'file'` the daemon produced)
 * and `data-attachment-name` (the exact post-sanitization name) on each chip, and `data-testid=
 * "composer-attachment-tray"` on the tray container. None of this file's locators depend on Jini's
 * package-internal styling class names (`.jini-attachment-chip-icon.is-*`, rendered-text matching)
 * or on `role="alert"`/`input[type="file"]` as a structural stand-in for a missing hook anymore.
 *
 * The kind matrix is still worth having, for a DIFFERENT reason: `kind` (`'image' | 'file'`, sniffed
 * server-side from the leading bytes) used to gate whether an attachment ever reached the agent at
 * all — `agent-daemon-server.ts`'s `imagePaths` filter previously narrated only `kind === 'image'`
 * attachments into the prompt, so a non-image file landed on disk but was invisible to the agent by
 * name. That server-side fix (and the real `createDiskAttachmentStore`/`register`/`claim` pipeline
 * proof that a binary PDF survives byte-for-byte and reaches `imagePaths` correctly where it used to
 * produce `[]`) is a separate agent's work, in `agent-daemon-server.ts:583` and its own test file —
 * this spec complements it from the client side: proving the COMPOSER's picker and upload path never
 * excludes a file by type, and that the daemon's byte-sniffed classification (not extension, not
 * browser MIME guess) is what the rendered chip reflects.
 *
 * ## Fixture design
 *
 * Every fixture is built in memory (`Buffer.from(...)`, a handful of bytes each) via
 * `setInputFiles`'s `{ name, mimeType, buffer }` form — nothing is committed to disk. Text/code/
 * config fixtures are a couple of lines of real content; image fixtures are the minimal byte
 * sequences `detectAttachmentKind`'s own signature matchers require (`hasPngSignature`,
 * `hasJpegSignature`, `hasGifSignature`, `hasWebpSignature` in `attachments.ts`) — a handful of
 * bytes, not a decodable image, since nothing in this pipeline ever renders or decodes the bytes,
 * only classifies them.
 *
 * ## Why the matrix is split into two logins, not one
 *
 * `createDaemonAttachmentUploader`'s default `maxAttachmentCount` is 10 files per composer batch,
 * and that batch persists for the life of one dock session (one `useChatPane` mount), not per
 * upload — so accumulating more than 10 real fixtures into one never-sent session would trip a real,
 * unrelated cap partway through the matrix. Splitting into two dock sessions (two logins) keeps each
 * group safely under 10 and, as a side effect, keeps this file's total login count (five, across the
 * whole suite) comfortably under `LOGIN_STRICT`'s real 10-requests/60s-per-IP limit
 * (`rate-limit.ts`) — batching by session rather than giving every matrix row its own `test()` (and
 * therefore its own login) was a deliberate choice for that reason, not just speed.
 */

/** One row of the file-kind matrix. Adding coverage for a new extension is exactly one entry. */
interface AttachmentMatrixCase {
  readonly label: string;
  readonly fileName: string;
  /** Documents the real-world MIME a browser might report — never sent as-is (the uploader always
   *  posts `content-type: application/octet-stream`; see `create-daemon-attachment-uploader.ts`'s
   *  own comment for why), so this has no effect on the assertion, only on this table's readability. */
  readonly mimeType: string;
  readonly content: Buffer;
  /** The raw `attachment.kind` the daemon is expected to sniff, read back via each chip's own
   *  `data-attachment-kind` attribute. */
  readonly expectedKind: "image" | "file";
}

function textFixture(bytes: string): Buffer {
  return Buffer.from(bytes, "utf8");
}

/** A minimal valid 1x1 transparent PNG — a real, complete PNG, not just a signature. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
/** `hasJpegSignature` only checks the first 3 bytes (SOI + APP0 marker start); three more are kept
 *  here purely for readability, not because the check needs them. */
const JPEG_SIGNATURE_ONLY = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
/** `hasGifSignature` decodes exactly the first 6 bytes and compares against 'GIF87a'/'GIF89a'. */
const GIF_SIGNATURE_ONLY = Buffer.from("GIF89a", "latin1");
/** `hasWebpSignature` needs >=12 bytes: 'RIFF' at [0,4), 'WEBP' at [8,12) — the 4 bytes in between
 *  (a real RIFF chunk size) are never read by the matcher, so they're left zeroed. */
const WEBP_SIGNATURE_ONLY = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP", "ascii"),
]);
const PDF_MINIMAL = textFixture("%PDF-1.4\n%%EOF\n");

/** Text/markup, code, and config kinds — 9 rows, one login's worth (see module doc). */
const TEXT_CODE_CONFIG_MATRIX: readonly AttachmentMatrixCase[] = [
  { label: "Markdown", fileName: "regression.md", mimeType: "" /* empty on macOS — the actual bug */, content: textFixture("# fixture\nmarkdown attachment\n"), expectedKind: "file" },
  { label: "plain text", fileName: "regression.txt", mimeType: "text/plain", content: textFixture("plain text attachment\n"), expectedKind: "file" },
  { label: "CSV", fileName: "regression.csv", mimeType: "text/csv", content: textFixture("col1,col2\nval1,val2\n"), expectedKind: "file" },
  { label: "TypeScript", fileName: "regression.ts", mimeType: "video/mp2t" /* macOS's historical (wrong) association */, content: textFixture("export const marker = 'ts-attachment';\n"), expectedKind: "file" },
  { label: "TSX", fileName: "regression.tsx", mimeType: "", content: textFixture("export const Marker = () => null;\n"), expectedKind: "file" },
  { label: "JSON", fileName: "regression.json", mimeType: "application/json", content: textFixture('{"marker":"json-attachment"}'), expectedKind: "file" },
  { label: "shell script", fileName: "regression.sh", mimeType: "application/x-sh", content: textFixture("#!/bin/sh\necho marker\n"), expectedKind: "file" },
  { label: "YAML", fileName: "regression.yaml", mimeType: "application/yaml", content: textFixture("marker: yaml-attachment\n"), expectedKind: "file" },
  { label: "TOML", fileName: "regression.toml", mimeType: "application/toml", content: textFixture('marker = "toml-attachment"\n'), expectedKind: "file" },
];

/** Real images (correct magic bytes, so each must classify `'image'`) plus a binary non-image and
 *  two filename edge cases — 7 name-matchable rows, one login's worth. A third edge case (a unicode
 *  filename) is exercised separately below this array, in the same test — see that step's own
 *  comment for why. */
const IMAGE_BINARY_AND_NAME_MATRIX: readonly AttachmentMatrixCase[] = [
  { label: "PNG (real signature)", fileName: "regression.png", mimeType: "image/png", content: PNG_1PX, expectedKind: "image" },
  { label: "JPEG (real signature)", fileName: "regression.jpg", mimeType: "image/jpeg", content: JPEG_SIGNATURE_ONLY, expectedKind: "image" },
  { label: "GIF (real signature)", fileName: "regression.gif", mimeType: "image/gif", content: GIF_SIGNATURE_ONLY, expectedKind: "image" },
  { label: "WEBP (real signature)", fileName: "regression.webp", mimeType: "image/webp", content: WEBP_SIGNATURE_ONLY, expectedKind: "image" },
  { label: "PDF (binary, non-image)", fileName: "regression.pdf", mimeType: "application/pdf", content: PDF_MINIMAL, expectedKind: "file" },
  { label: "no extension at all", fileName: "regression-no-extension", mimeType: "", content: textFixture("no extension attachment\n"), expectedKind: "file" },
  { label: "filename with spaces", fileName: "regression file with spaces.txt", mimeType: "text/plain", content: textFixture("spaces in the name\n"), expectedKind: "file" },
];

/** Drives one matrix row through the real picker and asserts the resulting chip's daemon-reported
 *  kind — not just that the upload returned success. Wrapped in `test.step` so each row shows up as
 *  its own pass/fail line in the report despite sharing one login with its group. */
async function runMatrixCase(
  { chat, matrixCase }: { chat: AdminChatDriver; matrixCase: AttachmentMatrixCase },
  _optional = {},
): Promise<void> {
  await test.step(matrixCase.label, async () => {
    await chat.attach({ files: [{
      name: matrixCase.fileName,
      mimeType: matrixCase.mimeType,
      buffer: matrixCase.content,
    }] });
    const chip = chat.ui.attachmentChip({ name: matrixCase.fileName });
    await expect(chip).toBeVisible({ timeout: 15_000 });
    // Reads the daemon's real classification directly off the chip's own attribute — no more
    // inferring it from a `.jini-attachment-chip-icon.is-*` presentational CSS suffix.
    await expect(chip).toHaveAttribute("data-attachment-kind", matrixCase.expectedKind);
    await expect(chat.ui.errors).toHaveCount(0);
  });
}

test.describe("admin composer — attachment file picker excludes no file type", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("the composer's file input carries no accept filter, so the OS dialog cannot exclude any file", async ({
    page,
  }) => {
    const chat = createAdminChatDriver({ page });
    await chat.open();

    const accept = await chat.ui.fileInput.getAttribute("accept");

    // The load-bearing regression assertion (see this file's module doc for why it's the only one
    // that can be). Falsy covers both `null` (React omits the attribute entirely when the prop is
    // `undefined`) and `""`, so this doesn't silently start passing again if a future refactor
    // swaps one for the other.
    expect(accept).toBeFalsy();
  });

  test("text, code, and config files all upload through the picker and classify as 'file'", async ({ page }) => {
    const chat = createAdminChatDriver({ page });
    await chat.open();
    // One upload must start at the visible action: setting the hidden input alone cannot catch
    // a menu item whose input.click() wiring was removed.
    const markdown = TEXT_CODE_CONFIG_MATRIX[0]!;
    await chat.attach({ files: [{ name: markdown.fileName, mimeType: markdown.mimeType, buffer: markdown.content }] }, { via: "picker" });
    await expect(chat.ui.attachmentChip({ name: markdown.fileName })).toBeVisible({ timeout: 15_000 });
    await expect(chat.ui.attachmentChip({ name: markdown.fileName })).toHaveAttribute("data-attachment-kind", "file");
    await expect(chat.ui.errors).toHaveCount(0);
    for (const matrixCase of TEXT_CODE_CONFIG_MATRIX.slice(1)) await runMatrixCase({ chat, matrixCase });
    // 9 successful uploads in one session — under the 10-per-batch cap this suite is deliberately
    // staying under (see module doc).
    await expect(chat.ui.attachmentChips).toHaveCount(TEXT_CODE_CONFIG_MATRIX.length);
  });

  test("real images classify as 'image', a binary non-image and odd filenames still classify as 'file'", async ({
    page,
  }) => {
    const chat = createAdminChatDriver({ page });
    await chat.open();
    for (const matrixCase of IMAGE_BINARY_AND_NAME_MATRIX) await runMatrixCase({ chat, matrixCase });

    // The unicode/emoji filename case, run separately: `data-attachment-name` now exposes the exact
    // post-sanitization name, so this can assert the real landed value directly instead of falling
    // back to a count-delta. `sanitizeAttachmentName` (`attachments.ts`) replaces every
    // non-`[a-zA-Z0-9._ -]` Unicode code point with a single `_`, so
    // "regression-🚀-résumé-测试.txt" becomes "regression-_-r_sum_-__.txt" — worked through
    // character by character: "regression" and both "-" survive; 🚀 -> "_"; "r" survives; each "é"
    // -> "_" (leaving "r_sum_"); "测" and "试" each -> "_"; ".txt" survives.
    await test.step("filename with unicode and emoji", async () => {
      await chat.attach({ files: [{
        name: "regression-🚀-résumé-测试.txt",
        mimeType: "text/plain",
        buffer: textFixture("unicode filename attachment\n"),
      }] });
      const chip = chat.ui.attachmentChip({ name: "regression-_-r_sum_-__.txt" });
      await expect(chip).toBeVisible({ timeout: 15_000 });
      await expect(chip).toHaveAttribute("data-attachment-kind", "file");
      await expect(chat.ui.errors).toHaveCount(0);
    });

    await expect(chat.ui.attachmentChips).toHaveCount(IMAGE_BINARY_AND_NAME_MATRIX.length + 1);
  });

  test("a zero-byte attachment is rejected by the daemon, with no chip added", async ({ page }) => {
    const chat = createAdminChatDriver({ page });
    await chat.open();

    // Passes the client-side size pre-check (0 bytes is never `> maxAttachmentBytes`), so this is
    // a REAL round trip to the daemon, which rejects it itself: `handleAttachmentUpload`
    // (`attachments.ts`) checks `upload.size === 0` after streaming and answers 400
    // `{ error: { message: 'Attachment is empty' } }` before ever calling `detectAttachmentKind` —
    // an empty file is rejected outright rather than classified. A naive "does the picker accept
    // any file" implementation could easily let this one through as a phantom zero-byte chip.
    await chat.attach({ files: [{
      name: "regression-empty.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(0),
    }] });

    const alert = chat.ui.errors;
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Attachment is empty");
    await expect(chat.ui.attachmentChips).toHaveCount(0);
  });

  test("a file over the 50 MB per-attachment cap is rejected before any upload request, with no chip added", async ({
    page,
  }, testInfo) => {
    const chat = createAdminChatDriver({ page });
    await chat.open();

    // Historical pin: 21 MB > `createDaemonAttachmentUploader`'s default 20 MB `maxAttachmentBytes`
    // (`create-daemon-attachment-uploader.ts`), built in-memory rather than committed as a fixture
    // file — this check runs entirely client-side against `File.size` before any `fetch` is issued,
    // so a real 20 MB+ file on disk would prove nothing an in-memory buffer of the same size
    // doesn't already prove, at the cost of a 20+ MB commit.
    // The host now overrides that default to the owner's 50 MiB per-file cap (2026-09-21).
    const oversizeBytes = 51 * 1024 * 1024;
    let uploadRequests = 0;
    await page.route("**/api/attachments*", async (route) => {
      uploadRequests += 1;
      await route.continue();
    });

    // Above 50 MiB Playwright requires a path rather than an in-memory payload. A sparse,
    // per-test file preserves the real File.size check without committing a large fixture.
    const oversizePath = testInfo.outputPath("regression-oversize.bin");
    try {
      await writeFile(oversizePath, "");
      await truncate(oversizePath, oversizeBytes);
      await chat.attach({ files: [{ path: oversizePath }] });
    } finally {
      await rm(oversizePath, { force: true });
    }

    const alert = chat.ui.errors;
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("50 MB");
    await expect(chat.ui.attachmentChips).toHaveCount(0);
    // The real proof this is a client-side pre-check, not a slow/failed network round trip: the
    // daemon was never even asked.
    expect(uploadRequests).toBe(0);
  });
});
});

// Migrated from admin-composer-discovery-menu-overlap.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-composer-discovery-menu-overlap", () => {
/**
 * @file Composer discovery/slash-menu popover overlap + dismissal, browser-verified 2026-08-21.
 *
 * Owner-reported bugs (screenshots): the "+" Add Context popover and the "/"-triggered slash
 * palette rendered in the wrong place — not as a compact card floating above the input, but
 * overlapping/covering the textarea itself and taking over the dock — with no way to dismiss
 * either one short of reloading.
 *
 * Root cause (`@jini-ai/chat`'s `packages/chat/src/react/features/chat-pane/styles.ts`): both
 * popovers anchored their `position: absolute; bottom: ...` off a small element sitting at the
 * BOTTOM of `.jini-composer` — the discovery popover off its own trigger-button wrapper
 * (`.jini-composer-discovery`, itself inside the footer), the slash popover off a flat `bottom:
 * 48px` measured from the composer's own bottom edge. Either anchor point sits right around the
 * textarea/footer seam, so a popover taller than a couple of rows grows upward straight over the
 * textarea — reproduced live via Playwright's own click failing with "intercepts pointer events"
 * on the textarea while the popover was open (same failure shape as
 * `admin-fab-position.spec.ts`'s Bug 5). Fixed by anchoring both off `.jini-composer` itself
 * (`bottom: calc(100% + 6px)`), which renders them fully above the textarea AND the footer, plus a
 * document-level outside-click handler (`Composer.tsx`) neither popover had before.
 *
 * This spec proves the fix geometrically (bounding-box non-overlap) and behaviorally (a real click
 * into the textarea succeeds and dismisses the popover) — the two things unit tests running under
 * jsdom cannot check, since jsdom performs no real CSS layout. The keyboard/ARIA/filtering side of
 * this same bug fix (Escape, `aria-describedby`, hover-title descriptions, typeahead narrowing) is
 * covered instead by `Composer.test.tsx` in the Jini repo, where jsdom + Testing Library is the
 * right tool.
 *
 * No `waitForLoadState("networkidle")` — same rationale as `admin-fab-position.spec.ts`: it never
 * resolves against this admin app's dev tooling.
 */

const TEXTAREA_SELECTOR = "textarea.jini-composer-input";

test.describe("admin composer discovery popovers float above the input, not over it", () => {
  test("the + Add Context popover does not overlap the textarea, and a real click into the textarea reaches it and dismisses the popover", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    await page.locator('button[aria-label="Add context"]').click();
    const menu = page.locator(".jini-composer-discovery-menu");
    await expect(menu).toBeVisible();

    const textarea = page.locator(TEXTAREA_SELECTOR);
    const menuBox = await menu.boundingBox();
    const textareaBox = await textarea.boundingBox();
    assert(menuBox, "discovery popover bounding box must be measurable");
    assert(textareaBox, "textarea bounding box must be measurable");

    // --- Check 1: no rectangle overlap between the popover and the textarea. ---
    const noOverlap =
      menuBox.x + menuBox.width <= textareaBox.x ||
      textareaBox.x + textareaBox.width <= menuBox.x ||
      menuBox.y + menuBox.height <= textareaBox.y ||
      textareaBox.y + textareaBox.height <= menuBox.y;
    expect(
      noOverlap,
      `discovery popover box ${JSON.stringify(menuBox)} must not overlap textarea box ${JSON.stringify(textareaBox)}`
    ).toBe(true);

    // --- Check 2: a real click reaches the textarea (this is the bug's own original failure
    // signature — Playwright's `.click()` fails outright with "intercepts pointer events" if
    // something still covers the target, so no manual try/catch is needed here). ---
    await textarea.click({ timeout: 8_000 });
    await textarea.type("regression check for the discovery popover overlap");

    // --- Check 3 (dismissal): that same click, being outside the popover's own wrapper, must have
    // closed it — this popover previously had no click-outside affordance at all. ---
    await expect(menu).not.toBeVisible();
  });

  test("the slash-command palette does not overlap the textarea and Escape dismisses it", async ({ page }) => {
    await loginAsAdmin(page);
    await page.setViewportSize({ width: 1280, height: 900 });

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    const textarea = page.locator(TEXTAREA_SELECTOR);
    await textarea.click();
    await textarea.pressSequentially("/");

    const palette = page.locator("#jini-composer-slash-menu");
    await expect(palette).toBeVisible();

    const paletteBox = await palette.boundingBox();
    const textareaBox = await textarea.boundingBox();
    assert(paletteBox, "slash palette bounding box must be measurable");
    assert(textareaBox, "textarea bounding box must be measurable");

    const noOverlap =
      paletteBox.x + paletteBox.width <= textareaBox.x ||
      textareaBox.x + textareaBox.width <= paletteBox.x ||
      paletteBox.y + paletteBox.height <= textareaBox.y ||
      textareaBox.y + textareaBox.height <= paletteBox.y;
    expect(
      noOverlap,
      `slash palette box ${JSON.stringify(paletteBox)} must not overlap textarea box ${JSON.stringify(textareaBox)}`
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect(palette).not.toBeVisible();
    await expect(dock).toBeVisible();

    // Escape keeps the draft and dismisses its palette until an edit; filling the same "/"
    // does not fire React's onChange. Clear and retype the trigger as the user would.
    await textarea.fill("");
    await textarea.pressSequentially("/");
    await expect(palette).toBeVisible();
    await page.setViewportSize({ width: 1000, height: 800 });
    await expect.poll(async () => {
      const menu = await palette.boundingBox();
      const input = await textarea.boundingBox();
      if (!menu || !input) return false;
      return menu.y + menu.height <= input.y && menu.x >= 0 && menu.x + menu.width <= 1000;
    }).toBe(true);
    await page.locator(".page-title").first().click();
    await expect(palette).not.toBeVisible();
  });
});
});

// Migrated from admin-composer-discovery-menu-scroll.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-composer-discovery-menu-scroll", () => {
/**
 * @file Composer discovery/slash-menu phantom-scroll regression, browser-verified 2026-08-21.
 *
 * Owner-reported bug (screenshot): a popover near/over its own 280px cap, scrolled to the end,
 * showed the last few real rows followed by a large block of empty white space filling the rest of
 * the box — as if the menu had a fixed/minimum height instead of sizing to its content. Reproduced
 * live against the exact three trailing tool-catalog rows from the owner's screenshot
 * (`forms_create_definition`, `forms_update_definition`, `taxonomy_assign_terms`) before this fix
 * landed; screenshots retained outside this repo (session scratchpad, not committed).
 *
 * Root cause (`@jini-ai/chat`'s `packages/chat/src/react/features/chat-pane/styles.ts`):
 * `.jini-composer-discovery-description` (the per-row hover tooltip added in Jini commit
 * `12f35dff`) is `position: absolute; top: 100%` on a row that is `position: relative`
 * (`.jini-composer-discovery-item`). At rest it was hidden only by `opacity: 0` — the box kept its
 * FULL natural size (routinely 50-260px tall for a real description), just invisible. An
 * absolutely-positioned descendant still counts toward its scrolling ancestor's scrollable overflow
 * region even while invisible, so every row silently taxed the popover with its own tooltip-height
 * of scrollable NOTHING below it (measured live: `scrollHeight` 501px against a 242px
 * `clientHeight` for one 6-row list) — scrolling to the end of an overflowing list landed on that
 * phantom space instead of the last real row. Fixed by collapsing the tooltip itself at rest
 * (`max-height: 0; overflow: hidden;` plus zeroed padding/border, restored only on
 * `:hover`/`:focus-visible`) rather than only hiding it visually — the node stays in the DOM with
 * real text at all times, so `aria-describedby` is unaffected either way.
 *
 * This spec proves the fix geometrically, using ONLY today's product-decided bundled catalog (no
 * re-wiring of the unwired tool-catalog source needed): the "+" Add Context menu's six bundled
 * groups (Files, Plugins, Agent Plugins, Skills, MCP, Tools) already need more than 280px of real
 * vertical space, so the popover already hits its `max-height` cap and scrolls on every run — the
 * exact overflow condition the bug lived in. jsdom cannot check this: it performs no real CSS
 * layout, so `scrollHeight`/`getBoundingClientRect` are meaningless there. The keyboard/ARIA side of
 * this same row (`aria-describedby` resolving regardless of hover state) is unaffected by this fix
 * and stays covered by `Composer.test.tsx` in the Jini repo.
 *
 * No `waitForLoadState("networkidle")` — same rationale as the sibling
 * `admin-composer-discovery-menu-overlap.spec.ts`: it never resolves against this admin app's dev
 * tooling.
 */

test.describe("admin composer discovery popover has no phantom scroll space from hidden hover-tooltip descriptions", () => {
  test("scrolling the + Add Context popover to its end reveals the last real row flush with the box's own bottom edge, not a blank block", async ({ page }) => {
    await loginAsAdmin(page);

    await page.locator("button.chat-fab").click();
    const dock = page.locator(".admin-chat-dock");
    await expect(dock).not.toHaveAttribute("hidden", "");

    await page.locator('button[aria-label="Add context"]').click();
    const menu = page.locator(".jini-composer-discovery-menu");
    await expect(menu).toBeVisible();

    await menu.hover();
    await page.mouse.wheel(0, 10_000);
    await expect.poll(() => menu.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    // Hover captions now grow their row in flow. Remove hover before measuring the collapsed
    // descriptions this pin targets; align to the end again after that layout change.
    await page.mouse.move(0, 0);
    await expect.poll(() => menu.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop);
    })).toBeLessThanOrEqual(1);

    const result = await menu.evaluate((el) => {
      const overflows = el.scrollHeight > el.clientHeight;
      const rows = Array.from(el.querySelectorAll(".jini-composer-discovery-item"));
      const lastRow = rows[rows.length - 1] as HTMLElement | undefined;
      if (!lastRow) return { overflows, rowCount: 0, gapBelowLastRow: null };
      const menuBottom = el.getBoundingClientRect().bottom;
      const lastRowBottom = lastRow.getBoundingClientRect().bottom;
      return { overflows, rowCount: rows.length, gapBelowLastRow: menuBottom - lastRowBottom, rowTop: lastRow.getBoundingClientRect().top, menuTop: el.getBoundingClientRect().top };
    });

    // Sanity check on the test's own premise: if today's bundled catalog ever shrinks below 280px
    // of real content, this spec would pass trivially (no scrolling occurs) without exercising the
    // bug's own overflow condition at all. Failing loudly here means a shrunk catalog needs a
    // different fixture, not a silently-weakened assertion below.
    expect(result.rowCount, "expected at least one discovery row").toBeGreaterThan(0);
    expect(
      result.overflows,
      "the bundled discovery catalog no longer exceeds the popover's 280px cap — this spec's premise (a real, overflowing list) no longer holds; see this file's own header",
    ).toBe(true);

    // The load-bearing assertion. Before the fix this gap was well over 100px of pure phantom
    // scroll space (an invisible hover-tooltip's own full natural height, stacked per row) — the
    // owner's exact "blank block" screenshot. A few pixels of padding/subpixel rounding around the
    // last row is fine; anything approaching even one row's own height is the bug back.
    expect(result.gapBelowLastRow).not.toBeNull();
    expect(result.gapBelowLastRow as number).toBeLessThan(20);
    expect(result.gapBelowLastRow as number).toBeGreaterThanOrEqual(-1);
    expect(result.rowTop as number).toBeGreaterThanOrEqual((result.menuTop as number) - 1);
  });
});
});

// Migrated from admin-composer-typeahead-visual.spec.ts; original pin intent and why comments follow.
test.describe("Bug pin: admin-composer-typeahead-visual", () => {
/**
 * @file Visual regression (pixel-diff) — admin assistant composer type-ahead ("/") menu.
 *
 * Reference implementation for the VRT paradigm documented in
 * `ADS-memory/reports/2026-08-21-visual-regression-testing-paradigm.md`. Generalizes
 * `theme-visual.spec.ts`'s pattern (fresh hermetic boot, `emulateMedia({ reducedMotion: "reduce" })`,
 * `toHaveScreenshot`, pinned `maxDiffPixelRatio`) from the public theme to the admin app, and targets
 * the owner's own named example: typing `/` in the composer and getting a mangled menu.
 *
 * This is deliberately a SECOND, complementary layer next to
 * `admin-composer-discovery-menu-overlap.spec.ts`'s bounding-box assertions, not a replacement —
 * that spec proves the menu doesn't overlap the textarea; a pixel diff is what catches a menu that
 * doesn't overlap anything but still renders broken (dropped font, missing icon, collapsed padding,
 * wrong colors).
 *
 * Screenshot scope: element-scoped to `.admin-chat-dock` (the composer's own container), NOT
 * `fullPage`. `theme-visual.spec.ts` uses `fullPage: true` because the public theme page has nothing
 * else moving on it. The admin shell does — this suite's own dispatch brief notes an open SSE feed on
 * admin pages that makes `waitUntil: "networkidle"` never resolve, and the sidebar/header render
 * live workspace chrome outside the dock entirely. Scoping the screenshot to the dock element keeps
 * this suite's diff surface limited to the thing under test and immune to chrome elsewhere on the
 * page that has nothing to do with the composer.
 */
async function prepareForScreenshot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

async function expectInsideViewport(page: Page, popover: Locator): Promise<void> {
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  await expect.poll(async () => {
    const box = await popover.boundingBox();
    return !!box && box.width > 0 && box.height > 0 && box.x >= 0 && box.y >= 0
      && box.x + box.width <= viewport!.width && box.y + box.height <= viewport!.height;
  }).toBe(true);
}

async function openDock(page: Page) {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await prepareForScreenshot(page);

  await page.locator("button.chat-fab").click();
  const dock = page.locator(".admin-chat-dock");
  await expect(dock).not.toHaveAttribute("hidden", "");
  return dock;
}

test.describe("admin composer type-ahead menu visual regression", () => {
  test("composer dock — resting state (baseline for comparison against the open menu)", async ({ page }) => {
    const dock = await openDock(page);
    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.waitFor({ state: "visible" });

    await expect(dock).toHaveScreenshot("composer-dock-resting.png", { animations: "disabled" });
  });

  test("typing / opens the slash menu — the owner's named bug case", async ({ page }) => {
    const dock = await openDock(page);

    const textarea = page.locator("textarea.jini-composer-input");
    await textarea.click();
    await textarea.pressSequentially("/");

    const palette = page.locator("#jini-composer-slash-menu");
    await expect(palette).toBeVisible();
    await expectInsideViewport(page, palette);

    await expect(dock).toHaveScreenshot("composer-dock-slash-menu-open.png", { animations: "disabled" });
  });

  test("+ Add Context menu — second type-ahead-style popover, same guard", async ({ page }) => {
    const dock = await openDock(page);

    await page.locator('button[aria-label="Add context"]').click();
    const menu = page.locator(".jini-composer-discovery-menu");
    await expect(menu).toBeVisible();
    await expectInsideViewport(page, menu);

    await expect(dock).toHaveScreenshot("composer-dock-discovery-menu-open.png", { animations: "disabled" });
  });
});
});
