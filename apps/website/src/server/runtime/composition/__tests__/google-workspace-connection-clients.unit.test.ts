/**
 * @file Provider-owned pins of the Google Workspace plugin's API-connection client settings, run through the
 * generic loader (`api-connections/contribution.ts`). They live outside the vendor-neutral seams so that
 * `api-connections/__tests__/vendor-neutrality.test.ts` can keep those seams free of provider names.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { loadPluginContributionsFromSource, type LoadPluginContributions } from "../../../../features/agent-plugins/lifecycle.js";
import { loadDeclaredApiConnections } from "../../../../features/api-connections/contribution.js";
import { ACME_PLUGIN, acmeFixtureCopy } from "../../../../features/api-connections/__tests__/support/acme-harness.js";

const loaderFor = (packageRoot: string): LoadPluginContributions => (input) =>
  loadPluginContributionsFromSource({ plugin: { pluginId: ACME_PLUGIN, packageRoot }, definition: input.definition });

test("load: Google Workspace admits the canonical Jini web and desktop client settings", async (t) => {
  const clients = {
    web: { clientIdEnv: "JINI_GOOGLE_WORKSPACE_OAUTH_WEB_CLIENT_ID", clientSecretEnv: "JINI_GOOGLE_WORKSPACE_OAUTH_WEB_CLIENT_SECRET" },
    desktop: { clientIdEnv: "JINI_GOOGLE_WORKSPACE_OAUTH_DESKTOP_CLIENT_ID", clientSecretEnv: "JINI_GOOGLE_WORKSPACE_OAUTH_DESKTOP_CLIENT_SECRET" },
  };
  const root = acmeFixtureCopy(t, (declaration) => { declaration.clients = clients; });
  const loaded = await loadDeclaredApiConnections({
    workspaceId: "ws-1",
    loadContributions: (input) => loadPluginContributionsFromSource({ plugin: { pluginId: "google-workspace", packageRoot: root }, definition: input.definition }),
  }, { clientNamespaceFor: async () => "JINI_" });
  assert.deepEqual(loaded.connections.map(({ pluginId, clients }) => ({ pluginId, clients })), [{ pluginId: "google-workspace", clients }], "the trusted Google Workspace connection must keep both canonical runtime clients");
  assert.deepEqual(loaded.refusals, [], "canonical Google Workspace client settings must not be refused");
});

test("load: Acme cannot claim the Jini Google Workspace client settings", async (t) => {
  const root = acmeFixtureCopy(t, (declaration) => {
    declaration.clients = {
      web: { clientIdEnv: "JINI_GOOGLE_WORKSPACE_OAUTH_WEB_CLIENT_ID", clientSecretEnv: "JINI_GOOGLE_WORKSPACE_OAUTH_WEB_CLIENT_SECRET" },
      desktop: { clientIdEnv: "JINI_GOOGLE_WORKSPACE_OAUTH_DESKTOP_CLIENT_ID", clientSecretEnv: "JINI_GOOGLE_WORKSPACE_OAUTH_DESKTOP_CLIENT_SECRET" },
    };
  });
  const loaded = await loadDeclaredApiConnections({ workspaceId: "ws-1", loadContributions: loaderFor(root) });
  assert.deepEqual(loaded.connections, [], "another trusted plugin must not receive Google Workspace client settings");
  assert.deepEqual(loaded.refusals, ["API connection 'account' from 'acme-office' was not loaded: Client settings must belong to this plugin's TOVU_ACME_OFFICE_ namespace."], "the refusal must identify Acme's own host namespace");
});

test("load: Google Workspace refuses the old Tovu client setting names", async (t) => {
  const root = acmeFixtureCopy(t, (declaration) => {
    declaration.clients = {
      web: { clientIdEnv: "TOVU_GOOGLE_WORKSPACE_OAUTH_WEB_CLIENT_ID", clientSecretEnv: "TOVU_GOOGLE_WORKSPACE_OAUTH_WEB_CLIENT_SECRET" },
      desktop: { clientIdEnv: "TOVU_GOOGLE_WORKSPACE_OAUTH_DESKTOP_CLIENT_ID", clientSecretEnv: "TOVU_GOOGLE_WORKSPACE_OAUTH_DESKTOP_CLIENT_SECRET" },
    };
  });
  const loaded = await loadDeclaredApiConnections({
    workspaceId: "ws-1",
    loadContributions: (input) => loadPluginContributionsFromSource({ plugin: { pluginId: "google-workspace", packageRoot: root }, definition: input.definition }),
  }, { clientNamespaceFor: async () => "JINI_" });
  assert.deepEqual(loaded.connections, [], "Google Workspace must not retain the old Tovu runtime client names");
  assert.deepEqual(loaded.refusals, ["API connection 'account' from 'google-workspace' was not loaded: Client settings must belong to this plugin's JINI_GOOGLE_WORKSPACE_ namespace."], "the refusal must identify Google Workspace's canonical Jini namespace");
});
