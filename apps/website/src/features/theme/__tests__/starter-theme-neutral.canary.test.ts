import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import sharp from "sharp";
import ts from "typescript";

/**
 * @file Canary: `content/themes/static/tovu-starter` stays de-branded.
 *
 * Slice 2/3 of the "Tovu Starter" plan (`ADS-memory/.local-artifacts/plans/2026-09-27-tovu-starter-
 * theme-plan.md`) stripped the Tovu wordmark, gold accent, and dark background out of a copy of the
 * live `tovu-theme`, and swapped its generated Tovu-coloured art for neutral generated icons. Nothing
 * enforces that a later edit — a copy-paste of new markup from `tovu-theme`, a reverted icon — doesn't
 * bring the brand back in. This sweep is that enforcement.
 *
 * Comments are stripped before matching: a bare regex scan over raw HTML/CSS/JS false-positives on
 * comment prose that legitimately names "Tovu" as the platform (B20 in the plan) — e.g. the NOTICE-
 * pointer comments in `posts-sidebar.html` and `css/theme.css`. `NOTICE.md` itself is excluded outright
 * (it is Tovu's own history of the theme, kept verbatim in two sections) and `scripts/vendor/` is
 * excluded (third-party code this project doesn't own the wording of).
 */

const THEME_DIR = path.resolve(
  import.meta.dirname,
  "../../../../../../content/themes/static/tovu-starter"
);
const OLD_THEME_LOGO = path.resolve(
  import.meta.dirname,
  "../../../../../../content/themes/static/tovu-theme/assets/logo.png"
);

const SCAN_EXTENSIONS = [".html", ".css", ".js", ".json", ".webmanifest", ".svg"];
const EXCLUDED_RELATIVE_PREFIXES = ["scripts/vendor/"];
const EXCLUDED_FILENAMES = ["NOTICE.md"];

/** One forbidden signal and why it would mean the brand crept back in. */
interface ForbiddenPattern {
  readonly label: string;
  readonly pattern: RegExp;
}

const FORBIDDEN_PATTERNS: ForbiddenPattern[] = [
  { label: "an asset URL still pointing at tovu-theme", pattern: /\/theme-assets\/tovu-theme\// },
  { label: "the word \"Tovu\" outside \"Tovu Starter\"", pattern: /\bTovu\b(?! Starter)/ },
  {
    // #020203 is deliberately NOT forbidden here: it is the starter's own dark-mode --bg (meta
    // theme-color, manifest background_color/theme_color), a neutral near-black chosen for the
    // starter itself, not a Tovu Theme leftover — see the slice-3 dispatch note.
    label: "tovu-theme's gold accent",
    pattern: /#f8b83[89]|#ffba3e|82\.1% 0\.153 80\.1/i,
  },
];

/** Remove comments according to the file's syntax, preserving URLs and string content. */
function stripCommentsAndSchemaUrl(source: string, extension: string): string {
  if (extension === ".html" || extension === ".svg") {
    const comments: { startOffset: number; endOffset: number }[] = [];
    const walk = (node: DefaultTreeAdapterMap["node"]): void => {
      if (node.nodeName === "#comment" && node.sourceCodeLocation) comments.push(node.sourceCodeLocation);
      if ("childNodes" in node) for (const child of node.childNodes) walk(child);
      if ("content" in node) walk(node.content);
    };
    walk(parse(source, { sourceCodeLocationInfo: true }));
    for (const { startOffset, endOffset } of comments.sort((a, b) => b.startOffset - a.startOffset)) {
      source = source.slice(0, startOffset) + source.slice(endOffset);
    }
    return source;
  }
  if (extension === ".js") {
    return ts.createPrinter({ removeComments: true }).printFile(
      ts.createSourceFile("theme.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
    );
  }
  if (extension === ".css") {
    // Preserve quoted strings; CSS has block comments but no // comments.
    return source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\/\*[\s\S]*?\*\//g,
      (token) => token.startsWith("/*") ? "" : token);
  }
  const json = JSON.parse(source);
  delete json.$schema;
  return JSON.stringify(json);
}

/**
 * @param dir Directory to walk.
 * @returns Every file path under `dir`, recursively, in no particular order.
 * @complexity O(f) in files under `dir` — one readdir per subdirectory.
 */
function listFilesRecursive(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFilesRecursive(full) : [full];
  });
}

function isScanned(relativePath: string): boolean {
  if (EXCLUDED_RELATIVE_PREFIXES.some((prefix) => relativePath.startsWith(prefix))) return false;
  if (EXCLUDED_FILENAMES.includes(path.basename(relativePath))) return false;
  return SCAN_EXTENSIONS.includes(path.extname(relativePath));
}

