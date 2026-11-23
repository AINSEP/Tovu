/**
 * @file Tovu's binding of the "Move Tovu to your Applications folder?" prompt. Every rule (when to
 * offer it, "Not Now" per version, the /Applications clash decision, the flow) lives in
 * `@jini-ai/devops/packaging/electron/move-to-applications`; this file holds only what is Tovu's:
 * the copy, the app name, the decline file's path under `userData`, and the native bindings (the
 * desktop durable JSON helper and `fs`) injected into the policy's ports.
 *
 * Copies: presence records are written by the auto-updater, which every packaged macOS launch runs
 * unless `TOVU_DESKTOP_DISABLE_UPDATER=1`; the host counts other live copies from them.
 *
 * **Strings.** `main.ts` has no i18n layer — every native dialog there is an English literal — so
 * the prompt's strings are English too, gathered in {@link MOVE_PROMPT} so a later locale layer has
 * one place to replace.
 *
 * No `electron` import, so it runs under plain `node --test`.
 */
import fs from "node:fs";
import path from "node:path";
import type { DeclinedVersionStore, MovePromptMessages, ReadTextFile } from "@jini-ai/devops/packaging/electron/move-to-applications";

import { readJsonFile, writeJsonFileAtomic } from "./durable-json-file.ts";

/** Every string the prompt and its outcomes show. */
const MOVE_PROMPT = {
  message: "Move Tovu to your Applications folder?",
  detail: "Tovu works best from Applications — it can update itself and your disk image can be ejected.",
  moveButton: "Move to Applications",
  notNowButton: "Not Now",
  moveFailed: "Tovu could not be moved to Applications. It will keep running from here.",
  olderCopyRunning: "An older Tovu is open from Applications. Quit it, then open this copy again to replace it.",
  openingNewer: "A newer Tovu is already in Applications. Opening that one instead.",
} as const satisfies MovePromptMessages;

/** The name the skip reason uses for the other open copies. */
const MOVE_PROMPT_APP_NAME = "Tovu";

/** `<userData>/move-to-applications.json`. @complexity O(1). */
function moveDeclineFilePath({ userDataDir }: { userDataDir: string }, _options = {}): string {
  return path.join(userDataDir, "move-to-applications.json");
}

/** The desktop durable JSON helper, bound to the policy's decline store port. */
const moveDeclineStore: DeclinedVersionStore = {
  readJsonFile: ({ filePath }) => readJsonFile({ filePath }),
  writeJsonFileAtomic: ({ filePath, value }) => writeJsonFileAtomic({ filePath, value }),
};

/** `fs.readFileSync` as the policy's text reader; throws when the file cannot be read. @complexity O(n). */
const readBundleTextFile: ReadTextFile = ({ filePath }) => fs.readFileSync(filePath, "utf8");

export { MOVE_PROMPT, MOVE_PROMPT_APP_NAME, moveDeclineFilePath, moveDeclineStore, readBundleTextFile };
