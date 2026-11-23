import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { QueriesPanel } from "@jini-ai/admin/screens/observability/queries-panel";
import { QueryDevtoolsPanel } from "../hooks/observability-wiring.hooks";

/**
 * @file The host's production Queries panel: `QueryDevtoolsPanel` lazy-loads TanStack's
 * production devtools panel (the explicit `/production` export, which renders in production builds
 * too), showing the Suspense status until that chunk arrives.
 */
describe("QueriesPanel default panel", () => {
  it("lazy-loads TanStack's production devtools panel behind a loading status", async () => {
    const { container } = render(<FetchQueryProvider><QueriesPanel readOnly={false} t={(key) => key} Panel={QueryDevtoolsPanel} /></FetchQueryProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading queries…");
    await waitFor(() => expect(screen.queryByText("Loading queries…")).not.toBeInTheDocument(), { timeout: 10_000 });
    const scroll = container.querySelector(".jini-observability-queries-scroll") as HTMLElement;
    expect(scroll.childElementCount).toBeGreaterThan(0);
  }, 15_000);
});
