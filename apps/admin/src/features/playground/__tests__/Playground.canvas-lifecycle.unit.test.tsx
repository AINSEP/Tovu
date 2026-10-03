import { render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";

import { Playground } from "../Playground";
import {
  getPlaygroundRenderTarget,
  resetPlaygroundRenderTargetBus,
  subscribeToPlaygroundRenderTarget,
} from "@/lib/playground-render-target-bus";

let unsubscribe = () => {};
beforeEach(() => resetPlaygroundRenderTargetBus());
afterEach(() => {
  unsubscribe();
  resetPlaygroundRenderTargetBus();
});

it("keeps the actual canvas registered across rerenders and publishes detach and remount", () => {
  // F2.3/F3.3/F7.5: removing useCallback makes a rerender publish null then the canvas again.
  // Record every real bus notification, so a transient clear cannot hide behind the final value.
  const transitions: (HTMLDivElement | null)[] = [];
  unsubscribe = subscribeToPlaygroundRenderTarget(() => transitions.push(getPlaygroundRenderTarget()));
  const view = render(<Playground />);
  const canvas = view.container.querySelector<HTMLDivElement>(".playground-render-target");
  expect(canvas).not.toBeNull();
  expect(getPlaygroundRenderTarget()).toBe(canvas);
  expect(transitions).toEqual([canvas]);

  view.rerender(<Playground />);
  expect(view.container.querySelector(".playground-render-target")).toBe(canvas);
  expect(getPlaygroundRenderTarget()).toBe(canvas);
  expect(transitions).toEqual([canvas]);

  view.unmount();
  expect(getPlaygroundRenderTarget()).toBeNull();
  expect(transitions).toEqual([canvas, null]);

  const nextView = render(<Playground />);
  const nextCanvas = nextView.container.querySelector<HTMLDivElement>(".playground-render-target");
  expect(nextCanvas).not.toBeNull();
  expect(nextCanvas).not.toBe(canvas);
  expect(getPlaygroundRenderTarget()).toBe(nextCanvas);
  expect(transitions).toEqual([canvas, null, nextCanvas]);
  nextView.unmount();
  expect(getPlaygroundRenderTarget()).toBeNull();
  expect(transitions).toEqual([canvas, null, nextCanvas, null]);
});
