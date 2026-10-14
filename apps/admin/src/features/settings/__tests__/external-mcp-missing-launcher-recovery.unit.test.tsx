import { render, screen, waitFor, within } from "@/__tests__/fetch-query-render";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";

import { ExternalMcpSettingsPanel } from "../ExternalMcpSettingsPanel";
import type { SavedConnectionIntent } from "../external-mcp-admissions-rules";
import { useExternalMcpAdmissions, type ExternalMcpAdmissionsPort } from "../hooks/use-external-mcp-admissions.hooks";
import { t } from "../external-mcp-i18n";

/** Scratch-QA incident recovery, through the real rules, banner, confirmation and list hook.
 * Only the persistence and daemon ports are fakes; no module mocks or network calls. */
function setup() {
  const command = "/tmp/deleted QA profile/tovu-desktop-mcp-launcher.sh";
  const dependencies = createFakeSourceConfigDependencies<SourceConfigItem>({
    createSource: (input) => ({ id: input.fields.id ?? "new-server", fields: input.fields }),
    sources: [
      { id: "tovu-desktop", enabled: true, fields: { transport: "stdio", command, allowedToolNames: "list_sites" } },
      { id: "other", enabled: false, fields: { transport: "stdio", command: "npx" } },
    ],
  });
  const removeSource = vi.spyOn(dependencies.port, "removeSource");
  const port: ExternalMcpAdmissionsPort = {
    getAdmissions: async () => ({ connections: [], configFailures: [{ connectionId: "tovu-desktop", reason: `child process error: spawn ${command} ENOENT` }] }),
    me: async () => ({ effectivePermissions: ["*"] }),
    restartAssistantDaemon: async () => ({ ok: true }),
  };
  function useAdmissions(saved: Readonly<Record<string, SavedConnectionIntent>>) {
    return useExternalMcpAdmissions({ port, savedAllowedToolNamesById: saved });
  }
  const rendered = render(<ExternalMcpSettingsPanel dependencies={dependencies} useExternalMcpAdmissionsHook={useAdmissions} />);
  return { ...rendered, dependencies, removeSource };
}

describe("missing launcher recovery", () => {
  it("Cancel keeps the server; Confirm deletes only that server through the existing list port", async () => {
    const user = userEvent.setup();
    const { container, dependencies, removeSource } = setup();
    await screen.findByText("Launcher missing");
    expect(screen.queryByRole("button", { name: "Restart the assistant" })).not.toBeInTheDocument();

    const banner = container.querySelector(".external-mcp-drift");
    expect(banner).not.toBeNull();
    await user.click(within(banner as HTMLElement).getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("tovu-desktop");
    expect(removeSource).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(removeSource).not.toHaveBeenCalled();
    expect((await dependencies.port.fetchSources()).map((source) => source.id)).toEqual(["tovu-desktop", "other"]);

    await user.click(within(banner as HTMLElement).getByRole("button", { name: "Remove" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removeSource).toHaveBeenCalledExactlyOnceWith("tovu-desktop"));
    await waitFor(() => expect(screen.queryByText("Launcher missing")).not.toBeInTheDocument());
    expect((await dependencies.port.fetchSources()).map((source) => source.id)).toEqual(["other"]);
    // Two full dialog round-trips: 1.7s alone, past the 5s default in a loaded batch run.
  }, 20_000);

  it("translates both recovery keys in every existing banner locale", () => {
    const locales = ["es", "id", "de", "zh-CN", "zh-TW", "pt-BR", "ru", "fa", "ar", "ja", "ko", "pl", "hu", "fr", "uk", "tr", "th", "it", "hi", "ur", "bn"];
    expect(Object.keys(t.dictionary).sort()).toEqual([...locales].sort());
    for (const locale of locales) {
      expect(t.dictionary[locale]).toHaveProperty("Launcher missing");
      // "Remove" comes from COMMON_I18N through the translator's fallback.
      for (const key of ["Launcher missing", "Remove"]) expect(t({ locale, key })).not.toBe(key);
    }
    expect(t({ locale: "en", key: "Launcher missing" })).toBe("Launcher missing");
  });
});
