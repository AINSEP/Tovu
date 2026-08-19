import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Playground } from "../Playground";
import {
  getPlaygroundRenderTarget,
  resetPlaygroundRenderTargetBus,
} from "../../../lib/playground-render-target-bus";

/**
 * @file `Playground` is the Studio "whiteboard" — a static instructional page (no manual component
 * picker, no `usePlayground` hook — the assistant discovers and renders components itself,
 * `assistant_render_ui`, tested at that tool's own layer) plus one live piece: it publishes its own
 * canvas container to `lib/playground-render-target-bus.ts` while mounted, which is what makes
 * `RoutedA2uiSurfaceCard.tsx` land a drawn surface here instead of inline in the chat transcript
 * (see that component's own test for the routing decision itself — this file only proves
 * Playground holds up its half: register on mount, unregister on unmount).
 *
 * The register/unregister ref callback itself lives in `hooks/use-playground-canvas.hooks.ts` and
 * is covered indirectly by the mount/unmount tests below (they exercise the real, default-injected
 * hook); the `usePlaygroundCanvasHook` describe block below covers the injectable-prop seam itself.
 */

afterEach(() => {
  resetPlaygroundRenderTargetBus();
});

describe("Playground", () => {
  it("renders the page heading and an example prompt inline in the description", () => {
    render(<Playground />);
    expect(screen.getByRole("heading", { name: "Playground" })).toBeInTheDocument();
    expect(screen.getByText(/pie chart of my posts vs pages/)).toBeInTheDocument();
  });

  it("shows a canvas with an empty-state message before anything has been drawn", () => {
    render(<Playground />);
    expect(screen.getByRole("heading", { name: "Canvas" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing drawn yet/)).toBeInTheDocument();
  });

  it("registers its own canvas container as the active Playground render target on mount", () => {
    expect(getPlaygroundRenderTarget()).toBeNull();

    render(<Playground />);

    const target = getPlaygroundRenderTarget();
    expect(target).not.toBeNull();
    expect(target).toBeInstanceOf(HTMLDivElement);
    expect(target?.className).toBe("playground-render-target");
  });

  it("clears the render target on unmount, so a later ask on another page renders inline again", () => {
    const { unmount } = render(<Playground />);
    expect(getPlaygroundRenderTarget()).not.toBeNull();

    unmount();

    expect(getPlaygroundRenderTarget()).toBeNull();
  });

  describe("usePlaygroundCanvasHook (injectable-prop seam)", () => {
    it("renders against the injected hook's `registerCanvas`, not the real bus, when an override is passed", () => {
      const fakeRegisterCanvas = vi.fn();
      const fakeHook = vi.fn(() => ({ registerCanvas: fakeRegisterCanvas }));

      render(<Playground usePlaygroundCanvasHook={fakeHook} />);

      // The fake ref callback is what got attached to the canvas div, not the real bus's own —
      // proven by the real bus never having registered anything for this render.
      expect(fakeHook).toHaveBeenCalledTimes(1);
      expect(fakeRegisterCanvas).toHaveBeenCalledWith(expect.any(HTMLDivElement));
      expect(getPlaygroundRenderTarget()).toBeNull();
    });

    it("defaults to the real usePlaygroundCanvas hook when no override is passed", () => {
      // No fake hook — the mount/unmount tests above already prove this indirectly; this test
      // names the guarantee explicitly: omitting the prop must fall through to the real hook.
      render(<Playground />);
      expect(getPlaygroundRenderTarget()).not.toBeNull();
    });
  });
});
