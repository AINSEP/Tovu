// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SitePreviewOverlay } from "../SitePreviewOverlay/SitePreviewOverlay";
import { resetSitePreviewBus, publishSitePreview } from "../../lib/site-preview-bus";

/**
 * @file `SitePreviewOverlay` — renders nothing until `site-preview-bus.ts` publishes a path, then an
 * `<iframe>` at exactly that path, closable by Escape or its own button. Uses the REAL
 * `useSitePreviewOverlay` hook (no injected fake) so this exercises the real bus subscription, the
 * same pattern `app-hooks-admin-capability-executors.unit.test.tsx` uses for the screenshot bus.
 */

afterEach(() => {
  resetSitePreviewBus();
});

describe("SitePreviewOverlay", () => {
  it("renders nothing before any path has been published", () => {
    const { container } = render(<SitePreviewOverlay locale="en" />);
    expect(container.querySelector(".site-preview-overlay")).toBeNull();
  });

  it("mounts an iframe at exactly the published path once shown", () => {
    render(<SitePreviewOverlay locale="en" />);
    act(() => { publishSitePreview({ path: "/blog/hello" }); });

    const iframe = screen.getByTitle("Site preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe("/blog/hello");
    expect(iframe.getAttribute("referrerPolicy") ?? iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
  });

  it("closes on the close button", () => {
    render(<SitePreviewOverlay locale="en" />);
    act(() => { publishSitePreview({ path: "/blog/hello" }); });
    expect(screen.queryByTitle("Site preview")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));

    expect(screen.queryByTitle("Site preview")).toBeNull();
  });

  it("closes on Escape", () => {
    render(<SitePreviewOverlay locale="en" />);
    act(() => { publishSitePreview({ path: "/blog/hello" }); });
    expect(screen.queryByTitle("Site preview")).not.toBeNull();

    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });

    expect(screen.queryByTitle("Site preview")).toBeNull();
  });

  it("re-showing a NEW path while already open updates the iframe rather than no-op", () => {
    render(<SitePreviewOverlay locale="en" />);
    act(() => { publishSitePreview({ path: "/a" }); });
    act(() => { publishSitePreview({ path: "/b" }); });

    const iframe = screen.getByTitle("Site preview") as HTMLIFrameElement;
    expect(iframe.getAttribute("src")).toBe("/b");
  });
});
