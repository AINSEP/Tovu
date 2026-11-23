/**
 * @file Tovu's binding of `@jini-ai/desktop-host/electron/usability`'s window-bounds store to a JSON
 * file in `userData` (D15). Jini owns the geometry decisions (`readWindowBounds` treats a missing,
 * unreadable or malformed entry as "nothing remembered"; `resolveWindowBounds` rejects a spot no
 * current display covers); this file owns only where the rectangle lives and how it is written.
 * The filename keeps the one earlier launches wrote, so an upgrade still restores the saved spot.
 */
import fs from "node:fs";
import path from "node:path";

import {
  readWindowBounds as readStoredBounds,
  windowBoundsFilePath,
  writeWindowBounds as writeStoredBounds,
  type BoundsStorePort,
  type WindowBounds,
} from "@jini-ai/desktop-host/electron/usability";

/** The file earlier launches already wrote under `userData`; renaming it would forget every saved spot. */
const WINDOW_BOUNDS_FILE_NAME = "window-bounds.json";

/** A JSON file per key. Read errors are absorbed by Jini's reader; write errors propagate to the caller. */
const windowBoundsJsonStore: BoundsStorePort = {
  read: ({ key }) => JSON.parse(fs.readFileSync(key, "utf8")),
  write: ({ key, bounds }) => {
    // `userData` may not exist yet on a first launch that closes the window before anything else wrote there.
    fs.mkdirSync(path.dirname(key), { recursive: true });
    fs.writeFileSync(key, JSON.stringify(bounds, null, 2));
  },
};

/** The sites home window's bounds file under `userDataDir`. @complexity O(1). */
function sitesHomeBoundsPath({ userDataDir }: { userDataDir: string }, _optional = {}): string {
  return windowBoundsFilePath({
    userDataDir, fileName: WINDOW_BOUNDS_FILE_NAME, joinPath: ({ directory, filename }) => path.join(directory, filename),
  });
}

/** Remembered bounds, or `null` when nothing usable is saved. @complexity O(n) in file bytes. */
function readWindowBounds({ boundsPath }: { boundsPath: string }, _optional = {}): WindowBounds | null {
  return readStoredBounds({ store: windowBoundsJsonStore, key: boundsPath });
}

/** Persist bounds for the next launch; filesystem errors propagate. @complexity O(1). */
function writeWindowBounds({ boundsPath, bounds }: { boundsPath: string; bounds: WindowBounds }, _optional = {}): void {
  writeStoredBounds({ store: windowBoundsJsonStore, key: boundsPath, bounds });
}

export { WINDOW_BOUNDS_FILE_NAME, sitesHomeBoundsPath, readWindowBounds, writeWindowBounds };
