import assert from "node:assert/strict";
import test from "node:test";

import { TRASH_RETENTION_DAYS } from "#src/server/runtime/composition/trash-retention";
import { getTrashItemAgentToolCatalog } from "../trash-item-tool.js";

test("the trash_item tool tells the model the retention window the host actually injects, not a stale one", () => {
  const text = JSON.stringify(getTrashItemAgentToolCatalog());
  const windows = [...text.matchAll(/(\d+)-day retention/g)].map((match) => Number(match[1]));
  assert.ok(windows.length > 0, "the tool still names its retention window");
  assert.deepEqual([...new Set(windows)], [TRASH_RETENTION_DAYS]);
});
