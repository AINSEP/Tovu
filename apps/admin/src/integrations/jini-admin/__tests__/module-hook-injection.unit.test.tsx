import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { UseAdminLocaleHook } from "@jini-ai/admin/react/kit";
import { AdminModulesProvider } from "../AdminModulesProvider";
import { ModulePanel } from "../ModulePanel";

/** @file The module provider and panel receive the hooks they call as props defaulted to the real hooks. */

const useAdminLocaleHook: UseAdminLocaleHook = () => "en";

it("ModulePanel renders the content returned by the injected useModulePanelHook", () => {
  const useModulePanelHook = vi.fn(() => ({ content: <p>Injected module content</p> }));
  const route = { query: new URLSearchParams() } as Parameters<typeof ModulePanel>[0]["route"];
  render(<ModulePanel moduleId="media" pageId="library" route={route} useModulePanelHook={useModulePanelHook} />);
  expect(screen.getByText("Injected module content")).toBeInTheDocument();
  expect(useModulePanelHook).toHaveBeenCalledWith(expect.objectContaining({ moduleId: "media", pageId: "library" }));
});

it("AdminModulesProvider renders the content returned by the injected hooks", () => {
  const runtime = { marker: "runtime" };
  const useAdminModulesHook = vi.fn(() => runtime as unknown as ReturnType<typeof import("../modules.hooks").useAdminModules>);
  const useModuleProviderContentHook = vi.fn(({ children }: { children: React.ReactNode }) => <section aria-label="injected provider">{children}</section>);
  render(
    <AdminModulesProvider permissions={["read"]} useAdminLocaleHook={useAdminLocaleHook} useAdminModulesHook={useAdminModulesHook} useModuleProviderContentHook={useModuleProviderContentHook}>
      <p>child content</p>
    </AdminModulesProvider>,
  );
  expect(screen.getByRole("region", { name: "injected provider" })).toContainElement(screen.getByText("child content"));
  expect(useAdminModulesHook).toHaveBeenCalledWith(expect.objectContaining({ permissions: ["read"], useAdminLocaleHook }));
});
