/**
 * @file Where the sites home window's size and position are remembered, and the decision that
 * keeps a remembered spot from ever opening the window off-screen.
 *
 * Electron does not persist `BrowserWindow` geometry on its own — every launch starts at whatever
 * fixed size the constructor names unless something writes it down and reads it back. This is that
 * something: a JSON file in `userData` (same convention as `site-dir-store.ts`'s
 * `desktop-state.json` and `site-process-registry.ts`'s `site-processes/` files, both resolved the same way from
 * `app.getPath("userData")`), plus {@link resolveWindowBounds} — the one place that decides whether
 * a remembered rectangle is still worth trusting.
 *
 * **Why a display can make a remembered spot wrong.** A laptop undocked from an external monitor,
 * or a monitor unplugged outright, leaves yesterday's `(x, y)` pointing at empty space no display
 * now covers — Electron does not clamp this itself; the window opens exactly there, invisible and
 * unreachable except from the Window menu. {@link boundsOnScreen} is the guard: a remembered
 * rectangle is trusted only when it meaningfully overlaps some CURRENT display, checked fresh at
 * every launch rather than assumed from whenever it was saved.
 *
 * No `electron` import, so all of it is testable under plain `node --test`; `main.ts` supplies the
 * `userData` path and `screen.getAllDisplays()`.
 */
import fs from "node:fs";
import path from "node:path";

const STATE_FILE_NAME = "window-bounds.json";

/** A `BrowserWindow`'s position and size, in the same units `getBounds()`/the constructor use. */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The slice of Electron's `Display` {@link boundsOnScreen} needs. A fake of it is what tests pass. */
export interface DisplayLike {
  bounds: { x: number; y: number; width: number; height: number };
}

/** @returns the bounds file's path inside Electron's per-user `userData` directory. */
export function windowBoundsFilePath(userDataDir: string): string {
  return path.join(userDataDir, STATE_FILE_NAME);
}

/**
 * Read the persisted bounds, treating any missing, unreadable, malformed, or non-finite entry as
 * "nothing remembered yet" rather than throwing — the caller's own fallback (a fixed default size,
 * centered) is always a safe next step, so a corrupt cache must degrade to that, not to a crash.
 *
 * @complexity O(1) beyond the file's own size.
 */
export function readWindowBounds(boundsPath: string): WindowBounds | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(boundsPath, "utf8")) as Partial<WindowBounds>;
    const { x, y, width, height } = parsed;
    if (![x, y, width, height].every((n): n is number => typeof n === "number" && Number.isFinite(n))) return null;
    return { x: x as number, y: y as number, width: width as number, height: height as number };
  } catch {
    return null;
  }
}

/** @complexity O(1). */
export function writeWindowBounds(boundsPath: string, bounds: WindowBounds): void {
  fs.mkdirSync(path.dirname(boundsPath), { recursive: true });
  fs.writeFileSync(boundsPath, JSON.stringify(bounds, null, 2));
}

/** How much of `bounds`' own rectangle has to land inside a display's work area for that display to
 *  count as "still covering it" — large enough that a sliver a stray pixel could satisfy is not
 *  enough, small enough that a window mostly dragged past a display's edge still counts. */
const MIN_ONSCREEN_PX = 100;

/**
 * Whether `bounds` still overlaps at least one of `displays` by a meaningful amount.
 *
 * @complexity O(n) in the display count — at most a handful in practice.
 */
export function boundsOnScreen(bounds: WindowBounds, displays: readonly DisplayLike[]): boolean {
  return displays.some((display) => {
    const overlapWidth = Math.min(bounds.x + bounds.width, display.bounds.x + display.bounds.width) - Math.max(bounds.x, display.bounds.x);
    const overlapHeight = Math.min(bounds.y + bounds.height, display.bounds.y + display.bounds.height) - Math.max(bounds.y, display.bounds.y);
    return overlapWidth >= MIN_ONSCREEN_PX && overlapHeight >= MIN_ONSCREEN_PX;
  });
}

/** {@link resolveWindowBounds}'s input. */
export interface ResolveWindowBoundsInput {
  stored: WindowBounds | null;
  displays: readonly DisplayLike[];
  fallback: { width: number; height: number };
}

/**
 * Decides what to hand `BrowserWindow`'s constructor: the remembered rectangle when there is one
 * AND it is still {@link boundsOnScreen}, otherwise just a default size with no `x`/`y` at all —
 * Electron centers a window with no position on the primary display on its own, which is exactly
 * the safe fallback a display that no longer exists needs.
 *
 * @complexity O(1) beyond `boundsOnScreen`'s own cost.
 */
export function resolveWindowBounds(input: ResolveWindowBoundsInput): Partial<WindowBounds> {
  if (input.stored && boundsOnScreen(input.stored, input.displays)) return input.stored;
  return { width: input.fallback.width, height: input.fallback.height };
}
