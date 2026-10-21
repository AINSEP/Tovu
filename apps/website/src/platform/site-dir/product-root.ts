import { existsSync } from "node:fs";
import path from "node:path";
import { isMainThread, workerData } from "node:worker_threads";

/**
 * @file Locates the product root — the directory containing this package's `package.json` and its
 * shipped `content/` tree (`content/templates`, `content/themes`, `content/agent-plugins`) — from
 * wherever the calling module happens to be running.
 *
 * Source (`apps/website/src/**`) and compiled (`dist/src/**`) modules sit at different
 * depths from their shipped `content/` tree. A fixed `../` count cannot serve both,
 * so resolution walks ancestors using the same `package.json` + `content/` condition.
 * Source finds the repo root; compiled output finds `dist/`, whose package manifest
 * and content are supplied by the build. `apps/website/` has no competing package manifest.
 */

const MAX_WALK_UP = 12;

/** The calling thread's identity and parent-supplied data, as `node:worker_threads` reports them. */
export interface ThreadContext {
  isMainThread: boolean;
  /** Whatever the parent passed; only a string `productRoot` on it is ever used. */
  workerData: { productRoot?: unknown } | null | undefined;
}

/**
 * Walks up from `fromDir` (itself included) to the first directory `matches` accepts.
 *
 * @param required.fromDir - Where the walk starts; resolved to an absolute path first.
 * @param required.matches - The marker test for one candidate directory.
 * @returns The matching directory, or `undefined` when none is found within {@link MAX_WALK_UP}
 *   levels or before the filesystem root.
 * @complexity O(depth) `matches` calls, capped at {@link MAX_WALK_UP} + 1.
 */
function findAncestor({ fromDir, matches }: { fromDir: string; matches: (dir: string) => boolean }): string | undefined {
  let dir = path.resolve(fromDir);
  for (let i = 0; i <= MAX_WALK_UP; i++) {
    if (matches(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined; // reached the filesystem root
    dir = parent;
  }
  return undefined;
}

/**
 * The product root a parent thread handed to this worker, when it applies: only inside a worker,
 * only for the default (no `fromDir`) resolution, and only when `workerData.productRoot` is a string.
 * Relocated theme workers use the trusted parent-supplied workerData.productRoot for default
 * resolution; explicit fromDir overrides still exercise ancestor discovery.
 *
 * @param required.fromDir - The caller's explicit start directory, if any.
 * @param optional.thread - Override for testing; defaults to this thread's real context.
 * @returns The supplied absolute root, or `undefined` when no worker root applies.
 * @throws If the parent supplied a relative root — an unpredictable cwd must not pick the install.
 * @complexity O(1).
 */
export function workerProductRoot(
  { fromDir }: { fromDir?: string },
  { thread = { isMainThread, workerData } }: { thread?: ThreadContext } = {},
): string | undefined {
  const supplied = thread.workerData?.productRoot;
  if (thread.isMainThread || fromDir !== undefined || typeof supplied !== "string") return undefined;
  if (!path.isAbsolute(supplied)) {
    throw new Error(
      `resolveProductRoot: worker productRoot ${JSON.stringify(supplied)} must be an absolute path; ` +
        `the parent thread must pass a resolved path in workerData.productRoot.`,
    );
  }
  return supplied;
}

/**
 * Walks up from `fromDir` (defaults to this file's own compiled/source location) until it finds a
 * directory containing both `package.json` and `content/`, and returns that directory.
 * Relocated theme workers use the trusted parent-supplied workerData.productRoot for default
 * resolution; explicit fromDir overrides still exercise ancestor discovery.
 *
 * @param fromDir - Override for testing; production callers should omit this and get the real
 *   caller-relative default.
 * @param optional.thread - Override for testing; defaults to this thread's real context.
 * @throws If no such ancestor is found within {@link MAX_WALK_UP} levels — a silent wrong guess
 *   is worse than a loud failure here — or the parent supplies a relative worker root.
 * @complexity O(depth) filesystem probes, capped at {@link MAX_WALK_UP}; O(1) for an injected root.
 */
export function resolveProductRoot(fromDir?: string, optional: { thread?: ThreadContext } = {}): string {
  const injected = workerProductRoot({ fromDir }, optional);
  if (injected !== undefined) return injected;
  const origin = fromDir ?? import.meta.dirname;
  const found = findAncestor({
    fromDir: origin,
    matches: (dir) => existsSync(path.join(dir, "package.json")) && existsSync(path.join(dir, "content")),
  });
  if (found !== undefined) return found;
  throw new Error(
    `resolveProductRoot: no ancestor of ${JSON.stringify(origin)} within ${MAX_WALK_UP} levels ` +
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
 *   allowing boot to succeed while the missing bundle is disclosed.
 * @complexity O(depth) `existsSync` calls, capped at {@link MAX_WALK_UP}.
 */
export function resolveAppDistDir(app: string, fromDir: string = import.meta.dirname): string {
  const checkout = findAncestor({ fromDir, matches: (dir) => existsSync(path.join(dir, "apps", app)) });
  return path.resolve(checkout ?? fromDir, "apps", app, "dist");
}

/**
 * The checkout root — the first ancestor of `fromDir` that has an `apps/website/` folder. That is
 * where the repo-level dev files live (`.certs/`, `.env`), and it is the same directory from the
 * tsx source tree (`apps/website/src/...`) and the compiled tree (`dist/src/...`, two levels
 * shallower), which a fixed `../` count cannot be (see this file's header).
 *
 * @param fromDir - Override for testing; production callers omit it.
 * @returns The checkout root. Never throws: with no matching ancestor (a desktop payload or any
 *   install that ships `dist/` without `apps/website/`) it returns `fromDir` itself, where no
 *   `.certs/` exists, so dev TLS stays off — the fail-open-to-HTTP outcome `dev-tls.ts` documents.
 * @complexity O(depth) `existsSync` calls, capped at {@link MAX_WALK_UP}.
 */
export function resolveCheckoutRoot(fromDir: string = import.meta.dirname): string {
  return findAncestor({ fromDir, matches: (dir) => existsSync(path.join(dir, "apps", "website")) }) ?? path.resolve(fromDir);
}
