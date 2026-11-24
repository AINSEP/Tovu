import assert from "node:assert/strict";
import test from "node:test";
import { PUBLIC_CONFIG_REFUSED_MESSAGE } from "@jini-ai/agent-plugins/site/admin-surfaces/public-config";
import { bundledPublicConfigNames, createAdminSurfacePublicConfig } from "../../public-config.js";

const env = { ACME_CHOOSER_APP_ID: " chooser ", TOVU_ACME_APP_ID: "tovu-app", JINI_OTHER_APP_ID: "other", JINI_S3_ACCESS_KEY_ID: "k" };

test("the public names a plugin manifest declares are read, and only those", async () => {
  const config = createAdminSurfacePublicConfig({ env, publicNames: ["ACME_CHOOSER_APP_ID"] });
  assert.equal(await config.get({ name: "ACME_CHOOSER_APP_ID" }), "chooser");
  assert.equal(await config.get({ name: "TOVU_ACME_APP_ID" }), "tovu-app");
  for (const name of ["JINI_OTHER_APP_ID", "JINI_S3_ACCESS_KEY_ID"]) {
    await assert.rejects(config.get({ name }), { message: PUBLIC_CONFIG_REFUSED_MESSAGE }, `${name} is not declared by a bundled manifest`);
  }
});

test("this host names no provider setting of its own: with no manifest names, only its own TOVU_ shapes are readable", async () => {
  const config = createAdminSurfacePublicConfig({ env: { ...env, JINI_WIDGET_APP_ID: "x" }, publicNames: [] });
  await assert.rejects(config.get({ name: "ACME_CHOOSER_APP_ID" }), { message: PUBLIC_CONFIG_REFUSED_MESSAGE });
  assert.equal(await config.get({ name: "TOVU_ACME_APP_ID" }), "tovu-app");
});

test("bundled manifests' publicConfig names are collected across surfaces, de-duplicated, and a missing manifest adds none", () => {
  const manifests: Record<string, unknown> = {
    one: { surfaces: [{ id: "a", publicConfig: ["X_APP_ID", "X_BROWSER_KEY"] }, { id: "b" }, { id: "c", publicConfig: ["X_APP_ID"] }] },
    two: { surfaces: [{ id: "a", publicConfig: ["Y_APP_ID"] }] },
  };
  const names = bundledPublicConfigNames({ pluginIds: ["one", "two", "absent"], readManifest: ({ pluginId }) => manifests[pluginId] ?? null });
  assert.deepEqual([...names].sort(), ["X_APP_ID", "X_BROWSER_KEY", "Y_APP_ID"]);
});
