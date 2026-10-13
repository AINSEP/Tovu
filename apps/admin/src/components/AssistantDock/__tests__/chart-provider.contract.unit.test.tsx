/** Chart plan step 6: real A2UI validation/rendering use the same capability-resolved entry. */
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { createLabCatalog } from "@jini-ai/agentic/a2ui";
import { DEFAULT_INTERACTIVE_UI_REGISTRY } from "@jini-ai/ui/interactive-ui";
import { createChartProviderRegistry } from "@jini-ai/ui/charts";
import { createChartInteractiveRegistry } from "@jini-ai/ui/charts/react";
import { AdminChartRegistryContext } from "@/integrations/chart-providers/chart-registry-context";
import { resetPlaygroundRenderTargetBus, setPlaygroundRenderTarget } from "@/lib/playground-render-target-bus";
import { RoutedA2uiSurfaceCard } from "../RoutedA2uiSurfaceCard";

afterEach(() => { cleanup(); resetPlaygroundRenderTargetBus(); });

function snapshot(id: string, generation: string) {
  const providers = createChartProviderRegistry({ providers: [{ id, kinds: ["bar", "line", "pie"], enabled: true,
    load: async () => ({ mount: ({ element, spec }) => {
      element.textContent = `${id}:${spec.kind}`;
      return { update() {}, destroy() {} };
    } }),
  }] });
  return { generation, stylesheets: ["/reviewed/styles.css"],
    registry: createChartInteractiveRegistry({ registry: DEFAULT_INTERACTIVE_UI_REGISTRY, providers }) };
}

function card(component: string, surfaceId: string) {
  return <RoutedA2uiSurfaceCard name="a2ui" runId="run-chart" runStreaming={false} runSucceeded={true} events={[{
    version: "v1.0", createSurface: { surfaceId, catalogId: createLabCatalog({}).catalogId,
      components: [{ id: "root", component, data: [{ name: "Ada", value: 3 }], categoryKey: "name", valueKey: "value" }] },
  }]} />;
}

it.each([false, true])("renders all three wire aliases with boundary CSS (canvas=%s)", async (canvas) => {
  const target = document.createElement("div");
  document.body.appendChild(target);
  if (canvas) setPlaygroundRenderTarget(target);
  try {
    const current = snapshot("plugin.reviewed", "boot");
    for (const kind of ["bar", "line", "pie"]) {
      const { container, unmount } = render(<AdminChartRegistryContext.Provider value={current}>
        {card(`recharts.${kind}-chart`, `surface-${kind}`)}
      </AdminChartRegistryContext.Provider>);
      const boundary = canvas ? target : container;
      await waitFor(() => expect(boundary.textContent).toContain(`plugin.reviewed:${kind}`));
      expect(boundary.querySelector('link[rel="stylesheet"]')?.getAttribute("href")).toBe("/reviewed/styles.css");
      expect(boundary.querySelector(".a2ui-surface-refused")).toBeNull();
      unmount();
    }
  } finally { target.remove(); }
});

it("generation change remounts the interpreter so a newly admitted provider ID validates", async () => {
  const first = snapshot("plugin.first", "first");
  const { container, rerender } = render(<AdminChartRegistryContext.Provider value={first}>
    {card("plugin.first.bar-chart", "first")}
  </AdminChartRegistryContext.Provider>);
  await waitFor(() => expect(container.textContent).toContain("plugin.first:bar"));
  const second = snapshot("plugin.second", "second");
  rerender(<AdminChartRegistryContext.Provider value={second}>
    {card("plugin.second.bar-chart", "second")}
  </AdminChartRegistryContext.Provider>);
  await waitFor(() => expect(container.textContent).toContain("plugin.second:bar"));
  expect(container.querySelector(".a2ui-surface-refused")).toBeNull();
});
