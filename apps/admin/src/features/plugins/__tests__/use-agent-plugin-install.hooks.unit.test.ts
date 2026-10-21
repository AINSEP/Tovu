import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError, type AdminAgentPlugin } from "@/lib/api";
import { useAgentPluginInstall } from "../hooks/use-agent-plugin-install.hooks";
import type { AgentPluginInstallPort } from "../hooks/agent-plugin-install-port.hooks";

/**
 * @file `useAgentPluginInstall` beyond the replace and size suites: every refusal's operator copy,
 * the install guard, an install the server answers without a row, and the picker plumbing.
 */

function setup(port: AgentPluginInstallPort, onInstalled = vi.fn()) {
  const hook = renderHook(() => useAgentPluginInstall({ port, t: (key) => key, onInstalled }));
  return { onInstalled, ...hook };
}

function failingPort(failure: unknown): AgentPluginInstallPort {
  return { sha256: async () => "sha", installZip: async () => { throw failure; } };
}

const zip = () => new File(["zip"], "notes.zip");

describe("useAgentPluginInstall refusal copy", () => {
  it.each([
    ["a non-API failure", new Error("offline"), "Could not install the plugin. Try again."],
    ["a 403 without a known code", new ApiError("nope", 403), "You don't have permission to install plugins."],
    ["a 400 with an unknown code", new ApiError("bad", 400, "SOMETHING_NEW"), "This .zip contains files or links that plugins may not include."],
    ["an unknown status", new ApiError("boom", 502), "Could not install the plugin. Try again."],
  ])("maps %s", async (_name, failure, expected) => {
    const { result } = setup(failingPort(failure));
    act(() => result.current.onFileChange({ target: { files: [zip()] } } as never));
    await act(async () => result.current.install());
    await waitFor(() => expect(result.current.error).toBe(expected));
  });
});

describe("useAgentPluginInstall choosing and installing", () => {
  it("refuses a zip over the size limit before any upload", () => {
    const installZip = vi.fn();
    const { result } = setup({ sha256: async () => "sha", installZip });
    const big = zip();
    Object.defineProperty(big, "size", { value: 33 * 1024 * 1024 });
    act(() => result.current.onFileChange({ target: { files: [big] } } as never));
    expect(result.current.error).toBe("The .zip is larger than the 32 MiB limit.");
    expect(result.current.installDisabled).toBe(true);
    expect(installZip).not.toHaveBeenCalled();
  });

  it("does nothing on Install with no file chosen, and treats an empty pick as no file", async () => {
    const installZip = vi.fn();
    const { result } = setup({ sha256: async () => "sha", installZip });
    act(() => result.current.onFileChange({ target: { files: null } } as never));
    await act(async () => result.current.install());
    expect(installZip).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("ignores a second Install while the first upload is running", async () => {
    let finish!: () => void;
    const installZip = vi.fn(() => new Promise<{ alreadyInstalled: boolean; agentPlugin: AdminAgentPlugin }>((resolve) => {
      finish = () => resolve({ alreadyInstalled: false, agentPlugin: { pluginId: "notes" } as AdminAgentPlugin });
    }));
    const { result } = setup({ sha256: async () => "sha", installZip });
    act(() => result.current.onFileChange({ target: { files: [zip()] } } as never));
    act(() => result.current.install());
    await waitFor(() => expect(installZip).toHaveBeenCalledOnce());
    act(() => result.current.install());
    await act(async () => finish());
    expect(installZip).toHaveBeenCalledOnce();
  });

  it("names the uploaded file when the server answers without a plugin row", async () => {
    const { result, onInstalled } = setup({ sha256: async () => "sha", installZip: async () => ({ alreadyInstalled: true }) as never });
    act(() => result.current.onFileChange({ target: { files: [zip()] } } as never));
    await act(async () => result.current.install());
    await waitFor(() => expect(result.current.installedMessage).toContain("notes.zip"));
    expect(onInstalled).not.toHaveBeenCalled();
  });

  it("opens the hidden file picker", () => {
    const { result } = setup(failingPort(new Error("unused")));
    const input = document.createElement("input");
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    result.current.inputRef.current = input;
    act(() => result.current.onChooseFile());
    expect(click).toHaveBeenCalledOnce();
  });
});
