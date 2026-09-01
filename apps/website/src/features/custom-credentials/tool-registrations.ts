import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import type { HttpClientPort } from "../../platform/http/index.js";
import type { SecretSealerPort } from "../webhooks/index.js";
import type { ToolContributor } from "#src/assistant/index";
import { customCredentialsAgentToolCatalog } from "./agent-tools.js";
import { makeCredentialedRequest, verifyCustomCredential, type CredentialedRequestAuditPort, type CredentialedRequestDeps } from "./credentialed-request.js";
import type { CustomCredentialSetRepoPort } from "./types.js";

/**
 * @file Wires `agent-tools.ts`'s two-tool catalog onto `credentialed-request.ts`'s domain logic —
 * the same `contribute<Domain>Tools()` shape every other domain's `tool-registrations.ts` uses (see
 * `features/deployments/tool-registrations.ts`'s own header for the catalog/wiring split this
 * mirrors).
 *
 * `custom-credentials.read`-gated on both tools, a NEW dot-namespaced permission — matches
 * `server/inbound/admin-http/routes/system/custom-credentials.ts`'s own established per-feature
 * convention (that route's `custom-credentials.write` header trace); the seeded owner's wildcard
 * grant authorizes it immediately with no seed edit required. `.read`, not `.write`: neither tool
 * durably mutates anything on Tovu's own side — see `credentialed-request.ts`'s header and
 * `agent-tools.ts`'s own catalog for why both are classified `sideEffects: "none"`.
 */

export interface CustomCredentialsToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly customCredentialSetRepo: CustomCredentialSetRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  /** The guarded outbound-HTTP seam (ADR-038) this domain's two tools call through — built ONLY by
   *  a composition root (`server/runtime/composition/{deps,app}.ts`); see `credentialed-request.ts`'s
   *  own `CredentialedRequestDeps.httpClient` doc for why this file never constructs one itself. */
  readonly customCredentialsHttpClient: HttpClientPort;
  /** Test-only override; defaults to `credentialed-request.ts`'s `ConsoleCredentialedRequestAuditLog`. */
  readonly customCredentialsAudit?: CredentialedRequestAuditPort;
}

const CATALOG_BY_ID = indexCatalogById(customCredentialsAgentToolCatalog);

/** This domain's name, doing double duty as both `buildDomainRegistrations`'s own `domain` field and
 *  `requireToolPermission`'s `entityType` — the same string
 *  `server/inbound/admin-http/routes/system/custom-credentials.ts`'s own admin route uses for its
 *  `custom-credentials.write` checks. Coincidence, not a shared concept forced together: this
 *  feature has exactly one domain and one entity type, so both names happen to be identical. */
const DOMAIN = "custom-credentials";
/** `.read`, not `.write` — see this file's header for why. */
const PERMISSION = `${DOMAIN}.read`;

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const customCredentialsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> resolveCustomCredentialByLabel (a decrypting read) plus one bounded outbound GET against the
  // credential's own saved base URL. No durable Tovu-side write of any kind.
  ["custom_credential_verify", "none"],
  // -> same shape, one bounded outbound GET (this slice is GET-only — see credentialed-request.ts's
  // header). No durable Tovu-side write.
  ["custom_credential_make_request", "none"],
]);

export function buildCustomCredentialsRegistrations(routeDeps: CustomCredentialsToolDeps): ToolRegistration[] {
  const requestDeps: CredentialedRequestDeps = {
    repo: routeDeps.customCredentialSetRepo,
    sealer: routeDeps.siteAssistantSecretSealer,
    httpClient: routeDeps.customCredentialsHttpClient,
    clock: routeDeps.clock,
    ...(routeDeps.customCredentialsAudit !== undefined ? { audit: routeDeps.customCredentialsAudit } : {}),
  };

  const handlers: Record<string, ToolHandler> = {
    custom_credential_verify: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const label = requireString(input, "label");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: PERMISSION, entityType: DOMAIN });
      return verifyCustomCredential(requestDeps, { workspaceId: routeDeps.workspaceId, label });
    },

    custom_credential_make_request: async (ctx) => {
      // All three required fields validated before the permission check, same order
      // `deployment_set_dockerfile` uses — a shape rejection should never need an authorize()
      // round trip first. `headers` is optional and re-validated (shape + forbidden names) by
      // `makeCredentialedRequest` itself.
      const input = requireInputRecord(ctx.input);
      const label = requireString(input, "label");
      const method = requireString(input, "method");
      const path = requireString(input, "path");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: PERMISSION, entityType: DOMAIN });
      return makeCredentialedRequest(requestDeps, { workspaceId: routeDeps.workspaceId, label, method, path, headers: input.headers });
    },
  };

  return buildDomainRegistrations({
    domain: DOMAIN,
    catalogModule: "features/custom-credentials/agent-tools.ts",
    catalog: CATALOG_BY_ID,
    handlers,
    derivedRisk: customCredentialsDerivedRisk,
  });
}

/**
 * Contributes `custom-credentials`' AI tools to the assistant's catalog — called once by
 * `server/runtime/composition/tool-catalog-manifest.ts`'s `installFirstPartyToolContributors()`,
 * not by importing this module.
 */
export function contributeCustomCredentialsTools(): ToolContributor {
  return { domain: DOMAIN, build: buildCustomCredentialsRegistrations, risk: customCredentialsDerivedRisk };
}
