/** @file The host collaborators `@jini-ai/cookie-consent/site/service` and `./site/region-plugins` require:
 * the local page path boundary, the deployment refusal envelope and the `[consent]` console lines. The
 * package passes plain messages; the host owns the console channel, the prefix and the redaction options,
 * so each log line stays byte-identical to the pre-extraction one. */
import { RESERVED_SEGMENTS } from "@jini-ai/cms/routing/site/reserved-paths";
import { resolveSitePath } from "@jini-ai/diagnostics/web-evidence/site-path-policy";
import { formatErrorForLog } from '@jini-ai/core';
import { TOVU_ERROR_REDACTION_OPTIONS } from '@tovu/contracts/secret-redaction';
import type { ConsentServicePorts } from '@jini-ai/cookie-consent/site/service';
import type { ConsentToolHost } from '@jini-ai/cookie-consent/site/tool-registrations';
import { approvalToolHandler } from '#src/contracts/core/human-confirm';
import { deploymentRefusal } from '#src/contracts/core/consent-refusal';
import { consentPagePath as pagePath, consentRevisionToken, readConsentRequest } from '@jini-ai/cookie-consent/site/request';

/** Use the existing local-render path boundary before allocating a loopback server. O(path length).
 * @example consentPagePath({ path: '/privacy' }) */
export function consentPagePath({ path }: { path: string }, _options = {}): string {
  return pagePath({ path, resolvePath: ({ raw }) => resolveSitePath({ raw, base: 'http://127.0.0.1', reservedSegments: RESERVED_SEGMENTS }) });
}

/** Warns about a degraded consent service path (render, verification, preview refresh) with a redacted cause.
 * @complexity O(message + stack length) for redaction. */
export function reportConsentFailure({ message, error }: { message: string; error: unknown }, _optional: Record<string, never> = {}): void {
  console.warn(`[consent] ${message}`, formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS));
}

/** Logs a plugin contribution load failure (region readers, browser bridges) with a redacted cause.
 * @complexity O(message + stack length) for redaction. */
export function reportConsentPluginFailure({ message, error }: { message: string; error: unknown }, _optional: Record<string, never> = {}): void {
  console.error(`[consent] ${message}`, formatErrorForLog({ error }, TOVU_ERROR_REDACTION_OPTIONS));
}

/** The host-owned service ports, spread into every `createSiteConsentService` binding. */
export const consentServiceHostPorts = {
  consentPagePath, deploymentRefusal, reportConsentFailure,
} satisfies Pick<ConsentServicePorts, 'consentPagePath' | 'deploymentRefusal' | 'reportConsentFailure'>;

/** The host-owned consent tool collaborators: the held-confirmation lifecycle and the closed request
 * contract the HTTP routes share, bound once where `contributeConsentTools` is registered. */
export const consentToolHost = {
  approvalToolHandler, readConsentRequest, consentRevisionToken,
} satisfies ConsentToolHost;
