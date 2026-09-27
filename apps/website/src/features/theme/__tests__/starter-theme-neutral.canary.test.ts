import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

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

const SCAN_EXTENSIONS = [".html", ".css", ".js", ".json", ".webmanifest"];
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

/**
 * Strips HTML, CSS/JS block, and JS line comments so comment prose (which legitimately names the
 * Tovu platform, B20) can't trip the brand-content checks below.
 *
 * This is deliberately naive, not a parser: it also drops the rest of a line after `//` that isn't
 * preceded by `:` (so an `http://` URL survives), which is enough for this theme's own hand-written
 * files. Content in `theme.json`'s `$schema` value is removed up front for the same reason: it is a
 * platform URL, not branding, and this keeps the check from depending on that value staying lowercase.
 *
 * @param source Raw file text.
 * @returns The same text with comment bodies (and the `$schema` value) removed.
 * @complexity O(n) in file length — a fixed number of regex passes.
 */
function stripCommentsAndSchemaUrl(source: string): string {
  return source
    .replace(/"\$schema"\s*:\s*"[^"]*"/g, '"$schema": ""')
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
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
    const stripped = stripCommentsAndSchemaUrl(raw);

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
