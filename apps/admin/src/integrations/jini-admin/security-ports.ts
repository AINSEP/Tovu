/** Host bindings for Jini Security; authentication stays with mediaTransport. */
import { createHttpSecurityApi, createHttpOtherCredentials, createHttpRootKey, createHttpPublishCredentials, createHttpCustomCredentials, createHttpCredentialCopy } from '@jini-ai/admin/security/adapters/http';
import { securityMessagesEn, type SecurityApiPort, type OtherCredentialsPort, type RootKeyPort, type SecurityTransportPort, type SecurityRefreshSignal, type SecurityTranslator, type DescribeCredentialError } from '@jini-ai/admin/security';
import { hasPermission } from '@jini-ai/ui/panel-kit';
import { interpolate } from '@jini-ai/core/text';
import { contentRefreshApplies, publishContentRefresh, subscribeToContentRefresh } from '@jini-ai/admin/shell/lib/content-refresh-bus';
import { translateCredentialMessage } from '@tovu/contracts/credential-copy';
import { WORKSPACE_ID } from '@jini-ai/admin/shell/lib/admin-http/config';
import { describeApiError } from '../../lib/admin-http/request';
import { CONFIGURABLE_MEDIA_PROVIDER_CATALOG as MEDIA_PROVIDER_CATALOG } from "@jini-ai/integrations/media-providers/catalog";
import { tSecurity as translateSecurity } from "../../lib/i18n-common";
import { mediaTransport } from './media-ports';

export interface SecurityHostPorts { securityApi: SecurityApiPort; otherCredentials?: OtherCredentialsPort; rootKey?: RootKeyPort }

/** The content-refresh resource every credential screen publishes and listens to. */
const ACCESS_TOKENS_RESOURCE = 'access-tokens';
/** The site-key permission (`features/identity/site-key-permission.ts`); it unlocks Jini's root-key tab. */
const SITE_KEY_MANAGE_PERMISSION = 'admin.security.site-key.manage';
/** Write grants Jini reads under the same names the host session carries. */
const WRITE_GRANTS = ['system.publish', 'source-control.credentials.write', 'custom-credentials.write', 'admin.assistant.manage', 'admin.integrations.manage'] as const;

/** Bind the host workspace wire to the Jini adapters. The site key keeps its `/system/site-key`
 * route and `{ siteKey }` import body; media keys are written one provider row at a time.
 * @example createSecurityHostPorts({ transport: mediaTransport });
 */
export function createSecurityHostPorts({ transport }: { transport: SecurityTransportPort }, { workspaceId = WORKSPACE_ID }: { workspaceId?: string } = {}): SecurityHostPorts & { otherCredentials: OtherCredentialsPort; rootKey: RootKeyPort } {
  const workspacePath = `/workspaces/${workspaceId}`;
  const mediaLabels = Object.fromEntries(MEDIA_PROVIDER_CATALOG.map(provider => [provider.id, provider.label]));
  return {
    securityApi: createHttpSecurityApi({ transport, workspacePath }, { sharedKeys: true }),
    otherCredentials: createHttpOtherCredentials({ transport, workspacePath }, { mediaLabels, tokenHints: true }),
    rootKey: createHttpRootKey({ transport, workspacePath }, { path: '/system/site-key', importField: 'siteKey', reveal: true }),
  };
}

/** The live implementation, as a module-level singleton — matches seoHostPorts. */
export const securityHostPorts = createSecurityHostPorts({ transport: mediaTransport });

/** The host's credential client under its own 11 method names, so Deployment and lib call sites keep
 * their shape; composed from the shared Jini publish, custom and Shared Keys clients.
 * @example createSecurityClient({ transport: mediaTransport });
 */
export function createSecurityClient({ transport }: { transport: SecurityTransportPort }, { workspaceId = WORKSPACE_ID }: { workspaceId?: string } = {}) {
  const workspacePath = `/workspaces/${workspaceId}`;
  return { ...createHttpPublishCredentials({ transport, workspacePath }), ...createHttpCredentialCopy({ transport, workspacePath }), ...createHttpCustomCredentials({ transport, workspacePath }) };
}
export const securityApi = createSecurityClient({ transport: mediaTransport });

/** D6: expand session grants through the host permission owner. `security.read` is always granted, so
 * a signed-in operator sees Access Tokens while grants load; every other grant waits for readiness.
 * Server routes re-check every verb; this controls screen affordances only.
 * @example securitySessionGrants({ permissions: ['*'] }, { grantsReady: true });
 */
export function securitySessionGrants({ permissions }: { permissions: readonly string[] }, { grantsReady = true }: { grantsReady?: boolean } = {}): string[] {
  if (!grantsReady) return ['security.read'];
  const tokens = hasPermission({ permissions, permission: SITE_KEY_MANAGE_PERMISSION }) ? ['admin.security.tokens.manage'] : [];
  return ['security.read', ...tokens, ...WRITE_GRANTS.filter(permission => hasPermission({ permissions, permission }))];
}

/** Jini keys whose English differs from the host dictionary key (D7). Every other key is looked up by
 * its Jini English text, which the relocated dictionary already carries. */
const SECURITY_KEY_ALIASES: Readonly<Record<string, string>> = {
  security: 'Secrets', tabsLabel: 'Secrets', kicker: 'Operations', accessTokens: 'Access Tokens', rootKey: 'Site key',
  rootKeyHandleLabel: 'Switch to the site key tab',
  description: 'One place to see every access token this install holds, and create, rotate, or remove one without hunting across the screens that created it.',
};
const JINI_ENGLISH: Readonly<Record<string, string>> = securityMessagesEn;

/** Bind the relocated dictionary, the alias table and placeholder interpolation.
 * @returns A pure translator with the original English fallback for unknown keys/locales.
 * @example createSecurityTranslator({ locale: 'es' })('rootKey');
 */
export function createSecurityTranslator({ locale }: { locale: string }, _optional: Record<string, never> = {}): SecurityTranslator {
  return (key, vars = {}) => interpolate({ template: translateSecurity({ locale, key: SECURITY_KEY_ALIASES[key] ?? JINI_ENGLISH[key] ?? key }), vars });
}

/** The host's credential failure copy: the server's `ApiError` message, translated when it is a known
 * credential message. Jini cuts every submitted secret out of the returned text. */
export const describeSecurityError: DescribeCredentialError = ({ error }) => translateCredentialMessage({ message: describeApiError({ e: error, fallback: '' }) }) || undefined;

/** Reload both credential lists when another screen publishes an access-tokens refresh. */
export const securityRefreshSignal: SecurityRefreshSignal = {
  subscribe({ onRefresh }) {
    return subscribeToContentRefresh({ listener: scope => { if (contentRefreshApplies({ scope, resource: ACCESS_TOKENS_RESOURCE })) onRefresh(); } });
  },
};

/** Tell Deployment, Source Control and the other credential screens that a credential changed here. */
export function onSecurityCredentialsChanged(_required: Record<string, never> = {}, _optional: Record<string, never> = {}): void {
  publishContentRefresh({ resources: [ACCESS_TOKENS_RESOURCE] });
}
