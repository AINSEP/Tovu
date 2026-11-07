import { deploymentRefusal } from '#src/features/consent/service';
import type { StaticPublishToolDeps } from '../publish-tool-deps.js';

/** Consent remains a fail-closed check before publish approval and effects. */
export async function checkToolPublishConsent({ deps, principalId }: {
  deps: StaticPublishToolDeps; principalId: string;
}, _options = {}) {
  return deps.siteConsent
    ? await deps.siteConsent.deploymentCheck({ principalId, permission: 'deployments.publish' })
    : deploymentRefusal({ problems: [{ code: 'CONSENT_UNAVAILABLE', message: 'Cookie consent readiness is unavailable. No publish was started.' }] });
}
