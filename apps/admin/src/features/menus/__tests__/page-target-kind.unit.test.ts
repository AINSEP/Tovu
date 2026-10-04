import { expect, it } from "vitest";
import { menuTargetEditorKind, pageItemsForSave, pageTargetForChoice, targetForKind } from "../page-link-rules";

it("distinguishes Page from existing generic Entry links without changing the public ref discriminator", () => {
  const entry = { kind: "entryRef" as const, entryId: "post-1" };
  expect(menuTargetEditorKind({ target: entry })).toBe("entryRef");
  const page = targetForKind({ kind: "page", prev: entry });
  expect(page).toEqual({ kind: "entryRef", entryId: "post-1", entryType: "page" });
  expect(menuTargetEditorKind({ target: page })).toBe("page");
  expect(targetForKind({ kind: "entryRef", prev: page })).toEqual(entry);
  expect(targetForKind({ kind: "url", prev: page })).toEqual({ kind: "url", href: "" });
});

it("recognizes an unhinted page id from the catalogue while keeping generic entries as Entry", () => {
  const pages = [{ id: "page-1", title: "About", status: "published" as const }];
  expect(menuTargetEditorKind({ target: { kind: "entryRef", entryId: "page-1" }, pages })).toBe("page");
  expect(menuTargetEditorKind({ target: { kind: "entryRef", entryId: "post-1" }, pages })).toBe("entryRef");
});

it("retains the last-known path during a catalogue failure and drops it when a different page is selected", () => {
  const target = { kind: "entryRef" as const, entryId: "page-1", entryType: "page", lastKnownHref: "/about" };
  expect(pageItemsForSave({ items: [{ id: "about", target }] })[0].target).toEqual(target);
  expect(pageTargetForChoice({ entryId: "page-2", previous: target })).toEqual({ kind: "entryRef", entryId: "page-2", entryType: "page" });
  expect(targetForKind({ kind: "page", prev: { kind: "url", href: "/about" } })).toEqual({
    kind: "entryRef", entryId: "", entryType: "page", lastKnownHref: "/about",
  });
});
