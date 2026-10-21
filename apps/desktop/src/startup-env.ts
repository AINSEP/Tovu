/**
 * @file The shell's launch-time environment decisions, extracted from `main.ts` (the Electron
 * composition root) so they are verified directly: which boot mode a launch opens, how a site's
 * `tovu serve` runs, which site dirs were pinned, and how a rejected startup default is explained.
 * Every function takes the environment as an argument; `main.ts` passes `process.env` once.
 */
import type { resolveSiteDir } from "./site-dir-store.ts";

/** `"source"` or `"compiled"`: how a site's `tovu serve` is run. See `main.ts`'s header. */
export type CliMode = "source" | "compiled";

/** The candidate the startup picker is told was tried first and turned down: `site-dir-store.ts`'s
 *  `RejectedDevFallback`, read off {@link resolveSiteDir}'s picker seam because that module does not
 *  export it. */
export type RejectedDefault = NonNullable<Parameters<NonNullable<Parameters<typeof resolveSiteDir>[0]["pickDir"]>>[0]>;

/** The environment slice these decisions read. */
export type StartupEnv = Readonly<Record<string, string | undefined>>;

/**
 * `true` when this launch should open the sites home Projects screen (boot mode 0) rather than a site
 * directly. Default since 2026-09-06 — the whole point of the port — but three things must keep
 * bypassing it unconditionally, because they each name a single destination directly and exist
 * specifically for automation/attach workflows that have no use for a project picker:
 *
 * - `TOVU_DESKTOP_URL` (attach mode).
 * - `TOVU_DESKTOP_SITE_DIR` / `TOVU_DESKTOP_SITE_DIRS` (own-server, pinned to specific dir(s)) —
 *   this is what keeps every existing `TOVU_DESKTOP_SITE_DIR`-driven E2E spec and any real
 *   automation untouched by this flip.
 *
 * An explicit `TOVU_DESKTOP_UI=runner` still opts in outright, unconditionally, matching this
 * function's pre-flip behavior exactly (kept for anyone who has that set alongside one of the
 * above, historically to force the sites home UI over a pinned site dir — that ordering is preserved:
 * explicit `runner` is checked, and returns, before any bypass condition below).
 */
export function sitesUiRequested({ env }: { env: StartupEnv }, _optional = {}): boolean {
  if (env.TOVU_DESKTOP_UI?.trim() === "runner") return true;
  const bypassesFrontPage =
    Boolean(env.TOVU_DESKTOP_URL?.trim()) ||
    Boolean(env.TOVU_DESKTOP_SITE_DIR?.trim()) ||
    explicitStartupSiteDirs({ env }) !== null;
  return !bypassesFrontPage;
}

/** `"source"` (default) or `"compiled"` — see `main.ts`'s own header. Read once at module load,
 *  same convention as every other `TOVU_DESKTOP_*` env var (parsed in `main.ts`, passed down as a
 *  plain argument, never read directly by `tovu-server.ts`/`site-dir-store.ts`). */
export function resolveCliMode({ env, defaultCliMode }: { env: StartupEnv; defaultCliMode: CliMode }, _optional = {}): CliMode {
  const explicit = env.TOVU_DESKTOP_CLI_MODE?.trim();
  if (explicit === "compiled") return "compiled";
  if (explicit === "source") return "source";
  // `"source"` in a checkout — unchanged, including for a garbage value, which still falls through
  // to the default exactly as the old ternary did. `"compiled"` when packaged, where no TypeScript
  // source and no `tsx` ship; see `packaged-paths.ts`.
  return defaultCliMode;
}

/** `TOVU_DESKTOP_SITE_DIRS`, split and trimmed — `null` when unset, so callers fall back to the
 *  normal single-site `resolveSiteDir()` precedence untouched. */
export function explicitStartupSiteDirs({ env }: { env: StartupEnv }, _optional = {}): string[] | null {
  const raw = env.TOVU_DESKTOP_SITE_DIRS?.trim();
  if (!raw) return null;
  return raw.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0);
}

/** Why the startup picker's first candidate was turned down, as the clause of its dialog message. */
export function describeRejectedDefault(rejectedDefault: RejectedDefault, _optional = {}): string {
  if (rejectedDefault.kind === "empty") return "has no site in it yet";
  // Before the `missing` read below: `classifySiteDirSafely` reports a candidate it could not
  // examine at all (EACCES/ENOTDIR/ELOOP — see D-01), and that verdict has no marker list to name,
  // so the generic branch would throw on `undefined.join` while building the very dialog that is
  // supposed to explain the problem.
  if (rejectedDefault.kind === "unreadable") return "could not be read (check its permissions, or whether something replaced it)";
  // "incomplete" and "occupied" both carry `missing` — the exact marker file name(s) `resolveSiteDir`
  // found absent — so the message names the actual reason instead of a generic "not a Tovu site".
  const missing = rejectedDefault.missing!.join(" and "); // `!`: "incomplete" and "occupied", the only kinds left, always carry it.
  return rejectedDefault.kind === "incomplete"
    ? `is missing ${missing} — it looks like a half-initialized site`
    : `is not a Tovu site (missing ${missing})`;
}
