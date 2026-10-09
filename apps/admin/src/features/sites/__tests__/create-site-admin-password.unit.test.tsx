import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminSitesSnapshot } from "@/lib/api";
import { CreateSiteOnboarding } from "../CreateSiteOnboarding";
import { AllSitesTab } from "../AllSitesTab";
import { createFakeSitesPort } from "../hooks/sites-dependencies.hooks";
import { useSites } from "../hooks/use-sites.hooks";
import type { SitesPort } from "../hooks/sites-port.hooks";

const DEFAULT_LOGIN = "Admin login: admin / tovu-dev — change it later under Users";
const CUSTOM_LOGIN = "Admin login: admin / the one you set — change it later under Users";
const snapshot: AdminSitesSnapshot = {
  switchingEnabled: true, sites: [], persistedSiteName: null,
  currentSite: { dir: "/repo/sites/live", name: "live", dirOverridden: false, listed: true },
};

function Harness({ port }: { port: SitesPort }) {
  const controller = useSites(port, (key) => key);
  return <>
    <CreateSiteOnboarding controller={controller} onCancel={() => {}} />
    <AllSitesTab sites={[]} snapshot={snapshot} switchingEnabled activatingName={null}
      createdName={controller.createdName} createdAdminLogin={controller.createdAdminLogin}
      onActivate={() => {}} t={(key) => key} />
  </>;
}

function setup() {
  const requests: Parameters<SitesPort["createSite"]>[0][] = [];
  const port = createFakeSitesPort(snapshot, { createSite: async (input) => {
    requests.push(input);
    return { site: { name: input.name, dir: `/repo/sites/${input.name}`, siteId: "fake-site-id" } };
  } });
  render(<FetchQueryProvider><Harness port={port} /></FetchQueryProvider>);
  return { requests, user: userEvent.setup() };
}

describe("new-site admin credentials", () => {
  it("shows the default login and sends it explicitly, then repeats it in the created-site notice", async () => {
    const { requests, user } = setup();
    await waitFor(() => expect(screen.getByLabelText("Folder name")).toBeEnabled());
    expect(screen.getByText(DEFAULT_LOGIN)).toBeVisible();
    const password = screen.getByLabelText("Set a different admin password");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAttribute("minlength", "1");
    expect(password).toHaveAttribute("maxlength", "512");
    expect(password).not.toBeRequired();
    await user.type(screen.getByLabelText("Folder name"), "new-site");
    await user.click(screen.getByRole("button", { name: "Create site" }));
    await waitFor(() => expect(requests).toEqual([{ name: "new-site", adminPassword: "tovu-dev" }]));
    await waitFor(() => expect(screen.getAllByText(DEFAULT_LOGIN)).toHaveLength(2));
    const notice = screen.getByText("new-site").closest("p")!;
    expect(notice.textContent).toContain(DEFAULT_LOGIN);
  });

  it("reveals and masks the optional password, preserves it exactly, and confirms it without echoing it", async () => {
    const { requests, user } = setup();
    await waitFor(() => expect(screen.getByLabelText("Folder name")).toBeEnabled());
    const password = screen.getByLabelText("Set a different admin password");
    const custom = " chosen 🔑 ";
    await user.type(screen.getByLabelText("Folder name"), "custom-site");
    await user.type(password, custom);
    await user.click(screen.getByRole("button", { name: "Show admin password" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide admin password" }));
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Create site" }));
    await waitFor(() => expect(requests).toEqual([{ name: "custom-site", adminPassword: custom }]));
    await waitFor(() => expect(screen.getByText(CUSTOM_LOGIN)).toBeVisible());
    expect(screen.getByText("custom-site").closest("p")!.textContent).not.toContain(custom);
    expect(password).toHaveValue("");
    expect(password).toHaveAttribute("type", "password");
    await user.type(password, "a"); // Current policy accepts a single character.
    expect(screen.queryByText(CUSTOM_LOGIN)).toBeNull();
  });
});
