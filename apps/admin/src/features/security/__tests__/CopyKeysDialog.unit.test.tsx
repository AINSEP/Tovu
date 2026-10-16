import { render, screen, waitFor } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CopyKeysDialog } from "../CopyKeysDialog";
import { useCopyKeys, type CopyKeysPort } from "../hooks/use-copy-keys.hooks";
import { ApiError, type AdminCredentialCopySource } from "@/lib/api";
import { subscribeToContentRefresh } from "@/lib/content-refresh-bus";
import { useOtherCredentials } from "../hooks/use-other-credentials.hooks";
import { createFakeOtherCredentialsPort } from "../hooks/other-credentials-dependencies.hooks";

const t = (key: string) => key;
const sources: AdminCredentialCopySource[] = [
  { siteId: "a", name: "Alpha", keys: [{ kind: "vendor", id: "one", label: "Main", provider: "OpenAI", last4: "1234" }] },
  { siteId: "b", name: "Beta", keys: [{ kind: "custom", id: "two", label: "Work", provider: "Example", last4: "5678" }] },
];
function port(choices = sources): CopyKeysPort {
  return {
    listCredentialCopySources: vi.fn().mockResolvedValue({ sources: choices }),
    copyCredentials: vi.fn().mockResolvedValue({ results: [{ kind: "vendor", id: "one", status: "copied", last4: "1234" }] }),
  };
}
function Harness({ api, startSite }: { api: CopyKeysPort; startSite?: (input: { id: string }) => Promise<unknown> }) {
  const dialog = useCopyKeys({ t }, { port: api, startSite });
  return <><button onClick={dialog.show}>Open</button><CopyKeysDialog dialog={dialog} t={t} /></>;
}
async function open(api: CopyKeysPort, startSite?: (input: { id: string }) => Promise<unknown>) {
  const user = userEvent.setup();
  const view = render(<Harness api={api} startSite={startSite} />);
  expect(api.listCredentialCopySources).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Open" }));
  await screen.findByRole("option", { name: "Alpha" });
  await user.selectOptions(screen.getByLabelText("Source project"), "a");
  return { user, ...view };
}
afterEach(() => vi.restoreAllMocks());

