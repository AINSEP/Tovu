import { test, expect, type Page, type Locator } from "@playwright/test";
import { loginAsAdmin } from "./auth-fixtures.js";

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
 * through `fileInput()` below, never a synthetic input built for this test.
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

async function openDock(page: Page): Promise<void> {
  await loginAsAdmin(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("button.chat-fab").click();
  const dock = page.locator(".admin-chat-dock");
  await expect(dock).not.toHaveAttribute("hidden", "");
}

/**
 * The file input always exists once the composer mounts with discovery groups (rendered
 * unconditionally by whichever of Jini's two composer render branches is live, not gated on the
 * "+" menu being open), so no menu click is needed to reach it — matching how `setInputFiles`
 * drives it directly rather than through a simulated click-then-native-dialog flow Playwright
 * cannot automate anyway.
 *
 * Keyed off the real `data-testid="composer-attachment-input"` hook, present on both of Jini's
 * composer render branches (`Composer.tsx`'s own `attachmentPicker && !hasDiscoveryItems` branch
 * and `ComposerDiscovery.tsx`'s `ComposerDiscoveryMenu` Files group — Tovu's admin dock takes the
 * discovery branch) — this locator doesn't need to know or care which one is live.
 */
function fileInput(page: Page): Locator {
  return page.getByTestId("composer-attachment-input");
}

/** Locates one attachment chip by its exact, post-sanitization `data-attachment-name` — the real
 *  value Jini's `sanitizeAttachmentName` computed, not a substring match on rendered text. Both
 *  attributes live on the same element, so this is one combined selector rather than a scoped
 *  `getByTestId().filter(...)` (which only matches a DESCENDANT, not the element itself). */
function attachmentChip(page: Page, name: string): Locator {
  return page.locator(`[data-testid="attachment-chip"][data-attachment-name="${name}"]`);
}

/** Drives one matrix row through the real picker and asserts the resulting chip's daemon-reported
 *  kind — not just that the upload returned success. Wrapped in `test.step` so each row shows up as
 *  its own pass/fail line in the report despite sharing one login with its group. */
async function runMatrixCase(page: Page, matrixCase: AttachmentMatrixCase): Promise<void> {
  await test.step(matrixCase.label, async () => {
    await fileInput(page).setInputFiles({
      name: matrixCase.fileName,
      mimeType: matrixCase.mimeType,
      buffer: matrixCase.content,
    });
    const chip = attachmentChip(page, matrixCase.fileName);
    await expect(chip).toBeVisible({ timeout: 15_000 });
    // Reads the daemon's real classification directly off the chip's own attribute — no more
    // inferring it from a `.jini-attachment-chip-icon.is-*` presentational CSS suffix.
    await expect(chip).toHaveAttribute("data-attachment-kind", matrixCase.expectedKind);
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
}

test.describe("admin composer — attachment file picker excludes no file type", () => {
  test("the composer's file input carries no accept filter, so the OS dialog cannot exclude any file", async ({
    page,
  }) => {
    await openDock(page);

    const accept = await fileInput(page).getAttribute("accept");

    // The load-bearing regression assertion (see this file's module doc for why it's the only one
    // that can be). Falsy covers both `null` (React omits the attribute entirely when the prop is
    // `undefined`) and `""`, so this doesn't silently start passing again if a future refactor
    // swaps one for the other.
    expect(accept).toBeFalsy();
  });

  test("text, code, and config files all upload through the picker and classify as 'file'", async ({ page }) => {
    await openDock(page);
    for (const matrixCase of TEXT_CODE_CONFIG_MATRIX) await runMatrixCase(page, matrixCase);
    // 9 successful uploads in one session — under the 10-per-batch cap this suite is deliberately
    // staying under (see module doc).
    await expect(page.getByTestId("attachment-chip")).toHaveCount(TEXT_CODE_CONFIG_MATRIX.length);
  });

  test("real images classify as 'image', a binary non-image and odd filenames still classify as 'file'", async ({
    page,
  }) => {
    await openDock(page);
    for (const matrixCase of IMAGE_BINARY_AND_NAME_MATRIX) await runMatrixCase(page, matrixCase);

    // The unicode/emoji filename case, run separately: `data-attachment-name` now exposes the exact
    // post-sanitization name, so this can assert the real landed value directly instead of falling
    // back to a count-delta. `sanitizeAttachmentName` (`attachments.ts`) replaces every
    // non-`[a-zA-Z0-9._ -]` Unicode code point with a single `_`, so
    // "regression-🚀-résumé-测试.txt" becomes "regression-_-r_sum_-__.txt" — worked through
    // character by character: "regression" and both "-" survive; 🚀 -> "_"; "r" survives; each "é"
    // -> "_" (leaving "r_sum_"); "测" and "试" each -> "_"; ".txt" survives.
    await test.step("filename with unicode and emoji", async () => {
      await fileInput(page).setInputFiles({
        name: "regression-🚀-résumé-测试.txt",
        mimeType: "text/plain",
        buffer: textFixture("unicode filename attachment\n"),
      });
      const chip = attachmentChip(page, "regression-_-r_sum_-__.txt");
      await expect(chip).toBeVisible({ timeout: 15_000 });
      await expect(chip).toHaveAttribute("data-attachment-kind", "file");
      await expect(page.getByRole("alert")).toHaveCount(0);
    });

    await expect(page.getByTestId("attachment-chip")).toHaveCount(IMAGE_BINARY_AND_NAME_MATRIX.length + 1);
  });

  test("a zero-byte attachment is rejected by the daemon, with no chip added", async ({ page }) => {
    await openDock(page);

    // Passes the client-side size pre-check (0 bytes is never `> maxAttachmentBytes`), so this is
    // a REAL round trip to the daemon, which rejects it itself: `handleAttachmentUpload`
    // (`attachments.ts`) checks `upload.size === 0` after streaming and answers 400
    // `{ error: { message: 'Attachment is empty' } }` before ever calling `detectAttachmentKind` —
    // an empty file is rejected outright rather than classified. A naive "does the picker accept
    // any file" implementation could easily let this one through as a phantom zero-byte chip.
    await fileInput(page).setInputFiles({
      name: "regression-empty.txt",
      mimeType: "text/plain",
      buffer: Buffer.alloc(0),
    });

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Attachment is empty");
    await expect(page.getByTestId("attachment-chip")).toHaveCount(0);
  });

  test("a file over the 20 MB per-attachment cap is rejected before any upload request, with no chip added", async ({
    page,
  }) => {
    await openDock(page);

    // 21 MB > `createDaemonAttachmentUploader`'s default 20 MB `maxAttachmentBytes`
    // (`create-daemon-attachment-uploader.ts`), built in-memory rather than committed as a fixture
    // file — this check runs entirely client-side against `File.size` before any `fetch` is issued,
    // so a real 20 MB+ file on disk would prove nothing an in-memory buffer of the same size
    // doesn't already prove, at the cost of a 20+ MB commit.
    const oversizeBytes = 21 * 1024 * 1024;
    let uploadRequests = 0;
    await page.route("**/api/attachments*", async (route) => {
      uploadRequests += 1;
      await route.continue();
    });

    await fileInput(page).setInputFiles({
      name: "regression-oversize.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(oversizeBytes),
    });

    const alert = page.getByRole("alert");
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("20 MB");
    await expect(page.getByTestId("attachment-chip")).toHaveCount(0);
    // The real proof this is a client-side pre-check, not a slow/failed network round trip: the
    // daemon was never even asked.
    expect(uploadRequests).toBe(0);
  });
});
