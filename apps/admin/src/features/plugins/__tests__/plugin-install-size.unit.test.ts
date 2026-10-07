import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { describe, expect, it } from "vitest";
import { usePluginInstall } from "../hooks/use-plugin-install.hooks";
import { useAgentPluginInstall } from "../hooks/use-agent-plugin-install.hooks";
import { createFakeAgentPluginInstallPort } from "../hooks/agent-plugin-install-dependencies.hooks";

// Assert both consumers: changing a formatter alone must not leave one add tab on 0.0 MiB.
describe("plugin add archive size", () => {
  it.each([[0, "0 B"], [83, "83 B"], [12 * 1024, "12 KB"], [1024 * 1024 - 1, "1024 KB"], [1024 * 1024, "1.0 MiB"]])(
    "shows %i bytes as %s on both add tabs", (bytes, label) => {
      const file = new File([new Uint8Array(bytes)], "fixture.zip");
      const site = renderHook(() => usePluginInstall({ port: { preview: async () => { throw new Error("size tests do not preview"); }, install: async () => { throw new Error("size tests do not install"); } }, t: (key) => key, onInstalled: async () => {} }));
      const agent = renderHook(() => useAgentPluginInstall({
        port: createFakeAgentPluginInstallPort({ row: { pluginId: "fixture", version: "1.0.0", enabled: false, description: null, keywords: [], skills: [], mcpServerIds: [] } }),
        t: (key) => key, onInstalled: () => {},
      }));
      act(() => site.result.current.setZipFile(file));
      expect(site.result.current.zipSizeLabel).toBe(label);
      // Empty agent archives are rejected; the other sizes exercise its real file-change handler.
      if (bytes > 0) {
        act(() => agent.result.current.onFileChange({ target: { files: [file] } } as unknown as ChangeEvent<HTMLInputElement>));
        expect(agent.result.current.fileSizeLabel).toBe(label);
      } else {
        act(() => agent.result.current.onFileChange({ target: { files: [file] } } as unknown as ChangeEvent<HTMLInputElement>));
        expect(agent.result.current.fileSizeLabel).toBe("");
        expect(agent.result.current.error).toBe("This file is not a readable .zip.");
      }
    },
  );
});
