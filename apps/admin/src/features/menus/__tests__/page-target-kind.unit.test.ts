import { expect, it } from "vitest";
import { menuTargetEditorKind, targetForKind } from "../page-link-rules";

it("distinguishes Page from existing generic Entry links without changing the public ref discriminator", () => {
  const entry = { kind: "entryRef" as const, entryId: "post-1" };
  expect(menuTargetEditorKind({ target: entry })).toBe("entryRef");
  const page = targetForKind({ kind: "page", prev: entry });
  expect(page).toEqual({ kind: "entryRef", entryId: "post-1", entryType: "page" });
  expect(menuTargetEditorKind({ target: page })).toBe("page");
  expect(targetForKind({ kind: "entryRef", prev: page })).toEqual(entry);
  expect(targetForKind({ kind: "url", prev: page })).toEqual({ kind: "url", href: "" });
});
