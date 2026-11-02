/**
 * @file The notice shown when Restart to update is chosen while other copies of the app are open,
 * extracted from `main.ts`'s `explainOthersOpen` so its wording is verified without Electron.
 * `main.ts` hands the result to `dialog.showMessageBox`.
 */

/** The `showMessageBox` options for the notice. */
interface OthersOpenNotice {
  type: "info";
  message: string;
  detail: string;
}

/**
 * Restart to update was chosen while other copies of the app are open.
 *
 * Known wording defect, kept as-is (this extraction changes no behavior): any count other than 1
 * reads "copys are open". Reported for a separate fix.
 *
 * @param count how many OTHER copies are open.
 * @returns the dialog options.
 * @complexity O(1).
 */
function othersOpenNotice({ count }: { count: number }, _optional = {}): OthersOpenNotice {
  return {
    type: "info",
    message: "Close the other copies of Tovu first",
    detail: `${count} other copy${count === 1 ? " is" : "s are"} open. The update installs when the last one quits.`,
  };
}

export { othersOpenNotice };
export type { OthersOpenNotice };
