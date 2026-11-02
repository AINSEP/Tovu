/**
 * @file `site-folder-prompt.ts`: the site-folder picker, driven with a fake `dialog`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { promptForSiteDir, siteFolderPromptMessage } from "./site-folder-prompt.ts";
import type { SiteFolderDialog, SiteFolderDialogOptions } from "./site-folder-prompt.ts";
import type { RejectedDefault } from "../../startup-env.ts";

const ASK = "Pick a folder that already holds a site, or an empty folder to start a new one.";

function fakeDialog(answer: { canceled: boolean; filePaths: string[] }) {
  const asked: SiteFolderDialogOptions[] = [];
  const dialog: SiteFolderDialog = {
    async showOpenDialog(options) {
      asked.push(options);
      return answer;
    },
  };
  return { dialog, asked };
}

test("with nothing rejected, the message is the plain ask", () => {
  assert.equal(siteFolderPromptMessage({ rejectedDefault: null }), ASK);
});

test("a rejected startup default is named first, with the reason for each kind", () => {
  const cases: Array<[RejectedDefault, string]> = [
    [{ dir: "/sites/dev", kind: "empty" }, "/sites/dev was tried first but has no site in it yet. "],
    [{ dir: "/sites/dev", kind: "unreadable" }, "/sites/dev was tried first but could not be read (check its permissions, or whether something replaced it). "],
    [{ dir: "/sites/dev", kind: "incomplete", missing: ["content.db"] }, "/sites/dev was tried first but is missing content.db — it looks like a half-initialized site. "],
    [{ dir: "/sites/dev", kind: "occupied", missing: ["site.json", "content.db"] }, "/sites/dev was tried first but is not a Tovu site (missing site.json and content.db). "],
  ];
  for (const [rejectedDefault, prefix] of cases) {
    assert.equal(siteFolderPromptMessage({ rejectedDefault }), `${prefix}${ASK}`, rejectedDefault.kind);
  }
});

test("the picker asks for a folder it may also create, with the explained message", async () => {
  const { dialog, asked } = fakeDialog({ canceled: false, filePaths: ["/Users/me/site"] });
  const chosen = await promptForSiteDir({ rejectedDefault: { dir: "/sites/dev", kind: "empty" }, dialog, selftest: false });
  assert.equal(chosen, "/Users/me/site");
  assert.deepEqual(asked, [{
    title: "Choose a folder for your Tovu site",
    message: `/sites/dev was tried first but has no site in it yet. ${ASK}`,
    buttonLabel: "Use this folder",
    properties: ["openDirectory", "createDirectory"],
  }]);
});

test("the first of several chosen paths is returned", async () => {
  const { dialog } = fakeDialog({ canceled: false, filePaths: ["/a", "/b", "/c"] });
  assert.equal(await promptForSiteDir({ rejectedDefault: null, dialog, selftest: false }), "/a");
});

test("a cancelled dialog returns null even if it carries paths", async () => {
  const { dialog } = fakeDialog({ canceled: true, filePaths: ["/a"] });
  assert.equal(await promptForSiteDir({ rejectedDefault: null, dialog, selftest: false }), null);
});

test("an uncancelled dialog with no path returns null", async () => {
  const { dialog } = fakeDialog({ canceled: false, filePaths: [] });
  assert.equal(await promptForSiteDir({ rejectedDefault: null, dialog, selftest: false }), null);
});

test("a self-test refuses to show a picker and names the env vars that avoid it", async () => {
  const { dialog, asked } = fakeDialog({ canceled: false, filePaths: ["/a"] });
  await assert.rejects(
    promptForSiteDir({ rejectedDefault: null, dialog, selftest: true }),
    { name: "Error", message: "no site dir resolved and TOVU_DESKTOP_SELFTEST=1 cannot show a folder picker — set TOVU_DESKTOP_SITE_DIR(S)." },
  );
  assert.deepEqual(asked, [], "no dialog may open in a self-test");
});

test("a dialog failure propagates unchanged", async () => {
  const dialog: SiteFolderDialog = { showOpenDialog: async () => { throw new Error("no display"); } };
  await assert.rejects(promptForSiteDir({ rejectedDefault: null, dialog, selftest: false }), { message: "no display" });
});
