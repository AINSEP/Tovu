import { expect, it } from "vitest";
import { summarizeErrorMessage } from "../recent-errors-rules";

/** The thrown-error line parser keeps the documented regex's quirks: `(.+?)\s*$` on an all-space remainder yields its last character. */
it("shows the thrown error's text after the colon, trimmed", () => {
  expect(summarizeErrorMessage({ message: "[assistant] daemon down\nTypeError:   fetch failed  " }))
    .toEqual({ scope: "assistant", summary: "daemon down — fetch failed" });
});

it("treats a colon followed only by spaces as the single trailing space the lazy capture would take", () => {
  expect(summarizeErrorMessage({ message: "head\nError:   " }).summary).toBe("head —  ");
});

it("ignores a thrown-error line whose message would span a line terminator", () => {
  expect(summarizeErrorMessage({ message: "head\nError: " }).summary).toBe("head");
  expect(summarizeErrorMessage({ message: "head\nError:  " }).summary).toBe("head");
});

it("ignores an error name without a colon, a lowercase name, and a name that is not an Error or Exception", () => {
  expect(summarizeErrorMessage({ message: "head\nTypeError fetch failed" }).summary).toBe("head");
  expect(summarizeErrorMessage({ message: "head\nmyError: nope" }).summary).toBe("head");
  expect(summarizeErrorMessage({ message: "head\nWarning: nope" }).summary).toBe("head");
});

it("reads a Caused by line and stops looking at the first stack frame", () => {
  expect(summarizeErrorMessage({ message: "head\nCaused by: socket closed" }).summary).toBe("head — socket closed");
  expect(summarizeErrorMessage({ message: "head\n    at fn (file.ts:1:1)\nError: after frames" }).summary).toBe("head");
});

it("uses the cause alone when there is no headline text after the tag, and keeps the tag when nothing follows it", () => {
  expect(summarizeErrorMessage({ message: "[assistant]\nError: boom" }).summary).toBe("boom");
  expect(summarizeErrorMessage({ message: "[assistant]" })).toEqual({ scope: "assistant", summary: "[assistant]" });
});

it("returns an empty summary for a blank message and truncates a very long one with an ellipsis", () => {
  expect(summarizeErrorMessage({ message: " \n " })).toEqual({ scope: null, summary: "" });
  const long = summarizeErrorMessage({ message: "x".repeat(500) }).summary;
  expect(long).toHaveLength(200);
  expect(long.endsWith("…")).toBe(true);
});
