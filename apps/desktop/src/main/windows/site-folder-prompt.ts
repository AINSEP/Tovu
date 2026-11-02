/**
 * @file The "which folder holds your site?" picker, extracted from `main.ts` so its decisions — the
 * self-test refusal, the message that explains a rejected startup default, and what a cancel
 * returns — are verified without Electron. `main.ts` passes Electron's `dialog` in.
 */
import { describeRejectedDefault, type RejectedDefault } from "../../startup-env.ts";

/** The native folder-dialog options this picker asks for. */
interface SiteFolderDialogOptions {
  title: string;
  message: string;
  buttonLabel: string;
  properties: Array<"openDirectory" | "createDirectory">;
}

/** The slice of Electron's `dialog` the picker uses. */
interface SiteFolderDialog {
  showOpenDialog(options: SiteFolderDialogOptions): Promise<{ canceled: boolean; filePaths: string[] }>;
}

const ASK_MESSAGE = "Pick a folder that already holds a site, or an empty folder to start a new one.";

/**
 * The dialog's message: the plain ask, prefixed with why the startup default was turned down when
 * there was one.
 *
 * @param rejectedDefault `{ dir, kind, missing? }` naming a candidate already tried and turned down
 *   (only ever non-null for the STARTUP picker, which tries `devFallbackDir` first — see
 *   `resolveSiteDir`), or `null` when there was nothing to try (every other call site).
 * @returns the message text.
 * @complexity O(1).
 */
function siteFolderPromptMessage({ rejectedDefault }: { rejectedDefault: RejectedDefault | null }, _optional = {}): string {
  if (rejectedDefault === null) return ASK_MESSAGE;
  return `${rejectedDefault.dir} was tried first but ${describeRejectedDefault(rejectedDefault)}. ${ASK_MESSAGE}`;
}

/**
 * Ask the user which folder holds their site. Cancelling returns `null`.
 *
 * `createDirectory` is on because the natural gesture for a new site is to make a folder from
 * inside the dialog; an empty one gets `tovu init`.
 *
 * @param rejectedDefault see {@link siteFolderPromptMessage}.
 * @param dialog Electron's `dialog`, or a fake.
 * @param selftest `TOVU_DESKTOP_SELFTEST=1`: no picker may be shown.
 * @returns the chosen folder, or `null` when the dialog was cancelled or returned no path.
 * @throws Error when `selftest` is set.
 * @complexity O(1) beyond the dialog itself.
 */
async function promptForSiteDir(
  { rejectedDefault, dialog, selftest }: { rejectedDefault: RejectedDefault | null; dialog: SiteFolderDialog; selftest: boolean },
  _optional = {},
): Promise<string | null> {
  // A modal dialog in a headless self-test would block forever with nothing to click it. Fail with
  // the reason instead, so an unattended run reports rather than hangs.
  if (selftest) {
    throw new Error("no site dir resolved and TOVU_DESKTOP_SELFTEST=1 cannot show a folder picker — set TOVU_DESKTOP_SITE_DIR(S).");
  }
  const result = await dialog.showOpenDialog({
    title: "Choose a folder for your Tovu site",
    message: siteFolderPromptMessage({ rejectedDefault }),
    buttonLabel: "Use this folder",
    properties: ["openDirectory", "createDirectory"],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]!; // `!`: the length check rules out an empty list.
}

export { promptForSiteDir, siteFolderPromptMessage };
export type { SiteFolderDialog, SiteFolderDialogOptions };
