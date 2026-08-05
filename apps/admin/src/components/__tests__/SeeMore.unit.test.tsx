import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SeeMore, useSeeMoreClamp } from "../SeeMore";

/**
 * @file `SeeMore` — the line-clamped block with a "See more" / "See less" toggle.
 *
 * jsdom has no layout engine: `scrollHeight` and `clientHeight` are both hard 0, so the component's
 * own overflow check reports "fits" for every string and the toggle would never render in any test
 * here. `stubLayout` below installs the smallest honest model of the real thing — the clamped
 * element is taller than its box, the expanded one is not — because that difference is precisely
 * what the component keys off, and getting it backwards is the strand-the-user bug this suite's
 * fourth test pins. Nothing here can vouch for the CSS actually clamping; that is a browser
 * measurement (see the handoff's "jsdom certified a visibly broken dialog" finding), and this
 * suite covers the behavior contract only.
 */

const CLAMPED_BOX_HEIGHT = 40;
const FULL_TEXT_HEIGHT = 120;

const LONG_TEXT =
  "Add CSS classes and HTML attributes to this field's input. Classes are unrestricted, and " +
  "attribute names are limited to a safe allowlist — anything else is rejected.";

let originalScrollHeight: PropertyDescriptor | undefined;
let originalClientHeight: PropertyDescriptor | undefined;

/**
 * @param overflowing when false, content is exactly its box height — the "short string, no toggle"
 * case. When true, clamped content overflows and expanded content does not, mirroring what a real
 * engine reports once `-webkit-line-clamp` is lifted.
 */
function stubLayout(overflowing: boolean) {
  Object.defineProperty(Element.prototype, "clientHeight", {
    configurable: true,
    get() {
      return CLAMPED_BOX_HEIGHT;
    },
  });
  Object.defineProperty(Element.prototype, "scrollHeight", {
    configurable: true,
    get(this: Element) {
      if (!overflowing) return CLAMPED_BOX_HEIGHT;
      return this.classList.contains("is-expanded") ? CLAMPED_BOX_HEIGHT : FULL_TEXT_HEIGHT;
    },
  });
}

beforeEach(() => {
  originalScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, "scrollHeight");
  originalClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, "clientHeight");
});

afterEach(() => {
  if (originalScrollHeight) Object.defineProperty(Element.prototype, "scrollHeight", originalScrollHeight);
  if (originalClientHeight) Object.defineProperty(Element.prototype, "clientHeight", originalClientHeight);
});

