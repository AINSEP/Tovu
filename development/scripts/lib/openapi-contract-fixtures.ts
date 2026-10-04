/**
 * Request fixtures for Tovu's live OpenAPI contract probes. A documented 400/403/404 describes
 * one failure condition, not every request to that operation: malformed bodies and paths must
 * not mask the permission/resource condition the probe is meant to exercise.
 *
 * These are Tovu HTTP inputs, not substitutes for production dependencies or error responses.
 */
import { buildUrl, type OpenApiOperation } from "./openapi-operations.js";

export type ContractProbeType = "AUTH_401" | "PERM_403" | "WORKSPACE_404" | "RESOURCE_404" | "RESOURCE_EMPTY_200" | "VALIDATION_400" | "IDEMPOTENCY_409";

const VALID_BODIES: Readonly<Record<string, Record<string, unknown>>> = {
  set_plugin_enabled: { enabled: false },
  write_policy_permission: { permission: "content.write" },
  set_setting_value: { namespace: "appearance", key: "accentColor", scope: "workspace", valueJson: "#123456" },
  clear_setting_value: { namespace: "appearance", key: "accentColor", scope: "workspace" },
  reset_settings_namespace: { namespace: "appearance", scope: "workspace" },
  create_redirect: { matchType: "exact", fromPattern: "/contract-probe-old", toTarget: "/contract-probe-new", statusCode: 301 },
  import_redirects: { rules: [{ matchType: "exact", fromPattern: "/contract-import-old", toTarget: "/contract-import-new", statusCode: 301 }] },
  create_form_definition: { name: "Contract permission probe", slug: "contract-permission-probe", fields: [{ id: "name", label: "Name", type: "text", required: true }] },
  create_newsletter_campaign: { subject: "Contract probe", fromName: "Probe", fromEmail: "probe@example.test", replyTo: "probe@example.test", listId: "placeholder", bodyJson: { type: "doc", content: [] } },
  send_test_newsletter_campaign: { testAddresses: ["probe@example.test"] },
  create_newsletter_list: { name: "Contract probe list", slug: "contract-probe-list" },
  create_newsletter_subscription: { subscriberId: "placeholder" },
  import_newsletter_subscriptions: { subscribers: [{ subscriberId: "placeholder" }] },
  update_menu_tree: { items: [], expectedVersion: 0 },
  assign_menu_location: { locationKey: "header" },
  upload_media: { filename: "contract-probe.png", contentType: "image/png", dataBase64: "AA==" },
};

const INVALID_BODIES: Readonly<Record<string, Record<string, unknown>>> = {
  // Empty/omitted titles intentionally create Untitled drafts (post/post.ts createPost).
  create_post: { title: "x".repeat(201) },
  create_page: { title: "x".repeat(201) },
  // An empty provider map is a valid Clear-all request (media/put-providers.ts).
  replace_media_providers: { "does-not-exist-provider": {} },
};

export interface ContractProbeRequest {
  readonly probeType: ContractProbeType;
  readonly expectedStatus: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body: string | undefined;
}

/** Build a request that isolates its named condition, with all other inputs valid. */
export function buildContractProbeRequest(
  { operation, probeType, workspaceId, headers }: {
    operation: OpenApiOperation;
    probeType: Exclude<ContractProbeType, "RESOURCE_EMPTY_200" | "IDEMPOTENCY_409">;
    workspaceId: string;
    headers: Record<string, string>;
  },
  { formSlug }: { formSlug?: string } = {},
): ContractProbeRequest {
  const params: Record<string, string> = {
    workspaceId: probeType === "WORKSPACE_404" ? "does-not-exist-workspace" : workspaceId,
  };
  let actualProbeType: ContractProbeType = probeType;
  let expectedStatus = probeType.slice(probeType.lastIndexOf("_") + 1);

  if (probeType === "RESOURCE_404") {
    params[operation.pathParams[operation.pathParams.length - 1]] = "does-not-exist-resource-id";
    if (operation.operationId === "get_media_rendition") {
      // filename is cosmetic. The asset must be missing and the transform segment well formed.
      params.assetId = "does-not-exist-resource-id";
      params.transformSpec = "thumb.v1";
      params.filename = "probe.jpg";
    }
    if (operation.operationId === "list_newsletter_subscriptions") {
      // Its 404 is workspace-only; the spec explicitly documents an empty 200 for unknown lists.
      actualProbeType = "RESOURCE_EMPTY_200";
      expectedStatus = "200";
    }
  }
  if (operation.operationId === "submit_form" && probeType === "VALIDATION_400") {
    if (!formSlug) throw new Error("submit_form validation requires a seeded active form");
    params.slug = formSlug;
  }

  const bodyValue = probeType === "VALIDATION_400"
    ? (INVALID_BODIES[operation.operationId] ?? {})
    : (VALID_BODIES[operation.operationId] ?? {});
  const body = operation.requestBodyRequired || probeType === "VALIDATION_400" ? JSON.stringify(bodyValue) : undefined;
  return {
    probeType: actualProbeType,
    expectedStatus,
    url: buildUrl(operation, params),
    headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
    body,
  };
}

/** Real HTTP setup, with its own success check so validation cannot pass against a missing form. */
export async function seedContractProbeForm(
  { request, baseUrl, ownerCookie, workspaceId }: {
    request: typeof fetch;
    baseUrl: string;
    ownerCookie: string;
    workspaceId: string;
  },
  { slug = "openapi-contract-validation-form" }: { slug?: string } = {},
): Promise<string> {
  const response = await request(`${baseUrl}/api/admin/v1/workspaces/${encodeURIComponent(workspaceId)}/forms`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ name: "Contract validation form", slug, fields: [{ id: "name", label: "Name", type: "text", required: true }] }),
  });
  if (response.status !== 201) throw new Error(`contract form setup returned ${response.status}, expected 201`);
  const payload = await response.json() as { data?: { slug?: string; status?: string } };
  if (payload.data?.slug !== slug || payload.data?.status !== "active") {
    throw new Error("contract form setup did not return the requested active form");
  }
  return slug;
}
