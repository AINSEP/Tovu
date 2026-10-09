import { readFile } from "node:fs/promises";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { crc32, deflateSync } from "node:zlib";

/**
 * @file The site-import journey's offline SOURCE site ("Lumen & Pine Ceramics"): a loopback static
 * server over `fixtures/journeys/site-import/source-site/`, so the import runs against a real HTTP
 * origin with no network. The site server reaches it only because the journey names its exact
 * origin in `outboundTestOrigins` (`apps/website/src/platform/http/test-origin-allowlist.ts`).
 *
 * Serving rules, kept tiny on purpose:
 * - `{{origin}}` in any text file becomes this server's origin, so sitemaps and `og:image` carry
 *   absolute URLs the way a real site's do; `{{head-common}}`, `{{header}}` and `{{footer}}` pull in
 *   `_partials/` (never served on their own).
 * - `/images/<name>.png` is GENERATED at request time as a distinct solid-color PNG
 *   ({@link FIXTURE_IMAGE_COLORS}): the repo keeps no binary fixtures, and distinct bytes keep the
 *   media library from de-duplicating two imports into one asset.
 * - A folder path serves its `index.html`; the query string is ignored (the sitemap lists a
 *   `?utm_source=` twin the importer must normalize away). Anything else is a 404.
 * Every request path is recorded so the journey can prove what the importer did and did NOT fetch
 * (robots.txt disallows `/cart/`).
 */

export const SITE_IMPORT_FIXTURE_ROOT = path.resolve(import.meta.dirname, "../fixtures/journeys/site-import/source-site");

/** RGB per generated image. Hex strings make a test failure readable. */
export const FIXTURE_IMAGE_COLORS: Readonly<Record<string, string>> = {
  hero: "#b5543a",
  story: "#5b6b4f",
  mugs: "#d9b38c",
  glaze: "#7d9a9e",
  studio: "#3e3a36",
};

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const PARTIALS = ["head-common", "header", "footer"] as const;

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData) >>> 0);
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * A valid truecolor PNG of one solid color.
 * @param required.hex - `#rrggbb`.
 * @complexity O(width * height).
 */
export function solidPng({ hex }: { hex: string }, { width = 48, height = 32 }: { width?: number; height?: number } = {}): Buffer {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new Error(`solidPng: expected #rrggbb, got ${hex}`);
  const rgb = [match[1], match[2], match[3]].map((part) => Number.parseInt(part!, 16));
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8); // 8-bit depth, truecolor, deflate, adaptive filter, no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: height }, () => row)))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

export interface FixtureResponse { status: number; contentType: string; body: Buffer }

const NOT_FOUND: FixtureResponse = { status: 404, contentType: "text/plain; charset=utf-8", body: Buffer.from("not found") };

/**
 * What the fixture site answers for one path. Pure apart from reading the fixture folder, so the
 * unit test drives the import script against the same bytes the journey's server sends.
 * @param required.pathname - The request path (no query string).
 * @param required.origin - Substituted for `{{origin}}`.
 * @complexity O(file size).
 */
export async function renderFixture(
  { pathname, origin }: { pathname: string; origin: string },
  { root = SITE_IMPORT_FIXTURE_ROOT }: { root?: string } = {},
): Promise<FixtureResponse> {
  const image = /^\/images\/([a-z-]+)\.png$/.exec(pathname);
  if (image) {
    const hex = FIXTURE_IMAGE_COLORS[image[1]!];
    return hex ? { status: 200, contentType: "image/png", body: solidPng({ hex }) } : NOT_FOUND;
  }
  // The source site's fonts are local shipped assets: reference imports need no Google Fonts
  // request, even when Chromium is enabled later for the comparison captures.
  const fontFiles: Record<string, string> = { "/fonts/display.woff2": "geist-mono-var.woff2", "/fonts/text.woff2": "geist-var.woff2" };
  if (fontFiles[pathname]) return { status: 200, contentType: "font/woff2", body: await readFile(
    path.resolve(import.meta.dirname, "../../../content/themes/static/tovu-starter/assets/fonts", fontFiles[pathname]!),
  ) };
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { return NOT_FOUND; }
  if (!decoded.startsWith("/") || decoded.split("/").some((segment) => segment === ".." || segment.startsWith("_"))) return NOT_FOUND;
  const relative = decoded.endsWith("/") ? `${decoded}index.html` : decoded;
  const contentType = CONTENT_TYPES[path.extname(relative)];
  if (!contentType) return NOT_FOUND;
  let text: string;
  try { text = await readFile(path.join(root, relative), "utf8"); } catch { return NOT_FOUND; }
  for (const name of PARTIALS) {
    if (text.includes(`{{${name}}}`)) text = text.replaceAll(`{{${name}}}`, (await readFile(path.join(root, "_partials", `${name}.html`), "utf8")).trimEnd());
  }
  return { status: 200, contentType, body: Buffer.from(text.replaceAll("{{origin}}", origin), "utf8") };
}

export interface SiteImportFixtureServer {
  /** `http://127.0.0.1:<port>`, no trailing slash. */
  readonly origin: string;
  /** Every request path (with query) in arrival order. */
  requests(): readonly string[];
  close(): Promise<void>;
}

/** Starts the fixture site on an ephemeral loopback port. Always `close()` it. */
export async function startSiteImportFixtureServer(
  _required = {}, { root = SITE_IMPORT_FIXTURE_ROOT }: { root?: string } = {},
): Promise<SiteImportFixtureServer> {
  const seen: string[] = [];
  let origin = "";
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", origin);
    seen.push(`${url.pathname}${url.search}`);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    renderFixture({ pathname: url.pathname, origin }, { root }).then(
      (response) => {
        res.writeHead(response.status, { "content-type": response.contentType, "content-length": response.body.length });
        res.end(req.method === "HEAD" ? undefined : response.body);
      },
      (error: Error) => {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(error.message);
      },
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    requests: () => seen,
    // Same reason as the fake model server: keep-alive sockets from the site server's client
    // would otherwise keep `close()` pending forever.
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
