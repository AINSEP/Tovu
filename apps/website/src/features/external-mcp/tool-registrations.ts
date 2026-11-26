import { buildExternalMcpRegistrations as buildWithPorts, externalMcpDerivedRisk } from '@jini-ai/mcp/external/tool-registrations';
import type { ExternalMcpToolDeps } from '@jini-ai/core/contracts/site/external-mcp-tool-ports';
import type { ChatDeleteSurfaceDeps } from '@jini-ai/core/contracts/site/daemon-surface-exchanges';
import type { ToolContributor } from '@jini-ai/core';
import { ToolInputError } from '@jini-ai/core';
import { ForbiddenError, requireToolPermission } from '@jini-ai/cms/core';
import { resolveOperatorLocale } from '@jini-ai/core/operator-locale';
import { issueCredentialSetup } from '#src/contracts/core/tool-failure-diagnostics';
import { assertCredentialFreeField } from '../../contracts/core/credential-token.js';
import { defineSecretCardTool } from '@jini-ai/ui/mcp-ui/secret-card';
import { credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage } from '@tovu/contracts/credential-copy';
import { approvalToolHandler } from '../../contracts/core/human-confirm.js';
import { askThenReport } from '@jini-ai/daemon/surface-exchanges';
import { listExternalMcpServerViews, readEnabledExternalMcpConfigs, saveExternalMcpServer } from './external-mcp-store.js';
import { notifyExternalMcpRosterChanged } from '../../assistant/mcp-services.js';
import { externalMcpAgentToolCatalog } from './external-mcp-host-copy.js';

/** Mirrors `oauth-callback-url.ts`'s own constant — restated, not imported. See this file's header
 *  ("no live HTTP request") for why. Both must keep naming the SAME path: `mcp-federation/registrations.ts`'s
 *  public callback route (`server/inbound/public-http/routes/external-mcp/oauth-callback.ts`) is the
 *  only thing listening on it. */
const EXTERNAL_MCP_OAUTH_CALLBACK_PATH = "/api/mcp-servers/oauth/callback";

/**
 * Resolves `TOVU_PUBLIC_URL` into an absolute origin, or `undefined` when it is unset or blank — the
 * identical local re-implementation `assistant/admin-screen-link-tool.ts`'s
 * `resolveConfiguredPublicOrigin` already uses for the same structural reason (see this file's
 * header). Duplicated rather than shared, matching this codebase's own "duplicate the tiny helper,
 * never share it across features/files" convention (that file's own header cites the precedent).
 *
 * Unlike that helper, a PRESENT-but-invalid value throws here rather than degrading to `undefined`:
 * a bad value there only costs a relative link, but here returning `undefined` for a malformed value
 * would make `resolveExternalMcpOAuthRedirectUri` silently fall back to the derived origin —
 * localhost in dev — handing the provider a callback the operator never configured. The operator
 * override must win whenever it is present, so its invalidity cannot be indistinguishable from its
 * absence. `platform/express/public-origin.ts`'s `resolvePublicOrigin` fails
 * the same way for the same reason.
 *
 * @throws {ToolInputError} `TOVU_PUBLIC_URL` is set but is not a valid `http(s)` URL — named so the
 *   misconfiguration reaches the operator instead of silently resolving to the wrong origin.
 * @complexity O(1).
 */
function resolveConfiguredPublicOrigin(): string | undefined {
  const configured = process.env.TOVU_PUBLIC_URL?.trim();
  if (!configured) return undefined;
  let url: URL | undefined;
  try {
    url = new URL(configured);
  } catch {
    url = undefined;
  }
  if (url === undefined) {
    throw new ToolInputError({ message: `TOVU_PUBLIC_URL must be an absolute http(s) URL, but "${configured}" is not a valid URL.` });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ToolInputError({ message: `TOVU_PUBLIC_URL must be an http(s) URL, got "${configured}".` });
  }
  return url.origin;
}

/**
 * Builds `external_mcp_oauth_connect`'s redirect URI for one server id, or `undefined` when NEITHER
 * an operator-configured origin nor a derived one is available.
 *
 * @param derivedPublicOrigin - `routeDeps.derivedPublicOrigin` — this process's own best-effort
 *   origin, read only when `TOVU_PUBLIC_URL` is unset. See this file's header ("2026-09-10") for why
 *   the precedence is one-directional: the operator override always wins when present.
 *
 * `undefined` rather than a throw when the derived origin is ALSO absent — see this file's header ("an
 * unset TOVU_PUBLIC_URL no longer blocks EVERY grant") for why `beginConnect`, not this function, is
 * what decides whether the caller's grant actually needs one. A PRESENT-but-invalid
 * `TOVU_PUBLIC_URL`, by contrast, throws (see {@link resolveConfiguredPublicOrigin}): it is never
 * masked by the derived origin.
 * @complexity O(1).
 */
function resolveExternalMcpOAuthRedirectUri({ serverId, derivedPublicOrigin }: { serverId: string; derivedPublicOrigin: string | undefined }, _optional = {}): string | undefined {
  const origin = resolveConfiguredPublicOrigin() ?? (derivedPublicOrigin || undefined);
  if (!origin) return undefined;
  return `${origin}${EXTERNAL_MCP_OAUTH_CALLBACK_PATH}/${encodeURIComponent(serverId)}`;
}


export function buildExternalMcpRegistrations(routeDeps: ExternalMcpToolDeps, surfaces: ChatDeleteSurfaceDeps) {
  return buildWithPorts({ ...routeDeps, catalog: externalMcpAgentToolCatalog, requireToolPermission, resolveOperatorLocale,
    assertCredentialFreeField, ForbiddenError, defineSecretCardTool, askThenReport, appName: 'tovu-external-mcp-save',
    secretCardOptions: { uriHost: 'tovu', frameSize: ['100%', '640px'], text: {
      noEmitter: 'external_mcp_save: this execution context has no interactive confirmation channel (no emitSurface), so a connection form cannot be shown here. Nothing was saved.',
      get saveFailure() { return credentialText({ id: 'storage', locale: 'en' }); },
    } },
    resolveExternalMcpOAuthRedirectUri, saveExternalMcpServer, listExternalMcpServerViews, readEnabledExternalMcpConfigs,
    notifyExternalMcpRosterChanged, credentialText, formatCredentialHint, formatCredentialHints, translateCredentialMessage,
    issueCredentialSetup, approvalToolHandler,
  }, surfaces);
}

export function contributeExternalMcpTools({ probe, knownToolNames }: { probe?: ({ deps, serverId }: { deps: ExternalMcpToolDeps; serverId: string }, optional?: Record<string, never>) => Promise<{ ok: boolean; body: Readonly<Record<string, unknown>> }>; knownToolNames?: ExternalMcpToolDeps['externalMcpKnownToolNames'] } = {}, _optional = {}): ToolContributor<ExternalMcpToolDeps, ChatDeleteSurfaceDeps> {
  return { domain: 'external-mcp', build: (deps, surfaces) => buildExternalMcpRegistrations({ ...deps,
    ...(knownToolNames ? { externalMcpKnownToolNames: knownToolNames } : {}),
    ...(probe ? { externalMcpProbe: ({ serverId }: { serverId: string }) => probe({ deps, serverId }) } : {}),
  }, surfaces), risk: externalMcpDerivedRisk };
}
