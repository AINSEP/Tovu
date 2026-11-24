import assert from "node:assert/strict";
import test from "node:test";

import { deriveDuplicateName } from "../copy-naming-policy.js";

test("the bound copy policy names copies '<base> <n>' (owner ruling 2026-09-08)", async () => {
  const taken = new Set(["Landing sample — xai"]);
  const isTaken = async ({ candidate }: { candidate: string }) => taken.has(candidate);
  const first = await deriveDuplicateName({ sourceName: "Landing sample — xai" }, { isTaken });
  taken.add(first);
  assert.equal(first, "Landing sample — xai 2");
  assert.equal(await deriveDuplicateName({ sourceName: "Landing sample — xai" }, { isTaken }), "Landing sample — xai 3");
});

test("the bound copy policy keeps the exact exhaustion wording", async () => {
  await assert.rejects(
    deriveDuplicateName({ sourceName: "x" }, { isTaken: async () => true }),
    { message: "no free name could be derived from 'x' after 1000 attempts — give the copy an explicit name" },
  );
});
