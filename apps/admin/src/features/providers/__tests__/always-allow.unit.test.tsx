import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { ApiError, type AdminExternalMcpToolApproval } from "@/lib/api";
import { FetchQueryProvider } from "@/lib/fetch-query";

import { AlwaysAllowPanel } from "../AlwaysAllowPanel";
import { formatGrantedAt, groupAlwaysAllow } from "../always-allow-rules";
import { createFakeAlwaysAllowPort } from "../hooks/always-allow-dependencies.hooks";
import type { AlwaysAllowPort } from "../hooks/always-allow-port.hooks";
import { useAlwaysAllow } from "../hooks/use-always-allow.hooks";

/**
 * @file The Integrations "Always allow" tab: grouping rules, the hook against a fake port, and the
 * panel's markup driven by that real hook (no fetch anywhere).
 */

const fakeT = (key: string): string => key;

beforeAll(() => vi.stubEnv("TZ", "UTC"));
afterAll(() => vi.unstubAllEnvs());

function approval(serverId: string, toolName: string): AdminExternalMcpToolApproval {
  return { serverId, toolName, grantedByPrincipalId: "owner", grantedAt: "2026-09-28T10:00:00.000Z" };
}

const SERVERS = [
  { serverId: "github", label: "GitHub" },
  { serverId: "linear", label: "Linear" },
];

function renderPanel(port: AlwaysAllowPort) {
  const hook = () => useAlwaysAllow(port, fakeT, "en");
  return render(
    <FetchQueryProvider>
      <AlwaysAllowPanel useAlwaysAllowHook={hook} />
    </FetchQueryProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("groupAlwaysAllow", () => {
  it("groups by server, labels from the roster, and sorts servers by label", () => {
    const groups = groupAlwaysAllow(
      [approval("linear", "list_issues"), approval("github", "get_file"), approval("github", "search")],
      [{ serverId: "linear", label: "Linear" }, { serverId: "github", label: "GitHub" }],
    );
    expect(groups.map((g) => [g.label, g.tools.map((tool) => tool.toolName)])).toEqual([
      ["GitHub", ["get_file", "search"]],
      ["Linear", ["list_issues"]],
    ]);
  });

  it("gives every section and Revoke button a valid, distinct agent handle, even for ids like get_file", () => {
    const groups = groupAlwaysAllow([approval("my_server", "get_file"), approval("my_server", "get-file")], [{ serverId: "my_server", label: "Mine" }]);
    expect(groups[0]?.handle).toBe("always-allow-server-my-server");
    expect(groups[0]?.tools.map((tool) => tool.revokeHandle)).toEqual(["always-allow-server-my-server-revoke-get-file", "always-allow-server-my-server-revoke-get-file-2"]);
  });

  it("falls back to the server id when the server is not on the roster (or has no label)", () => {
    const groups = groupAlwaysAllow([approval("gone", "x"), approval("blank", "y")], [{ serverId: "blank", label: "" }]);
    expect(groups.map((g) => g.label)).toEqual(["blank", "gone"]);
  });
});

describe("formatGrantedAt", () => {
  it("formats a date in the given locale and passes an unparseable value through", () => {
    expect(formatGrantedAt("2026-09-28T10:00:00.000Z", "en")).toBe("Sep 28, 2026");
    expect(formatGrantedAt("not a date", "en")).toBe("not a date");
  });
});

describe("AlwaysAllowPanel", () => {
  it("lists each server's Always-allow tools under the server's label", async () => {
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    renderPanel(createFakeAlwaysAllowPort({ approvals: [approval("github", "get_file"), approval("linear", "list_issues")], servers: SERVERS }));

    const github = await screen.findByRole("heading", { name: "GitHub" });
    const section = github.closest("section") as HTMLElement;
    expect(within(section).getByText("get_file")).toBeInTheDocument();
    expect(within(section).getByText("Sep 28, 2026")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Linear" })).toBeInTheDocument();
    expect(network).not.toHaveBeenCalled();
  });

  it("shows the empty state when nothing is set to Always allow", async () => {
    renderPanel(createFakeAlwaysAllowPort({ servers: SERVERS }));
    expect(await screen.findByText("Nothing is set to Always allow. Pick it on a tool's approval card in chat.")).toBeInTheDocument();
  });

  it("revoking removes the row with no confirm step, and the server's heading goes with its last tool", async () => {
    const port = createFakeAlwaysAllowPort({ approvals: [approval("github", "get_file"), approval("linear", "list_issues")], servers: SERVERS });
    const revokeSpy = vi.spyOn(port, "revokeExternalMcpToolApproval");
    renderPanel(port);

    const section = (await screen.findByRole("heading", { name: "GitHub" })).closest("section") as HTMLElement;
    await userEvent.click(within(section).getByRole("button", { name: "Revoke" }));

    expect(revokeSpy).toHaveBeenCalledWith("github", "get_file");
    await waitFor(() => expect(screen.queryByRole("heading", { name: "GitHub" })).not.toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Linear" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect((await port.listExternalMcpToolApprovals()).approvals.map((row) => row.toolName)).toEqual(["list_issues"]);
  });

  it("treats a 404 revoke (already gone) as done, not as an error", async () => {
    const port = createFakeAlwaysAllowPort({ approvals: [approval("github", "get_file")], servers: SERVERS });
    const removeApproval = port.revokeExternalMcpToolApproval;
    port.revokeExternalMcpToolApproval = async (serverId, toolName) => {
      // A 404 means another window already removed it; the next list must agree.
      await removeApproval(serverId, toolName);
      throw new ApiError("no Always allow is saved for that tool", 404, "NOT_FOUND");
    };
    renderPanel(port);

    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    await waitFor(() => expect(screen.queryByText("get_file")).not.toBeInTheDocument());
    expect(screen.queryByText("Couldn't revoke. Try again.")).not.toBeInTheDocument();
  });

  it("keeps the row and says so when a revoke fails", async () => {
    renderPanel(createFakeAlwaysAllowPort({ approvals: [approval("github", "get_file")], servers: SERVERS, revokeError: new ApiError("boom", 500) }));

    await userEvent.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(await screen.findByText("Couldn't revoke. Try again.")).toBeInTheDocument();
    expect(screen.getByText("get_file")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeEnabled();
  });

  it("shows a load error instead of an empty list when the list cannot be read", async () => {
    const port = createFakeAlwaysAllowPort();
    port.listExternalMcpToolApprovals = async () => {
      throw new ApiError("down", 500);
    };
    renderPanel(port);

    expect(await screen.findByText("Couldn't load this list.", {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is set to Always allow/)).not.toBeInTheDocument();
  });
});
