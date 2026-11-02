/**
 * @file Native boxes through fake `dialog`/`BrowserWindow` ports: which window parents a box, what
 * the "Update ready" prompt answers, and that the OFF preference suppresses a queued prompt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import type { MessageBoxOptions } from "electron";
import {
  explainOthersOpen,
  othersOpenDialog,
  promptUpdateReady,
  showDesktopNotice,
  showOnFocusedWindow,
  updateReadyDialog,
} from "./native-notices.ts";

interface FakeWindow { name: string }

/** Records every box: `parent` is the window it was parented to, or null when app-modal. */
function fakeDialog({ response = 0 }: { response?: number } = {}) {
  const shown: { parent: FakeWindow | null; options: MessageBoxOptions }[] = [];
  const dialog = {
    showMessageBox(first: FakeWindow | MessageBoxOptions, second?: MessageBoxOptions) {
      if (second) shown.push({ parent: first as FakeWindow, options: second });
      else shown.push({ parent: null, options: first as MessageBoxOptions });
      return Promise.resolve({ response });
    },
  };
  return { dialog, shown };
}

function windowsOf({ focused, all }: { focused: FakeWindow | null; all: FakeWindow[] }) {
  return { getFocusedWindow: () => focused, getAllWindows: () => all };
}

const A = { name: "a" };
const B = { name: "b" };

test("a box parents to the focused window, else the first open window, else none", async () => {
  const cases: [FakeWindow | null, FakeWindow[], FakeWindow | null][] = [
    [B, [A, B], B],
    [null, [A, B], A],
    [null, [], null],
  ];
  for (const [focused, all, expected] of cases) {
    const { dialog, shown } = fakeDialog();
    await showOnFocusedWindow({ dialog, windows: windowsOf({ focused, all }), options: { message: "m" } });
    assert.deepEqual(shown, [{ parent: expected, options: { message: "m" } }]);
  }
});

test("a desktop notice is one OK box carrying the notice's type, message and detail", () => {
  const { dialog, shown } = fakeDialog();
  showDesktopNotice({ dialog, windows: windowsOf({ focused: A, all: [A] }),
    notice: { type: "error", message: "Couldn’t check", detail: "Try again" } });
  assert.deepEqual(shown, [{ parent: A,
    options: { type: "error", message: "Couldn’t check", detail: "Try again", buttons: ["OK"] } }]);
});

test("a notice with no open window is app-modal rather than lost", () => {
  const { dialog, shown } = fakeDialog();
  showDesktopNotice({ dialog, windows: windowsOf({ focused: null, all: [] }),
    notice: { type: "info", message: "m", detail: "d" } });
  assert.equal(shown.length, 1);
  assert.equal(shown[0]!.parent, null);
});

test("Update ready names the version, defaults to Restart and cancels to Later", () => {
  assert.deepEqual(updateReadyDialog({ version: "1.4.0" }), {
    type: "info",
    buttons: ["Restart to update", "Later"],
    defaultId: 0,
    cancelId: 1,
    message: "Update ready",
    detail: "Tovu 1.4.0 is downloaded. Restart now, or it installs when you quit Tovu.",
  });
});

test("the prompt resolves true only for Restart (button 0)", async () => {
  for (const [response, expected] of [[0, true], [1, false], [-1, false]] as const) {
    const { dialog, shown } = fakeDialog({ response });
    const restart = await promptUpdateReady({ dialog, windows: windowsOf({ focused: A, all: [A] }),
      automaticUpdates: () => true, version: "2.0.0" });
    assert.equal(restart, expected);
    assert.equal(shown[0]!.parent, A);
    assert.deepEqual(shown[0]!.options, updateReadyDialog({ version: "2.0.0" }));
  }
});

test("a prompt queued before the checkbox turned OFF shows nothing and declines the restart", async () => {
  const { dialog, shown } = fakeDialog({ response: 0 });
  const restart = await promptUpdateReady({ dialog, windows: windowsOf({ focused: A, all: [A] }),
    automaticUpdates: () => false, version: "2.0.0" });
  assert.equal(restart, false);
  assert.deepEqual(shown, []);
});

// KNOWN BUG, pinned so a fix is deliberate: the plural reads "copys" (moved verbatim from main.ts;
// this refactor changes no behavior). Fix the wording in othersOpenDialog and update these strings.
test("the others-open explanation is app-modal and pluralizes the count", () => {
  const { dialog, shown } = fakeDialog();
  explainOthersOpen({ dialog, count: 1 });
  explainOthersOpen({ dialog, count: 3 });
  assert.deepEqual(shown.map(box => [box.parent, box.options.detail]), [
    [null, "1 other copy is open. The update installs when the last one quits."],
    [null, "3 other copys are open. The update installs when the last one quits."],
  ]);
  assert.deepEqual(othersOpenDialog({ count: 2 }), { type: "info", message: "Close the other copies of Tovu first",
    detail: "2 other copys are open. The update installs when the last one quits." });
});
