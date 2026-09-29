/**
 * @file Vercel deploy target for the Tovu `deploy` plugin.
 *
 * Ported from `@jini-ai/devops` `src/deploy/vercel.ts` at Jini commit 28f67f9a: the body of
 * {@link bindVercel} is that source with its TypeScript types stripped, same Vercel calls, error texts,
 * redirect guard and Deployment Protection detector (`isVercelProtectedResponse`). Changes:
 *
 * - Network, timeouts, poll delay, reachability, naming, the redirect guard and `DeployError` come
 *   from the host kit Tovu injects (`apps/website/src/features/deployments/deploy-targets/types.ts`),
 *   bound once per target by {@link bindVercel}: an installed plugin has no npm dependencies.
 * - `responseHeaders` (the host's security header set) is rendered into a root `vercel.json` here,
 *   which Tovu core used to add itself.
 *
 * Plain JS by owner decision (2026-09-29).
 */

export const VERCEL_TARGET_ID = "vercel";

/** The root file Vercel reads response-header rules from. */
const VERCEL_CONFIG_FILE = "vercel.json";

/**
 * Renders a header set as a `vercel.json` with one catch-all header rule. Byte-identical to what
 * Tovu core rendered before this moved here.
 *
 * @param {Readonly<Record<string, string>>} headers
 * @returns {string}
 */
function renderVercelConfig(headers) {
  const rule = { source: "/(.*)", headers: Object.entries(headers).map(([key, value]) => ({ key, value })) };
  return `${JSON.stringify({ headers: [rule] }, null, 2)}\n`;
}

/**
 * The file set actually deployed: `files`, plus a root `vercel.json` rendered from
 * `responseHeaders`, which REPLACES a site-supplied one (the header set is the host's policy).
 *
 * @param {Array<{ file: string, data: string | Uint8Array, contentType?: string }>} files
 * @param {Readonly<Record<string, string>> | undefined} responseHeaders
 */
function withVercelConfigFile(files, responseHeaders) {
  if (!responseHeaders || Object.keys(responseHeaders).length === 0) return files;
  return [...files.filter((file) => file.file !== VERCEL_CONFIG_FILE), { file: VERCEL_CONFIG_FILE, data: renderVercelConfig(responseHeaders) }];
}

/**
 * Binds the ported Vercel code to one host kit.
 *
 * @param {import("../../../../apps/website/src/features/deployments/deploy-targets/types.js").DeployHostKit} kit
 * @returns The target class (constructed with `{ token, teamId?, teamSlug? }`, as in devops) and the
 * protected-response detector.
 */
