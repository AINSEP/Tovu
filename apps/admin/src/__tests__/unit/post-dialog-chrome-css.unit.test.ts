import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { effectiveDeclarationsFor } from "./css-declarations.test-helper";

/**
 * @file `PostSettingsDialog` and `PostUrlDialog` render from `@jini-ai/admin` and emit only
 * `jini-*` classes, so the admin's shared dialog/segmented/footer/secondary-button chrome reaches
 * them through twin selectors. Each twin must carry exactly the declarations of the shared rule it
 * stands in for; the shared rules stay for every other caller. Asserted over the stylesheets, like
 * `post-field-label-css`.
 */
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const styles = read("src/styles.css");
const pages = read("src/styles/pages.css");
const nativeDialogs = read("src/styles/native-domain-dialogs.css");
const editor = read("src/styles/editor.css");

const TWINS: ReadonlyArray<[string, string, string]> = [
  ["styles.css", ".settings-dialog", ".jini-post-dialog"],
  ["styles.css", ".settings-dialog h2", ".jini-post-dialog h2"],
  ["styles.css", ".settings-dialog p", ".jini-post-dialog p"],
  ["styles.css", ".btn-secondary", ".jini-post-btn-secondary"],
  ["styles.css", ".btn-secondary:hover", ".jini-post-btn-secondary:hover"],
  ["styles.css", ".btn-secondary:where(:hover)", ".jini-post-btn-secondary:where(:hover)"],
  ["styles.css", ".btn-secondary:where(:not(:disabled):active)", ".jini-post-btn-secondary:where(:not(:disabled):active)"],
  ["styles.css", ".btn-secondary:disabled", ".jini-post-btn-secondary:disabled"],
  ["styles.css", ".editor-actions", ".jini-post-settings-dialog__actions"],
  ["styles.css", ".widget-picker-footer", ".jini-post-settings-dialog__footer"],
  ["pages.css", ".segmented", ".jini-post-settings-tabs"],
  ["pages.css", ".segmented button", ".jini-post-settings-tabs button"],
  ["pages.css", ".segmented button.is-active", '.jini-post-settings-tabs button[aria-selected="true"]'],
  ["native-domain-dialogs.css", ".settings-dialog.jini-domain-dialog", ".jini-post-dialog.jini-domain-dialog"],
];
const SHEETS: Record<string, string> = { "styles.css": styles, "pages.css": pages, "native-domain-dialogs.css": nativeDialogs };

describe("post dialog chrome twins", () => {
  it.each(TWINS)("%s: %s is twinned by %s with identical declarations", (sheet, shared, twin) => {
    const css = SHEETS[sheet]!;
    const expected = effectiveDeclarationsFor(css, shared);
    expect(expected).not.toBe("");
    expect(effectiveDeclarationsFor(css, twin)).toBe(expected);
  });

  it("keeps the post settings footer layout on the jini footer class", () => {
    expect(effectiveDeclarationsFor(editor, ".jini-post-settings-dialog .jini-post-settings-dialog__footer"))
      .toBe("display: flex; justify-content: flex-end; margin-top: var(--space-4);");
  });
});
