import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAgentPluginInstall } from "../hooks/use-agent-plugin-install.hooks";
import { ApiError } from "@/lib/api";

it("same-id refusal offers replacement without calling it a different plugin", async () => {
  const port = { sha256: async () => "sha", installZip: vi.fn(async () => { throw new ApiError("taken", 409, "AGENT_PLUGIN_PLUGIN_ID_TAKEN"); }) };
  const { result } = renderHook(() => useAgentPluginInstall({ port, t: key => key, onInstalled: vi.fn() }));
  act(() => result.current.onFileChange({ target: { files: [new File(["zip"], "notes.zip")] } } as never));
  await act(async () => result.current.install());
  await waitFor(() => expect(result.current.error).toBe("This plugin ID is already installed. Choose Replace existing version to upgrade it."));
  expect(result.current.replace).toBe(false);
  act(() => result.current.onReplaceChange({ target: { checked: true } } as never));
  await act(async () => result.current.install());
  await waitFor(() => expect(port.installZip).toHaveBeenLastCalledWith({ file: expect.any(File), sha256: "sha", replace: true }));
  act(() => result.current.onClearFile());
  expect(result.current.replace).toBe(false);
});
