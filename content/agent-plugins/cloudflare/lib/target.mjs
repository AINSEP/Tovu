import { createHash } from 'node:crypto';
import { createApi, refusal, segment, PAGES_PROJECTS_PAGING } from './api.mjs';
import { prepareAssets } from './assets.mjs';
import { previewDomains, assertDomainApproval, applyDomains } from './domains.mjs';
import { normalizeDomain } from './zones.mjs';

/** Stable jini-<project> identity, retained for Pages; an explicitly recorded remote name wins. */
/**
   * Derives a stable, Cloudflare-Pages-safe project name from the caller's
   * `projectName` label. Deterministic (no random suffix) so repeated
   * publishes of the same logical site land on the same Cloudflare Pages
   * project — replaces the OD origin's `od-${projectId}-${hash}` convention,
   * which relied on an OD project id this package has no concept of.
   */
export function resourceName({ projectName, config, kit }, _options = {}) {
  if (config.resourceName) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(config.resourceName)) throw refusal({ kit, code: 'CLOUDFLARE_RESOURCE_NAME', message: 'The remote resource name is invalid. Use the exact existing Cloudflare project/script name.' });
    return config.resourceName;
  }
  const label = kit.safeDnsLabel(projectName) || 'site';
  return kit.safeDnsLabel(`jini-${label}`).slice(0, 63);
}

/** Read-only resource and domain inspection through the plugin-owned API. */
export async function previewTarget({ credential, config, kit, projectName, targetId }, _options = {}) {
  const api = createApi({ credential, kit });
  const name = resourceName({ projectName, config, kit });
  const domain = config.customDomain ? normalizeDomain({ domain: config.customDomain, kit }) : undefined;
  try { return await inspectTarget({ api, config, kit, targetId, name, domain }); }
  catch (error) {
    if (!domain) throw error;
    return { resourceName: name, targetId, hostingChanges: [], domains: { inventoryStatus: 'unknown', changes: [],
      errorCode: 'CLOUDFLARE_INVENTORY_UNKNOWN', hostnames: [domain, `www.${domain}`].map(hostname => ({ hostname, status: 'unknown' })),
      message: `Cannot safely inspect ${domain}. ${error.message} Complete the named read permission or setup step, then preview again.` } };
  }
}

async function inspectTarget({ api, config, kit, targetId, name, domain }, _options = {}) {
  const path = targetId === 'cloudflare-workers' ? `${api.accountPath}/workers/scripts` : `${api.accountPath}/pages/projects`;
  const resources = await api.list({ path }, targetId === 'cloudflare-workers' ? {} : PAGES_PROJECTS_PAGING);
  // Workers scripts are identified by `id`, Pages projects by `name`.
  const existing = resources.find(resource => resource.id === name || resource.name === name);
  const hostingChanges = [{ action: existing ? 'update' : 'create', targetId, resourceName: name }];
  if (targetId === 'cloudflare-workers') {
    await workersAddress({ api, kit, resourceName: name });
    hostingChanges.push({ action: 'enable-workers-dev', targetId, resourceName: name });
  }
  const domains = domain ? await previewDomains({ api, kit, targetId, resourceName: name, domain, zoneId: config.zoneId }) : undefined;
  return { resourceName: name, targetId, hostingChanges, ...(domains ? { domains } : {}) };
}

/** Read workers.dev from Cloudflare. Never manufacture an account subdomain or register one. */
export async function workersAddress({ api, kit, resourceName }, _options = {}) {
  const result = await api.request({ path: `${api.accountPath}/workers/subdomain` }, { allowMissing: true });
  if (typeof result?.subdomain !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(result.subdomain)) throw refusal({ kit, code: 'CLOUDFLARE_SUBDOMAIN_REQUIRED', message: `Worker ${resourceName} needs this account's workers.dev subdomain. Open Workers & Pages in the Cloudflare dashboard, set it up, then preview again.` });
  return `https://${resourceName}.${result.subdomain}.workers.dev`;
}

