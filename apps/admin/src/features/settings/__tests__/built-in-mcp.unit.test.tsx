import { formatCredentialHint, formatCredentialHints, translateCredentialMessage } from "@tovu/contracts/credential-copy";
import { credentialDraftError } from "@/lib/credential-copy";
import { describeApiError } from "@/lib/admin-http/request";
import { useSerialWrites } from "@jini-ai/ui/panel-kit";
import { useContentRefreshSubscription } from "@jini-ai/admin/shell/hooks/use-content-refresh-subscription.hooks";
import { accessTokensLoadErrorMessage, accessTokenSaveErrorMessage } from "@jini-ai/admin/security/security-i18n";
import { OTHER_CREDENTIAL_STORES } from "../../security/other-credential-stores";
import { envNamesFact, maskedTailFact, mediaProviderCatalogFrom, mediaProviderLabel, otherCredentialMatchesQuery } from "@jini-ai/integrations/react/credentials/other-credential-stores";
import { ACCESS_TOKENS_RESOURCE } from "../../security/rules";

const hooks = { useSerialWrites, useContentRefreshSubscription };
const deps = { stores: OTHER_CREDENTIAL_STORES, resource: ACCESS_TOKENS_RESOURCE,
  formatCredentialHint, formatCredentialHints, translateCredentialMessage, credentialDraftError,
  envNamesFact, maskedTailFact, mediaProviderCatalogFrom, mediaProviderLabel, otherCredentialMatchesQuery,
  describeApiError, accessTokensLoadErrorMessage, accessTokenSaveErrorMessage };

import { render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { createFakeSourceConfigDependencies, type SourceConfigItem } from "@jini-ai/ui";
import { FetchQueryProvider } from "@/__tests__/fetch-query-provider.test-helper";
import type { AdminExternalMcpServer } from "@jini-ai/core/contracts/site/cms-external-mcp";
import { ExternalMcpSettingsPanel } from "@jini-ai/mcp/react/external-mcp/ExternalMcpSettingsPanel";
import { hooks as panelHooks, kit as panelKit, deps as panelDeps } from "../ExternalMcpSettingsPanel";
import { useOtherCredentials } from "@jini-ai/admin/security/host/hooks/use-other-credentials.hooks";
import { createFakeOtherCredentialsPort } from "../../security/hooks/other-credentials-dependencies.hooks";
import { COMMON_I18N } from "../../../lib/i18n-common";

it("a renamed built-in connection has a badge and Tools, and no Remove control", async () => {
  const source: SourceConfigItem = { id: "host-tools", label: "Renamed host", enabled: true, fields: { builtIn: "true", transport: "stdio", authMode: "none", command: "host-launcher", allowedToolNames: "host_tool" } };
  const dependencies = createFakeSourceConfigDependencies<SourceConfigItem>({ sources: [source], createSource: input => ({ id: "new", fields: input.fields }) });
  render(<FetchQueryProvider><ExternalMcpSettingsPanel dependencies={dependencies} hooks={panelHooks} kit={panelKit} deps={panelDeps} /></FetchQueryProvider>);
  await screen.findByText("Built-in");
  const card = screen.getByRole("region", { name: "Renamed host" });
  expect(within(card).queryByRole("button", { name: "Remove" })).toBeNull();
  expect(screen.getByRole("button", { name: "Open tool permissions for Renamed host — 1 enabled" })).toBeInTheDocument();
  expect(screen.getByText("Renamed host")).toBeInTheDocument();
  for (const values of Object.values(COMMON_I18N)) expect(values["Built-in"]).toBeTruthy();
});

it("Secrets excludes the source flag and still includes a user connection with the desktop name", async () => {
  const base: AdminExternalMcpServer = { serverId: "host-tools", version: 1, label: "Renamed host", transport: "stdio", authMode: "none", enabled: true, command: "host-launcher", url: null, args: [], allowedToolNames: [], writeAllowedToolNames: [], writeGrantsUpdatedByPrincipalId: null, writeGrantsUpdatedAt: null, envNames: [], oauth: { providerId: null, grant: null, clientId: null, scopes: [], status: "disconnected", expiresAt: null, tokenEnvName: null, hasStoredToken: false } };
  const port = createFakeOtherCredentialsPort({ listExternalMcpServers: async () => ({ servers: [{ ...base, builtIn: true }, { ...base, serverId: "user-server", label: "Tovu Desktop", builtIn: false }] }) });
  const t = (key: string) => key;
  const { result } = renderHook(() => useOtherCredentials({ hooks, deps, port, t, locale: "en", filter: { query: "", category: "all" } }), { wrapper: ({ children }) => <FetchQueryProvider>{children}</FetchQueryProvider> });
  await waitFor(() => expect(result.current.groups).toBeDefined());
  expect(result.current.groups!.find(group => group.store.id === "external-mcp")?.rows.map(row => row.itemId)).toEqual(["user-server"]);
});
