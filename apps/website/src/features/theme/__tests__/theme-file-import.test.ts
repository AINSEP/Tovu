import { MediaImportValidationError } from "@jini-ai/cms/media/import";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { HttpClientPort, HttpRequest, HttpResponse } from "../../../platform/http/index.js";
import { ThemePathError } from "../theme-files.js";
import { importThemeFileFromUrl, sniffThemeImportType, THEME_IMPORT_MAX_BYTES } from "../theme-file-import.js";

/**
 * @file `theme-file-import.ts` — the service half of `theme_import_file_from_url`: fetch a font or
 * image through the injected guarded client, decide its type from its bytes, and write it byte for
 * byte into one theme's folder. The guarded client's own SSRF behaviour is certified by
 * `platform/http/__tests__/client.test.ts` and the fetch policy by `media-import`'s
 * `fetch-image.test.ts`; this suite covers what the theme side adds: the font sniff, the
 * path-before-network order, the extension-must-match-bytes rule, and the binary write.
 */

/** Scripted `HttpClientPort`; `calls` proves whether a refusal happened before the network. */
class FakeHttpClient implements HttpClientPort {
  readonly calls: HttpRequest[] = [];
  constructor(private readonly response: HttpResponse) {}
  async send(request: HttpRequest): Promise<HttpResponse> {
    this.calls.push(request);
    return this.response;
  }
}

function okResponse(bytes: Uint8Array, contentType = "font/woff2"): HttpResponse {
  return { status: 200, headers: { "content-type": contentType }, bodyText: Buffer.from(bytes).toString("utf8"), bodyBytes: bytes, bodyTruncated: false };
}

/** Magic bytes, then bytes that are invalid UTF-8 — a lossy text round-trip would change them. */
function withMagic(magic: readonly number[]): Uint8Array {
  return Uint8Array.from([...magic, 0x00, 0xff, 0xfe, 0x80, 0x81, 0xc3, 0x28, 0x10, 0x20, 0x30, 0x40, 0x50]);
}

const WOFF2 = withMagic([0x77, 0x4f, 0x46, 0x32]);
const WOFF = withMagic([0x77, 0x4f, 0x46, 0x46]);
const TTF = withMagic([0x00, 0x01, 0x00, 0x00]);
const OTF = withMagic([0x4f, 0x54, 0x54, 0x4f]);
const ICO = withMagic([0x00, 0x00, 0x01, 0x00]);
const PNG = withMagic([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const HTML = Buffer.from("<!doctype html><html><body>not a font</body></html>", "utf8");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "utf8");

function makeTheme(): { themesRoot: string; themeDir: string } {
  const themesRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-theme-file-import-"));
  const themeDir = path.join(themesRoot, "match");
  fs.mkdirSync(themeDir, { recursive: true });
  fs.writeFileSync(path.join(themeDir, "theme.json"), "{}", "utf8");
  return { themesRoot, themeDir };
}

function run(client: HttpClientPort, relativePath: string, url = "https://fonts.example.com/f/display.woff2") {
  const { themesRoot, themeDir } = makeTheme();
  const result = importThemeFileFromUrl({ httpClient: client, themeDir, themesRoot, relativePath, url });
  return { themeDir, result };
}

test("sniffThemeImportType names every font family by its magic bytes and defers images to the media sniffer", () => {
  assert.equal(sniffThemeImportType({ bytes: WOFF2 }), "font/woff2");
  assert.equal(sniffThemeImportType({ bytes: WOFF }), "font/woff");
  assert.equal(sniffThemeImportType({ bytes: TTF }), "font/ttf");
  assert.equal(sniffThemeImportType({ bytes: Uint8Array.from([0x74, 0x72, 0x75, 0x65, 0x00, 0x01]) }), "font/ttf");
  assert.equal(sniffThemeImportType({ bytes: OTF }), "font/otf");
  assert.equal(sniffThemeImportType({ bytes: ICO }), "image/x-icon");
  assert.equal(sniffThemeImportType({ bytes: PNG }), "image/png");
  assert.equal(sniffThemeImportType({ bytes: HTML }), "text/html");
  assert.equal(sniffThemeImportType({ bytes: Uint8Array.from([0x77, 0x4f]) }), "application/octet-stream");
});

test("a woff2 is written byte for byte at the requested path, creating its folders", async () => {
  const client = new FakeHttpClient(okResponse(WOFF2));
  const { themeDir, result } = run(client, "assets/fonts/display.woff2");

  const imported = await result;
  assert.deepEqual(imported, {
    path: "assets/fonts/display.woff2",
    contentType: "font/woff2",
    bytes: WOFF2.byteLength,
    sourceUrl: "https://fonts.example.com/f/display.woff2",
  });
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(themeDir, "assets/fonts/display.woff2"))), WOFF2);
  assert.equal(client.calls.length, 1);
  assert.match(String(client.calls[0]?.headers?.Accept), /font\/woff2/);
});

