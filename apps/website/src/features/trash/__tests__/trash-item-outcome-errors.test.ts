import assert from "node:assert/strict";
import test from "node:test";
import { ToolInputError } from "@jini-ai/core";
import type { MoveToTrashOutcome } from "../move-to-trash.js";
import { moveToTrashOutcomeToError } from "../trash-item-tool.js";

/** @file Every non-ok moveToTrash outcome maps to one ToolInputError whose message names what to do. */

type Refusal = Extract<MoveToTrashOutcome, { ok: false }>;

test("each moveToTrash refusal reason maps to its own actionable ToolInputError", () => {
  const cases: Array<[Refusal, string]> = [
    [{ ok: false, reason: "not-found" } as Refusal, "trash_item: post 'p1' was not found. Nothing was changed."],
    [{ ok: false, reason: "forbidden", permission: "post.delete" } as Refusal, "trash_item: not authorized for 'post.delete'. Nothing was changed."],
    [{ ok: false, reason: "version-changed" } as Refusal, "trash_item: post 'p1' changed during removal. Reload and try again. Nothing was changed."],
    [{ ok: false, reason: "unknown-type" } as Refusal, "trash_item: 'post' is not a kind of thing the Trash can hold. Nothing was changed."],
  ];
  for (const [outcome, message] of cases) {
    const error = moveToTrashOutcomeToError("post", "p1", outcome);
    assert.ok(error instanceof ToolInputError);
    assert.equal(error.message, message);
  }
});

test("a reason this file does not name yet still surfaces its reason and code", () => {
  const future = { ok: false, reason: "blocked", code: "HAS_CHILDREN" } as unknown as Refusal;
  assert.equal(moveToTrashOutcomeToError("term", "t1", future).message,
    "trash_item: could not move term 't1' to the Trash: blocked (HAS_CHILDREN). Nothing was changed.");
  const bare = { ok: false, reason: "paused" } as unknown as Refusal;
  assert.equal(moveToTrashOutcomeToError("term", "t1", bare).message,
    "trash_item: could not move term 't1' to the Trash: paused. Nothing was changed.");
});
