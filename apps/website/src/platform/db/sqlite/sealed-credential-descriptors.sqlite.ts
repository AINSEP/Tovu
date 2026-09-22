import type { UUID } from "@jini-ai/cms/core";

import { buildExecutionCredentialAad } from "#src/assistant/execution-credential-aad";
import { buildExternalMcpEnvAad, buildExternalMcpOAuthAad, EXTERNAL_MCP_AAD_VERSION } from "#src/assistant/external-mcp-aad";
import { buildSiteAssistantCredentialAad } from "#src/assistant/site-credential-aad";
import { buildCustomCredentialAad } from "#src/features/custom-credentials/aad";
import { buildPublishCredentialAad, type PublishProviderId } from "#src/features/deployments/publish-credentials/index";
import { buildMediaProviderCredentialAad } from "#src/features/media/aad";
import { buildPublishContentPeerAad, PUBLISH_CONTENT_PEER_AAD_VERSION } from "#src/features/publish-content/peer-aad";
import { buildSourceControlCredentialAad } from "#src/features/source-control/aad";
import type { SourceControlProviderId } from "#src/features/source-control/types";
import { buildVendorCredentialAad } from "#src/features/vendor-credentials/aad";
import type { VendorId } from "#src/features/vendor-credentials/types";
import { buildComposioConfigAad } from "#src/platform/connectors/composio-config-aad";
import { buildConnectorCredentialAad } from "#src/platform/connectors/connector-credential-aad";
import { deviceAad } from "./oauth-pending-store.sqlite.js";
import type { SealedColumnDescriptor, SealedRowAadSelection, SealedRowIdentity } from "./sealed-credential-inventory.sqlite.js";

/**
 * @file One {@link SealedColumnDescriptor} per sealed column the app knows how to open — the per-store
 * half of `sealed-credential-inventory.sqlite.ts`.
 *
 * Each descriptor mirrors its store's own open path exactly: the same AAD builder (imported, never
 * restated) and the same `aad_version` branch, with one deliberate difference — a version the store
 * does not know yields `unrecognized-aad-version` (`"unknown"`), where some stores would still try
 * the current builder (`external-mcp-store.ts` uses `>=`). An open with a guessed AAD that fails would
 * read as `false`; the inventory must never claim a row is dead because it guessed.
 *
 * This list is NOT what makes the inventory complete — discovery reads the database catalog, and a
 * sealed column missing from here still shows up, as `no-descriptor`. The companion test fails when
 * a sealed column in a freshly migrated `content.db` has no descriptor here, so a new sealed table is
 * caught in CI as well as at runtime.
 *
 * ## Identity columns are non-secret by review
 * Selected: ids, workspace/principal ids, provider/vendor/connector/server ids, operator-chosen
 * labels, created-at stamps, and AAD version integers. Never selected: any `*_sealed_*` column (the
 * engine refuses those), `masked`, `key_tail`, `token_tail` (each is a fragment of the plaintext),
 * `base_url`/`url`/`command`/`args` (may embed credentials), `username`, `account_label` (personal
 * data a support transcript does not need), OAuth `state` (itself a bearer credential — so
 * `oauth_pending_authorizations` rows carry `rowId: null`), and device `user_code`/`verification_uri_complete`.
 */

const LEGACY_AAD_VERSION = 0;
const STORE_AAD_VERSION = 1;

/** A required text identity value; throws (caught by the engine as `descriptor-error`) otherwise. */
function text(row: SealedRowIdentity, column: string): string {
  const value = row[column];
  if (typeof value !== "string" || value.length === 0) throw new Error(`expected text in ${column}`);
  return value;
}

/** The `aad_version`-branched selection every retrofitted store uses: 0 = no AAD, current = the store's builder. */
function versionedAad(version: unknown, currentVersion: number, build: () => string): SealedRowAadSelection {
  if (version === LEGACY_AAD_VERSION) return { kind: "aad", aad: undefined };
  if (version === currentVersion) return { kind: "aad", aad: build() };
  return { kind: "unrecognized-aad-version" };
}

function workspaceOf(row: SealedRowIdentity): string {
  return text(row, "workspace_id");
}

const siteAssistantCredentials: SealedColumnDescriptor = {
  table: "site_assistant_credentials",
  column: "sealed_ciphertext",
  identityColumns: ["workspace_id", "provider", "aad_version"],
  workspaceId: workspaceOf,
  rowId: workspaceOf,
  label: (row) => `Site assistant API key (${text(row, "provider")})`,
  aadFor: (row) =>
    versionedAad(row.aad_version, STORE_AAD_VERSION, () => buildSiteAssistantCredentialAad({ workspaceId: workspaceOf(row) as UUID })),
};

