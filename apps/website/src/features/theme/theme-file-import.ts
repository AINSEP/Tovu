/**
 * @file Theme binary import: read a URL or guarded local file and write a font or image,
 * byte for byte, into one theme's folder.
 *
 * Why it exists: theme tools were UTF-8 only and `media_import_from_url` refuses fonts and lands
 * images in the media library, not the theme. So "match a reference site" could only hotlink the
 * source's font files, and a duplicated theme could never gain a binary its source lacked.
 *
 * Nothing security-relevant is reimplemented here:
 * - Fetching goes through `media-import`'s `fetchImage` with the injected guarded client
 *   (DNS/peer pinning, per-hop redirect checks, https-only, byte/time caps), with this file's own
 *   policy: fonts and still images, {@link THEME_IMPORT_MAX_BYTES}.
 * - The path goes through `resolveThemeFilePath` (traversal, absolute, NUL, symlink escape), checked
 *   BEFORE the network so a bad path costs no request.
 * - The type is decided by the bytes ({@link sniffThemeImportType}); the response header and the
 *   path's extension never decide it. The extension must then AGREE with the bytes, so a theme never
 *   holds PNG bytes named `.woff2` that the asset server would label as a font.
 *
 * The theme write rules (generated/trash/compiled-sourceDir refusals) and permissions belong to the
 * tool layer (`import-theme-file-tool.ts`), which shares them with `theme_write_file`.
 */
import { MediaImportValidationError } from "@jini-ai/cms/media/import";
import type { HttpClientPort } from "#src/platform/http/index";
import { sniffContentType } from "../media/index.js";
import { fetchImage } from "../media-import/fetch-image.js";
import { openFsFileForRead } from "../fs-files/fs-files.js";
import { fileExtension } from "./file-identity-lock.js";
import { MAX_THEME_FILE_BYTES, resolveThemeFilePath, ThemePathError, writeThemeBinaryFile } from "./theme-files.js";

/** Largest file this tool imports: 10 MB — room for a CJK font or a hero image, a fifth of
 *  `theme_duplicate`'s whole-theme cap. */
export const THEME_IMPORT_MAX_BYTES = MAX_THEME_FILE_BYTES * 10;

/**
 * Accepted sniffed type -> the extensions a file of that type may be saved under. TrueType and
 * OpenType share one container (sfnt), and real sites ship either under either name, so both
 * accept both. SVG is absent on purpose: it is text (fetch it with `web_fetch_page`, write it with
 * `theme_write_file`), and unsanitized SVG is the one image type the media sniffer flags.
 */
const EXTENSIONS_BY_TYPE: Readonly<Record<string, readonly string[]>> = {
  "font/woff2": [".woff2"],
  "font/woff": [".woff"],
  "font/ttf": [".ttf", ".otf"],
  "font/otf": [".otf", ".ttf"],
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "image/avif": [".avif"],
  "image/x-icon": [".ico"],
};

const IMPORTABLE_TYPES: ReadonlySet<string> = new Set(Object.keys(EXTENSIONS_BY_TYPE));
const IMPORTABLE_EXTENSIONS: ReadonlySet<string> = new Set(Object.values(EXTENSIONS_BY_TYPE).flat());

/** Leading magic -> font/icon type. Checked before the media sniffer, which knows no fonts. */
const FONT_AND_ICON_MAGIC: ReadonlyArray<readonly [readonly number[], string]> = [
  [[0x77, 0x4f, 0x46, 0x32], "font/woff2"], // "wOF2"
  [[0x77, 0x4f, 0x46, 0x46], "font/woff"], // "wOFF"
  [[0x4f, 0x54, 0x54, 0x4f], "font/otf"], // "OTTO" (CFF outlines)
  [[0x00, 0x01, 0x00, 0x00], "font/ttf"], // sfnt version 1.0 (TrueType outlines)
  [[0x74, 0x72, 0x75, 0x65], "font/ttf"], // "true" (legacy Apple TrueType)
  [[0x00, 0x00, 0x01, 0x00], "image/x-icon"], // ICONDIR, type 1
];

/**
 * Names a payload's type from its leading bytes: fonts and `.ico` here, everything else by the
 * media library's own sniffer (`@jini-ai/cms/media`'s `sniffContentType`).
 * @returns A MIME type; `application/octet-stream` when nothing matches.
 * @complexity O(1) — fixed-length prefix compares, plus the media sniffer's bounded window.
 */
export function sniffThemeImportType({ bytes }: { bytes: Uint8Array }): string {
  for (const [magic, type] of FONT_AND_ICON_MAGIC) {
    if (bytes.length >= magic.length && magic.every((byte, index) => bytes[index] === byte)) return type;
  }
  return sniffContentType({ bytes });
}

/** Shared safe-fetch byte/type policy for theme asset imports, including files_copy. */
export const THEME_IMPORT_ACCEPT = "font/woff2, font/woff, font/ttf, font/otf, image/*;q=0.8, */*;q=0.1";
export const THEME_IMPORT_POLICY = {
  maxBytes: THEME_IMPORT_MAX_BYTES,
  allowedContentTypes: IMPORTABLE_TYPES,
  sniffer: { sniff: sniffThemeImportType },
};

/** What one import wrote. `path` is theme-relative; `sourceUrl` is the final hop the bytes came from. */
export interface ImportedThemeFile {
  path: string;
  contentType: string;
  bytes: number;
  sourceUrl: string;
}

