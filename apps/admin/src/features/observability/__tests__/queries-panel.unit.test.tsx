import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useQueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import { Observability } from "../Observability";
import { QueriesPanel } from "../queries-panel";

describe("Observability Queries tab", () => {
  it("opens a permitted Queries deep link directly with the matching subtitle", () => {
    const { container } = render(<Observability tabId="queries"
      useObservabilityStatusHook={() => ({ status: null, error: null, locale: "en", t: key => key })}
      useQueriesTabHook={() => ({ visible: true, readOnly: true })}
      QueriesPanelComponent={() => <p>Linked cache</p>} />);
    expect(screen.getByText("Linked cache")).toBeInTheDocument();
    expect(container.querySelector('.page-description')).toHaveTextContent('The live data cache for this admin session.');
    expect(screen.queryByRole("region", { name: "Observability Overview" })).not.toBeInTheDocument();
  });
  it.each([true, false])("mounts live tooling only after selection, readOnly=%s", async readOnly => {
    let mounts = 0;
    function LivePanel({ theme }: { theme?: "light" | "dark" }) {
      const client = useQueryClient();
      mounts++;
      return <p data-theme={theme}>{client.getQueryData<string>(["live-cache"])}</p>;
    }
    function SeedCache() {
      useQueryClient().setQueryData(["live-cache"], "Existing cache value");
      return null;
    }
    function TestQueriesPanel(props: { readOnly: boolean; t: (key: string) => string }) {
      return <QueriesPanel {...props} Panel={LivePanel} />;
    }
    const { container } = render(<FetchQueryProvider>
      <SeedCache />
      <Observability
        useObservabilityStatusHook={() => ({ status: null, error: null, locale: "en", t: key => key })}
        useQueriesTabHook={() => ({ visible: true, readOnly })}
        QueriesPanelComponent={TestQueriesPanel}
      />
    </FetchQueryProvider>);
    expect(mounts).toBe(0);
    expect(screen.queryByText("Existing cache value")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Queries" }));
    expect(screen.getByRole("button", { name: "Queries" }).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: 'Observability' })).toBeInTheDocument();
    expect(mounts).toBeGreaterThan(0);
    expect(screen.getByText("Existing cache value")).toBeInTheDocument();
    expect(screen.getByText("Existing cache value")).toHaveAttribute("data-theme", "light");
    expect(container.querySelector('.page-description')).toHaveTextContent('The live data cache for this admin session.');
    const panelHost = container.querySelector('[aria-label="Queries"] > div');
    expect(panelHost?.hasAttribute("inert")).toBe(readOnly);
    expect(panelHost).toHaveClass("observability-queries-scroll");
    await userEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(screen.queryByText("Existing cache value")).not.toBeInTheDocument();
    expect(container.querySelector('.page-description')).toHaveTextContent("What OpenTelemetry is, and whether it's on right now.");
  });

  it("offers no Queries tab when the visibility hook denies access", () => {
    render(<Observability
      tabId="queries"
      useObservabilityStatusHook={() => ({ status: null, error: null, locale: "en", t: key => key })}
      useQueriesTabHook={() => ({ visible: false, readOnly: true })}
      QueriesPanelComponent={() => { throw new Error("Denied panel must never mount"); }}
    />);
    expect(screen.queryByRole("button", { name: "Queries" })).not.toBeInTheDocument();
  });
});
