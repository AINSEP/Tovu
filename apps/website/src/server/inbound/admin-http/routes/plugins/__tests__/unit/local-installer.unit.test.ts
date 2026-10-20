import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createPluginSourcePolicy } from "@jini-ai/plugins/host";
import type { PluginInstallerPort } from "@jini-ai/plugins/host/node";
import { localPluginInstaller } from "../../local-installer.js";

const INSTALLER: PluginInstallerPort = {
  preview: async () => { throw new Error("localPluginInstaller must not call the installer"); },
  install: async () => { throw new Error("localPluginInstaller must not call the installer"); },
};
const policy = (localInstallOptIn: boolean) => createPluginSourcePolicy({ hosted: true, localInstallOptIn }, {});

/** Runs one test as a hosted (Fly) process with the given TOVU_PLUGIN_LOCAL_INSTALL value. */
function hostedEnv(t: TestContext, optIn: string | undefined) {
  const previous = { fly: process.env.FLY_APP_NAME, optIn: process.env.TOVU_PLUGIN_LOCAL_INSTALL };
  process.env.FLY_APP_NAME = "hosted-test";
  if (optIn === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = optIn;
  t.after(() => {
    if (previous.fly === undefined) delete process.env.FLY_APP_NAME; else process.env.FLY_APP_NAME = previous.fly;
    if (previous.optIn === undefined) delete process.env.TOVU_PLUGIN_LOCAL_INSTALL; else process.env.TOVU_PLUGIN_LOCAL_INSTALL = previous.optIn;
  });
}

test("a source policy that admits local installs hands back the wired installer", () => {
  assert.equal(localPluginInstaller({ pluginSourcePolicy: policy(true), pluginInstaller: INSTALLER }), INSTALLER);
});

test("a source policy that keeps local installs off yields no installer", () => {
  assert.equal(localPluginInstaller({ pluginSourcePolicy: policy(false), pluginInstaller: INSTALLER }), undefined);
});

test("local installs on but no installer wired yields no installer", () => {
  assert.equal(localPluginInstaller({ pluginSourcePolicy: policy(true) }), undefined);
});

test("the injected policy wins over the env: a hosted process without the opt-in still installs under an admitting policy", (t) => {
  hostedEnv(t, undefined);
  assert.equal(localPluginInstaller({ pluginSourcePolicy: policy(true), pluginInstaller: INSTALLER }), INSTALLER);
});

test("without a policy, a hosted process with TOVU_PLUGIN_LOCAL_INSTALL=1 hands back the installer", (t) => {
  hostedEnv(t, "1");
  assert.equal(localPluginInstaller({ pluginInstaller: INSTALLER }), INSTALLER);
});

test("without a policy, a hosted process without the env opt-in yields no installer", (t) => {
  hostedEnv(t, "true");
  assert.equal(localPluginInstaller({ pluginInstaller: INSTALLER }), undefined);
});
