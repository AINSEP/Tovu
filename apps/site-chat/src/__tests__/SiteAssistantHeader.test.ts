import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { JSDOM } from "jsdom";
import type { Root } from "react-dom/client";
import { act, React, createRoot, installDom } from "./react-dom-harness";

// Load the component only after the harness has pinned React and initialized the DOM.
const { SiteAssistantHeader } = await import("../SiteAssistantHeader");

/**
 * Real `react-dom/client` render into a real JSDOM document, driven with genuine DOM events
 * (`.click()`, a real `KeyboardEvent` dispatched on `window`) rather than simulated handler calls —
 * this is a real component (confirm/cancel/Escape state machine, a real `useEffect` with a real
 * cleanup path), not a pure function, so the React Component Testing Policy's render/interaction/a11y
 * coverage applies. `.test.ts`, not `.test.tsx`: the repo's test globs (`package.json`) only match
 * `*.test.ts`, so this file uses `React.createElement` instead of JSX to stay picked up without a
 * glob change.
 *
 * No `@testing-library/react` in this app (see `package.json`) — "no new deps" per the coverage
 * brief — so DOM globals (`window`/`document`/etc.) are installed from a fresh `JSDOM` instance per
 * test and saved/restored by the shared harness, which also pins linked dependencies to this app's
 * React and initializes DOM feature detection before the renderer loads.
 */

