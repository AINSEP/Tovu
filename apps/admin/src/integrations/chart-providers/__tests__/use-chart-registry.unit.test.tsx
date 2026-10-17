/** Chart plan step 6: existing cache invalidation and settings notifications replace whole snapshots. */
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useFetchMutation } from "@jini-ai/ui/fetch-query";
import type { ChartProvider } from "@jini-ai/ui/charts";
import { FetchQueryProvider } from "@/lib/fetch-query/provider";
import { publishSettingsRefresh, resetSettingsRefreshBus } from "@/lib/settings-refresh-bus";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeChartRegistryPort } from "../chart-registry-dependencies.hooks";
import { useAdminChartRegistry } from "../use-chart-registry.hooks";

afterEach(() => { cleanup(); resetSettingsRefreshBus(); resetContentRefreshBus(); });

it("loads the admitted module only when its chart is rendered and tears its renderer down", async () => {
  const importedUrls: string[] = [];
  const port = createFakeChartRegistryPort({ snapshot: {
    generation: "renderable", siteProvider: "plugin.test", providers: [
      { id: "plugin.test", kinds: ["bar"], javascript: "/admitted/chart.js" },
    ],
  } });
  const provider: ChartProvider = {
    mount({ element, spec }) {
      element.textContent = `Rendered ${spec.kind}: ${spec.data[0]!.value}`;
      return {
        update({ spec: next }) { element.textContent = `Rendered ${next.kind}: ${next.data[0]!.value}`; },
        destroy() { element.replaceChildren(); },
      };
    },
  };
  const importModule = async ({ url }: { url: string }) => {
    if (url !== "/admitted/chart.js") throw new Error(`Unexpected chart module: ${url}`);
    importedUrls.push(url);
    return provider;
  };
  const { result } = renderHook(() => useAdminChartRegistry({ principalId: "owner", port }, { importModule }), {
    wrapper: ({ children }) => <FetchQueryProvider adapter="builtin">{children}</FetchQueryProvider>,
  });
  await waitFor(() => expect(result.current.generation).toBe("renderable"));
  expect(importedUrls).toEqual([]);

  const entry = result.current.registry.resolveById({ id: "recharts.bar-chart" });
  expect(entry?.provider).toBe("plugin.test");
  const Component = entry!.Component;
  const view = render(<Component data={[{ name: "Jan", value: 7 }]} categoryKey="name" valueKey="value" />);
  await waitFor(() => expect(view.container.querySelector("[data-chart-renderer]")?.textContent).toBe("Rendered bar: 7"));
  expect(importedUrls).toEqual(["/admitted/chart.js"]);
  const renderer = view.container.querySelector("[data-chart-renderer]")!;
  const frame = renderer.firstElementChild!;
  view.unmount();
  expect(frame.textContent).toBe("");
});

it("ignores unrelated settings and refreshes charts when the changed scope is unknown", async () => {
  const port = createFakeChartRegistryPort({ snapshot: { generation: "initial", siteProvider: "core.table", providers: [] } });
  let reads = 0;
  const readSnapshot = port.readSnapshot.bind(port);
  port.readSnapshot = async (input, options) => { reads += 1; return readSnapshot(input, options); };
  const { result } = renderHook(() => useAdminChartRegistry({ principalId: "owner", port }), {
    wrapper: ({ children }) => <FetchQueryProvider adapter="builtin">{children}</FetchQueryProvider>,
  });
  await waitFor(() => expect(result.current.generation).toBe("initial"));
  const initialReads = reads;
  port.snapshot = { generation: "changed", siteProvider: "core.table", providers: [] };
  await act(async () => { publishSettingsRefresh(["core.unrelated"]); });
  expect(reads).toBe(initialReads);
  expect(result.current.generation).toBe("initial");

  act(() => publishSettingsRefresh());
  await waitFor(() => expect(result.current.generation).toBe("changed"));
  expect(reads).toBeGreaterThan(initialReads);
});

it.each(["builtin", "tanstack"] as const)("%s: boot, plugin toggle and site default use one stable registry generation", async (adapter) => {
  const port = createFakeChartRegistryPort({ snapshot: { generation: "first", siteProvider: "plugin.recharts", providers: [
    { id: "plugin.recharts", kinds: ["bar", "line", "pie"], javascript: "/reviewed/provider.js", stylesheet: "/reviewed/styles.css" },
  ] } });
  const { result } = renderHook(() => ({
    snapshot: useAdminChartRegistry({ principalId: "owner", port }),
    write: useFetchMutation({ run: async () => {} }, { invalidates: [["plugins"]] }),
  }), { wrapper: ({ children }) => <FetchQueryProvider adapter={adapter}>{children}</FetchQueryProvider> });
  await waitFor(() => expect(result.current.snapshot.generation).toBe("first"));
  const first = result.current.snapshot;
  expect(first.registry.resolveById({ id: "recharts.bar-chart" })?.provider).toBe("plugin.recharts");
  expect(first.stylesheets).toEqual(["/reviewed/styles.css"]);
  // A real JSON response has fresh object identity even when configuration did not change.
  port.snapshot = { ...port.snapshot, providers: port.snapshot.providers.map((provider) => ({ ...provider })) };
  act(() => publishSettingsRefresh(["core.charts"]));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(result.current.snapshot).toBe(first);
  port.snapshot = { generation: "disabled", siteProvider: "plugin.recharts", providers: [] };
  await act(async () => { await result.current.write.mutate({ input: undefined }); });
  await waitFor(() => expect(result.current.snapshot.generation).toBe("disabled"));
  expect(result.current.snapshot.registry.resolveById({ id: "recharts.bar-chart" })?.provider).toBe("core.table");
  expect(result.current.snapshot.stylesheets).toEqual([]);
  port.snapshot = { generation: "site-default", siteProvider: "plugin.line", providers: [
    { id: "plugin.recharts", kinds: ["bar", "line", "pie"], javascript: "/reviewed/provider.js" },
    { id: "plugin.line", kinds: ["line"], javascript: "/reviewed/line.js" },
  ] };
  act(() => publishSettingsRefresh(["core.charts"]));
  await waitFor(() => expect(result.current.snapshot.generation).toBe("site-default"));
  expect(result.current.snapshot.registry.resolveById({ id: "recharts.line-chart" })?.provider).toBe("plugin.line");
  expect(result.current.snapshot.registry.resolveById({ id: "recharts.bar-chart" })?.provider).toBe("plugin.recharts");
  port.snapshot = { ...port.snapshot, generation: "agent-change", providers: [] };
  act(() => publishContentRefresh(["plugins"]));
  await waitFor(() => expect(result.current.snapshot.generation).toBe("agent-change"));
});
