import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminSitesSnapshot } from "@/lib/api";
import { CreateSiteOnboarding } from "../CreateSiteOnboarding";
import { AllSitesTab } from "../AllSitesTab";
import { createFakeSitesPort } from "../hooks/sites-dependencies.hooks";
import { useSites } from "../hooks/use-sites.hooks";
import type { SitesPort } from "../hooks/sites-port.hooks";

const DEFAULT_LOGIN = "Admin login: admin / the default password — change it later under Users";
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
  it("keeps the seeded password private, sends no default password, and retains the created-site guidance", async () => {
    const { requests, user } = setup();
    await waitFor(() => expect(screen.getByLabelText("Folder name")).toBeEnabled());
    expect(document.body.textContent).not.toContain("tovu-dev");
    expect(document.body.textContent).not.toContain("Sign in as admin with password");
    expect(screen.getByRole("button", { name: "About the default admin login" })).toBeVisible();
    const password = screen.getByLabelText("Set a different admin password");
    expect(password).toHaveValue("");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "new-password");
    expect(password).toHaveAttribute("minlength", "1");
    expect(password).toHaveAttribute("maxlength", "512");
    expect(password).not.toBeRequired();
    await user.type(screen.getByLabelText("Folder name"), "new-site");
    await user.click(screen.getByRole("button", { name: "Create site" }));
    await waitFor(() => expect(requests).toEqual([{ name: "new-site" }]));
    expect(Object.keys(requests[0]!)).toEqual(["name"]);
    await waitFor(() => expect(screen.getByText(DEFAULT_LOGIN)).toBeVisible());
    const notice = screen.getByText("new-site").closest("p")!;
    expect(notice.textContent).toContain(DEFAULT_LOGIN);
    expect(document.body.textContent).not.toContain("tovu-dev");
  });

  it("reveals and masks the optional password, preserves it exactly, and confirms it without echoing it", async () => {
    const { requests, user } = setup();
    await waitFor(() => expect(screen.getByLabelText("Folder name")).toBeEnabled());
    const password = screen.getByLabelText("Set a different admin password");
    const custom = " chosen 🔑 ";
    await user.type(screen.getByLabelText("Folder name"), "custom-site");
    await user.type(password, custom);
    await user.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Hide password" }));
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

  it("shows the default-login note as a tooltip when the info icon is hovered or focused", async () => {
    const { user } = setup();
    await waitFor(() => expect(screen.getByLabelText("Folder name")).toBeEnabled());
    const icon = screen.getByRole("button", { name: "About the default admin login" });
    const bubble = () => document.querySelector(".info-tip-bubble");
    const note = "This is a starter password for this site only.";
    expect(bubble()).toBeNull();
    await user.hover(icon);
    expect(bubble()?.textContent).toContain(note);
    await user.unhover(icon);
    expect(bubble()).toBeNull();
    act(() => icon.focus());
    expect(bubble()?.textContent).toContain(note);
    act(() => icon.blur());
    expect(bubble()).toBeNull();
  });
});
