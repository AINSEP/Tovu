/** V06: Fly owns these env names and copy, never executable preboot policy.
 * APP_NAME identifies the edge proxy and hosted app. MACHINE/ALLOC alone do not establish an
 * edge hop or hosted-install context, but still restrict native tools. Do not collapse them.
 */
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { evaluateHostSignals } from "../../../../apps/website/src/contracts/core/host-signals.ts";
import { readBundledHostSignalDeclaration, resolveBundledHostSignals } from "../../../../apps/website/src/features/agent-plugins/host-signals.ts";
import { resolveTrustProxySetting } from "../../../../apps/website/src/server/inbound/shared/trust-proxy.ts";
import { createSitePluginPolicy, sitePluginLocalInstallEnabled } from "../../../../apps/website/src/features/plugin-runtime/install.ts";
import { isHostedAssistantRuntime, resolveFullCliAccess, resolveAssistantCliPermissions } from "../../../../apps/website/src/contracts/core/assistant-native-fallbacks.ts";
import { resolveAgentPermissionMode } from "../../../../apps/website/src/contracts/core/agent-permission-mode.ts";
import { detectDeploymentSignals, collectBootReadinessWarnings, warnOnBootReadinessGaps } from "../../../../apps/website/src/server/runtime/boot/boot-readiness-warnings.ts";
import { headExpectations, headProxyOutcome, headEnvironmentMatrix } from "./fixtures/host-signals-head.mjs";
import { stageServerRuntimeAssets } from "../../../../development/scripts/build-server.mjs";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const shippedManifest = readFileSync(new URL("../plugin.json", import.meta.url), "utf8");
const extension = JSON.parse(shippedManifest).extensions.tovu;

test("Fly's host declaration is plain manifest data, synchronously readable before activation", () => {
  assert.deepEqual(extension.hostSignals, [
    { env: "FLY_APP_NAME", facts: { hosted: true, trustProxyHops: 1, nativeToolsRestricted: true }, label: "Fly.io (FLY_APP_NAME)" },
    { env: "FLY_MACHINE_ID", facts: { nativeToolsRestricted: true } },
    { env: "FLY_ALLOC_ID", facts: { nativeToolsRestricted: true } },
  ]);
  const declaration = readBundledHostSignalDeclaration({ sourceRoot });
  assert.deepEqual(declaration.signals, extension.hostSignals);
  assert.equal(declaration.deploymentAdvice, "Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).");
});

for (const app of [undefined, "", " ", "0", "app"]) for (const machine of [undefined, "", " ", "0", "machine"]) for (const alloc of [undefined, "", " ", "0", "alloc"]) {
  test(`Fly APP/MACHINE/ALLOC policy matrix ${JSON.stringify([app, machine, alloc])}`, () => {
    const env = { FLY_APP_NAME: app, FLY_MACHINE_ID: machine, FLY_ALLOC_ID: alloc, TOVU_AGENT_PERMISSION_MODE: "bypass" };
    const hostSignals = resolveBundledHostSignals({ env }, { sourceRoot });
    const options = { hostSignals };
    const restricted = !!(app || machine || alloc);
    assert.equal(resolveTrustProxySetting({ env }, options), app ? 1 : false);
    assert.equal(createSitePluginPolicy({ env }, options).localInstallEnabled({}, {}), !app);
    assert.equal(isHostedAssistantRuntime({ env }, options), restricted);
    assert.equal(resolveFullCliAccess({ isOwner: true, env, setting: true }, options), !restricted);
    assert.equal(resolveAgentPermissionMode({ env }, options), restricted ? "restricted" : "bypass");
    assert.deepEqual(detectDeploymentSignals({ env }, { ...options, pathExists: () => false }), app ? ["Fly.io (FLY_APP_NAME)"] : []);
    const deployedEnv = { ...env, NODE_ENV: "production" };
    const labels = app ? "NODE_ENV=production, Fly.io (FLY_APP_NAME)" : "NODE_ENV=production";
    const agentClause = restricted ? "" : ' and the assistant agent runs with permission mode "bypass"';
    assert.deepEqual(collectBootReadinessWarnings({ env: deployedEnv, mode: "local",
      deploymentSignals: detectDeploymentSignals({ env: deployedEnv }, { ...options, pathExists: () => false }),
      agentPermissionMode: resolveAgentPermissionMode({ env: deployedEnv }, options),
    }, options), [
      `[boot-readiness] WARNING: this server looks deployed (${labels}) but TOVU_RUNTIME_MODE is not "production": production boot checks are off${agentClause}. Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).`,
    ]);
    assert.deepEqual(collectBootReadinessWarnings({ env: { ...deployedEnv, COMMENTS_IP_SALT: "pinned" }, mode: "production",
      deploymentSignals: [labels], agentPermissionMode: "restricted",
    }, options), []);
    for (const [value, expected] of [["false", false], ["0", false], ["off", false], ["no", false], ["2", 2], ["", app ? 1 : false], [" loopback ", "loopback"]]) {
      assert.equal(resolveTrustProxySetting({ env: { ...env, TOVU_TRUST_PROXY: value } }, options), expected);
    }
    assert.throws(() => resolveTrustProxySetting({ env: { ...env, TOVU_TRUST_PROXY: "true" } }, options), /would trust/);
  });
}

