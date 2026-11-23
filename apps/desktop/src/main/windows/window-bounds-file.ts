/**
 * @file Where the sites home window's size and position are remembered: a JSON file in `userData`
 * (same convention as `site-dir-store.ts`'s `desktop-state.json` and `site-child-registry.ts`'s
 * `site-processes/` files, both resolved the same way from `app.getPath("userData")`).
 *
 * Electron does not persist `BrowserWindow` geometry on its own — every launch starts at whatever
 * fixed size the constructor names unless something writes it down and reads it back. The file name
 * and the JSON store are this shell's; validation (a corrupt file means "nothing remembered") and the
 * on-screen decision live in Jini's `@jini-ai/desktop-host/electron/usability`.
 *
 * No `electron` import, so it is testable under plain `node --test`; `main/index.ts` supplies the
 * `userData` path.
 */
// Geometry rationale: Jini packages/desktop-host/src/electron/usability/window-bounds-store.ts.
import fs from "node:fs";
import path from "node:path";
import {
  readWindowBounds as readBounds, writeWindowBounds as writeBounds, windowBoundsFilePath as boundsFilePath,
  type BoundsStorePort, type WindowBounds,
} from "@jini-ai/desktop-host/electron/usability";

/** Pretty-printed JSON keyed by absolute file path; creates `userData` on first write. */
const windowBoundsJsonStore: BoundsStorePort = {
  read: ({ key }) => JSON.parse(fs.readFileSync(key, "utf8")),
  write: ({ key, bounds }) => {
    fs.mkdirSync(path.dirname(key), { recursive: true });
    fs.writeFileSync(key, JSON.stringify(bounds, null, 2));
  },
};

/** `<userData>/window-bounds.json`. @complexity O(1). */
function windowBoundsFilePath({ userDataDir }: { userDataDir: string }, _optional = {}): string {
  return boundsFilePath({ userDataDir, fileName: "window-bounds.json", joinPath: ({ directory, filename }) => path.join(directory, filename) });
}

/** The remembered rectangle, or `null` when missing, unreadable or malformed. @complexity O(n) in file bytes. */
function readWindowBounds({ boundsPath }: { boundsPath: string }, _optional = {}): WindowBounds | null {
  return readBounds({ store: windowBoundsJsonStore, key: boundsPath });
}

/** Write the rectangle; filesystem errors propagate. @complexity O(1). */
function writeWindowBounds({ boundsPath, bounds }: { boundsPath: string; bounds: WindowBounds }, _optional = {}): void {
  writeBounds({ store: windowBoundsJsonStore, key: boundsPath, bounds });
}

export { readWindowBounds, windowBoundsFilePath, writeWindowBounds };