type ThemeImportDestination = { themeDir: string; themesRoot: string; relativePath: string };

/** Checks containment and the destination extension before reading either source.
 * @throws {ThemePathError} For an escaping path or unsupported extension.
 * @complexity Bounded filesystem path checks.
 */
function validateThemeImportDestination(required: ThemeImportDestination, _optional: Record<string, never> = {}): void {
  resolveThemeFilePath(required);
  if (!IMPORTABLE_EXTENSIONS.has(fileExtension(required.relativePath))) {
    throw new ThemePathError(
      `path '${required.relativePath}' must end in a font or image extension (${[...IMPORTABLE_EXTENSIONS].join(", ")}). ` +
        "SVG and other text files: read as text and write with theme_write_file."
    );
  }
}

/** Sniffs and validates bounded bytes, then uses the theme's atomic binary writer.
 * Both source adapters call this owner so type/extension and persistence rules cannot drift.
 * @returns Theme-relative path, sniffed type and byte count.
 * @throws {MediaImportValidationError} For empty, oversized, unsupported or mismatched bytes.
 * @throws {ThemePathError} For an unsafe destination; disk errors propagate.
 * @complexity O(s) time/space for s bytes, capped at THEME_IMPORT_MAX_BYTES.
 */
function persistThemeImport(
  required: ThemeImportDestination & { bytes: Uint8Array; source: string },
  _optional: Record<string, never> = {},
): Omit<ImportedThemeFile, "sourceUrl"> {
  const { bytes, relativePath, source } = required;
  const contentType = sniffThemeImportType({ bytes });
  const allowed = EXTENSIONS_BY_TYPE[contentType] ?? [];
  if (bytes.byteLength === 0 || bytes.byteLength > THEME_IMPORT_MAX_BYTES || allowed.length === 0) {
    throw new MediaImportValidationError({ message: `'${source}' must contain a supported font or image, up to ${THEME_IMPORT_MAX_BYTES} bytes. Nothing was saved.` });
  }
  if (!allowed.includes(fileExtension(relativePath))) {
    throw new MediaImportValidationError({
      message: `'${source}' is ${contentType}, so '${relativePath}' needs a ${allowed.join(" or ")} extension. Nothing was saved.`,
    });
  }
  writeThemeBinaryFile(required);
  return { path: relativePath, contentType, bytes: bytes.byteLength };
}

/**
 * Downloads a font or image and writes it into `themeDir` at `relativePath`.
 *
 * Order: path containment and extension (before source I/O) -> guarded fetch and byte sniff -> extension
 * agrees with the bytes -> atomic binary write. A refusal at any step writes nothing.
 *
 * @param optional.plainHttpTestOrigins - HARNESS ONLY, as `FetchImageDeps.plainHttpTestOrigins`.
 * @returns What was written.
 * @throws {ThemePathError} For an escaping path or an extension that is not a font/image type.
 * @throws {MediaImportValidationError} For a bad URL, a non-2xx, an over-cap/clipped/empty body,
 * bytes that are not an accepted type, or bytes whose type the extension does not match.
 * Guarded-transport errors (`EgressRefusedError`, network failures) propagate unchanged.
 * @complexity One bounded GET plus redirects; O(s) write in the byte count.
 */
export async function importThemeFileFromUrl(
  required: { httpClient: HttpClientPort; themeDir: string; themesRoot: string; relativePath: string; url: string },
  { plainHttpTestOrigins }: { plainHttpTestOrigins?: readonly string[] } = {},
): Promise<ImportedThemeFile> {
  const { httpClient, themeDir, themesRoot, relativePath, url } = required;
  validateThemeImportDestination(required);

  const fetched = await fetchImage(
    { deps: { httpClient, plainHttpTestOrigins }, url },
    { policy: THEME_IMPORT_POLICY, accept: THEME_IMPORT_ACCEPT },
  );
  return { ...persistThemeImport({ themeDir, themesRoot, relativePath, bytes: fetched.bytes, source: fetched.url.href }), sourceUrl: fetched.url.href };
}

/** Imports a local font/image through Jini's guarded reader and the URL importer's persistence.
 * @param required.rootPath - Owner-selected fs-files root directory, resolved by the tool layer.
 * @param required.sourcePath - File path relative to that root; never an arbitrary absolute path.
 * @returns Written asset metadata and the relative source path.
 * @throws {FsFilePathError} For denied, missing, escaping, nonregular or oversized sources.
 * @throws {ThemePathError} For unsafe destinations; byte validation and I/O errors propagate.
 * @complexity O(s) time/space, bounded by THEME_IMPORT_MAX_BYTES plus one reader chunk.
 */
export async function importThemeFileFromLocalFile(
  required: ThemeImportDestination & { rootPath: string; sourcePath: string },
  _optional: Record<string, never> = {},
): Promise<Omit<ImportedThemeFile, "sourceUrl"> & { sourcePath: string }> {
  validateThemeImportDestination(required);
  const bytes = await openFsFileForRead({ rootPath: required.rootPath, relativePath: required.sourcePath, maxBytes: THEME_IMPORT_MAX_BYTES });
  return { ...persistThemeImport({ ...required, bytes, source: required.sourcePath }), sourcePath: required.sourcePath };
}
