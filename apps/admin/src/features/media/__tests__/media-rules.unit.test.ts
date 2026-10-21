import { describe, expect, it } from "vitest";
import type { AdminMedia } from "@/lib/api";
import {
  mediaAltText,
  parseMediaHtmlAttributes,
  readFileAsBase64,
  resolveLightboxItem,
  type Base64FileReader,
} from "../rules";

/**
 * @file Small `media/rules.ts` contracts not pinned by the topic-specific suites: the base64 file
 * reader's error/empty/bare-payload paths (driven through its injected reader), the alt-text
 * fallback chain, the lightbox index lookup, and the unsafe-URL scan on non-ASCII input.
 */

/** A plain-object reader that answers `readAsDataURL` with the given outcome on the next tick. */
function fakeReader(outcome: { result?: string | null; error?: unknown; fail?: boolean }): Base64FileReader {
  const reader: Base64FileReader = {
    error: outcome.error ?? null,
    result: outcome.result ?? null,
    onerror: null,
    onload: null,
    readAsDataURL() {
      queueMicrotask(() => (outcome.fail ? reader.onerror?.() : reader.onload?.()));
    },
  };
  return reader;
}

const file = new File(["hi"], "a.txt");

describe("readFileAsBase64", () => {
  it("returns the payload after the data: URL's comma", async () => {
    await expect(readFileAsBase64(file, { createReader: () => fakeReader({ result: "data:text/plain;base64,aGk=" }) })).resolves.toBe("aGk=");
  });

  it("returns a comma-less result unchanged", async () => {
    await expect(readFileAsBase64(file, { createReader: () => fakeReader({ result: "aGk=" }) })).resolves.toBe("aGk=");
  });

  it("returns an empty string when the reader answers null", async () => {
    await expect(readFileAsBase64(file, { createReader: () => fakeReader({ result: null }) })).resolves.toBe("");
  });

  it("rejects with the reader's own error", async () => {
    const error = new Error("disk gone");
    await expect(readFileAsBase64(file, { createReader: () => fakeReader({ fail: true, error }) })).rejects.toBe(error);
  });

  it("rejects with a generic error when the reader reports none", async () => {
    await expect(readFileAsBase64(file, { createReader: () => fakeReader({ fail: true }) })).rejects.toThrow("failed to read file");
  });

  it("defaults to the browser FileReader", async () => {
    await expect(readFileAsBase64(new File(["hi"], "a.txt", { type: "text/plain" }))).resolves.toBe("aGk=");
  });
});

describe("mediaAltText", () => {
  it("prefers alt, then title, then the untitled label", () => {
    expect(mediaAltText({ alt: "A cat", title: "IMG_1" } as AdminMedia, "Untitled asset")).toBe("A cat");
    expect(mediaAltText({ alt: "", title: "IMG_1" } as AdminMedia, "Untitled asset")).toBe("IMG_1");
    expect(mediaAltText({ alt: "", title: "" } as AdminMedia, "Untitled asset")).toBe("Untitled asset");
  });
});

describe("resolveLightboxItem", () => {
  const items = [{ id: "a" }, { id: "b" }] as AdminMedia[];

  it("returns the item at the open index, or null when closed or out of range", () => {
    expect(resolveLightboxItem(items, 1)).toBe(items[1]);
    expect(resolveLightboxItem(items, null)).toBeNull();
    expect(resolveLightboxItem(items, 5)).toBeNull();
  });
});

describe("unsafe-URL scan on non-ASCII values", () => {
  it("keeps astral characters when stripping whitespace, so an emoji-prefixed scheme is not misread", () => {
    expect(parseMediaHtmlAttributes('title="\u{1F600}javascript:x"').errors).toEqual([]);
    expect(parseMediaHtmlAttributes('title="\u{1F600}javascript:x"').attributes).toEqual({ title: "\u{1F600}javascript:x" });
  });

  it("still flags a scheme split by interior whitespace", () => {
    expect(parseMediaHtmlAttributes('title="java\tscript:x"').errors).toEqual([{ reason: "unsafe-url", attribute: "title" }]);
  });
});