test("each font and image type lands under its own extension; .otf and .ttf share the sfnt family", async () => {
  const cases: Array<[Uint8Array, string, string]> = [
    [WOFF, "a.woff", "font/woff"], [TTF, "b.ttf", "font/ttf"], [TTF, "b2.otf", "font/ttf"],
    [OTF, "c.otf", "font/otf"], [PNG, "d.png", "image/png"], [ICO, "favicon.ico", "image/x-icon"],
  ];
  for (const [bytes, file, contentType] of cases) {
    const { themeDir, result } = run(new FakeHttpClient(okResponse(bytes)), `assets/${file}`);
    assert.equal((await result).contentType, contentType, file);
    assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(themeDir, "assets", file))), bytes, file);
  }
});

test("bytes that are not a font or image are refused whatever the header says, and nothing is written", async () => {
  for (const body of [HTML, SVG]) {
    const { themeDir, result } = run(new FakeHttpClient(okResponse(body, "font/woff2")), "assets/fonts/x.woff2");
    await assert.rejects(result, MediaImportValidationError);
    assert.equal(fs.existsSync(path.join(themeDir, "assets")), false);
  }
});

test("bytes whose type does not match the path's extension are refused, and nothing is written", async () => {
  const { themeDir, result } = run(new FakeHttpClient(okResponse(PNG, "image/png")), "assets/fonts/display.woff2");
  await assert.rejects(result, (error: unknown) => {
    assert.ok(error instanceof MediaImportValidationError);
    assert.match(error.message, /'assets\/fonts\/display\.woff2' needs a \.png extension/);
    return true;
  });
  assert.equal(fs.existsSync(path.join(themeDir, "assets")), false);
});

test("an escaping path or a non-font/image extension is refused before any network call", async () => {
  for (const relativePath of ["../escape.woff2", "/abs/x.woff2", "css/theme.css", "theme.json", "assets/logo.svg", "assets/noext"]) {
    const client = new FakeHttpClient(okResponse(WOFF2));
    const { result } = run(client, relativePath);
    await assert.rejects(result, ThemePathError, relativePath);
    assert.equal(client.calls.length, 0, `${relativePath}: refused before the network`);
  }
});

test("a non-https URL is refused before any network call", async () => {
  const client = new FakeHttpClient(okResponse(WOFF2));
  const { result } = run(client, "assets/fonts/x.woff2", "http://fonts.example.com/x.woff2");
  await assert.rejects(result, MediaImportValidationError);
  assert.equal(client.calls.length, 0);
});

test("an over-cap or clipped body is refused rather than written as a corrupt file", async () => {
  const clipped = new FakeHttpClient({ ...okResponse(WOFF2), bodyBytesTruncated: true });
  const { themeDir, result } = run(clipped, "assets/fonts/x.woff2");
  await assert.rejects(result, MediaImportValidationError);
  assert.equal(fs.existsSync(path.join(themeDir, "assets")), false);
  assert.ok(THEME_IMPORT_MAX_BYTES >= 5 * 1024 * 1024, "big enough for a CJK font or a hero image");
});

test("an existing file at the path is replaced, not refused", async () => {
  const { themesRoot, themeDir } = makeTheme();
  fs.mkdirSync(path.join(themeDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(themeDir, "assets", "logo.png"), "old");
  await importThemeFileFromUrl({ httpClient: new FakeHttpClient(okResponse(PNG, "image/png")), themeDir, themesRoot, relativePath: "assets/logo.png", url: "https://example.com/logo.png" });
  assert.deepEqual(new Uint8Array(fs.readFileSync(path.join(themeDir, "assets", "logo.png"))), PNG);
});
