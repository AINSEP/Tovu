import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { useFocusTrap } from "../use-focus-trap.hooks";

/**
 * @file `useFocusTrap` — the Tab containment an `aria-modal="true"` div dialog promises. The
 * attribute tells assistive technology the background is unavailable; without this, Tab walked
 * straight out of the dialog onto page controls behind it.
 *
 * Asserts on the dispatched event's own `defaultPrevented` (the listener is a native `document`
 * listener, not a React handler, so root delegation does not apply) and on `document.activeElement`.
 */

function Dialog({ label, trapped = true }: { label: string; trapped?: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(ref, trapped);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label}>
      <button type="button">{label} first</button>
      <button type="button" disabled>
        {label} disabled
      </button>
      <input aria-label={`${label} field`} />
      <button type="button">{label} last</button>
    </div>
  );
}

function tab(target: Element, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

function button(name: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll("button")).find((b) => b.textContent === name);
  if (!found) throw new Error(`no button "${name}"`);
  return found;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useFocusTrap", () => {
  it("Tab on the last focusable element wraps to the first instead of leaving the dialog", () => {
    render(
      <>
        <button type="button">page behind</button>
        <Dialog label="A" />
      </>,
    );
    button("A last").focus();

    const event = tab(button("A last"));

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("A first"));
  });

  it("Shift+Tab on the first focusable element wraps to the last", () => {
    render(<Dialog label="A" />);
    button("A first").focus();

    const event = tab(button("A first"), true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("A last"));
  });

  it("Tab in the middle of the dialog is left to the browser", () => {
    render(<Dialog label="A" />);
    const field = document.querySelector("input")!;
    field.focus();

    const event = tab(field);

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(field);
  });

  it("Tab while focus is outside the dialog pulls it back to the first element", () => {
    render(
      <>
        <button type="button">page behind</button>
        <Dialog label="A" />
      </>,
    );
    button("page behind").focus();

    const event = tab(button("page behind"));

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(button("A first"));
  });

  it("only the most recently opened trap acts when two are open at once", () => {
    render(
      <>
        <Dialog label="Outer" />
        <Dialog label="Inner" />
      </>,
    );
    button("Inner last").focus();

    tab(button("Inner last"));

    expect(document.activeElement).toBe(button("Inner first"));
  });

  it("the outer trap takes over again once the inner one closes", () => {
    const { rerender } = render(
      <>
        <Dialog label="Outer" />
        <Dialog label="Inner" />
      </>,
    );
    rerender(<Dialog label="Outer" />);
    button("Outer last").focus();

    tab(button("Outer last"));

    expect(document.activeElement).toBe(button("Outer first"));
  });

  it("does nothing while inactive", () => {
    render(<Dialog label="A" trapped={false} />);
    button("A last").focus();

    const event = tab(button("A last"));

    expect(event.defaultPrevented).toBe(false);
  });

  it("ignores keys other than Tab", () => {
    render(<Dialog label="A" />);
    button("A last").focus();
    const event = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });

    button("A last").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});