/** One lifecycle shared by both hosting variants. The transport-specific uploader is injected.
 * Consent/stale checks precede ALL remote writes, including provisioning and upload sessions. */
export function createTarget({ credential, config, kit, targetId, upload }, _options = {}) {
  const api = createApi({ credential, kit });
  return {
    id: targetId,
    async publish(input, options = {}) {
      const merged = { ...input, ...options };
      const name = resourceName({ projectName: input.projectName, config, kit });
      const requestedDomain = config.customDomain ?? merged.metadata?.customDomain;
      const domainInput = { api, kit, targetId, resourceName: name, domain: requestedDomain, zoneId: config.zoneId, approval: merged.metadata?.domainApproval };
      const plan = requestedDomain ? await assertDomainApproval(domainInput) : undefined;
      const prepared = preparePublish({ input: merged, kit, config, plan, targetId });
      const hosting = await upload({ api, kit, resourceName: name, prepared: prepared.assets });
      const link = await kit.waitForReachableDeploymentUrl([hosting.url], { providerLabel: targetId });
      const hostnames = plan ? await applyDomains({ api, kit, plan, proof: prepared.proof }) : [];
      const complete = hostnames.every(hostname => hostname.status === 'ready' && !hostname.operationFailed);
      return { targetId, url: hosting.url, deploymentId: hosting.deploymentId, status: complete ? link.status : 'link-delayed',
        statusMessage: complete ? link.statusMessage : `Hosting is ${link.status}; custom domains are unfinished. ${hostnames.filter(host => host.status !== 'ready' || host.operationFailed).map(host => host.message).join(' ')}`,
        providerMetadata: { resourceName: name, projectName: name, accountId: api.accountId, hosting: { ...link, url: hosting.url }, hostnames, ...(plan ? { domainChanges: plan.changes, zoneId: plan.zone.id } : {}) } };
    },
    checkReachability: url => kit.checkDeploymentUrl(url),
  };
}

function preparePublish({ input, kit, config, plan, targetId }, _options = {}) {
  const maxFiles = targetId === 'cloudflare-workers' && config.assetPlan === 'paid' ? 100_000 : 20_000;
  const assets = prepareAssets({ files: input.files, responseHeaders: input.responseHeaders, kit }, { maxFiles });
  if (!plan) return { assets };
  const expected = createHash('sha256').update(JSON.stringify({ manifest: assets.manifest, config: assets.config })).digest('hex');
  const path = `/.well-known/tovu-deployment-${expected}.txt`;
  const proofFile = { file: path.slice(1), data: expected, contentType: 'text/plain' };
  return { assets: prepareAssets({ files: [...input.files, proofFile], responseHeaders: input.responseHeaders, kit }, { maxFiles }), proof: { path, expected } };
}

/** Verify token active status only; this does not authorize publishing, DNS or domain inventory.
 * `GET /user/tokens/verify` is Cloudflare's own check for a scoped API token (a broader `/user` read
 * can need account scopes a Pages-only token lacks, misreporting a good token as rejected). It
 * returns no account identity, so nothing is read back. */
export async function verifyCredential({ credential, kit }, _options = {}) {
  const resp = await kit.fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', { headers: { Authorization: `Bearer ${credential.token}` }, redirect: 'error' }, { timeoutMs: kit.timeouts.QUICK });
  if (!resp.ok) return { ok: false, reason: resp.status === 401 || resp.status === 403 ? 'rejected' : 'unreachable', statusCode: resp.status };
  const json = await resp.json();
  if (json.success === false || json.result?.status !== 'active') return { ok: false, reason: 'rejected', statusCode: resp.status };
  return { ok: true };
}

export function validateConfig(config, _options = {}) {
  if (config.assetPlan && !['free', 'paid'].includes(config.assetPlan)) return 'assetPlan must be free or paid. Select the actual Workers account plan.';
  return null;
}
