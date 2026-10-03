import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createLabCatalog } from "@jini-ai/agentic/a2ui";

import { RoutedA2uiSurfaceCard } from "../RoutedA2uiSurfaceCard";
import { resetPlaygroundRenderTargetBus, setPlaygroundRenderTarget } from "@/lib/playground-render-target-bus";

afterEach(() => {
  cleanup();
  resetPlaygroundRenderTargetBus();
});

it("routes a real A2uiSurfaceCard catalog refusal inline and relays its error.surfaceId exactly once", async () => {
  const target = document.createElement("div");
  document.body.appendChild(target);
  setPlaygroundRenderTarget(target);
  const onAgentAction = vi.fn();
  try {
    const { container } = render(<RoutedA2uiSurfaceCard
      name="a2ui"
      runId="run-contract"
      runStreaming={false}
      runSucceeded={true}
      onAgentAction={onAgentAction}
      events={[{
        version: "v1.0",
        createSurface: {
          surfaceId: "surface-contract",
          catalogId: createLabCatalog({}).catalogId,
          // Text's required text prop is absent: the real interpreter must refuse it.
          components: [{ id: "root", component: "Text" }],
        },
      }]}
    />);

    await waitFor(() => expect(container.querySelector(".a2ui-surface-refused")).toBeInTheDocument());
    expect(target.querySelector(".a2ui-surface-card")).not.toBeInTheDocument();
    expect(target.querySelector(".playground-drawn-surface-dismiss")).not.toBeInTheDocument();
    expect(onAgentAction).toHaveBeenCalledTimes(1);
    expect(onAgentAction).toHaveBeenCalledWith("run-contract", expect.objectContaining({
      error: expect.objectContaining({ code: "VALIDATION_FAILED", surfaceId: "surface-contract", message: expect.any(String) }),
    }));
  } finally {
    target.remove();
  }
});