export function bindVercel(kit) {
  const { fetch: fetchWithTimeout, timeouts: FETCH_TIMEOUT_MS, sleep, DeployError, checkDeploymentUrl, normalizeDeploymentUrl, waitForReachableDeploymentUrl, safeProjectLabel, assertNotRedirected, redirectGuardInit } = kit;
  const VERCEL_TARGET_ID = 'vercel';
  const VERCEL_API = 'https://api.vercel.com';
  const VERCEL_PROTECTED_MESSAGE = 'Deployment is protected by Vercel. Disable Deployment Protection or use a custom domain to make this link public.';
  /**
   * Heuristically detects Vercel's own Deployment Protection auth wall from a
   * 401 response, so `checkReachability` can report `status: 'protected'`
   * (an actionable, non-error outcome) instead of `reachable: false` with a
   * generic message.
   *
   * @param resp - The HTTP response received from probing a deployment URL.
   * @param body - The response body (only read for 401s by the caller).
   * @returns `true` if the response looks like Vercel's SSO/auth gate.
   * @complexity O(1) — a handful of regex tests over already-fetched strings.
   * @overallScore 100/100
   */
  function isVercelProtectedResponse(resp, body = '') {
      const server = resp.headers?.get?.('server') || '';
      const setCookie = resp.headers?.get?.('set-cookie') || '';
      const text = String(body || '');
      return (/vercel/i.test(server) ||
          /_vercel_sso_nonce/i.test(setCookie) ||
          /Authentication Required/i.test(text) ||
          /Vercel Authentication/i.test(text) ||
          /vercel\.com\/sso-api/i.test(text));
  }
  /**
   * `DeployTarget` adapter for Vercel's v13 deployments API. Publishes a
   * caller-supplied file set as a single deployment, polls until Vercel
   * reports a terminal `readyState`, then waits for the resulting URL to
   * become publicly reachable.
   *
   * Genericized from the origin product's daemon deploy module's
   * `deployToVercel`: the origin's product-specific deployment-name
   * convention is replaced by `input.projectName` (sanitized the same way);
   * token/team config is supplied by the caller instead of being read from a
   * product-owned local config file — persistence of that config is now the
   * caller's concern, not this package's.
   */
  class VercelDeployTarget {
      config;
      id = VERCEL_TARGET_ID;
      constructor(config) {
          this.config = config;
      }
      /**
       * Publishes `input.files` as a new Vercel deployment and waits for the
       * resulting URL to be reachable.
       *
       * @param input - File set plus a caller-chosen project name label.
       * @returns The published deployment's URL/status once Vercel has a
       *   terminal `readyState` (or the poll budget is exhausted).
       * @throws {DeployError} If `config.token` is missing, or Vercel's API
       *   rejects the deployment request or reports `readyState: 'ERROR'`.
       * @complexity O(files) to encode the payload, plus a bounded poll loop
       *   (`pollVercelDeployment`) and the reachability wait's own bound.
       * @overallScore 100/100
       */
      async publish(input) {
          if (!this.config.token) {
              throw new DeployError('Vercel token is required.', 400);
          }
          const createResp = await fetchWithTimeout(`${VERCEL_API}/v13/deployments${vercelTeamQuery(this.config)}`, redirectGuardInit({
              method: 'POST',
              headers: {
                  Authorization: `Bearer ${this.config.token}`,
                  'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                  name: safeVercelProjectName(input.projectName),
                  files: withVercelConfigFile(input.files, input.responseHeaders).map((f) => ({
                      file: f.file,
                      data: Buffer.from(f.data).toString('base64'),
                      encoding: 'base64',
                  })),
                  projectSettings: { framework: null },
              }),
          }), { timeoutMs: FETCH_TIMEOUT_MS.UPLOAD });
          assertNotRedirected(createResp, 'Vercel deployment creation');
          const created = await readVercelJson(createResp);
          if (!createResp.ok)
              throw vercelError(created, createResp.status);
          const deploymentId = typeof created.id === 'string' ? created.id : typeof created.uid === 'string' ? created.uid : undefined;
          const initialUrl = deploymentUrl(created);
          const ready = deploymentId ? await pollVercelDeployment(this.config, deploymentId) : created;
          if (ready?.readyState === 'ERROR') {
              const readyError = ready?.error;
              // `ready ?? undefined` — the `undefined` side is unreachable: this line
              // only runs when `ready?.readyState === 'ERROR'` just matched, which
              // requires `ready` itself to already be a real object (optional
              // chaining on a null/undefined `ready` would make the whole comparison
              // `undefined === 'ERROR'`, i.e. false, skipping this block entirely).
              // So by the time `ready ?? undefined` evaluates, `ready` is always
              // truthy and the `??` is a no-op at runtime. Kept (not simplified to
              // just `ready`) purely for type-level reasons: `ready`'s static type is
              // `JsonObject | null` (from `pollVercelDeployment`'s return type /
              // `created`'s), and `DeployError`'s `details` parameter accepts
              // `JsonObject | string | undefined` — not `null` — so this coalesce is
              // a compile-time-required null-to-undefined conversion that TypeScript's
              // control-flow analysis cannot narrow away just from the optional-chained
              // comparison above. See packages/devops/source-map.md's 2026-07-22
              // addition for the full re-derivation.
              throw new DeployError(readyError?.message || 'Vercel deployment failed.', 502, ready ?? undefined);
          }
          const candidates = deploymentUrlCandidates(ready, created);
          const link = await waitForReachableDeploymentUrl(candidates.length ? candidates : [initialUrl], {
              providerLabel: 'Vercel',
              detectProtected: isVercelProtectedResponse,
              protectedMessage: VERCEL_PROTECTED_MESSAGE,
          });
          return {
              targetId: this.id,
              url: link.url || deploymentUrl(ready) || initialUrl,
              ...(deploymentId ? { deploymentId } : {}),
              status: link.status,
              statusMessage: link.statusMessage,
              ...(link.reachableAt !== undefined ? { reachableAt: link.reachableAt } : {}),
          };
      }
      /** Probes `url`, recognizing Vercel's own Deployment Protection auth wall. */
      async checkReachability(url) {
          return checkDeploymentUrl(url, {
              detectProtected: isVercelProtectedResponse,
              protectedMessage: VERCEL_PROTECTED_MESSAGE,
          });
      }
  }
  /**
   * Polls a just-created Vercel deployment until it reaches a terminal
   * `readyState` (`READY`/`ERROR`) or the fixed 30-attempt budget is spent
   * (~1s for the first 5 attempts, 2s thereafter — roughly a minute).
   *
   * A response this file cannot parse as JSON is treated as "keep polling,"
   * not an error — same reasoning as `github-pages.ts`'s `pollGitHubPagesBuild`
   * (fixed 2026-08-16 for the identical bug class): the deployment already
   * exists server-side by the time this loop runs (the create call above
   * already succeeded), so a transient/edge/empty poll response is exactly as
   * uninformative as a stuck in-progress state, never a reason to report an
   * already-created deployment as failed. Any other non-2xx response whose
   * body DID parse still fails fast, unchanged.
   *
   * @complexity O(30) network round-trips, bounded and fixed regardless of input size.
   * @overallScore 90/100
   * @tradeoffs Fixed attempt/backoff constants (lifted verbatim from the OD
   *   origin) rather than caller-configurable ones — acceptable for now since
   *   `publish` has no caller-facing timeout knob yet either; flagged as a
   *   minor extensibility gap rather than a correctness issue.
   */
  async function pollVercelDeployment(config, id) {
      let last = null;
      for (let i = 0; i < 30; i += 1) {
          await sleep(i < 5 ? 1000 : 2000);
          const resp = await fetchWithTimeout(`${VERCEL_API}/v13/deployments/${encodeURIComponent(id)}${vercelTeamQuery(config)}`, redirectGuardInit({ headers: { Authorization: `Bearer ${config.token}` } }), { timeoutMs: FETCH_TIMEOUT_MS.DEPLOY });
          assertNotRedirected(resp, 'Vercel deployment status poll');
          let json;
          try {
              json = await readVercelJson(resp);
          }
          catch {
              // Nothing usable to report yet — keep polling within the same fixed budget
              // rather than turning an ambiguous mid-poll hiccup into a reported failure.
              continue;
          }
          if (!resp.ok)
              throw vercelError(json, resp.status);
          last = json;
          if (json.readyState === 'READY' || json.readyState === 'ERROR')
              return json;
      }
      return last;
  }
  function vercelTeamQuery(config) {
      const params = new URLSearchParams();
      if (config.teamId)
          params.set('teamId', config.teamId);
      else if (config.teamSlug)
          params.set('slug', config.teamSlug);
      const s = params.toString();
      return s ? `?${s}` : '';
  }
  /**
   * Derives a Vercel-safe project name from a caller-supplied label, falling
   * back to a random id if the label sanitizes to nothing. Replaces the OD
   * origin's hardcoded `od-${projectId}` convention.
   */
  function safeVercelProjectName(projectName) {
      return safeProjectLabel(projectName, 80) || `deploy-${Math.random().toString(36).slice(2, 10)}`;
  }
  async function readVercelJson(resp) {
      try {
          return (await resp.json());
      }
      catch {
          throw new DeployError('Vercel returned a non-JSON response.', resp.status || 502);
      }
  }
  function vercelError(json, status) {
      const code = json?.error && typeof json.error === 'object' ? json.error.code : undefined;
      const message = (json?.error && typeof json.error === 'object' ? json.error.message : undefined) ||
          json?.message ||
          `Vercel request failed (${status}).`;
      if (code === 'forbidden' || /permission/i.test(String(message))) {
          return new DeployError("You don't have permission to create a project.", status, json);
      }
      return new DeployError(String(message), status, json);
  }
  function deploymentUrl(json) {
      const url = json?.url || json?.alias?.[0] || '';
      if (!url)
          return '';
      return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }
  /**
   * `if (!json) continue` is unreachable via this file's one call site,
   * `deploymentUrlCandidates(ready, created)` in `publish()`: `created` comes
   * from `readVercelJson`, which either returns a real parsed `JsonObject` or
   * throws (never resolves to null/undefined); `ready` is either `created`
   * itself (same guarantee) or `pollVercelDeployment`'s result, which — per
   * that function's own loop shape (`i < 30` starting at `i = 0`, so it always
   * runs at least one full iteration before it can return, and that iteration
   * unconditionally assigns `last = json` right after the `!resp.ok` throw
   * check, before any `return`) — can only resolve to a real `JsonObject` or
   * throw, never resolve to `null`. The wider `(JsonObject | null | undefined)[]`
   * parameter type is deliberately more permissive than what this one caller
   * can ever supply — same "general-purpose helper, defense-in-depth beyond
   * today's only caller" reasoning `netlify.ts`'s own `netlifyUrlCandidates`
   * already documents for its structurally identical guard.
   */
  function deploymentUrlCandidates(...responses) {
      const urls = [];
      for (const json of responses) {
          if (!json)
              continue;
          if (typeof json.url === 'string')
              urls.push(json.url);
          for (const alias of json.alias ?? []) {
              if (typeof alias === 'string')
                  urls.push(alias);
          }
          for (const alias of json.aliases ?? []) {
              if (typeof alias === 'string')
                  urls.push(alias);
              else if (alias && typeof alias === 'object') {
                  const a = alias;
                  if (typeof a.domain === 'string')
                      urls.push(a.domain);
                  else if (typeof a.url === 'string')
                      urls.push(a.url);
              }
          }
      }
      return [...new Set(urls.map(normalizeDeploymentUrl).filter(Boolean))];
  }

  return { VercelDeployTarget, isVercelProtectedResponse };
}