const adminExecutionCredentials: SealedColumnDescriptor = {
  table: "admin_execution_credentials",
  column: "sealed_ciphertext",
  identityColumns: ["workspace_id", "principal_id", "protocol", "provider_id", "aad_version"],
  workspaceId: workspaceOf,
  rowId: (row) => `${workspaceOf(row)}:${text(row, "principal_id")}`,
  label: (row) => `Personal assistant API key for ${text(row, "principal_id")} (${typeof row.provider_id === "string" ? row.provider_id : text(row, "protocol")})`,
  aadFor: (row) =>
    versionedAad(row.aad_version, STORE_AAD_VERSION, () =>
      buildExecutionCredentialAad({ workspaceId: workspaceOf(row) as UUID, principalId: text(row, "principal_id") as UUID })
    ),
};

const publishCredentialSets: SealedColumnDescriptor = {
  table: "publish_credential_sets",
  column: "sealed_ciphertext",
  identityColumns: ["id", "workspace_id", "provider_id", "label"],
  workspaceId: workspaceOf,
  rowId: (row) => text(row, "id"),
  label: (row) => `Publish credentials "${text(row, "label")}" (${text(row, "provider_id")})`,
  aadFor: (row) => ({
    kind: "aad",
    aad: buildPublishCredentialAad({
      workspaceId: workspaceOf(row) as UUID,
      providerId: text(row, "provider_id") as PublishProviderId,
      id: text(row, "id") as UUID,
    }),
  }),
};

/**
 * `publish_content_peers` — added by migration `0066_shocking_psynapse` (the publish-content
 * feature, `feat(db): ...` two days after this inventory's own 13-descriptor introduction,
 * `feat(root-key): add a read-only sealed-credential inventory`), and never registered here. Unlike
 * every store above, this table was born with AAD from day one (every write stamps
 * `PUBLISH_CONTENT_PEER_AAD_VERSION`, per `peer-aad.ts`) — there is no
 * `aad_version = 0` "legacy, no AAD" era to special-case, so this passes the row's own
 * `aad_version` of 1 to {@link buildPublishContentPeerAad} (as `peers.ts`'s `resolvePeerCredential`
 * does), rather than routing through {@link versionedAad} — whose 0 means "no AAD", untrue here.
 */
const publishContentPeers: SealedColumnDescriptor = {
  table: "publish_content_peers",
  column: "sealed_ciphertext",
  identityColumns: ["id", "workspace_id", "label", "aad_version"],
  workspaceId: workspaceOf,
  rowId: (row) => text(row, "id"),
  label: (row) => `Publish-content peer "${text(row, "label")}"`,
  // Only the version this build knows (v1) is opened; any other stored value (the schema's `DEFAULT 0`,
  // a future v2) is `unrecognized-aad-version` rather than a guessed AAD reported as "does not open".
  aadFor: (row) =>
    row.aad_version === PUBLISH_CONTENT_PEER_AAD_VERSION
      ? {
          kind: "aad",
          aad: buildPublishContentPeerAad({
            workspaceId: workspaceOf(row) as UUID,
            id: text(row, "id") as UUID,
            aadVersion: PUBLISH_CONTENT_PEER_AAD_VERSION,
          }),
        }
      : { kind: "unrecognized-aad-version" },
};

const sourceControlCredentialSets: SealedColumnDescriptor = {
  table: "source_control_credential_sets",
  column: "sealed_ciphertext",
  identityColumns: ["id", "workspace_id", "provider_id", "label"],
  workspaceId: workspaceOf,
  rowId: (row) => text(row, "id"),
  label: (row) => `Source control credentials "${text(row, "label")}" (${text(row, "provider_id")})`,
  aadFor: (row) => ({
    kind: "aad",
    aad: buildSourceControlCredentialAad({
      workspaceId: workspaceOf(row) as UUID,
      providerId: text(row, "provider_id") as SourceControlProviderId,
      id: text(row, "id") as UUID,
    }),
  }),
};

const customCredentialSets: SealedColumnDescriptor = {
  table: "custom_credential_sets",
  column: "sealed_ciphertext",
  identityColumns: ["id", "workspace_id", "label", "category"],
  workspaceId: workspaceOf,
  rowId: (row) => text(row, "id"),
  label: (row) => `Custom credential "${text(row, "label")}" (${text(row, "category")})`,
  aadFor: (row) => ({ kind: "aad", aad: buildCustomCredentialAad({ workspaceId: workspaceOf(row) as UUID, id: text(row, "id") as UUID }) }),
};

const vendorCredentialSets: SealedColumnDescriptor = {
  table: "vendor_credential_sets",
  column: "sealed_ciphertext",
  identityColumns: ["id", "workspace_id", "vendor_id", "label"],
  workspaceId: workspaceOf,
  rowId: (row) => text(row, "id"),
  label: (row) => `Vendor credentials "${text(row, "label")}" (${text(row, "vendor_id")})`,
  aadFor: (row) => ({
    kind: "aad",
    aad: buildVendorCredentialAad({ workspaceId: workspaceOf(row) as UUID, vendorId: text(row, "vendor_id") as VendorId, id: text(row, "id") as UUID }),
  }),
};