describe("CopyKeysDialog", () => {
  it("stays hidden until opened and closes when cancelled", async () => {
    const api = port();
    const user = userEvent.setup();
    render(<Harness api={api} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("option", { name: "Alpha" });
    expect(screen.getByRole("dialog", { name: "Copy keys from another project…" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("clears selected keys and results when the source changes; overwrite starts unchecked", async () => {
    const api = port();
    const { user } = await open(api);
    expect(screen.getByLabelText("Overwrite existing")).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByText("Main · copied ✓ …1234");
    expect(api.copyCredentials).toHaveBeenCalledExactlyOnceWith({ sourceSiteId: "a", ids: ["one"], overwrite: false });
    await user.selectOptions(screen.getByLabelText("Source project"), "b");
    expect(screen.getByLabelText("Work · Example · …5678")).not.toBeChecked();
    expect(screen.queryByText("Main · copied ✓ …1234")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Source project"), "a");
    expect(screen.getByLabelText("Main · OpenAI · …1234")).not.toBeChecked();
  });

  it("renders only summaries, including skipped and failed reasons, and publishes inventory refresh", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockResolvedValue({ results: [
      { kind: "vendor", id: "one", status: "copied", last4: "1234", value: "never-show-this-value" },
      { kind: "custom", id: "two", status: "skipped", reasonCode: "target-exists" },
      { kind: "custom", id: "three", status: "failed", reasonCode: "conflict" },
      { kind: "custom", id: "four", status: "copied" },
    ] } as Awaited<ReturnType<CopyKeysPort["copyCredentials"]>>);
    const refreshed = vi.fn();
    const unsubscribe = subscribeToContentRefresh(refreshed);
    try {
      const { user, container } = await open(api);
      await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
      await user.click(screen.getByLabelText("Overwrite existing"));
      await user.click(screen.getByRole("button", { name: "Copy" }));
      await screen.findByText("Main · copied ✓ …1234");
      expect(screen.getByText("skipped (already there)")).toBeInTheDocument();
      expect(screen.getByText("Changed during copy; try again.")).toBeInTheDocument();
      expect(screen.getByText("copied ✓")).toBeInTheDocument();
      expect(container.innerHTML).not.toContain("never-show-this-value");
      expect(refreshed).toHaveBeenCalledExactlyOnceWith(["access-tokens"]);
      expect(api.copyCredentials).toHaveBeenCalledWith({ sourceSiteId: "a", ids: ["one"], overwrite: true });
    } finally { unsubscribe(); }
  });

  it("shows the exact upgrade instruction and starts only the route-supplied desktop site", async () => {
    const upgrade = { ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade",
      actionHint: { action: "start-site" as const, siteId: "a", desktopSiteId: "/registered/alpha" } };
    const api = port([upgrade]);
    vi.mocked(api.listCredentialCopySources).mockResolvedValueOnce({ sources: [upgrade] }).mockResolvedValue({ sources });
    const startSite = vi.fn().mockResolvedValue({});
    const { user } = await open(api, startSite);
    expect(screen.getByText("Start Alpha once in Tovu to upgrade it, then copy.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Start project" }));
    await screen.findByLabelText("Main · OpenAI · …1234");
    expect(startSite).toHaveBeenCalledExactlyOnceWith({ id: "/registered/alpha" });
  });

  it("offers no start action without a route hint, even when the desktop port exists", async () => {
    await open(port([{ ...sources[0]!, keys: [], reasonCode: "source-needs-upgrade" }]), vi.fn());
    expect(screen.queryByRole("button", { name: "Start project" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  });

  it("locks source, keys, overwrite and cancellation while copying and suppresses repeat submission", async () => {
    const api = port();
    let finish!: (value: Awaited<ReturnType<CopyKeysPort["copyCredentials"]>>) => void;
    vi.mocked(api.copyCredentials).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const { user } = await open(api);
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.dblClick(screen.getByRole("button", { name: "Copy" }));
    expect(screen.getByLabelText("Source project")).toBeDisabled();
    expect(screen.getByLabelText("Main · OpenAI · …1234")).toBeDisabled();
    expect(screen.getByLabelText("Overwrite existing")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(api.copyCredentials).toHaveBeenCalledTimes(1);
    finish({ results: [] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeEnabled());
  });

  it("shows safe failure copy and resets overwrite and selection after cancel/reopen", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValue(new Error("secret driver payload"));
    const { user, container } = await open(api);
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByLabelText("Overwrite existing"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByRole("alert");
    expect(container.innerHTML).not.toContain("secret driver payload");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Open" }));
    await screen.findByRole("option", { name: "Alpha" });
    await user.selectOptions(screen.getByLabelText("Source project"), "a");
    expect(screen.getByLabelText("Overwrite existing")).not.toBeChecked();
    expect(screen.getByLabelText("Main · OpenAI · …1234")).not.toBeChecked();
  });

  it("refreshes the existing Tier 2 store reader after copy", async () => {
    const stores = createFakeOtherCredentialsPort();
    const read = vi.spyOn(stores, "getMediaProviders");
    function Inventory() {
      const inventory = useOtherCredentials(stores, t, "en", { query: "", category: "all" });
      return <><output>{inventory.groups ? "ready" : "loading"}</output>
        {inventory.groups?.flatMap(group => group.rows.map(row => <span key={row.key}>{row.valueFact}</span>))}</>;
    }
    render(<Inventory />);
    await screen.findByText("ready");
    const before = read.mock.calls.length;
    read.mockResolvedValue({ cloudinary: { apiKeyConfigured: true, apiKeyTail: "5678" } });
    const { user } = await open(port());
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(before + 1));
    await screen.findByText(/5678/);
  });

  it("handles a source that needs upgrading between inventory and submission", async () => {
    const api = port();
    vi.mocked(api.copyCredentials).mockRejectedValue(new ApiError("private payload", 409, undefined, { reasonCode: "source-needs-upgrade" }));
    const { user } = await open(api);
    await user.click(screen.getByLabelText("Main · OpenAI · …1234"));
    await user.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByText("Start Alpha once in Tovu to upgrade it, then copy.");
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(screen.queryByLabelText("Main · OpenAI · …1234")).not.toBeInTheDocument();
    expect(screen.queryByText("private payload")).not.toBeInTheDocument();
  });
});
