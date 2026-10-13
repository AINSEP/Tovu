/** Chart plan step 6: existing cache invalidation and settings notifications replace whole snapshots. */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useFetchMutation } from "@jini-ai/ui/fetch-query";
import { FetchQueryProvider } from "@/lib/fetch-query/provider";
import { publishSettingsRefresh, resetSettingsRefreshBus } from "@/lib/settings-refresh-bus";
import { publishContentRefresh, resetContentRefreshBus } from "@/lib/content-refresh-bus";
import { createFakeChartRegistryPort } from "../chart-registry-dependencies.hooks";
import { useAdminChartRegistry } from "../use-chart-registry.hooks";

afterEach(() => { cleanup(); resetSettingsRefreshBus(); resetContentRefreshBus(); });

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