test("packaged desktop and plugin-install opt-in preserve their separate exceptions", () => {
  for (const app of ["", "app"]) for (const machine of ["", "machine"]) for (const alloc of ["", "alloc"]) for (const optIn of [undefined, "1"]) {
    const env = { NODE_ENV: "production", ELECTRON_RUN_AS_NODE: "1", TOVU_DESKTOP_OWNER_PID: "42",
      FLY_APP_NAME: app, FLY_MACHINE_ID: machine, FLY_ALLOC_ID: alloc, TOVU_PLUGIN_LOCAL_INSTALL: optIn };
    const options = { hostSignals: resolveBundledHostSignals({ env }, { sourceRoot }) };
    assert.equal(createSitePluginPolicy({ env }, options).localInstallEnabled({}, {}), !app || optIn === "1");
    assert.equal(resolveFullCliAccess({ isOwner: true, env }, options), !(app || machine || alloc));
  }
});

test("boot labels, ordering and full warning bytes stay identical, including incidental advice", () => {
  const env = { NODE_ENV: "production", KUBERNETES_SERVICE_HOST: "private-k8s", FLY_APP_NAME: "private-app" };
  const hostSignals = resolveBundledHostSignals({ env }, { sourceRoot });
  const deploymentSignals = detectDeploymentSignals({ env }, { hostSignals, pathExists: () => true });
  assert.deepEqual(deploymentSignals, ["NODE_ENV=production", "container (/.dockerenv)", "container (/run/.containerenv)", "Kubernetes (KUBERNETES_SERVICE_HOST)", "Fly.io (FLY_APP_NAME)"]);
  assert.deepEqual(collectBootReadinessWarnings({ env, mode: "local", deploymentSignals, agentPermissionMode: "restricted" }, { hostSignals }), [
    '[boot-readiness] WARNING: this server looks deployed (NODE_ENV=production, container (/.dockerenv), container (/run/.containerenv), Kubernetes (KUBERNETES_SERVICE_HOST), Fly.io (FLY_APP_NAME)) but TOVU_RUNTIME_MODE is not "production": production boot checks are off. Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).',
  ]);
  const lines = [];
  warnOnBootReadinessGaps({ env: { FLY_APP_NAME: "private-app", TOVU_AGENT_PERMISSION_MODE: "bypass" }, pathExists: () => false, log: line => lines.push(line) });
  assert.deepEqual(lines, ['[boot-readiness] WARNING: this server looks deployed (Fly.io (FLY_APP_NAME)) but TOVU_RUNTIME_MODE is not "production": production boot checks are off. Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).']);
  // Advice was unconditional legacy copy, even when another deployment signal was the trigger.
  const noMatch = evaluateHostSignals({ env: {}, declaration: { signals: extension.hostSignals, deploymentAdvice: extension.deploymentAdvice } });
  assert.ok(collectBootReadinessWarnings({ env: {}, mode: "local", deploymentSignals: ["container (/.dockerenv)"], agentPermissionMode: "bypass" }, { hostSignals: noMatch })[0].endsWith(extension.deploymentAdvice));
});

/** Compare thrown proxy errors as data; no assertion runs inside this catch boundary. */
function currentProxyOutcome({ env, hostSignals }, _optional = {}) {
  try { return resolveTrustProxySetting({ env }, { hostSignals }); }
  catch (error) { return { error: error.message }; }
}

