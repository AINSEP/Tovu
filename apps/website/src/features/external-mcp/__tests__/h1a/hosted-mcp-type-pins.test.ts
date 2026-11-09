/**
 * EXTRACT-S5 H1a public type pins. The `Pinned*` shapes below are the c3801c833 Tovu declarations
 * (contracts.ts e2f1d908, external-mcp-access.ts 4f6fc1ba, external-mcp-auth.ts 6418431c) restated
 * without comments. Each pin must be identical to (a) the canonical core type and (b) the Tovu
 * compatibility alias: same keys, and assignable both ways. Enforced by `npm run typecheck:tests`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import type { ISODateTime, UUID } from "@jini-ai/core/primitives";
import type { SealedSecret } from "@jini-ai/core/contracts/vault";
import type * as Core from "@jini-ai/core/contracts/hosted-mcp";
import type * as Signin from "@jini-ai/integrations/api-connections/hosted-mcp";
import type * as T from "../../contracts.js";
import type * as TAccess from "../../../../contracts/core/external-mcp-access.js";
import type * as TAuth from "../../../../contracts/core/external-mcp-auth.js";
import type { CredentialTokenHint } from "../../../../contracts/core/credential-token.js";
import type { SharedExternalMcpOwner } from "../../external-mcp-shared-oauth.js";
import { SUPPORTED_EXTERNAL_MCP_TRANSPORTS, EXTERNAL_MCP_OAUTH_GRANTS, EXTERNAL_MCP_AUTH_MODES, EXTERNAL_MCP_OAUTH_STATUSES } from "@jini-ai/mcp/federation/hosted";

type Equal<A, B> = (<X>() => X extends A ? 1 : 2) extends (<X>() => X extends B ? 1 : 2) ? true : false;
type TwoWay<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Pin<A, B> = Equal<A, B> extends true ? (Equal<keyof A, keyof B> extends true ? TwoWay<A, B> : false) : false;
const pinned = <A, B>(ok: Pin<A, B>): Pin<A, B> => ok;

interface PinnedRecord {
  workspaceId: UUID; serverId: string; label: string | null; provisionedByPluginId: string | null; transport: string; authMode: string;
  enabled: boolean; command: string | null; url: string | null; args: string | null; allowedToolNames: string | null;
  writeAllowedToolNames: string | null; writeGrantsUpdatedByPrincipalId: string | null; writeGrantsUpdatedAt: ISODateTime | null;
  envNames: string | null; sealedEnv: SealedSecret | null; oauthProviderId: string | null; oauthGrant: string | null;
  oauthClientId: string | null; oauthEndpointsJson: string | null; oauthScopesJson: string | null; oauthStatus: string | null;
  oauthExpiresAt: ISODateTime | null; oauthTokenEnvName: string | null; oauthRefreshLeaseUntil: ISODateTime | null;
  sealedOAuth: SealedSecret | null; aadVersion: number; oauthAadVersion: number; createdAt: ISODateTime; updatedAt: ISODateTime;
}
interface PinnedSnapshot {
  readonly admissionRevision: string; readonly enabled: boolean; readonly allowedToolNames: string | null; readonly writeAllowedToolNames: string | null;
  readonly writeGrantsUpdatedByPrincipalId: string | null; readonly writeGrantsUpdatedAt: ISODateTime | null; readonly provisionedByPluginId: string | null;
}
interface PinnedApprovedAccess {
  readonly workspaceId: string; readonly serverId: string; readonly expected: PinnedSnapshot;
  readonly access: { readonly enabled: boolean; readonly allowedToolNames: readonly string[]; readonly writeAllowedToolNames: readonly string[] }; readonly principalId: string;
}
interface PinnedAccessUpdate {
  readonly workspaceId: UUID; readonly serverId: string; readonly expected: PinnedSnapshot;
  readonly access: { readonly enabled: boolean; readonly allowedToolNames: string; readonly writeAllowedToolNames: string }; readonly principalId: string; readonly nowIso: ISODateTime;
}
interface PinnedSaveOAuth { providerId?: string; grant?: string; clientId?: string; clientSecret?: string; scopes?: string; tokenEnvName?: string; authorizationEndpoint?: string; tokenEndpoint?: string; deviceAuthorizationEndpoint?: string }
interface PinnedSave {
  workspaceId: UUID; serverId: string; label?: string; transport: string; authMode?: string; enabled: boolean; command: string; url?: string; args: string;
  allowedToolNames: string; writeAllowedToolNames: string; env?: string; accessToken?: string; accessTokenEnvName?: string; oauth?: PinnedSaveOAuth;
  provisionedByPluginId?: string; principalId: string;
}
interface PinnedOAuthView { providerId: string | null; grant: string | null; clientId: string | null; scopes: string[]; status: "disconnected" | "pending" | "connected" | "needs_reauth"; expiresAt: ISODateTime | null; tokenEnvName: string | null; hasStoredToken: boolean }
interface PinnedView {
  serverId: string; label: string; provisionedByPluginId: string | null; transport: string; authMode: string; enabled: boolean; command: string; url: string | null;
  args: string[]; allowedToolNames: string[]; writeAllowedToolNames: string[]; writeGrantsUpdatedByPrincipalId: string | null; writeGrantsUpdatedAt: ISODateTime | null;
  envNames: string[]; hasAccessToken: boolean; accessTokenHint?: CredentialTokenHint | null; envTokenHints?: Readonly<Record<string, CredentialTokenHint>>;
  accessTokenEnvName: string | null; oauth: PinnedOAuthView;
}
type PinnedBearer = (request: { readonly url: string }, options?: { readonly signal?: AbortSignal | undefined }) => string | undefined | Promise<string | undefined>;
type PinnedTarget =
  | { readonly kind: "stdio"; readonly command: string; readonly args: string[]; readonly env: Record<string, string> }
  | { readonly kind: "streamable_http"; readonly url: string; readonly headers: Record<string, string>; readonly bearerToken?: PinnedBearer };
interface PinnedConfig {
  provisionedByPluginId?: string; serverId: string; label: string; transport: "stdio" | "streamable_http"; authMode: "none" | "static_env" | "oauth"; enabled: boolean;
  allowedToolNames: string[]; writeAllowedToolNames: string[]; target: PinnedTarget; admissionRevision: string;
}
interface PinnedSealedPayload {
  readonly staticAccessToken?: string; readonly clientSecret?: string;
  readonly tokens?: { readonly accessToken: string; readonly refreshToken: string | null; readonly tokenType: string; readonly scopes: readonly string[]; readonly expiresAt: ISODateTime | null };
}
interface PinnedSealedOAuth { readonly sealedOAuth: SealedSecret | null; readonly oauthAadVersion: number }
type PinnedConnectStart =
  | { readonly kind: "redirect_required"; readonly authorizationUrl: string; readonly expiresAt: string }
  | { readonly kind: "device_code"; readonly userCode: string; readonly verificationUri: string; readonly verificationUriComplete: string | null; readonly expiresAt: ISODateTime; readonly intervalSeconds: number };
type PinnedReason = "removed" | "turned-off" | "disconnected" | "changed" | "tool-not-allowed" | "write-not-allowed" | "unverifiable";
type PinnedRepoKeys = "listByWorkspaceId" | "findByServerId" | "upsert" | "updateAccessIfCurrent" | "deleteByServerId" | "tryClaimOAuthRefreshLease" | "releaseOAuthRefreshLease";
type PinnedServiceKeys = "beginConnect" | "completeAuthorizationCallback" | "pollDeviceAuthorization" | "disconnect" | "reportAuthFailure" | "tokenResolver" | "listSharedConnections" | "assertSharedAuthorized" | "useLocalConnection" | "useSharedConnection";
type PinnedDepsKeys = "shared" | "workspaceId" | "repo" | "sealer" | "keyring" | "clock" | "devices" | "httpPorts" | "providers" | "lookupProvider" | "onConnected";

test("canonical core record and the Tovu aliases equal the c3801c833 pins (keys + both assignability directions)", () => {
  const checks: true[] = [
    pinned<PinnedRecord, Core.ExternalMcpServerRecord>(true), pinned<PinnedRecord, T.ExternalMcpServerRecord>(true),
    pinned<PinnedSnapshot, Core.ExternalMcpAccessSnapshot>(true), pinned<PinnedSnapshot, TAccess.ExternalMcpAccessSnapshot>(true), pinned<PinnedSnapshot, T.ExternalMcpAccessSnapshot>(true),
    pinned<PinnedApprovedAccess, Core.ExternalMcpApprovedAccess>(true), pinned<PinnedApprovedAccess, TAccess.ExternalMcpApprovedAccess>(true),
    pinned<PinnedAccessUpdate, Core.ExternalMcpAccessUpdate>(true), pinned<PinnedAccessUpdate, T.ExternalMcpAccessUpdate>(true),
    pinned<PinnedSaveOAuth, T.SaveExternalMcpOAuthInput>(true), pinned<PinnedSave, Core.SaveExternalMcpServerInput>(true), pinned<PinnedSave, T.SaveExternalMcpServerInput>(true),
    pinned<PinnedOAuthView, T.ExternalMcpOAuthView>(true), pinned<PinnedView, T.ExternalMcpServerView>(true), pinned<PinnedView, Core.ExternalMcpServerView<CredentialTokenHint>>(true),
    pinned<PinnedBearer, Core.McpBearerTokenSupplier>(true), pinned<PinnedBearer, import("@jini-ai/mcp/federation").McpBearerTokenSupplier>(true),
    pinned<PinnedTarget, T.ExternalMcpServerTarget>(true), pinned<PinnedConfig, T.ExternalMcpServerConfig>(true),
    pinned<PinnedSealedPayload, T.ExternalMcpSealedOAuthPayload>(true), pinned<PinnedSealedOAuth, T.SealedExternalMcpOAuth>(true),
    pinned<PinnedConnectStart, T.ExternalMcpConnectStart>(true), pinned<PinnedReason, T.ExternalMcpRevocationReason>(true),
    pinned<"stdio" | "streamable_http", T.ExternalMcpTransport>(true), pinned<(typeof SUPPORTED_EXTERNAL_MCP_TRANSPORTS)[number], Core.ExternalMcpTransport>(true),
    pinned<"authorization_code" | "device_code", T.ExternalMcpOAuthGrant>(true), pinned<(typeof EXTERNAL_MCP_OAUTH_GRANTS)[number], Core.ExternalMcpOAuthGrant>(true),
    pinned<"none" | "static_env" | "oauth", TAuth.ExternalMcpAuthMode>(true), pinned<(typeof EXTERNAL_MCP_AUTH_MODES)[number], Core.ExternalMcpAuthMode>(true),
    pinned<PinnedOAuthView["status"], TAuth.ExternalMcpOAuthStatus>(true), pinned<(typeof EXTERNAL_MCP_OAUTH_STATUSES)[number], Core.ExternalMcpOAuthStatus>(true),
    pinned<PinnedRepoKeys, keyof T.ExternalMcpServerRepoPort>(true), pinned<T.ExternalMcpServerRepoPort, Core.ExternalMcpServerRepoPort>(true),
    pinned<PinnedServiceKeys, keyof T.ExternalMcpOAuthService>(true), pinned<T.ExternalMcpOAuthService, Signin.ExternalMcpOAuthService>(true),
    pinned<PinnedDepsKeys, keyof T.ExternalMcpOAuthDeps>(true), pinned<T.ExternalMcpOAuthDeps, Signin.ExternalMcpOAuthDeps<SharedExternalMcpOwner>>(true),
    pinned<T.DeviceAuthorizationStore, Signin.DeviceAuthorizationStore>(true), pinned<"put" | "get" | "delete", keyof T.DeviceAuthorizationStore>(true),
  ];
  assert.equal(checks.length, 39);
  assert.ok(checks.every(Boolean));
});

test("a second host binds its own token-hint and shared-owner shapes without Tovu types", () => {
  interface SecondHostHint { readonly fingerprint: string }
  interface SecondHostShared { readonly tenant: string }
  const checks: true[] = [
    pinned<Core.ExternalMcpServerView<SecondHostHint>["accessTokenHint"], SecondHostHint | null | undefined>(true),
    pinned<Core.ExternalMcpServerView["accessTokenHint"], null | undefined>(true),
    pinned<Signin.ExternalMcpOAuthDeps<SecondHostShared>["shared"], SecondHostShared | undefined>(true),
    pinned<Omit<Signin.ExternalMcpOAuthDeps<SecondHostShared>, "shared">, Omit<T.ExternalMcpOAuthDeps, "shared">>(true),
  ];
  assert.ok(checks.every(Boolean));
});
