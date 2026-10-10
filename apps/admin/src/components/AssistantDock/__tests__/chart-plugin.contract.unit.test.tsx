import { act, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CHART_MANIFESTS } from "@jini-ai/charts-recharts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createLabCatalog } from "@jini-ai/agentic/a2ui";
import { DEFAULT_INTERACTIVE_UI_REGISTRY } from "@jini-ai/ui/interactive-ui";
import { createAssistantInteractiveUiRegistry } from "../chart-provider";
import { RoutedA2uiSurfaceCard } from "../RoutedA2uiSurfaceCard";
import { resetPlaygroundRenderTargetBus, setPlaygroundRenderTarget } from "@/lib/playground-render-target-bus";

beforeEach(() => {
  // jsdom has no layout or ResizeObserver. Supply browser measurements, never fake chart modules.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 600, height: 300, top: 0, left: 0, bottom: 300, right: 600, x: 0, y: 0, toJSON: () => ({}),
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      this.callback([{ target, contentRect: target.getBoundingClientRect() } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => {
  resetPlaygroundRenderTargetBus();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([
  [true, undefined, true], [false, undefined, false], [true, "0", false], [false, "1", true], [true, "", false],
] as const)("gates the provider with dev=%s and flag=%s", (development, flag, enabled) => {
  const registry = createAssistantInteractiveUiRegistry({ registry: DEFAULT_INTERACTIVE_UI_REGISTRY }, { development, flag });
  for (const kind of ["bar-chart", "line-chart", "pie-chart"]) {
    expect(registry.resolveById({ id: `recharts.${kind}` })?.provider).toBe(enabled ? "plugin.recharts" : "recharts");
  }
  if (!enabled) expect(registry).toBe(DEFAULT_INTERACTIVE_UI_REGISTRY);
  const expectedIds = enabled ? ["recharts.bar-chart", "recharts.line-chart", "recharts.pie-chart", ...CHART_MANIFESTS.map(({ id }) => id)] : [];
  expect(registry.list().filter(({ provider }) => provider === "plugin.recharts").map(({ id }) => id).sort()).toEqual(expectedIds.sort());
  expect(registry.resolveById({ id: "shadcn.data-table" })).toBe(DEFAULT_INTERACTIVE_UI_REGISTRY.resolveById({ id: "shadcn.data-table" }));
});

it("uses a published version range so link:jini owns local development wiring", () => {
  const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../package.json"), "utf8"));
  expect(pkg.dependencies["@jini-ai/charts-recharts"]).toBe("^0.1.0");
});

it.each(["bar-chart", "line-chart", "pie-chart"])("renders legacy %s from the plugin when on and ui when off", async (kind) => {
  const data = kind === "pie-chart"
    ? { data: [{ name: "Published", value: 5 }, { name: "Draft", value: 2 }] }
    : { data: [{ status: "Published", count: 5 }, { status: "Draft", count: 2 }], categoryKey: "status", valueKey: "count" };
  const events = [
    { version: "v1.0", createSurface: { surfaceId: `all-${kind}`, catalogId: createLabCatalog({}).catalogId } },
    { version: "v1.0", updateComponents: { surfaceId: `all-${kind}`, components: [
      { id: "root", component: "Column", children: ["chart"] },
      { id: "chart", component: `recharts.${kind}`, ...data },
    ] } },
  ];
  for (const flag of ["0", "1"]) {
    const registry = createAssistantInteractiveUiRegistry({ registry: DEFAULT_INTERACTIVE_UI_REGISTRY }, { flag });
    const view = render(<RoutedA2uiSurfaceCard name="a2ui" runId={`run-${kind}-${flag}`} events={events} registry={registry} runStreaming={false} runSucceeded={true} />);
    try {
      await waitFor(() => expect(view.container.querySelector("svg.recharts-surface")).toBeInTheDocument());
      const figure = view.container.querySelector("figure")!;
      if (flag === "1") expect(figure).toHaveAttribute("data-chart-provider", "plugin.recharts");
      else expect(figure).not.toHaveAttribute("data-chart-provider");
      if (kind === "bar-chart") expect(figure.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2);
      else if (kind === "line-chart") {
        expect(figure.querySelector(".recharts-line-curve")).toBeInTheDocument();
        expect(figure.querySelector("linearGradient")).toBeInTheDocument();
      } else {
        expect(figure.querySelectorAll(".recharts-pie-sector")).toHaveLength(2);
        expect(figure.querySelector(".jini-chart-total")).toHaveTextContent("7Total");
      }
      await waitFor(() => expect(figure).toHaveTextContent("Published"));
    } finally {
      view.unmount();
    }
  }
});

it("renders tool-shaped legacy chart events through the plugin on canvas and inline, with a real built-in baseline", async () => {
  const target = document.createElement("div");
  document.body.appendChild(target);
  setPlaygroundRenderTarget(target);
  // Same two-message wire shape emitted by assistant_render_ui; data comes from the preceding read tool.
  const events = [
    { version: "v1.0", createSurface: { surfaceId: "post-status", catalogId: createLabCatalog({}).catalogId } },
    { version: "v1.0", updateComponents: { surfaceId: "post-status", components: [
      { id: "root", component: "Column", children: ["chart"] },
      { id: "chart", component: "recharts.bar-chart", data: [{ status: "Published", count: 5 }, { status: "Draft", count: 2 }], categoryKey: "status", valueKey: "count" },
    ] } },
  ];
  const props = { name: "a2ui", runId: "run-chart", events, runStreaming: false, runSucceeded: true };
  const enabled = createAssistantInteractiveUiRegistry({ registry: DEFAULT_INTERACTIVE_UI_REGISTRY }, { development: false, flag: "1" });
  const disabled = createAssistantInteractiveUiRegistry({ registry: DEFAULT_INTERACTIVE_UI_REGISTRY }, { development: false, flag: "0" });
  try {
    const baseline = render(<RoutedA2uiSurfaceCard {...props} registry={disabled} />);
    await waitFor(() => expect(target.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2));
    expect(target.querySelector('[data-chart-provider="plugin.recharts"]')).toBeNull();
    baseline.unmount();
    const { container, rerender } = render(<RoutedA2uiSurfaceCard {...props} registry={enabled} />);
    await waitFor(() => expect(target.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(2));
    expect(target.querySelector("figure")).toHaveAttribute("data-chart-provider", "plugin.recharts");
    // Recharts portals category text into its tick-label layer, outside the axis chrome.
    await waitFor(() => expect(target.querySelector(".recharts-xAxis-tick-labels")).toHaveTextContent("Published"));
    expect(container.querySelector("figure")).toBeNull();
    act(() => setPlaygroundRenderTarget(null));
    await waitFor(() => expect(container.querySelector("figure")).toHaveAttribute("data-chart-provider", "plugin.recharts"));
    expect(target.querySelector("figure")).toBeNull();
    rerender(<RoutedA2uiSurfaceCard {...props} registry={enabled} events={[...events, {
      version: "v1.0", updateComponents: { surfaceId: "post-status", components: [
        { id: "chart", component: "recharts.bar-chart", data: [{ status: "Trashed", count: 3 }], categoryKey: "status", valueKey: "count" },
      ] },
    }]} />);
    await waitFor(() => expect(container.querySelectorAll(".recharts-bar-rectangle")).toHaveLength(1));
    await waitFor(() => expect(container.querySelector(".recharts-xAxis-tick-labels")).toHaveTextContent("Trashed"));
  } finally {
    target.remove();
  }
});

it('uses preferred capability schemas and components together, without vendor ID assumptions', async () => {
  const { InteractiveUiRegistry } = await import('@jini-ai/ui/interactive-ui');
  const { z } = await import('zod');
  const { buildA2uiCatalogFromRegistry } = await import('@jini-ai/ui/a2ui');
  const preferred = {
    id: 'independent.bar-chart', provider: 'independent', capabilities: ['chart', 'bar-chart'],
    description: 'A provider with a distinct required prop', propsSchema: z.object({ caption: z.literal('Accepted') }),
    Component: ({ caption }: Record<string, unknown>) => <figure data-chart-provider="independent">{String(caption)}</figure>,
  };
  const registry = createAssistantInteractiveUiRegistry({ registry: DEFAULT_INTERACTIVE_UI_REGISTRY }, {
    flag: '1', registerProvider: ({ registry }) => new InteractiveUiRegistry({ entries: [preferred, ...registry.list()] }),
  });
  const legacy = registry.resolveById({ id: 'recharts.bar-chart' })!;
  expect(legacy.provider).toBe('independent');
  expect(legacy.propsSchema.safeParse({ caption: 'Accepted' }).success).toBe(true);
  expect(legacy.propsSchema.safeParse({ data: [{ x: 1 }], categoryKey: 'x', valueKey: 'x' }).success).toBe(false);
  const catalog = buildA2uiCatalogFromRegistry({ registry, catalogId: 'probe' });
  expect(catalog.components.get('recharts.bar-chart')!.propsSchema).toBe(preferred.propsSchema);
  const events = [
    { version: 'v1.0', createSurface: { surfaceId: 'preferred', catalogId: createLabCatalog({}).catalogId } },
    { version: 'v1.0', updateComponents: { surfaceId: 'preferred', components: [
      { id: 'root', component: 'recharts.bar-chart', caption: 'Accepted' },
    ] } },
  ];
  const view = render(<RoutedA2uiSurfaceCard name="a2ui" runId="preferred-run" events={events} registry={registry} runStreaming={false} runSucceeded={true} />);
  try {
    await waitFor(() => expect(view.container.querySelector('figure')).toHaveAttribute('data-chart-provider', 'independent'));
    expect(view.container.querySelector('figure')).toHaveTextContent('Accepted');
  } finally { view.unmount(); }
});


it('resolves a legacy chart by its declared capability when the ID suffix is different', async () => {
  const { InteractiveUiRegistry } = await import('@jini-ai/ui/interactive-ui');
  const original = DEFAULT_INTERACTIVE_UI_REGISTRY.resolveById({ id: 'recharts.bar-chart' })!;
  const host = new InteractiveUiRegistry({ entries: [{ ...original, id: 'host.sales-histogram' }] });
  const registry = createAssistantInteractiveUiRegistry({ registry: host }, { flag: '1' });
  const resolved = registry.resolveById({ id: 'host.sales-histogram' })!;
  expect(resolved.id).toBe('host.sales-histogram');
  expect(resolved.provider).toBe('plugin.recharts');
  expect(resolved.capabilities).toContain('bar-chart');
  expect(resolved.Component).toBe(registry.resolveById({ id: 'plugin.recharts.bar-chart' })!.Component);
});