const mediaProviderCredentials: SealedColumnDescriptor = {
  table: "media_provider_credentials",
  column: "sealed_ciphertext",
  identityColumns: ["workspace_id", "provider_id", "aad_version"],
  workspaceId: workspaceOf,
  rowId: (row) => `${workspaceOf(row)}:${text(row, "provider_id")}`,
  label: (row) => `Media provider API key (${text(row, "provider_id")})`,
  aadFor: (row) =>
    versionedAad(row.aad_version, STORE_AAD_VERSION, () =>
      buildMediaProviderCredentialAad({ workspaceId: workspaceOf(row) as UUID, providerId: text(row, "provider_id") })
    ),
};

const composioConfig: SealedColumnDescriptor = {
  table: "composio_config",
  column: "sealed_ciphertext",
  identityColumns: ["workspace_id", "aad_version"],
  workspaceId: workspaceOf,
  rowId: workspaceOf,
  label: () => "Composio project API key",
  aadFor: (row) => versionedAad(row.aad_version, STORE_AAD_VERSION, () => buildComposioConfigAad({ workspaceId: workspaceOf(row) as UUID })),
};

const externalMcpServerEnv: SealedColumnDescriptor = {
  table: "external_mcp_servers",
  column: "sealed_ciphertext",
  identityColumns: ["workspace_id", "server_id", "aad_version"],
  workspaceId: workspaceOf,
  rowId: (row) => `${workspaceOf(row)}:${text(row, "server_id")}`,
  label: (row) => `MCP server "${text(row, "server_id")}" environment`,
  aadFor: (row) =>
    versionedAad(row.aad_version, EXTERNAL_MCP_AAD_VERSION, () =>
      buildExternalMcpEnvAad({ workspaceId: workspaceOf(row), serverId: text(row, "server_id") })
    ),
};

const externalMcpServerOAuth: SealedColumnDescriptor = {
  table: "external_mcp_servers",
  column: "oauth_sealed_ciphertext",
  identityColumns: ["workspace_id", "server_id", "oauth_aad_version"],
  workspaceId: workspaceOf,
  rowId: (row) => `${workspaceOf(row)}:${text(row, "server_id")}`,
  label: (row) => `MCP server "${text(row, "server_id")}" OAuth credentials`,
  aadFor: (row) =>
    versionedAad(row.oauth_aad_version, EXTERNAL_MCP_AAD_VERSION, () =>
      buildExternalMcpOAuthAad({ workspaceId: workspaceOf(row), serverId: text(row, "server_id") })
    ),
};

/** `rowId` is `null`: this table's primary key (`state`) authenticates the public OAuth callback. */
const oauthPendingAuthorizations: SealedColumnDescriptor = {
  table: "oauth_pending_authorizations",
  column: "sealed_ciphertext",
  identityColumns: ["owner_key", "provider_id", "created_at"],
  workspaceId: () => null,
  rowId: () => null,
  label: (row) => `Pending OAuth sign-in for ${text(row, "owner_key")} (${text(row, "provider_id")}), started ${text(row, "created_at")}`,
  // The store opens with `aad: row.ownerKey` — the stored owner binding IS the AAD.
  aadFor: (row) => ({ kind: "aad", aad: text(row, "owner_key") }),
};

const oauthDeviceAuthorizations: SealedColumnDescriptor = {
  table: "oauth_device_authorizations",
  column: "sealed_ciphertext",
  identityColumns: ["workspace_id", "server_id", "created_at"],
  workspaceId: workspaceOf,
  rowId: (row) => `${workspaceOf(row)}:${text(row, "server_id")}`,
  label: (row) => `Pending device sign-in for MCP server "${text(row, "server_id")}", started ${text(row, "created_at")}`,
  aadFor: (row) => ({ kind: "aad", aad: deviceAad(workspaceOf(row) as UUID, text(row, "server_id")) }),
};

const composioConnectorCredentials: SealedColumnDescriptor = {
  table: "composio_connector_credentials",
  column: "sealed_ciphertext",
  identityColumns: ["workspace_id", "connector_id", "aad_version"],
  workspaceId: workspaceOf,
  rowId: (row) => `${workspaceOf(row)}:${text(row, "connector_id")}`,
  label: (row) => `Connected account (${text(row, "connector_id")})`,
  aadFor: (row) =>
    versionedAad(row.aad_version, STORE_AAD_VERSION, () =>
      buildConnectorCredentialAad({ workspaceId: workspaceOf(row) as UUID, connectorId: text(row, "connector_id") })
    ),
};

/** Every sealed column the app can open today, in `schema.sqlite.ts` order. */
export const SEALED_COLUMN_DESCRIPTORS: readonly SealedColumnDescriptor[] = [
  siteAssistantCredentials,
  adminExecutionCredentials,
  publishCredentialSets,
  publishContentPeers,
  sourceControlCredentialSets,
  customCredentialSets,
  vendorCredentialSets,
  mediaProviderCredentials,
  composioConfig,
  externalMcpServerEnv,
  externalMcpServerOAuth,
  oauthPendingAuthorizations,
  oauthDeviceAuthorizations,
  composioConnectorCredentials,
];
