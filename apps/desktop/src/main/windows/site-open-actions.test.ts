/**
 * @file `site-open-actions.ts`: the "Open Site…" / "Open Recent" actions, driven with fake ports.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { adoptAndOpenSite, promptAndOpenNewSite } from "./site-open-actions.ts";
import type { SiteOpenActionPorts } from "./site-open-actions.ts";

/** Ports that record every step into `log`. */
function fakePorts(overrides: Partial<SiteOpenActionPorts> = {}) {
  const log: string[] = [];
  const ports: SiteOpenActionPorts = {
    adoptSiteDir: async (dir) => { log.push(`adopt ${dir}`); return `${dir}/site`; },
    openSiteWindow: async (siteDir) => { log.push(`open ${siteDir}`); },
    refreshAppMenu: () => { log.push("refresh"); },
    promptForSiteDir: async () => { log.push("prompt"); return "/picked"; },
    showErrorBox: (title, message) => { log.push(`error ${title}: ${message}`); },
    ...overrides,
  };
  return { ports, log };
}

test("open recent: adopts the folder, opens what adoption resolved, then refreshes the menu", async () => {
  const { ports, log } = fakePorts();
  await adoptAndOpenSite({ dir: "/recent", ports });
  assert.deepEqual(log, ["adopt /recent", "open /recent/site", "refresh"]);
});

test("a folder that no longer adopts is reported and nothing opens or refreshes", async () => {
  const { ports, log } = fakePorts({ adoptSiteDir: async () => { throw new Error("is not a Tovu site"); } });
  await adoptAndOpenSite({ dir: "/moved", ports });
  assert.deepEqual(log, ["error Tovu could not open that site: is not a Tovu site"]);
});

test("a window that fails to open is reported and the menu is not refreshed", async () => {
  const { ports, log } = fakePorts({ openSiteWindow: async () => { throw new Error("spawn failed"); } });
  await adoptAndOpenSite({ dir: "/a", ports });
  assert.deepEqual(log, ["adopt /a", "error Tovu could not open that site: spawn failed"]);
});

test("open site…: prompts, then adopts, opens and refreshes the picked folder", async () => {
  const { ports, log } = fakePorts();
  await promptAndOpenNewSite({ ports });
  assert.deepEqual(log, ["prompt", "adopt /picked", "open /picked/site", "refresh"]);
});

test("a cancelled picker does nothing at all", async () => {
  const { ports, log } = fakePorts({ promptForSiteDir: async () => null });
  await promptAndOpenNewSite({ ports });
  assert.deepEqual(log, []);
});

test("a picker that cannot be shown (self-test) is reported as a folder failure", async () => {
  const { ports, log } = fakePorts({ promptForSiteDir: async () => { throw new Error("cannot show a folder picker"); } });
  await promptAndOpenNewSite({ ports });
  assert.deepEqual(log, ["error Tovu could not open that folder: cannot show a folder picker"]);
});

test("a picked folder that fails to open is reported as a site failure, not a folder failure", async () => {
  const { ports, log } = fakePorts({ adoptSiteDir: async () => { throw new Error("occupied"); } });
  await promptAndOpenNewSite({ ports });
  assert.deepEqual(log, ["prompt", "error Tovu could not open that site: occupied"]);
});

test("a failing error dialog propagates rather than being swallowed", async () => {
  const { ports } = fakePorts({
    adoptSiteDir: async () => { throw new Error("x"); },
    showErrorBox: () => { throw new Error("dialog unavailable"); },
  });
  await assert.rejects(adoptAndOpenSite({ dir: "/a", ports }), { message: "dialog unavailable" });
});
