import { expect, it } from "vitest";
import { chatCleanupCopy } from "../chat-cleanup-copy";

it("BUG T-B06: an inherited reason name uses the generic retention copy", () => {
  const copy = chatCleanupCopy({ t: ({ key }) => key, locale: "en", untitled: "Untitled" });

  expect(copy.reason({ reason: "constructor" })).toBe("Not checked");
});
