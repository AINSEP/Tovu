import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * @file `RoutedA2uiSurfaceCard`'s whole job: decide where the real `A2uiSurfaceCard` ends up.
 *
 * `@jini-ai/chat/react`'s real `A2uiSurfaceCard` drives a stateful A2UI interpreter off a growing
 * `events` array (see that component's own module doc) — mounting the real thing here would test
 * that package, not this host's routing decision. It is replaced with a thin recorder that renders
 * one identifiable element, the same "recorder, not the real component" approach
 * `AssistantDock.unit.test.tsx` already uses for `ChatPane`.
 */

const a2uiSurfaceCardSpy = vi.hoisted(() => vi.fn());

vi.mock("@jini-ai/chat/react", () => ({
  useT: () => (key: string) => key,
  // A real `A2uiSurfaceCard` relays a catalog-validation refusal through `onAgentAction` (see that
  // component's own doc) — simulated here by checking `events` for a marker object the tests below
  // control, rather than driving the real A2UI interpreter just to reach the same call.
  A2uiSurfaceCard: (props: { runId?: string; events?: readonly unknown[]; onAgentAction?: (runId: string | undefined, message: unknown) => unknown }) => {
    a2uiSurfaceCardSpy(props);
    for (const event of props.events ?? []) {
      const marker = event as { __simulateError?: boolean; surfaceId?: string };
      if (marker.__simulateError) {
        props.onAgentAction?.(props.runId, {
          error: { code: "VALIDATION_FAILED", surfaceId: marker.surfaceId ?? "surface-1", message: "boom" },
        });
      }
    }
    return <div className="fake-a2ui-surface-card" data-run-id={props.runId ?? ""} />;
  },
}));

import { RoutedA2uiSurfaceCard } from "../RoutedA2uiSurfaceCard";
import {
  resetPlaygroundRenderTargetBus,
  setPlaygroundRenderTarget,
} from "@/lib/playground-render-target-bus";

const baseProps = {
  name: "a2ui",
  events: [{ createSurface: { surfaceId: "surface-1" } }],
  runStreaming: false,
  runSucceeded: true,
  runId: "run-1",
};

afterEach(() => {
  cleanup();
  resetPlaygroundRenderTargetBus();
  a2uiSurfaceCardSpy.mockReset();
});

describe("RoutedA2uiSurfaceCard", () => {
  it("renders A2uiSurfaceCard inline when no Playground render target is registered — the unchanged default", () => {
    const { container } = render(<RoutedA2uiSurfaceCard {...baseProps} />);

    expect(container.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();
    expect(a2uiSurfaceCardSpy).toHaveBeenCalledTimes(1);
  });

  it("portals into the registered Playground target and renders nothing inline, once a target exists", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    setPlaygroundRenderTarget(target);

    const { container } = render(<RoutedA2uiSurfaceCard {...baseProps} />);

    // Not inline, at the component's own render position.
    expect(container.querySelector(".fake-a2ui-surface-card")).not.toBeInTheDocument();
    // Landed in the Playground target instead — same underlying card, same props.
    expect(target.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();
    expect(target.querySelector('[data-run-id="run-1"]')).toBeInTheDocument();
    expect(a2uiSurfaceCardSpy).toHaveBeenCalledTimes(1);

    document.body.removeChild(target);
  });

  it("reverts to inline rendering once the target is cleared (e.g. navigating away from Playground)", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    setPlaygroundRenderTarget(target);

    const { container, rerender } = render(<RoutedA2uiSurfaceCard {...baseProps} />);
    expect(target.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();

    setPlaygroundRenderTarget(null);
    rerender(<RoutedA2uiSurfaceCard {...baseProps} />);

    expect(target.querySelector(".fake-a2ui-surface-card")).not.toBeInTheDocument();
    expect(container.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();

    document.body.removeChild(target);
  });

  it("shows a dismiss button only when portaled, and removes the surface from the canvas on click", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    setPlaygroundRenderTarget(target);

    render(<RoutedA2uiSurfaceCard {...baseProps} />);
    expect(target.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();

    const dismissButton = target.querySelector(".playground-drawn-surface-dismiss");
    expect(dismissButton).toBeInTheDocument();

    fireEvent.click(dismissButton!);

    expect(target.querySelector(".fake-a2ui-surface-card")).not.toBeInTheDocument();
    expect(target.querySelector(".playground-drawn-surface-dismiss")).not.toBeInTheDocument();

    document.body.removeChild(target);
  });

  it("renders no dismiss button when rendering inline in the chat (no target registered)", () => {
    const { container } = render(<RoutedA2uiSurfaceCard {...baseProps} />);
    expect(container.querySelector(".playground-drawn-surface-dismiss")).not.toBeInTheDocument();
  });

  it("keeps a refused surface in the chat, not on the Playground canvas, even with a target registered", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    setPlaygroundRenderTarget(target);

    const { container } = render(
      <RoutedA2uiSurfaceCard {...baseProps} events={[baseProps.events[0], { __simulateError: true }]} />,
    );

    // A refusal is diagnostic chat output, not a drawn artifact — it must not land on the canvas.
    expect(target.querySelector(".fake-a2ui-surface-card")).not.toBeInTheDocument();
    expect(target.querySelector(".playground-drawn-surface-dismiss")).not.toBeInTheDocument();
    // Rendered inline in the chat instead.
    expect(container.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();

    document.body.removeChild(target);
  });

  it("still relays the refusal to the host's real onAgentAction exactly once, despite the portal-to-inline remount", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    setPlaygroundRenderTarget(target);
    const onAgentAction = vi.fn();

    render(
      <RoutedA2uiSurfaceCard
        {...baseProps}
        events={[baseProps.events[0], { __simulateError: true }]}
        onAgentAction={onAgentAction}
      />,
    );

    expect(onAgentAction).toHaveBeenCalledTimes(1);
    expect(onAgentAction).toHaveBeenCalledWith("run-1", expect.objectContaining({ error: expect.objectContaining({ surfaceId: "surface-1" }) }));

    document.body.removeChild(target);
  });

  it("portals a later, different surface that succeeds, even though an earlier surface in the SAME turn refused — a sticky error must not hold back a genuinely fresh retry", () => {
    // Regression, caught live: one assistant turn can open several surfaces — a first
    // `assistant_render_ui` call fails validation, the model retries with fixed props, and
    // `render-ui-tool.ts` mints a NEW exchange (a new surfaceId) for that retry, all landing in the
    // SAME `events` array. A first version of this component tracked a single sticky "has this card
    // EVER seen an error" flag, which locked a later, genuinely successful surface to inline
    // rendering too — the chat said "it's on your screen" while the canvas stayed empty.
    const target = document.createElement("div");
    document.body.appendChild(target);
    setPlaygroundRenderTarget(target);

    const { container } = render(
      <RoutedA2uiSurfaceCard
        {...baseProps}
        events={[
          { createSurface: { surfaceId: "surface-1" } },
          { __simulateError: true, surfaceId: "surface-1" },
          { createSurface: { surfaceId: "surface-2" } },
        ]}
        runId="run-2"
      />,
    );

    // The current surface (surface-2) never refused — it belongs on the canvas.
    expect(target.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();
    expect(target.querySelector(".playground-drawn-surface-dismiss")).toBeInTheDocument();
    expect(container.querySelector(".fake-a2ui-surface-card")).not.toBeInTheDocument();

    document.body.removeChild(target);
  });

  it("does not forward the render-target bus's own state as a prop to A2uiSurfaceCard", () => {
    const target = document.createElement("div");
    document.body.appendChild(target);
    setPlaygroundRenderTarget(target);

    render(<RoutedA2uiSurfaceCard {...baseProps} onAgentAction={vi.fn()} />);

    const forwardedProps = a2uiSurfaceCardSpy.mock.calls.at(-1)?.[0];
    expect(forwardedProps).toEqual(expect.objectContaining({ name: "a2ui", runId: "run-1" }));
    expect(forwardedProps).not.toHaveProperty("target");

    document.body.removeChild(target);
  });

  describe("useRoutedA2uiSurfaceCardHook (injectable-prop seam)", () => {
    it("renders against the injected hook's return value, not the real bus/state, when no real target is registered", () => {
      // No `setPlaygroundRenderTarget` call here — the real hook would return `target: null` and
      // render inline. The fake below claims a target anyway, proving the component follows it.
      const fakeTarget = document.createElement("div");
      document.body.appendChild(fakeTarget);
      const fakeHook = vi.fn(() => ({
        target: fakeTarget,
        dismissed: false,
        setDismissed: vi.fn(),
        hasError: false,
        handleAgentAction: vi.fn(),
      }));

      const { container } = render(
        <RoutedA2uiSurfaceCard {...baseProps} useRoutedA2uiSurfaceCardHook={fakeHook} />,
      );

      expect(fakeHook).toHaveBeenCalledTimes(1);
      expect(container.querySelector(".fake-a2ui-surface-card")).not.toBeInTheDocument();
      expect(fakeTarget.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();
      expect(fakeTarget.querySelector(".playground-drawn-surface-dismiss")).toBeInTheDocument();

      document.body.removeChild(fakeTarget);
    });

    it("follows the injected hook's hasError even when a real target IS registered, proving it overrides the real hook rather than merely supplementing it", () => {
      const target = document.createElement("div");
      document.body.appendChild(target);
      setPlaygroundRenderTarget(target);
      // The real hook, given this `events` array with no error marker, would return
      // `hasError: false` and portal. The fake below claims `hasError: true` anyway.
      const fakeHook = vi.fn(() => ({
        target,
        dismissed: false,
        setDismissed: vi.fn(),
        hasError: true,
        handleAgentAction: vi.fn(),
      }));

      const { container } = render(
        <RoutedA2uiSurfaceCard {...baseProps} useRoutedA2uiSurfaceCardHook={fakeHook} />,
      );

      expect(target.querySelector(".fake-a2ui-surface-card")).not.toBeInTheDocument();
      expect(container.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();

      document.body.removeChild(target);
    });

    it("never spreads the injectable hook prop itself through to the real A2uiSurfaceCard", () => {
      const fakeHook = vi.fn(() => ({
        target: null,
        dismissed: false,
        setDismissed: vi.fn(),
        hasError: false,
        handleAgentAction: vi.fn(),
      }));

      render(<RoutedA2uiSurfaceCard {...baseProps} useRoutedA2uiSurfaceCardHook={fakeHook} />);

      const forwardedProps = a2uiSurfaceCardSpy.mock.calls.at(-1)?.[0];
      expect(forwardedProps).not.toHaveProperty("useRoutedA2uiSurfaceCardHook");
    });

    it("defaults to the real useRoutedA2uiSurfaceCard hook when no override is passed", () => {
      // No target registered, no fake hook — the pre-existing default-behavior test above already
      // proves this indirectly; this test names the guarantee explicitly: omitting the prop must
      // not throw and must fall through to the real hook rather than leaving `undefined` called as
      // a function.
      const { container } = render(<RoutedA2uiSurfaceCard {...baseProps} />);
      expect(container.querySelector(".fake-a2ui-surface-card")).toBeInTheDocument();
    });
  });
});
