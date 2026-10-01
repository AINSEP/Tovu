import assert from "node:assert/strict";
import test from "node:test";

import { buildTrashAgentToolCatalog } from "../agent-tools.js";

const TRASH_PURGE_HINT = "There is no tool to empty the Trash or permanently delete an item; the owner does that from the Trash screen in the admin. Items here are removed automatically on the date shown.";

test("trash_list_items ends with the exact manual-purge and automatic-removal guidance", () => {
  const catalog = buildTrashAgentToolCatalog(["post", "menu"]);
  const tool = catalog.find((entry) => entry.name === "trash_list_items");
  assert.ok(tool, "trash_list_items must exist");
  assert.equal(tool.description.endsWith(TRASH_PURGE_HINT), true, "trash_list_items must end with the exact purge guidance");
  assert.deepEqual(catalog.filter((entry) => entry.description.includes(TRASH_PURGE_HINT)).map((entry) => entry.name), ["trash_list_items"]);
});
