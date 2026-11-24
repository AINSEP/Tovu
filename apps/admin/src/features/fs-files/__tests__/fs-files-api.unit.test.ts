import { expect, it } from "vitest";

import { ApiError } from "../../../lib/admin-http/request";
import { isFolderPickerBusyError } from "../api/fs-files-api";

/**
 * @file The host binding `AssistantDock` passes to `@jini-ai/admin`'s `useNativeFolderPicker` as
 * `isDialogAlreadyOpen`: only the folder-picker route's 409 (a dialog already open in another tab)
 * keeps the button usable; every other rejection hides it.
 */

it("treats only an ApiError 409 as a dialog already open", () => {
  expect(isFolderPickerBusyError({ error: new ApiError({ message: "busy", status: 409 }) })).toBe(true);
  expect(isFolderPickerBusyError({ error: new ApiError({ message: "picker-failed", status: 500 }) })).toBe(false);
  expect(isFolderPickerBusyError({ error: new ApiError({ message: "not found", status: 404 }) })).toBe(false);
  expect(isFolderPickerBusyError({ error: Object.assign(new Error("busy"), { status: 409 }) })).toBe(false);
});
