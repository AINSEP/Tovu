import { render, screen } from "@testing-library/react";
import { useContext } from "react";
import { expect, it } from "vitest";
import { AdminChartRegistryContext } from "../chart-registry-context";
import { ChartRegistryProvider } from "../ChartRegistryProvider";
import type { useWiredAdminChartRegistry } from "../use-chart-registry.hooks";

/** @file The provider publishes whatever snapshot its injected registry hook returns. */

function ProbeGeneration() {
  const snapshot = useContext(AdminChartRegistryContext);
  return <output>{snapshot ? String(snapshot.generation) : "none"}</output>;
}

it("provides the snapshot returned by the injected useWiredAdminChartRegistryHook and forwards the principal", () => {
  const received: unknown[] = [];
  const useWiredAdminChartRegistryHook: typeof useWiredAdminChartRegistry = (required) => {
    received.push(required);
    return { generation: "injected-generation", siteProvider: "plugin.test", providers: [] } as unknown as ReturnType<typeof useWiredAdminChartRegistry>;
  };
  render(
    <ChartRegistryProvider principalId="owner-1" useWiredAdminChartRegistryHook={useWiredAdminChartRegistryHook}>
      <ProbeGeneration />
    </ChartRegistryProvider>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("injected-generation");
  expect(received).toEqual([{ principalId: "owner-1" }]);
});
