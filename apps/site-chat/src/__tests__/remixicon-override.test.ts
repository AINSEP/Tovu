import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { JSDOM } from "jsdom";

import { installRemixIconOverride } from "../remixicon-override";

/**
 * `installRemixIconOverride`'s three branches (see the source file's own header for the full "why":
 * this bundle's `iife` build breaks `RemixIcon.tsx`'s own `import.meta.url`-relative stylesheet
 * loader, so this module installs the host-override escape hatch that component already exposes).
 * Each test installs (or deliberately withholds) a fresh `JSDOM` global, matching
 * `highlight.test.ts`'s own "fresh JSDOM per scenario" pattern.
 */

const MARKER = "data-jini-remixicon";
const CSS_URL = "/site-chat/remixicon.css";

describe("installRemixIconOverride", () => {
  it("does nothing when document is undefined (non-browser context)", () => {
    const savedDocument = (globalThis as { document?: unknown }).document;
    assert.equal(typeof (globalThis as { document?: unknown }).document, "undefined", "sanity: no JSDOM installed for this test");
    try {
      assert.doesNotThrow(() => installRemixIconOverride());
    } finally {
      (globalThis as { document?: unknown }).document = savedDocument;
    }
  });

  describe("with a document present", () => {
    let dom: JSDOM;
    let savedDocument: unknown;

    beforeEach(() => {
      dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://localhost/" });
      savedDocument = (globalThis as { document?: unknown }).document;
      (globalThis as { document?: unknown }).document = dom.window.document;
    });

    afterEach(() => {
      (globalThis as { document?: unknown }).document = savedDocument;
      dom.window.close();
    });

    it("appends a marked stylesheet link pointed at the real static asset URL", () => {
      installRemixIconOverride();
      const link = document.querySelector(`link[${MARKER}]`);
      assert.ok(link, "expected a link element carrying the marker attribute");
      assert.equal(link?.getAttribute("rel"), "stylesheet");
      assert.equal(link?.getAttribute("href"), CSS_URL);
      assert.equal(document.head.contains(link), true);
    });

    it("does not install a second link when the marker is already present", () => {
      installRemixIconOverride();
      installRemixIconOverride();
      const links = document.querySelectorAll(`[${MARKER}]`);
      assert.equal(links.length, 1, "a second call must not duplicate the stylesheet");
    });

    it("defers to a pre-existing marked element even if it is not this module's own link", () => {
      const style = document.createElement("style");
      style.setAttribute(MARKER, "");
      document.head.appendChild(style);

      installRemixIconOverride();

      assert.equal(document.querySelectorAll(`[${MARKER}]`).length, 1, "no link should be added on top of the existing marker");
      assert.equal(document.querySelector("link"), null, "no link element should exist at all");
    });
  });
});
