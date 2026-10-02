import assert from "node:assert/strict";
import test from "node:test";

import { buildTrashAgentToolCatalog } from "../agent-tools.js";

const TRASH_PURGE_HINT = "Use trash_empty to empty the Trash or trash_purge_item to permanently delete one item; both wait for a human confirmation card. Items here are removed automatically on the date shown.";

test("trash_list_items ends with the exact confirmed-purge and automatic-removal guidance", () => {
  const catalog = buildTrashAgentToolCatalog(["post", "menu"]);
  const tool = catalog.find((entry) => entry.name === "trash_list_items");
  assert.ok(tool, "trash_list_items must exist");
  assert.equal(tool.description.endsWith(TRASH_PURGE_HINT), true, "trash_list_items must end with the exact purge guidance");
  assert.deepEqual(catalog.filter((entry) => entry.description.includes(TRASH_PURGE_HINT)).map((entry) => entry.name), ["trash_list_items"]);
});
