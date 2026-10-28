import assert from "node:assert/strict";
import test from "node:test";

import { buildAssistantRuntimeGuidance, buildPickedFolderGuidance } from "../assistant-runtime-guidance.js";

const base = { preferSubagents: false, claudeInChrome: false, replyLength: "normal" as const };

test("a picked folder is named in the run guidance as read-only, with writes into it only through fs_write_files", () => {
  const text = buildAssistantRuntimeGuidance({ input: { ...base, pickedFolder: "/Users/x/Desktop/Brand Assets" } });
  assert.equal(text, `${buildPickedFolderGuidance({ path: "/Users/x/Desktop/Brand Assets" })} `);
  assert.match(text, /"\/Users\/x\/Desktop\/Brand Assets"/);
  assert.match(text, /read-only/);
  assert.match(text, /copy/i);
  assert.match(text, /fs_write_files/);
  assert.match(text, /approv/i);
});

test("no picked folder adds no guidance", () => {
  assert.equal(buildAssistantRuntimeGuidance({ input: base }), "");
});