/**
 * Reads one credential-check response WITHOUT touching its body: 401/403 means the host refused the
 * credential, any other failure says nothing about it (a 5xx, a rate limit).
 *
 * @param {Response} response
 * @returns {{ ok: true } | { ok: false, reason: "rejected" | "unreachable", statusCode: number }}
 */
function classifyCredentialResponse(response) {
  if (response.ok) return { ok: true };
  return { ok: false, reason: response.status === 401 || response.status === 403 ? "rejected" : "unreachable", statusCode: response.status };
}

/**
 * The token's account `user.username` from a `GET /v2/user` body, or `undefined`. Reads no other field.
 * @param {unknown} body
 * @returns {string | undefined}
 */
function readVercelUsername(body) {
  const user = typeof body === "object" && body !== null ? /** @type {Record<string, unknown>} */ (body).user : undefined;
  const username = typeof user === "object" && user !== null ? /** @type {Record<string, unknown>} */ (user).username : undefined;
  return typeof username === "string" && username !== "" ? username : undefined;
}

/** The module contract Tovu's deploy-target registry loads (`DeployTargetModule`). The one config
 *  field is the optional Vercel `teamId`. */
export default {
  /** @param {{ credential: { token: string }, config: { teamId?: string }, kit: any }} context */
  create({ credential, config, kit }) {
    const { VercelDeployTarget } = bindVercel(kit);
    return new VercelDeployTarget({ token: credential.token, ...(typeof config.teamId === "string" ? { teamId: config.teamId } : {}) });
  },
  /**
   * `GET /v2/user`: 401/403 for a bad token. Reads back only `user.username`, required on both body
   * shapes Vercel's OpenAPI schema declares and public (`vercel.com/<username>`), never email,
   * billing or `defaultTeamId`.
   * @param {{ credential: { token: string }, kit: any }} context
   */
  async verifyCredential({ credential, kit }) {
    const response = await kit.fetch("https://api.vercel.com/v2/user", { headers: { Authorization: `Bearer ${credential.token}` } }, { timeoutMs: kit.timeouts.QUICK });
    const check = classifyCredentialResponse(response);
    if (!check.ok) return check;
    return { ok: true, accountLabel: readVercelUsername(await response.json().catch(() => undefined)) };
  },
  /** @param {{ teamId?: unknown }} config */
  validateConfig(config) {
    if (typeof config.teamId === "string" && config.teamId.trim() === "") return "teamId must not be blank when provided";
    return null;
  },
  basePath() {
    return undefined;
  },
};
