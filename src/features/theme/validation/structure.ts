import { readdirSync, realpathSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { GENERATED_THEME_DIRS, isSourceDirGeneratedConflict } from "../theme-files.js";
import type { ThemeBuildInfo } from "../theme.js";
import type { ThemeValidationIssue } from "./profiles.js";

/**
 * @file Package-tree shape checks: file-count/depth/size/symlink ceilings (every schema version),
 * plus the v2-strict "only approved invariant roots" rule (§3/§4 of `theme-authoring-guide-v2.md`).
 *
 * Runs its OWN bounded directory walk rather than reusing `theme-files.ts`'s `listThemeFiles` — that
 * helper requires its target to sit under a recognized, already-configured `themesRoot`
 * (`isRecognizedThemeRoot`), which is the right constraint for a LIVE theme's per-file read/write
 * surface but wrong here: `tovu theme validate <dir>` must work against an arbitrary directory (a
 * downloaded zip extracted to a temp folder, a theme mid-authoring outside any themes root at all)
 * before that directory has ever been installed anywhere. Mirrors the same bounds and the same
 * symlink-refusing discipline independently rather than relaxing the production helper's contract to
 * accommodate this.
 */

/** Matches `theme-files.ts`'s own ceilings (`MAX_LISTED_FILES`/`MAX_WALK_DEPTH`) — same order of
 * magnitude reasoning: a pathological package should fail loudly, not hang the validator. */
const MAX_PACKAGE_FILES = 4_000;
const MAX_PACKAGE_DEPTH = 16;
/** One file over 16 MiB is already rejected by `checkBuiltThemeConformance` for a compiled theme's
 * generated tree (`build-conformance.ts`'s `MAX_HASHED_FILE_BYTES`); applied here uniformly to every
 * tracked file in the package, authored or generated, compiled or not. */
const MAX_FILE_BYTES = 16 * 1024 * 1024;

/** Roots `theme-authoring-guide-v2.md` §3 approves at an authored v2 theme's top level. Anything else
 * present in a v2-strict validation is an unrecognized root file/folder. `screenshots` is real
 * author-owned marketing content, deliberately distinct from `assets/previews/`'s specific
 * marketplace-card-thumbnail purpose — see `theme-files.ts`'s own `isGeneratedThemePath` doc comment
 * for why it's already treated as first-class content elsewhere in this codebase; every real theme on
 * disk ships one. `index.html` (Milestone 5, 2026-08-18) is `static-portability-index.ts`'s generated
 * root output for a `static`-tier theme — same "approved but generated, never hand-authored" framing
 * as `preview/` (also in `theme-files.ts`'s `GENERATED_THEME_ROOT_FILES`, this list's own sibling
 * concept for a single file rather than a whole directory), optional (a theme need not have one yet),
 * and not itself tier-gated here — a non-`static` theme simply never produces one, matching
 * `screenshots`/`templates`' own precedent of an approved root that's semantically tier-specific
 * without a dedicated structural rule enforcing that. */
const V2_APPROVED_ROOTS: ReadonlySet<string> = new Set([
  "theme.json",
  "tokens.json",
  "AGENTS.md",
  "LICENSE",
  "NOTICE.md",
  "assets",
  "screenshots",
  "css",
  "render",
  "scripts",
  "ai",
  "locales",
  "tests",
  "package.json",
  "index.html",
]);

/** Install-local metadata files a strict v2 structure check must NOT flag as unrecognized — they are
 * never part of the manifest/package a publisher authors, only what installing a copy adds alongside
 * it. See `theme-lineage.ts`'s own file header for `.tovu-lineage.json`. Matched by exact name, not
 * "any dotfile", so a real unexpected dotfile a package happens to ship still gets flagged. */
const INSTALL_LOCAL_FILES: ReadonlySet<string> = new Set([".tovu-lineage.json"]);

/** `tokens.<mode>.json` (e.g. `tokens.light.json`) — the one approved-root shape that isn't a fixed
 * literal name, so it needs a pattern rather than a set membership check. */
const TOKENS_MODE_FILE_PATTERN = /^tokens\.[a-z0-9-]+\.json$/;

function isApprovedV2Root(name: string): boolean {
  return V2_APPROVED_ROOTS.has(name) || INSTALL_LOCAL_FILES.has(name) || TOKENS_MODE_FILE_PATTERN.test(name);
}

export interface PackageWalkEntry {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly sizeBytes: number;
}

export interface PackageWalkResult {
  readonly files: readonly PackageWalkEntry[];
  readonly issues: readonly ThemeValidationIssue[];
}

/**
 * Walk a theme package directory, bounded and symlink-refusing. Never throws on a bad theme — a
 * ceiling breach, an oversized file, or a symlink is reported as an issue, not an exception, matching
 * every other check module's contract (`validate-theme-package.ts` aggregates issues, it never relies
 * on a check module throwing).
 *
 * @complexity O(n) in the package's own file count, bounded by {@link MAX_PACKAGE_FILES}.
 */
export function walkThemePackage(
  required: { themeDir: string },
  _optional: Record<string, never> = {}
): PackageWalkResult {
  const { themeDir } = required;
  const files: PackageWalkEntry[] = [];
  const issues: ThemeValidationIssue[] = [];
  let truncated = false;

  // Real-path the ROOT once before walking, then compare every descendant's realpath against THAT —
  // never against a non-realpathed `full`. `os.tmpdir()` (every fixture in this validator's own test
  // suite) resolves through a symlink on macOS (`/tmp` -> `/private/tmp`), so comparing an entry's
  // realpath to its own non-realpathed path would flag every single file as a symlink, not just real
  // ones. Same fix `theme-files.ts`'s `listThemeFiles` already applies (`const base =
  // realpathSync(themeDir)`) — mirrored here rather than rediscovered differently.
  const base = realpathSync(themeDir);

  const walk = (dir: string, depth: number): void => {
    if (truncated) return;
    if (depth > MAX_PACKAGE_DEPTH) {
      issues.push({ ruleId: "structure-max-depth", message: `package exceeds the ${MAX_PACKAGE_DEPTH}-directory depth ceiling under '${relative(base, dir)}'` });
      return;
    }
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch (err) {
      issues.push({ ruleId: "structure-unreadable-dir", message: `cannot read directory '${relative(base, dir)}': ${(err as Error).message}` });
      return;
    }
    for (const name of entries) {
      if (files.length >= MAX_PACKAGE_FILES) {
        truncated = true;
        issues.push({ ruleId: "structure-max-files", message: `package exceeds the ${MAX_PACKAGE_FILES}-file ceiling` });
        return;
      }
      const full = join(dir, name);
      const stat = statSync(full, { throwIfNoEntry: false });
      if (!stat) continue;
      const isLink = realpathSync(full) !== full;
      const relPath = relative(base, full).split(sep).join("/");
      if (isLink) {
        issues.push({ ruleId: "structure-symlink-forbidden", message: `'${relPath}' is a symlink, which a theme package must not contain`, path: relPath });
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, depth + 1);
      } else if (stat.isFile()) {
        if (stat.size > MAX_FILE_BYTES) {
          issues.push({ ruleId: "structure-max-file-size", message: `'${relPath}' is ${stat.size} bytes, exceeding the ${MAX_FILE_BYTES}-byte per-file ceiling`, path: relPath });
        }
        files.push({ relativePath: relPath, absolutePath: full, sizeBytes: stat.size });
      }
    }
  };
  walk(base, 0);

  return { files, issues };
}

