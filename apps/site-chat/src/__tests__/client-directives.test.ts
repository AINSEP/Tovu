import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { extractPageActions, isPageActionDirective, isQueuedPageAction, splitPageActions, type PageAction } from "../client-directives";

/** SPEC-046 REQ-4/REQ-6 — the client's structural trust boundary for the SSE `client_directive`
 *  payload, and the pure helpers `SiteAssistantWidget.tsx` uses to act on it. */

const NAV: PageAction = { type: "navigate", target: { slug: "a", title: "A", path: "/a" }, auto: false };
const SCROLL: PageAction = { type: "scroll_to", target: { slug: "b", title: "B", path: "/b" } };
const HIGHLIGHT: PageAction = { type: "highlight", target: { slug: "c", title: "C", path: "/c" } };

describe("isPageActionDirective", () => {
  it("accepts a well-shaped navigate directive", () => {
    assert.equal(isPageActionDirective({ kind: "page_action", action: NAV }), true);
  });

  it("accepts scroll_to and highlight directives", () => {
    assert.equal(isPageActionDirective({ kind: "page_action", action: SCROLL }), true);
    assert.equal(isPageActionDirective({ kind: "page_action", action: HIGHLIGHT }), true);
  });

  it("rejects a ui_surface directive — no Tier B runtime exists in this bundle", () => {
    assert.equal(isPageActionDirective({ kind: "ui_surface", toolId: "x", resource: {} }), false);
  });

  it("rejects navigate missing the auto flag", () => {
    assert.equal(isPageActionDirective({ kind: "page_action", action: { type: "navigate", target: NAV.target } }), false);
  });

  it("rejects a target missing a required field", () => {
    assert.equal(isPageActionDirective({ kind: "page_action", action: { type: "scroll_to", target: { slug: "a", title: "A" } } }), false);
  });

  it("rejects non-object, null, and unrelated shapes without throwing", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { kind: "page_action" }]) {
      assert.doesNotThrow(() => isPageActionDirective(bad));
      assert.equal(isPageActionDirective(bad), false);
    }
  });
});

describe("isQueuedPageAction (SPEC-046 REQ-2's queued-action boundary)", () => {
  it("accepts a bare, well-shaped PageAction — the shape SiteAssistantWidget.tsx actually enqueues", () => {
    assert.equal(isQueuedPageAction(NAV), true);
    assert.equal(isQueuedPageAction(SCROLL), true);
    assert.equal(isQueuedPageAction(HIGHLIGHT), true);
  });

  it("rejects a full ClientDirective envelope — that is not what gets enqueued", () => {
    assert.equal(isQueuedPageAction({ kind: "page_action", action: NAV }), false);
  });

  it("rejects malformed and non-object entries without throwing (a poisoned queue entry, REQ-2)", () => {
    for (const bad of [null, undefined, 42, "x", [], {}, { type: "navigate" }, { type: "teleport", target: NAV.target }]) {
      assert.doesNotThrow(() => isQueuedPageAction(bad));
      assert.equal(isQueuedPageAction(bad), false);
    }
  });
});

describe("extractPageActions", () => {
  it("returns [] for undefined events", () => {
    assert.deepEqual(extractPageActions(undefined), []);
  });

  it("extracts client_directive ext events in order, skipping text/tool events", () => {
    const events = [
      { kind: "text", text: "hi" },
      { kind: "ext", name: "client_directive", data: { kind: "page_action", action: NAV } },
      { kind: "ext", name: "client_directive", data: { kind: "page_action", action: HIGHLIGHT } },
      { kind: "usage" },
    ];
    assert.deepEqual(extractPageActions(events), [NAV, HIGHLIGHT]);
  });

  it("skips an ext event under a different name and a malformed directive payload", () => {
    const events = [
      { kind: "ext", name: "some_other_product_event", data: { anything: true } },
      { kind: "ext", name: "client_directive", data: { kind: "ui_surface", toolId: "x", resource: {} } },
      { kind: "ext", name: "client_directive", data: "not even an object" },
      { kind: "ext", name: "client_directive", data: { kind: "page_action", action: SCROLL } },
    ];
    assert.deepEqual(extractPageActions(events), [SCROLL]);
  });
});

describe("splitPageActions", () => {
  it("splits a navigate and a non-navigate action apart", () => {
    assert.deepEqual(splitPageActions([HIGHLIGHT, NAV]), { navigate: NAV, other: HIGHLIGHT });
  });

  it("navigate is null when no navigate action is present", () => {
    assert.deepEqual(splitPageActions([SCROLL]), { navigate: null, other: SCROLL });
  });

  it("other is null when only a navigate action is present", () => {
    assert.deepEqual(splitPageActions([NAV]), { navigate: NAV, other: null });
  });

  it("both are null for an empty list", () => {
    assert.deepEqual(splitPageActions([]), { navigate: null, other: null });
  });

  it("takes the FIRST of each kind — at most one navigate, at most one other, per turn", () => {
    const secondNav: PageAction = { type: "navigate", target: { slug: "z", title: "Z", path: "/z" }, auto: true };
    assert.deepEqual(splitPageActions([NAV, SCROLL, secondNav, HIGHLIGHT]), { navigate: NAV, other: SCROLL });
  });
});