/** Every security consumer and both warning paths are checked against the frozen HEAD oracle. */
function assertHeadConsumers({ env, hostSignals, pathExists }, _optional = {}) {
  const expected = headExpectations({ env, pathExists });
  const options = { hostSignals };
  assert.equal(isHostedAssistantRuntime({ env }, options), expected.nativeRestricted);
  assert.equal(resolveFullCliAccess({ isOwner: true, setting: true, env }, options), expected.fullCliAccess);
  assert.equal(resolveAgentPermissionMode({ env }, options), expected.permissionMode);
  assert.equal(createSitePluginPolicy({ env }, options).localInstallEnabled({}, {}), expected.localInstallEnabled);
  assert.equal(sitePluginLocalInstallEnabled({ env }, options), expected.localInstallEnabled);
  const permissions = resolveAssistantCliPermissions({ isOwner: true, env, settings: { enabled: true } }, options);
  assert.equal(permissions.enabled, expected.fullCliAccess);
  assert.deepEqual(permissions.capabilities, Object.fromEntries([
    "shell", "fileWrite", "userMcp", "subagents", "userSettings", "web", "workflows", "loginEnvironment",
  ].map(key => [key, expected.fullCliAccess])));
  const deploymentSignals = detectDeploymentSignals({ env }, { ...options, pathExists });
  assert.deepEqual(deploymentSignals, expected.labels);
  assert.deepEqual(collectBootReadinessWarnings({ env,
    mode: env.TOVU_RUNTIME_MODE === "production" ? "production" : "local", deploymentSignals,
    agentPermissionMode: resolveAgentPermissionMode({ env }, options),
  }, options), expected.warnings);
  const lines = [];
  warnOnBootReadinessGaps({ env, hostSignals, pathExists, log: line => lines.push(line) });
  assert.deepEqual(lines, expected.warnings);
  for (const override of [undefined, "", " ", "false", "FALSE", "0", "off", "no", "1", "01", "2", " loopback ", "true", " TrUe "]) {
    const overriddenEnv = { ...env, TOVU_TRUST_PROXY: override };
    assert.deepEqual(currentProxyOutcome({ env: overriddenEnv, hostSignals }), headProxyOutcome({ env: overriddenEnv }));
  }
}

/** Fakes exercise real JSON validation/aggregation without filesystem permissions or plugin code. */
function declarationReader({ texts }, _optional = {}) {
  return required => readBundledHostSignalDeclaration(required, {
    sources: () => texts.map((_text, index) => ({ pluginId: `host-${index}`, packageRoot: `/bundled/host-${index}` })),
    readText: file => {
      const text = texts[Number(path.basename(path.dirname(file)).slice("host-".length))];
      if (text === undefined) throw new Error("unreadable manifest");
      return text;
    },
  });
}

/** Encode manifest variants through the same two-object boundary as the reader. */
function manifestText({ hostSignals, deploymentAdvice = extension.deploymentAdvice }, _optional = {}) {
  return JSON.stringify({ extensions: { tovu: { hostSignals, deploymentAdvice } } });
}
const validDeclaration = readBundledHostSignalDeclaration({ sourceRoot });
const resolutionCases = [
  ["valid shipped declaration", { sourceRoot, readDeclaration: () => validDeclaration }],
  ["missing declaration", { sourceRoot, readDeclaration: declarationReader({ texts: [] }) }],
  ["unreadable manifest", { sourceRoot, readDeclaration: declarationReader({ texts: [undefined] }) }],
  ["malformed JSON", { sourceRoot, readDeclaration: declarationReader({ texts: ["{"] }) }],
  ["missing metadata", { sourceRoot, readDeclaration: declarationReader({ texts: ["{}"] }) }],
  ["malformed declaration", { sourceRoot, readDeclaration: declarationReader({ texts: [manifestText({ hostSignals: "not an array" })] }) }],
  ["empty security declaration", { sourceRoot, readDeclaration: declarationReader({ texts: [manifestText({ hostSignals: [] })] }) }],
  ["partial security declaration", { sourceRoot, readDeclaration: declarationReader({ texts: [manifestText({ hostSignals: extension.hostSignals.slice(0, 1) })] }) }],
  ["weakened security facts", { sourceRoot, readDeclaration: declarationReader({ texts: [manifestText({ hostSignals: [
    { ...extension.hostSignals[0], facts: { hosted: false, nativeToolsRestricted: false, trustProxyHops: 2 } }, ...extension.hostSignals.slice(1),
  ] })] }) }],
  ["ambiguous cross-package ownership", { sourceRoot, readDeclaration: declarationReader({ texts: [shippedManifest, manifestText({ hostSignals: [extension.hostSignals[1]] })] }) }],
  ["ambiguous ownership within package", { sourceRoot, readDeclaration: declarationReader({ texts: [manifestText({ hostSignals: [...extension.hostSignals, extension.hostSignals[2]] })] }) }],
  ["conflicting advice", { sourceRoot, readDeclaration: declarationReader({ texts: [shippedManifest, manifestText({ hostSignals: [], deploymentAdvice: "Other advice." })] }) }],
  ["unresolved product root", { productRoot: () => { throw new Error("no product root"); } }],
  ["absent source root", { sourceRoot: "/absent", readDeclaration: required => readBundledHostSignalDeclaration(required, {
    sources: () => { throw new Error("no source root"); },
  }) }],
  ["reader failure", { sourceRoot, readDeclaration: () => { throw new Error("reader failed"); } }],
  ["missing advice", { sourceRoot, readDeclaration: declarationReader({ texts: [JSON.stringify({ extensions: { tovu: { hostSignals: extension.hostSignals } } })] }) }],
];

