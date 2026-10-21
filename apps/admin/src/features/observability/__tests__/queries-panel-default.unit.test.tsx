import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { QueriesPanel } from "../queries-panel";

/**
 * @file `QueriesPanel`'s production default: with no injected `Panel` it lazy-loads TanStack's
 * production devtools panel (the explicit `/production` export, which renders in production builds
 * too), showing the Suspense status until that chunk arrives.
 */
describe("QueriesPanel default panel", () => {
  it("lazy-loads TanStack's production devtools panel behind a loading status", async () => {
    const { container } = render(<FetchQueryProvider><QueriesPanel readOnly={false} t={(key) => key} /></FetchQueryProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading queries…");
    await waitFor(() => expect(screen.queryByText("Loading queries…")).not.toBeInTheDocument(), { timeout: 10_000 });
    const scroll = container.querySelector(".observability-queries-scroll") as HTMLElement;
    expect(scroll.childElementCount).toBeGreaterThan(0);
  }, 15_000);
});
