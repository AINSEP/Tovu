import { describe, expect, it } from "vitest";

import { getFolderDropPort, type FolderDropPort } from "../folder-drop-port";

/** @file Mirrors `voice-input-port.ts`'s own capability-gate shape exactly — SPEC-053 EC-05 (a plain
 *  browser tab, no `window.tovuFiles`, must resolve to `null`, never throw). */
describe("getFolderDropPort", () => {
  it("returns null for a window with no tovuFiles bridge (plain browser tab)", () => {
    const fakeWindow = {} as unknown as Window;
    expect(getFolderDropPort(fakeWindow)).toBeNull();
  });

  it("returns the real port when window.tovuFiles is present (inside the desktop shell)", () => {
    const port: FolderDropPort = { getPathForFile: () => "/Users/x/Desktop/Folder" };
    const fakeWindow = { tovuFiles: port } as unknown as Window;
    expect(getFolderDropPort(fakeWindow)).toBe(port);
  });

  it("falls back to the global window when no target is injected", () => {
    // jsdom's global `window` has no `tovuFiles` — same "absent" case as the plain-browser test
    // above, exercised through the real default path instead of an injected fake.
    expect(getFolderDropPort(undefined)).toBeNull();
  });
});
