/**
 * Frozen behavioral oracle from HEAD 15dac40d0b51c308d80e16370cf33ff2cc464dcd, before phase 4.
 * Sources: assistant-native-fallbacks.ts, agent-permission-mode.ts, runtime-mode.ts,
 * plugin-runtime/install.ts, trust-proxy.ts and boot-readiness-warnings.ts.
 * This fixture deliberately imports no production evaluator, fallback, declaration or policy.
 * Do not update it to agree with the extraction: any change is a security-policy decision.
 */
const HEAD_ADVICE = "Set TOVU_RUNTIME_MODE=production (fly.toml and docker-compose.yml already do).";
const PROXY_ERROR = 'TOVU_TRUST_PROXY="true" would trust X-Forwarded-For from any client. Set the number of proxy hops in front of Tovu (e.g. 1), or a list of proxy addresses/subnets.';
const SALT_WARNING = "[boot-readiness] WARNING: COMMENTS_IP_SALT is not set: comment IP hashes are salted with a value derived from the site key, " +
  "so rotating the site key changes them. Set COMMENTS_IP_SALT to a long random value to pin it.";

/** HEAD native-host predicate, including independent product switches. */
function nativeRestricted({ env }, _optional = {}) {
  return env.TOVU_RUNTIME_MODE === 'production' || env.TOVU_HOSTED === '1' || env.TOVU_HOSTED === 'true' ||
    !!(env.FLY_APP_NAME || env.FLY_MACHINE_ID || env.FLY_ALLOC_ID) ||
    /^https?:\/\/(?:[^/]+\.)?tovu\.dev(?::\d+)?(?:\/|$)/i.test(env.TOVU_PUBLIC_URL ?? '');
}

/** HEAD override parsing, as a result so the test can compare both successful and refused settings. */
export function headProxyOutcome({ env }, _optional = {}) {
  const override = env.TOVU_TRUST_PROXY?.trim() ?? "";
  if (override !== "") {
    const lower = override.toLowerCase();
    if (lower === "true") return { error: PROXY_ERROR };
    if (["false", "0", "off", "no"].includes(lower)) return false;
    if (/^\d+$/.test(override)) return Number(override);
    return override;
  }
  return env.FLY_APP_NAME ? 1 : false;
}

/** HEAD warning copy and ordering; path probes are deterministic test input. */
function warnings({ env, labels, permissionMode }, _optional = {}) {
  if (env.TOVU_RUNTIME_MODE === "production") {
    return env.COMMENTS_IP_SALT === undefined || env.COMMENTS_IP_SALT.trim() === "" ? [SALT_WARNING] : [];
  }
  if (labels.length === 0) return [];
  const agent = permissionMode === "bypass" ? ' and the assistant agent runs with permission mode "bypass"' : "";
  return [`[boot-readiness] WARNING: this server looks deployed (${labels.join(", ")}) but TOVU_RUNTIME_MODE is not "production": ` +
    `production boot checks are off${agent}. ${HEAD_ADVICE}`];
}

/** HEAD local CLI locks; owner opt-ins never override an explicit OFF switch. */
function cliLocked({ env }, _optional = {}) {
  return env.TOVU_AGENT_PERMISSION_MODE === 'restricted' || env.TOVU_AGENT_FORBID_BASH === '1' ||
    ['TOVU_AGENT_FULL_CLI_ACCESS', 'TOVU_AGENT_NATIVE_FALLBACKS'].some(key => ['0', 'false'].includes(env[key] ?? ''));
}

/** HEAD's adapter plus Jini source-policy result, including desktop and explicit opt-in. */
function localInstallEnabled({ env }, _optional = {}) {
  const desktop = env.ELECTRON_RUN_AS_NODE === '1' && !!env.TOVU_DESKTOP_OWNER_PID;
  const hosted = !!env.FLY_APP_NAME || (env.NODE_ENV === 'production' && !desktop);
  return !hosted || env.TOVU_PLUGIN_LOCAL_INSTALL === '1';
}

/** HEAD's deployment labels in their original order. */
function deploymentLabels({ env, pathExists }, _optional = {}) {
  const labels = [];
  if (env.NODE_ENV === "production") labels.push("NODE_ENV=production");
  for (const marker of ["/.dockerenv", "/run/.containerenv"]) if (pathExists(marker)) labels.push(`container (${marker})`);
  if (env.KUBERNETES_SERVICE_HOST) labels.push("Kubernetes (KUBERNETES_SERVICE_HOST)");
  if (env.FLY_APP_NAME) labels.push("Fly.io (FLY_APP_NAME)");
  return labels;
}

/** Frozen HEAD expectations for every consumer; policy exceptions remain independent. */
export function headExpectations({ env, pathExists }, _optional = {}) {
  const restricted = nativeRestricted({ env });
  const permissionMode = restricted || env.TOVU_AGENT_PERMISSION_MODE === "restricted" ? "restricted" : "bypass";
  const labels = deploymentLabels({ env, pathExists });
  return {
    nativeRestricted: restricted, fullCliAccess: !restricted && !cliLocked({ env }), permissionMode,
    localInstallEnabled: localInstallEnabled({ env }),
    labels, warnings: warnings({ env, labels, permissionMode }),
  };
}

/** All legacy string truthiness combinations, including whitespace and literal "0" for each signal. */
function* signalVariants(_required, _optional = {}) {
  const values = [undefined, "", " ", "0", "present"];
  for (const app of values) for (const machine of values) for (const alloc of values) {
    yield { FLY_APP_NAME: app, FLY_MACHINE_ID: machine, FLY_ALLOC_ID: alloc };
  }
}

/** The independent NODE_ENV, desktop and install opt-in dimensions from the CHECK. */
function* runtimeVariants(_required, _optional = {}) {
  for (const node of [undefined, "development", "production"]) {
    for (const desktop of [{}, { ELECTRON_RUN_AS_NODE: "1" }, { TOVU_DESKTOP_OWNER_PID: "42" }, { ELECTRON_RUN_AS_NODE: "1", TOVU_DESKTOP_OWNER_PID: "42" }]) {
      for (const optIn of [undefined, "0", "1"]) {
        yield { NODE_ENV: node, ...desktop, TOVU_PLUGIN_LOCAL_INSTALL: optIn, TOVU_AGENT_PERMISSION_MODE: "bypass" };
      }
    }
  }
}

/** The CHECK's 4,500 combinations: 5³ signal values × 3 NODE_ENV × 4 desktop × 3 opt-in. */
export function* headEnvironmentMatrix(_required, _optional = {}) {
  for (const signals of signalVariants({})) for (const runtime of runtimeVariants({})) {
    yield { ...signals, ...runtime };
  }
}