for (const [name, ports] of resolutionCases) {
  test(`${name}: 4,500 combinations match frozen HEAD for every consumer`, () => {
    let combinations = 0;
    for (const env of headEnvironmentMatrix({})) {
      const hostSignals = resolveBundledHostSignals({ env }, ports);
      assertHeadConsumers({ env, hostSignals, pathExists: () => true });
      combinations++;
    }
    assert.equal(combinations, 4500);
  });

  test(`${name}: independent product switches, CLI locks, warning triggers and salt bytes match HEAD`, () => {
    for (const env of [
      {}, { FLY_MACHINE_ID: " " }, { FLY_ALLOC_ID: "0" }, { NODE_ENV: "production" },
      { KUBERNETES_SERVICE_HOST: "private" }, { FLY_APP_NAME: "app" },
      ...[undefined, "", " ", "pinned"].map(salt => ({ TOVU_RUNTIME_MODE: "production", COMMENTS_IP_SALT: salt })),
      ...["1", "true", "0", "false"].map(value => ({ TOVU_HOSTED: value, TOVU_AGENT_PERMISSION_MODE: "bypass" })),
      ...["https://tovu.dev", "https://owner.tovu.dev/", "https://tovu.dev:443/", "https://tovu.dev.evil/"].map(url => ({ TOVU_PUBLIC_URL: url })),
      ...["restricted", "bypass", "invalid"].map(value => ({ TOVU_AGENT_PERMISSION_MODE: value })),
      ...["TOVU_AGENT_FULL_CLI_ACCESS", "TOVU_AGENT_NATIVE_FALLBACKS", "TOVU_AGENT_FORBID_BASH"].flatMap(key =>
        ["0", "false", "1"].map(value => ({ [key]: value }))),
    ]) {
      const hostSignals = resolveBundledHostSignals({ env }, ports);
      for (const pathExists of [() => false, marker => marker === "/.dockerenv"]) {
        assertHeadConsumers({ env, hostSignals, pathExists });
      }
    }
  });
}

// Exercise default filesystem selection as well as the injected failure seams above.
test("missing/malformed on-disk declarations preserve HEAD rather than silently granting access", t => {
  const emptyRoot = mkdtempSync(path.join(tmpdir(), "host-signals-missing-"));
  t.after(() => rmSync(emptyRoot, { recursive: true, force: true }));
  mkdirSync(path.join(emptyRoot, "fly"));
  const env = { FLY_APP_NAME: "app", FLY_MACHINE_ID: "machine", FLY_ALLOC_ID: "alloc" };
  for (const text of [undefined, "{", manifestText({ hostSignals: "not an array" })]) {
    if (text !== undefined) writeFileSync(path.join(emptyRoot, "fly/plugin.json"), text);
    assertHeadConsumers({ env, hostSignals: resolveBundledHostSignals({ env }, { sourceRoot: emptyRoot }), pathExists: () => false });
  }
});

// The pure shared policy also retains the legacy restriction if a host omits injection entirely.
test("native and permission policies without host injection preserve frozen HEAD", () => {
  for (const env of headEnvironmentMatrix({})) {
    const expected = headExpectations({ env, pathExists: () => false });
    assert.equal(isHostedAssistantRuntime({ env }), expected.nativeRestricted);
    assert.equal(resolveFullCliAccess({ isOwner: true, env }), expected.fullCliAccess);
    assert.equal(resolveAgentPermissionMode({ env }), expected.permissionMode);
  }
});

test("Docker's runtime-asset staging preserves Fly's host declaration byte for byte", t => {
  const repoRoot = mkdtempSync(path.join(tmpdir(), "fly-host-payload-"));
  t.after(() => rmSync(repoRoot, { recursive: true, force: true }));
  for (const dir of ["templates", "themes", "agent-plugins/fly", "plugins", "public"]) mkdirSync(path.join(repoRoot, "content", dir), { recursive: true });
  mkdirSync(path.join(repoRoot, "apps/website/src/platform/db/drizzle"), { recursive: true });
  writeFileSync(path.join(repoRoot, "content/agent-plugins/fly/plugin.json"), shippedManifest);
  stageServerRuntimeAssets({ repoRoot });
  assert.equal(readFileSync(path.join(repoRoot, "dist/content/agent-plugins/fly/plugin.json"), "utf8"), shippedManifest);
  assert.deepEqual(readBundledHostSignalDeclaration({ sourceRoot: path.join(repoRoot, "dist/content/agent-plugins") }).signals, extension.hostSignals);
  const dockerfile = readFileSync(new URL("../../../../Dockerfile", import.meta.url), "utf8");
  assert.match(dockerfile, /RUN npm run build/);
  assert.match(dockerfile, /COPY --from=build \/workspace\/Tovu \/workspace\/Tovu/);
});