describe("SiteAssistantHeader", () => {
  let dom: JSDOM;
  let restoreDom: () => void;
  let container: HTMLElement;
  let root: Root;

  beforeEach(() => {
    const installed = installDom();
    dom = installed.dom;
    restoreDom = installed.restore;
    container = dom.window.document.getElementById("root") as unknown as HTMLElement;
    root = createRoot(container as unknown as Element);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    restoreDom();
  });

  function renderHeader(props: { title: string; hasMessages: boolean; onReset: () => void }) {
    act(() => {
      root.render(React.createElement(SiteAssistantHeader, props));
    });
  }

  function clickButton(text: string): void {
    const button = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === text);
    assert.ok(button, `expected a button labeled "${text}"`);
    act(() => {
      (button as HTMLButtonElement).click();
    });
  }

  function pressEscape(): void {
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
  }

  it("renders the public title and New thread without a workspace kicker", () => {
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => {} });

    assert.equal(container.querySelector(".jini-chat-pane__eyebrow"), null);
    assert.equal(container.querySelector(".jini-chat-pane__title")?.textContent, "My Site");
    assert.equal(container.querySelectorAll("button").length, 1);
    assert.equal(container.querySelector("button")?.textContent, "New thread");
    assert.equal(container.querySelector(".jini-chat-embed__reset-confirm"), null);
  });

  it("resets immediately with no confirm step when the transcript is empty", () => {
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: false, onReset: () => (resetCount += 1) });

    clickButton("New thread");

    assert.equal(resetCount, 1);
    assert.equal(container.querySelector(".jini-chat-embed__reset-confirm"), null, "empty transcript has nothing to confirm");
  });

  it("shows a two-step confirm, without resetting yet, when the transcript has messages", () => {
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => (resetCount += 1) });

    clickButton("New thread");

    assert.equal(resetCount, 0, "must not reset until confirmed");
    assert.ok(container.querySelector(".jini-chat-embed__reset-confirm"));
    assert.ok(Array.from(container.querySelectorAll("button")).some((b) => b.textContent === "Cancel"));
    assert.ok(Array.from(container.querySelectorAll("button")).some((b) => b.textContent === "Discard chat"));
  });

  it("protects a typed draft in an empty transcript and restores focus after Cancel or Escape", () => {
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: false, onReset: () => (resetCount += 1) });
    container.classList.add('jini-chat-pane');
    const textarea = dom.window.document.createElement('textarea');
    textarea.className = 'jini-composer-input';
    textarea.value = 'An unsent question';
    container.append(textarea);

    for (const cancel of [() => clickButton('Cancel'), pressEscape]) {
      clickButton('New thread');
      assert.equal(resetCount, 0);
      assert.equal(dom.window.document.activeElement?.textContent, 'Cancel');
      cancel();
      assert.equal(textarea.value, 'An unsent question');
      assert.equal(dom.window.document.activeElement?.textContent, 'New thread');
    }
    clickButton('New thread');
    clickButton('Discard draft');
    assert.equal(resetCount, 1);
  });

  it("autofocuses Cancel (the safe choice), not the destructive Discard button, once the confirm step appears", () => {
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => {} });
    clickButton("New thread");

    const cancelButton = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "Cancel");
    assert.equal(dom.window.document.activeElement, cancelButton, "Cancel must hold focus, not Discard");
  });

  it("backs out on Cancel without resetting, restoring the plain New thread button", () => {
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => (resetCount += 1) });
    clickButton("New thread");

    clickButton("Cancel");

    assert.equal(resetCount, 0);
    assert.equal(container.querySelector(".jini-chat-embed__reset-confirm"), null);
    assert.equal(container.querySelector("button")?.textContent, "New thread");
  });

  it("resets and closes the confirm step when Discard is clicked", () => {
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => (resetCount += 1) });
    clickButton("New thread");

    clickButton("Discard chat");

    assert.equal(resetCount, 1);
    assert.equal(container.querySelector(".jini-chat-embed__reset-confirm"), null);
  });

  it("backs out on Escape (from anywhere in the pane) without resetting", () => {
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => (resetCount += 1) });
    clickButton("New thread");
    assert.ok(container.querySelector(".jini-chat-embed__reset-confirm"), "sanity: confirm step is open");

    pressEscape();

    assert.equal(resetCount, 0);
    assert.equal(container.querySelector(".jini-chat-embed__reset-confirm"), null);
  });

  it("keeps confirmation open on non-Escape keydown without resetting", () => {
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => (resetCount += 1) });
    clickButton("New thread");
    const cancel = dom.window.document.activeElement!;
    assert.equal(cancel.textContent, "Cancel");

    for (const key of ["Tab", "Enter", "a"]) {
      act(() => {
        cancel.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
      assert.ok(container.querySelector(".jini-chat-embed__reset-confirm"), `${key} must not dismiss confirmation on keydown`);
      assert.equal(resetCount, 0);
    }
  });

  it("Escape is inert when the confirm step is not open (no listener attached, nothing to dismiss)", (t) => {
    const added = t.mock.method(window, "addEventListener");
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => (resetCount += 1) });

    assert.doesNotThrow(() => pressEscape());
    assert.equal(added.mock.calls.filter(({ arguments: args }) => args[0] === "keydown").length, 0);

    assert.equal(resetCount, 0);
    assert.equal(container.querySelector("button")?.textContent, "New thread");
  });

  it("removes its Escape listener on unmount — a later Escape after unmount touches nothing", async (t) => {
    // JSDOM lazily installs its own keydown observer on the first selector query (F7.2).
    // Initialize it before spying so these exact counts measure the component's listener.
    container.querySelector("button");
    const added = t.mock.method(window, "addEventListener");
    const removed = t.mock.method(window, "removeEventListener");
    let resetCount = 0;
    renderHeader({ title: "My Site", hasMessages: true, onReset: () => (resetCount += 1) });
    clickButton("New thread");

    const keydownAdds = () => added.mock.calls.filter(({ arguments: args }) => args[0] === "keydown");
    const keydownRemoves = () => removed.mock.calls.filter(({ arguments: args }) => args[0] === "keydown");
    assert.equal(keydownAdds().length, 1);
    assert.equal(keydownRemoves().length, 0);
    clickButton("Cancel");
    assert.deepEqual(keydownRemoves().map((call) => call.arguments), keydownAdds().map((call) => call.arguments));
    clickButton("New thread");
    assert.equal(keydownAdds().length, 2);

    await act(async () => {
      root.unmount();
    });
    assert.deepEqual(keydownRemoves().map((call) => call.arguments), keydownAdds().map((call) => call.arguments));

    assert.doesNotThrow(() => pressEscape());
    assert.equal(resetCount, 0, "an unmounted component's onReset must never fire");
  });
});