const ALL_FILES = listFilesRecursive(THEME_DIR).map((absolute) => path.relative(THEME_DIR, absolute));
const SCANNED_FILES = ALL_FILES.filter(isScanned).sort();

test("canary: the starter theme sweep is not vacuous", () => {
  // Without this, THEME_DIR moving or every extension changing turns every check below into a pass
  // over an empty list.
  assert.ok(SCANNED_FILES.length > 0, `no scannable files found under ${THEME_DIR}`);
});

for (const relativePath of SCANNED_FILES) {
  test(`canary: ${relativePath} carries no Tovu Theme branding`, () => {
    const raw = fs.readFileSync(path.join(THEME_DIR, relativePath), "utf8");
    const stripped = stripCommentsAndSchemaUrl(raw, path.extname(relativePath));

    for (const { label, pattern } of FORBIDDEN_PATTERNS) {
      const match = stripped.match(pattern);
      assert.ok(
        match === null,
        `${relativePath} contains ${label} (matched "${match?.[0]}") outside comments — ` +
          `the starter theme must stay de-branded from tovu-theme.`
      );
    }
  });
}

test("canary: the starter's logo is not tovu-theme's logo", () => {
  const starterLogo = fs.readFileSync(path.join(THEME_DIR, "assets/logo.png"));
  const oldLogo = fs.readFileSync(OLD_THEME_LOGO);
  const starterSha = crypto.createHash("sha256").update(starterLogo).digest("hex");
  const oldSha = crypto.createHash("sha256").update(oldLogo).digest("hex");

  assert.notEqual(
    starterSha,
    oldSha,
    "content/themes/static/tovu-starter/assets/logo.png is byte-identical to tovu-theme's logo — " +
      "the starter needs its own neutral generated mark, not the Tovu gold one."
  );
});

// F5.6: positive controls for the preprocessing used by the actual sweep.
test("canary scanner preserves branding after URLs and inside strings, and scans SVG", () => {
  for (const extension of [".html", ".svg"]) {
    assert.match(stripCommentsAndSchemaUrl('<a href="//example.test">Tovu</a><!-- Tovu -->', extension), /Tovu<\/a>/);
    assert.equal(stripCommentsAndSchemaUrl("<!-- Tovu -->", extension), "");
  }
  assert.equal(isScanned("assets/logo.svg"), true);
  assert.match(stripCommentsAndSchemaUrl('const url = "//example.test/Tovu"; // comment', ".js"), /Tovu/);
  assert.match(stripCommentsAndSchemaUrl('a { content: "//Tovu"; } /* Tovu comment */', ".css"), /"\/\/Tovu"/);
  assert.match(stripCommentsAndSchemaUrl('{"url":"//example.test","name":"Tovu"}', ".json"), /Tovu/);
});

const IMAGE_FILES = ALL_FILES.filter((file) => /\.(png|jpe?g|webp|gif|avif)$/.test(file)).sort();
const OLD_THEME_DIR = path.dirname(path.dirname(OLD_THEME_LOGO));

async function appearance(bytes: Buffer) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

test("canary image sweep includes the logo, icons and screenshots", () => {
  assert.ok(IMAGE_FILES.includes("assets/logo.png"));
  assert.ok(IMAGE_FILES.includes("icons/icon-192.png"));
  assert.ok(IMAGE_FILES.includes("screenshots/index.png"));
});

for (const file of IMAGE_FILES) {
  test(`canary: ${file} does not reuse tovu-theme's image appearance`, async (t) => {
    const oldPath = path.join(OLD_THEME_DIR, file);
    if (!fs.existsSync(oldPath)) {
      t.skip("No same-named branded asset to compare");
      return;
    }
    const starter = fs.readFileSync(path.join(THEME_DIR, file));
    const branded = fs.readFileSync(oldPath);
    assert.notEqual(crypto.createHash("sha256").update(starter).digest("hex"),
      crypto.createHash("sha256").update(branded).digest("hex"));
    assert.notDeepEqual(await appearance(starter), await appearance(branded),
      `${file} must have neutral artwork even if the branded image was re-encoded`);
  });
}

test("canary appearance comparison ignores lossless PNG re-encoding", async () => {
  const original = fs.readFileSync(OLD_THEME_LOGO);
  const reencoded = await sharp(original).png({ compressionLevel: 0 }).toBuffer();
  assert.notDeepEqual(reencoded, original);
  assert.deepEqual(await appearance(reencoded), await appearance(original));
});
