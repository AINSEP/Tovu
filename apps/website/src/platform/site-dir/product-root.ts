import { existsSync } from "node:fs";
import path from "node:path";

/**
 * @file Locates the product root — the directory containing this package's `package.json` and its
 * shipped `content/` tree (`content/templates`, `content/themes`, `content/agent-plugins`) — from
 * wherever the calling module happens to be running.
 *
 * Why a walk-up instead of a fixed `../` count: `tsconfig.json`'s `rootDir: "apps/website"` makes
 * `tsc` mirror compiled output as `dist/src/**`, deliberately UNCHANGED from before the 2026-08-28
 * `src/` -> `apps/website/src/` rename (so `bin`/`start`/the Dockerfile's `dist/src/index.js` never
 * had to move). But the SOURCE tree's own files moved two levels deeper, under `apps/website/`. A
 * file that reaches past its own package into sibling `content/` (which never moved — it isn't part
 * of `rootDir`) now sits at two DIFFERENT depths from that shared ancestor depending on which tree
 * is running it: a hardcoded `../` count can be correct for tsx/source or for the compiled/dist
 * tree, never both at once. This walks up from wherever it actually is instead of assuming a depth,
 * so it's correct in both trees without needing to know which one it's in.
 *
 * Both trees satisfy the same stop condition: `<repo-root>/package.json` + `<repo-root>/content/`
 * in source, `dist/package.json` (written by `emit-dist-package-json.mjs`) + `dist/content/`
 * (copied there by `npm run build`) in the compiled tree — verified there is no closer ancestor
 * that would false-positive on this check (`apps/website/` has no `package.json` of its own).
 */

const MAX_WALK_UP = 12;

/**
 * Walks up from `fromDir` (defaults to this file's own compiled/source location) until it finds a
 * directory containing both `package.json` and `content/`, and returns that directory.
 *
 * @param fromDir - Override for testing; production callers should omit this and get the real
 *   caller-relative default.
 * @throws If no such ancestor is found within {@link MAX_WALK_UP} levels — a silent wrong guess
 *   (like the two `../` counts this replaced) is worse than a loud failure here.
 */
export function resolveProductRoot(fromDir: string = import.meta.dirname): string {
  let dir = path.resolve(fromDir);
  for (let i = 0; i <= MAX_WALK_UP; i++) {
    if (existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "content"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  throw new Error(
    `resolveProductRoot: no ancestor of ${JSON.stringify(fromDir)} within ${MAX_WALK_UP} levels ` +
      `has both a package.json and a content/ directory. Expected to find either the repo root ` +
      `(source tree) or dist/ (compiled tree).`,
  );
}

/**
 * Where a sibling browser app's built bundle lives: `<checkout>/apps/<app>/dist`, found by walking
 * up from `fromDir` to the first ancestor that has an `apps/<app>/` folder. Same source-vs-compiled
 * depth problem as {@link resolveProductRoot}, but that root does not help here: in the compiled
 * tree it is `dist/`, and `apps/` sits next to `dist/`, not inside it.
 *
 * Matches on `apps/<app>/` rather than `apps/<app>/dist/`, so an app that has not been built yet
 * still resolves to its real (missing) `dist` path, and the static mount can answer with its
 * "not built" page instead of looking somewhere else.
 *
 * @param app - The folder name under `apps/` (`"admin"`, `"site-chat"`).
 * @param fromDir - Override for testing; production callers omit it.
 * @returns The `dist` path. Never throws: with no matching ancestor it returns
 *   `<fromDir>/apps/<app>/dist`, which does not exist, so boot still succeeds and the mount 503s —
 *   the same outcome the old fixed path had when it pointed at the wrong place.
 * @complexity O(depth) `existsSync` calls, capped at {@link MAX_WALK_UP}.
 */
export function resolveAppDistDir(app: string, fromDir: string = import.meta.dirname): string {
  let dir = path.resolve(fromDir);
  for (let i = 0; i <= MAX_WALK_UP; i++) {
    if (existsSync(path.join(dir, "apps", app))) return path.join(dir, "apps", app, "dist");
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(fromDir, "apps", app, "dist");
}