/**
 * v2-strict-only: every top-level entry of the package must be one of §3's approved invariant roots
 * (or an install-local sidecar file). A no-op for a v1-shaped theme — v1's real, flat `pages/`/`css/`/
 * `js/`/root-`.html` layout is intentionally NOT re-validated here; changing what v1 themes are
 * allowed to contain is out of scope for this validator (see this file's own header).
 */
export function checkApprovedRoots(
  required: { themeDir: string },
  _optional: Record<string, never> = {}
): ThemeValidationIssue[] {
  const { themeDir } = required;
  const issues: ThemeValidationIssue[] = [];
  let entries: string[];
  try {
    entries = readdirSync(themeDir);
  } catch (err) {
    return [{ ruleId: "structure-unreadable-dir", message: `cannot read theme directory: ${(err as Error).message}` }];
  }
  for (const name of entries) {
    if (!isApprovedV2Root(name)) {
      issues.push({
        ruleId: "structure-unapproved-root",
        message: `'${name}' is not an approved schema v2 root (theme-authoring-guide-v2.md §3) — approved roots are: ${[...V2_APPROVED_ROOTS].join(", ")}`,
        path: name,
      });
    }
  }
  return issues;
}

/**
 * A compiled theme's `sourceDir` must be canonical (no `.`/`..`), contained inside the package (never
 * absolute, never escaping via traversal), non-root, non-symlinked, and disjoint from EVERY reserved
 * root — not just `preview/` (the Milestone-1 narrow fix this generalizes). `isSourceDirGeneratedConflict`
 * already covers the generated-directory half (`GENERATED_THEME_DIRS`, currently `["preview"]`); this
 * adds the v2-strict half — a `sourceDir` naming (or nesting inside, or being an ancestor of) one of
 * §3's OTHER invariant roots (`css`, `render`, `scripts`, `assets`, `ai`, `locales`, `tests`) is just
 * as much a collision as naming `preview` is: a `sourceDir: "css"` would make the generated
 * `css/theme.css` indistinguishable from hand-authored source the same way `sourceDir: "preview"`
 * made generated preview output indistinguishable from source.
 *
 * v2-strict only, deliberately — `loadTheme()`'s own production enforcement
 * (`isSourceDirGeneratedConflict`, `theme.ts`) stays exactly as narrow as Milestone 1 left it
 * (`GENERATED_THEME_DIRS` only); widening what an EXISTING v1 compiled theme's `sourceDir` may name
 * is a live-behavior change this validator does not make on its own.
 */
