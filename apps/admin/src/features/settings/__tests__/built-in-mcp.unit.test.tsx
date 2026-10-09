import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminExternalMcpServer } from "../../../lib/api";
import { ExternalMcpSettingsPanel } from "../ExternalMcpSettingsPanel";
import { useOtherCredentials } from "../../security/hooks/use-other-credentials.hooks";
import { createFakeOtherCredentialsPort } from "../../security/hooks/other-credentials-dependencies.hooks";
import { COMMON_I18N } from "../../../lib/i18n-common";

it("a renamed built-in connection has a badge and Tools, and no Remove control", async () => {
  const source: SourceConfigItem = { id: "host-tools", label: "Renamed host", enabled: true, fields: { builtIn: "true", transport: "stdio", authMode: "none", command: "host-launcher", allowedToolNames: "host_tool" } };
  const dependencies = createFakeSourceConfigDependencies<SourceConfigItem>({ sources: [source], createSource: input => ({ id: "new", fields: input.fields }) });
  render(<FetchQueryProvider><ExternalMcpSettingsPanel dependencies={dependencies} /></FetchQueryProvider>);
  await screen.findByText("Built-in");
  const card = screen.getByRole("region", { name: "Renamed host" });
  expect(within(card).queryByRole("button", { name: "Remove" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open tool permissions for Renamed host — 1 enabled" })).toBeInTheDocument();
  expect(screen.getByText("Renamed host")).toBeInTheDocument();
  for (const values of Object.values(COMMON_I18N)) expect(values["Built-in"]).toBeTruthy();
});

it("Secrets excludes the source flag and still includes a user connection with the desktop name", async () => {
  const base: AdminExternalMcpServer = { serverId: "host-tools", label: "Renamed host", transport: "stdio", authMode: "none", enabled: true, command: "host-launcher", url: null, args: [], allowedToolNames: [], writeAllowedToolNames: [], writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: [], oauth: { providerId: null, grant: null, clientId: null, scopes: [], status: "disconnected", expiresAt: null, tokenEnvName: null, hasStoredToken: false } };
  const port = createFakeOtherCredentialsPort({ listExternalMcpServers: async () => ({ servers: [{ ...base, builtIn: true }, { ...base, serverId: "user-server", label: "Tovu Desktop", builtIn: false }] }) });
  const t = (key: string) => key;
  const { result } = renderHook(() => useOtherCredentials(port, t, "en", { query: "", category: "all" }), { wrapper: ({ children }) => <FetchQueryProvider>{children}</FetchQueryProvider> });
  await waitFor(() => expect(result.current.groups).toBeDefined());
  expect(result.current.groups!.find(group => group.store.id === "external-mcp")?.rows.map(row => row.itemId)).toEqual(["user-server"]);
});
