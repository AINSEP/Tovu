import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createA2uiInterpreter, createLabCatalog } from "@jini-ai/ui/a2ui";

import { Playground } from "../Playground";
import type { PlaygroundController } from "../hooks/use-playground.hooks";
import { usePlayground } from "../hooks/use-playground.hooks";

/**
 * @file `Playground` — rendering off the real hook (a light smoke test; the search/surface
 * behavior itself is pinned in `use-playground.hooks.unit.test.ts`), plus (per the `ConfirmDialog
 * dialog-hook injection` precedent) proof the `usePlaygroundHook` prop this pass added actually
 * reaches the render.
 */

function makeFakeController(overrides: Partial<PlaygroundController> = {}): PlaygroundController {
  const registry = usePlayground.length === 0 ? undefined : undefined; // unused, keeps eslint quiet about an empty destructure below
  void registry;
  return {
    registry: { list: () => [] } as unknown as PlaygroundController["registry"],
    matches: [],
    query: "",
    setQuery: vi.fn(),
    total: 0,
    surfaceOpen: false,
    // A real (empty-catalog) interpreter, not a bare `{}` cast — `Playground` mounts
    // `A2uiSurfaceRenderer` off this whenever `surfaceOpen` is true, and that renderer calls
    // `interpreter.subscribe`/`interpreter.getRoot` for real (see `use-a2ui-surface.ts`), which a
    // stub object can't satisfy.
    interpreter: createA2uiInterpreter(createLabCatalog()),
    addToSurface: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe("Playground", () => {
  it("renders the component library off the real usePlayground hook", () => {
    render(<Playground />);
    expect(screen.getByRole("heading", { name: "Playground" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search by id, provider, or capability")).toBeInTheDocument();
  });
});

describe("Playground playground-hook injection", () => {
  it("renders purely off an injected fake, proving usePlaygroundHook is not hardcoded", () => {
    // The real hook always starts with `matches` equal to the full (non-empty) registry — a fake
    // reporting a `total` of 5 with zero `matches` is a combination the real hook, on a fresh
    // mount with an empty query, can never produce.
    render(<Playground usePlaygroundHook={() => makeFakeController({ total: 5, matches: [] })} />);

    expect(screen.getByText("0 of 5")).toBeInTheDocument();
  });

  it("shows the empty-registry state and its search-surface hint copy off the fake", () => {
    render(<Playground usePlaygroundHook={() => makeFakeController({ query: "table" })} />);

    expect(screen.getByPlaceholderText("Search by id, provider, or capability")).toHaveValue("table");
    expect(screen.getByText(/No component matches/)).toBeInTheDocument();
  });

  it("Add to surface and Clear surface call through to the injected controller's actions", async () => {
    const user = userEvent.setup();
    const addToSurface = vi.fn();
    const reset = vi.fn();
    const entry = { id: "table", provider: "shadcn", capabilities: ["table"], description: "" } as never;

    render(
      <Playground
        usePlaygroundHook={() =>
          makeFakeController({ matches: [entry], total: 1, surfaceOpen: true, addToSurface, reset })
        }
      />,
    );

    await user.click(screen.getByRole("button", { name: "Add to surface" }));
    expect(addToSurface).toHaveBeenCalledWith(entry);

    await user.click(screen.getByRole("button", { name: "Clear surface" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