export function checkSourceDirContainment(
  required: { build: Pick<ThemeBuildInfo, "source" | "sourceDir">; schemaVersion: 1 | 2 },
  _optional: Record<string, never> = {}
): ThemeValidationIssue[] {
  const { build, schemaVersion } = required;
  if (build.source !== "compiled" || !build.sourceDir) return [];
  const issues: ThemeValidationIssue[] = [];

  if (build.sourceDir.startsWith("/") || build.sourceDir.includes("..")) {
    issues.push({ ruleId: "structure-sourcedir-escapes", message: `build.sourceDir '${build.sourceDir}' must be a relative, contained path (no leading '/', no '..')` });
    return issues;
  }
  const normalized = build.sourceDir.replace(/^\.\/+/, "").replace(/\/+$/, "");
  if (normalized === "" || normalized === ".") {
    issues.push({ ruleId: "structure-sourcedir-root", message: "build.sourceDir must not be the theme root itself" });
    return issues;
  }
  if (isSourceDirGeneratedConflict(normalized)) {
    issues.push({
      ruleId: "structure-sourcedir-generated-conflict",
      message: `build.sourceDir '${build.sourceDir}' must not name or contain a reserved generated directory (${GENERATED_THEME_DIRS.join(", ")})`,
    });
  }
  if (schemaVersion === 2) {
    const firstSegment = normalized.split("/")[0];
    const otherReservedRoots = [...V2_APPROVED_ROOTS].filter((root) => root !== "package.json" && !root.includes("."));
    if (otherReservedRoots.includes(firstSegment)) {
      issues.push({
        ruleId: "structure-sourcedir-root-conflict",
        message: `build.sourceDir '${build.sourceDir}' collides with the approved invariant root '${firstSegment}' — a schema v2 package's generated tree and its sourceDir must be fully disjoint`,
      });
    }
  }
  return issues;
}