describe("SeeMore", () => {
  it("renders collapsed with the full text still in the DOM", async () => {
    stubLayout(true);
    const { container } = render(<SeeMore>{LONG_TEXT}</SeeMore>);

    const region = container.querySelector(".see-more-text");
    // The point of clamping over conditional rendering: every word is present and findable even
    // while visually cut off. A substring-based implementation would pass nothing but this.
    expect(region).toHaveTextContent(LONG_TEXT);
    expect(region).not.toHaveClass("is-expanded");
    expect(screen.getByRole("button", { name: "See more" })).toHaveAttribute("aria-expanded", "false");
  });

  it("renders no toggle at all when the text fits within the clamp", () => {
    stubLayout(false);
    render(<SeeMore>Short.</SeeMore>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("expands and collapses, swapping the label and aria-expanded", async () => {
    const user = userEvent.setup();
    stubLayout(true);
    const { container } = render(<SeeMore>{LONG_TEXT}</SeeMore>);
    const region = container.querySelector(".see-more-text");

    await user.click(screen.getByRole("button", { name: "See more" }));
    expect(region).toHaveClass("is-expanded");
    expect(screen.getByRole("button", { name: "See less" })).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("button", { name: "See less" }));
    expect(region).not.toHaveClass("is-expanded");
    expect(screen.getByRole("button", { name: "See more" })).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps the toggle mounted while expanded", async () => {
    const user = userEvent.setup();
    stubLayout(true);
    render(<SeeMore>{LONG_TEXT}</SeeMore>);

    await user.click(screen.getByRole("button", { name: "See more" }));

    // The regression this pins: expanding removes the clamp, so a re-measure while expanded reports
    // "does not overflow" and would unmount the only control that can collapse it again. The
    // component skips measuring while expanded precisely to prevent that. Without the skip, this
    // assertion fails and the user is stuck reading six lines forever.
    expect(screen.getByRole("button", { name: "See less" })).toBeInTheDocument();
  });

  it("points aria-controls at the clamped region's own id", () => {
    stubLayout(true);
    const { container } = render(<SeeMore>{LONG_TEXT}</SeeMore>);

    const region = container.querySelector(".see-more-text");
    const controlled = screen.getByRole("button").getAttribute("aria-controls");
    expect(controlled).toBeTruthy();
    expect(region?.id).toBe(controlled);
  });

  it("drives the clamp line count from the prop, not a class per N", () => {
    stubLayout(true);
    for (const lines of [1, 2, 3]) {
      const { container, unmount } = render(<SeeMore lines={lines}>{LONG_TEXT}</SeeMore>);
      const region = container.querySelector<HTMLElement>(".see-more-text");
      expect(region?.style.getPropertyValue("--see-more-lines")).toBe(String(lines));
      unmount();
    }
  });

  it("defaults to two lines and raises a below-1 value to 1", () => {
    stubLayout(true);
    const { container, unmount } = render(<SeeMore>{LONG_TEXT}</SeeMore>);
    expect(container.querySelector<HTMLElement>(".see-more-text")?.style.getPropertyValue("--see-more-lines")).toBe("2");
    unmount();

    const { container: zero } = render(<SeeMore lines={0}>{LONG_TEXT}</SeeMore>);
    expect(zero.querySelector<HTMLElement>(".see-more-text")?.style.getPropertyValue("--see-more-lines")).toBe("1");
  });

  it("applies caller styling classes without dropping its own", () => {
    stubLayout(true);
    const { container } = render(
      <SeeMore className="host-wrap" textClassName="field-attrs-hint" toggleClassName="host-toggle">
        {LONG_TEXT}
      </SeeMore>
    );

    expect(container.querySelector(".see-more")).toHaveClass("host-wrap");
    // `field-attrs-hint` is what carries the caller's typography; `see-more-text` is what carries
    // the clamp. Both must survive — dropping either is a silent visual regression.
    expect(container.querySelector(".see-more-text")).toHaveClass("field-attrs-hint");
    expect(screen.getByRole("button")).toHaveClass("see-more-toggle", "host-toggle");
  });

  it("accepts custom toggle labels and an explicit accessible name", async () => {
    const user = userEvent.setup();
    stubLayout(true);
    render(
      <SeeMore moreLabel="Show details" lessLabel="Hide details" toggleAriaLabel="Toggle attribute help">
        {LONG_TEXT}
      </SeeMore>
    );

    // `aria-label` wins over the visible text for the accessible name, which is the whole reason
    // the prop exists: several "See more" buttons on one screen are indistinguishable in a screen
    // reader's button list.
    const toggle = screen.getByRole("button", { name: "Toggle attribute help" });
    expect(toggle).toHaveTextContent("Show details");

    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Toggle attribute help" })).toHaveTextContent("Hide details");
  });

  it("renders element children, not just strings", () => {
    stubLayout(true);
    const { container } = render(
      <SeeMore>
        Use <code>md:col-span-2</code> here.
      </SeeMore>
    );
    expect(container.querySelector(".see-more-text code")).toHaveTextContent("md:col-span-2");
  });
});

/** A fake element good enough for `useSeeMoreClamp`'s `measure()`: it only ever reads
 * `clientHeight`/`scrollHeight` off `textRef.current`, nothing else about a real node. */
function fakeMeasuredElement(clientHeight: number, scrollHeight: number): HTMLDivElement {
  return { clientHeight, scrollHeight } as unknown as HTMLDivElement;
}

describe("useSeeMoreClamp", () => {
  it("rounds lines to the nearest integer and floors anything below 1", () => {
    const cases: Array<[number, number]> = [
      [2, 2],
      [1.4, 1],
      [2.6, 3],
      [0, 1],
      [-3, 1],
    ];
    for (const [lines, expected] of cases) {
      const { result } = renderHook(() => useSeeMoreClamp({ lines, children: "x" }));
      expect(result.current.lineCount).toBe(expected);
    }
  });

  it("starts collapsed and flips via setExpanded", () => {
    const { result } = renderHook(() => useSeeMoreClamp({ lines: 2, children: "x" }));
    expect(result.current.expanded).toBe(false);

    act(() => result.current.setExpanded(true));
    expect(result.current.expanded).toBe(true);
  });

  it("measures overflow against the live textRef element when children change while collapsed", () => {
    const { result, rerender } = renderHook(({ children }) => useSeeMoreClamp({ lines: 2, children }), {
      initialProps: { children: "short" },
    });

    // The hook only measures the ref it's handed — nothing here renders real DOM, so a fake element
    // exposing the two properties `measure()` actually reads is the honest substitute for the
    // clamped/full-text box heights a real browser would report.
    act(() => {
      result.current.textRef.current = fakeMeasuredElement(CLAMPED_BOX_HEIGHT, FULL_TEXT_HEIGHT);
    });
    rerender({ children: "longer text that overflows" });
    expect(result.current.overflows).toBe(true);
  });

  it("does not re-measure while expanded, leaving overflows stale until the next collapse", () => {
    const { result, rerender } = renderHook(({ children }) => useSeeMoreClamp({ lines: 2, children }), {
      initialProps: { children: "a" },
    });
    act(() => {
      result.current.textRef.current = fakeMeasuredElement(CLAMPED_BOX_HEIGHT, FULL_TEXT_HEIGHT);
    });
    rerender({ children: "b" });
    expect(result.current.overflows).toBe(true);

    act(() => result.current.setExpanded(true));
    act(() => {
      // Reports "fits" now — matches what a real element would report once the clamp is lifted.
      // The guard under test: the hook must NOT re-measure while expanded, so `overflows` should
      // stay stuck at `true` rather than flip to `false` and strand the user with no way to
      // collapse (the same regression the component-level "keeps the toggle mounted" test pins).
      result.current.textRef.current = fakeMeasuredElement(CLAMPED_BOX_HEIGHT, CLAMPED_BOX_HEIGHT);
    });
    rerender({ children: "c" });
    expect(result.current.overflows).toBe(true);
  });
});
