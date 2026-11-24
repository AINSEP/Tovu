import { render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { InfoTip } from "@jini-ai/ui/admin-widgets";
import { AdminPermanentDeletes } from "@jini-ai/admin/screens/assistant-settings/AdminPermanentDeletes";
import { useAdminPermanentDeletes } from "@jini-ai/admin/screens/assistant-settings/use-admin-permanent-deletes.hooks";
import { PERMANENT_DELETE_TOOLS, PERMANENT_DELETE_DANGERS, type AssistantPermanentDeletesPort, type AssistantPermanentDeletesSettings } from "@jini-ai/admin/shell/lib/assistant-permanent-deletes";
import { adminPermanentDeletesPolicy } from "../hooks/permanent-deletes-dependencies.hooks";
import { assistantOwnerGrantDependencies } from "../hooks/assistant-owner-grant-dependencies.hooks";
import { ADMIN_PERMANENT_DELETES_COPY } from "../owner-grant-bindings";

/**
 * @file Host wiring for the engine's permanent-deletes screen (its behaviour is tested in
 * `@jini-ai/admin`): this admin's real 13-tool policy, its danger list, its canonical admin
 * destinations and its product copy reach the screen.
 */
function fakePort(initial: AssistantPermanentDeletesSettings) {
  let settings = structuredClone(initial);
  const port: AssistantPermanentDeletesPort = {
    read: async () => structuredClone(settings),
    write: async input => { settings = { ...settings, enabled: input.enabled, allowedToolIds: [...input.allowedToolIds] }; return structuredClone(settings); },
  };
  return port;
}
const toggle = () => screen.getByRole("checkbox", { name: "Allow permanent deletes from chat" });
const ready = () => waitFor(() => expect(toggle()).toBeEnabled());
function mount(port: AssistantPermanentDeletesPort) {
  return render(<AdminPermanentDeletes t={key => key} InfoTip={InfoTip} copy={ADMIN_PERMANENT_DELETES_COPY}
    useAdminPermanentDeletesHook={input => useAdminPermanentDeletes({ ...input, ...assistantOwnerGrantDependencies, ...adminPermanentDeletesPolicy, port })} />);
}
describe("permanent deletes host wiring", () => {
  it("names every product danger in the consent dialog", async () => {
    mount(fakePort({ enabled: false, allowedToolIds: [], canEdit: true })); await ready();
    await userEvent.setup().click(toggle());
    const dialog = screen.getByRole("dialog", { name: "Allow permanent deletes from chat?" });
    for (const danger of PERMANENT_DELETE_DANGERS) expect(within(dialog).getByText(danger)).toBeVisible();
  });
  it("lists the 13 tools in their two groups", async () => {
    mount(fakePort({ enabled: true, allowedToolIds: [], canEdit: true })); await ready();
    expect(screen.getAllByRole("checkbox")).toHaveLength(14);
    expect(screen.getByRole("group", { name: "Content purges" })).toBeVisible(); expect(screen.getByRole("group", { name: "Settings deletes" })).toBeVisible();
  });
  it("uses the canonical admin destinations and does not invent a secret-removal screen", async () => {
    mount(fakePort({ enabled: true, allowedToolIds: [], canEdit: true })); await ready();
    const links = screen.getAllByRole("link", { name: "Open admin screen" });
    expect(links.map(link => link.getAttribute("href"))).toEqual(PERMANENT_DELETE_TOOLS.flatMap(tool => tool.adminPath ? [tool.adminPath] : []));
    expect(screen.getByText("No Tovu admin screen for this operation.")).toBeVisible();
  });
});
