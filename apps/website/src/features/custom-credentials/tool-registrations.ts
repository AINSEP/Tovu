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
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { askOnce, type AssistantSurfaceDeps, type SurfaceExchange } from "../../contracts/core/tool-surface-exchanges.js";
import type { HttpClientPort } from "../../platform/http/index.js";
import type { SecretSealerPort } from "../webhooks/index.js";
import type { ToolContributor } from "#src/assistant/index";
import { customCredentialsAgentToolCatalog } from "./agent-tools.js";
import {
  makeCredentialedRequest,
  resolveRequestTarget,
  verifyCustomCredential,
  type CredentialedRequestAuditPort,
  type CredentialedRequestDeclinedResult,
  type CredentialedRequestDeps,
  type CredentialedRequestOutcome,
} from "./credentialed-request.js";
import { buildDeleteRequestConfirmationResource, MAKE_CREDENTIALED_REQUEST_TOOL_ID } from "./delete-request-confirmation-ui.js";
import type { CustomCredentialSetRepoPort } from "./types.js";

/**
 * @file Wires `agent-tools.ts`'s two-tool catalog onto `credentialed-request.ts`'s domain logic —
 * the same `contribute<Domain>Tools()` shape every other domain's `tool-registrations.ts` uses (see
 * `features/deployments/tool-registrations.ts`'s own header for the catalog/wiring split this
 * mirrors).
 *
 * `custom_credential_verify` is `custom-credentials.read`-gated: it never durably mutates anything on
 * Tovu's own side. `custom_credential_make_request` is `custom-credentials.write`-gated (2026-08-31,
 * owner override widened this tool from GET-only to all five methods — see
 * `credentialed-request.ts`'s header): it can now perform a real external mutation through the saved
 * credential, so it sits on the write permission rather than read, the same distinction the admin
 * route (`server/inbound/admin-http/routes/system/custom-credentials.ts`) already draws between
 * reading and writing this table — this is a NEW dot-namespaced permission pair, matching that
 * route's own established per-feature convention; the seeded owner's wildcard grant authorizes both
 * immediately with no seed edit required.
 *
 * ## DELETE's confirmation gate (owner decision, 2026-08-31)
 *
 * "The only thing we maybe should be worried about is deletion, but we can gate that with MCP-UI."
 * GET/POST/PUT/PATCH run immediately with no ceremony — parity with what a human can already do from
 * the site. DELETE alone opens a `SurfaceExchangeStore` exchange and parks on the human's answer
 * (ADR-055 Decision 2) — the SAME mechanism `content_post_delete`
 * (`features/post/tool-registrations.ts`) already uses for its own destructive gate, reused here
 * rather than reinvented (see that file's own header for the full mechanism this one holds up: one
 * call opens the exchange, emits the dialog, and returns the truthful outcome to the SAME call once
 * answered — there is no second tool call, so there is nothing left for a token to guard). Not routed
 * through `core/gated-mutations` (the heavier plan/confirm/execute ceremony
 * `features/recovery/gated-hooks.ts`/`features/database/gated-hooks.ts` use) — the owner explicitly
 * asked for this lighter shape instead.
 *
 * `resolveRequestTarget` (non-decrypting) validates the target BEFORE the dialog is ever raised, so a
 * bad label or an off-allowlist `url` is refused with no dialog and no decrypt; the credential is only
 * decrypted once the human has actually confirmed, inside `makeCredentialedRequest` itself.
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
 *  own checks. Coincidence, not a shared concept forced together: this feature has exactly one
 *  domain and one entity type, so both names happen to be identical. */
const DOMAIN = "custom-credentials";
/** Gates `custom_credential_verify` — a read against the third party, never a Tovu-side write. */
const READ_PERMISSION = `${DOMAIN}.read`;
/** Gates `custom_credential_make_request` — see this file's header for why a tool that can now issue
 *  a real external POST/PUT/PATCH/DELETE sits on the write permission, not read. */
const WRITE_PERMISSION = `${DOMAIN}.write`;

/**
 * This wiring layer's OWN risk classification, authored from what each handler below actually
 * calls. See `DerivedRiskByToolId` in the kit for why it is independent of the catalog's own
 * `sideEffects` declaration.
 */
export const customCredentialsDerivedRisk: DerivedRiskByToolId = new Map<string, AgentToolSideEffect>([
  // -> resolveCustomCredentialByLabel (a decrypting read) plus one bounded outbound GET against the
  // credential's own saved base URL. No durable Tovu-side write of any kind.
  ["custom_credential_verify", "none"],
  // -> makeCredentialedRequest: a real outbound GET/POST/PUT/PATCH/DELETE against the third party's
  // own API using a write-scoped saved credential — genuinely can mutate external state (2026-08-31
  // owner override widened this from GET-only). No Tovu-side DB write, but the SAME external-mutation
  // classification `deployment_execute_static_publish`/`source_control_execute_commit` carry.
  ["custom_credential_make_request", "mutates-durable-state"],
]);

/**
 * Waits for the human's answer to a DELETE-through-credential confirmation dialog and turns it into
 * either "go ahead" or the exact not-confirmed result the tool call should return (ADR-055 Decision
 * 6: no-answer is a result, not a thrown error) — mirrors `features/post/tool-registrations.ts`'s own
 * `resolveDeleteDecision` exactly, adapted to this domain's `CredentialedRequestDeclinedResult` shape.
 */
async function resolveMakeRequestDeleteDecision(exchange: SurfaceExchange, ui: UIResource): Promise<{ confirmed: true } | { confirmed: false; result: CredentialedRequestDeclinedResult }> {
  const answer = await askOnce(exchange, { channel: "mcp-ui", payload: { resource: ui } });

  if (answer.status !== "received") {
    return { confirmed: false, result: { executed: false, cancelled: false, reason: answer.status } };
  }

  const decision = typeof answer.params["decision"] === "string" ? answer.params["decision"] : "confirm";
  if (decision !== "confirm") {
    return { confirmed: false, result: { executed: false, cancelled: true } };
  }

  return { confirmed: true };
}

export function buildCustomCredentialsRegistrations(routeDeps: CustomCredentialsToolDeps, surfaces: AssistantSurfaceDeps): ToolRegistration[] {
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
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: READ_PERMISSION, entityType: DOMAIN });
      return verifyCustomCredential(requestDeps, { workspaceId: routeDeps.workspaceId, label });
    },

    // GET/POST/PUT/PATCH run immediately (no ceremony — parity with the site). DELETE opens an
    // in-chat confirmation and parks until answered; see this file's own header for the full
    // mechanism and why. All shape/security-boundary validation (`method`/`url`/`headers`/`body`,
    // label existence, host allowlist) happens inside `resolveRequestTarget`/`makeCredentialedRequest`
    // themselves — this handler's only job is deciding WHETHER to gate, never re-validating.
    custom_credential_make_request: async (ctx): Promise<CredentialedRequestOutcome> => {
      const input = requireInputRecord(ctx.input);
      const label = requireString(input, "label");
      const method = requireString(input, "method");
      const url = requireString(input, "url");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: WRITE_PERMISSION, entityType: DOMAIN });

      if (method !== "DELETE") {
        return makeCredentialedRequest(requestDeps, { workspaceId: routeDeps.workspaceId, label, method, url, headers: input.headers, body: input.body });
      }

      // Non-decrypting: a declined/expired/off-allowlist DELETE must never have cost a decrypt.
      const target = await resolveRequestTarget({ repo: requestDeps.repo }, { workspaceId: routeDeps.workspaceId, label, url });

      // Fail closed rather than degrade — same posture `content_post_delete`'s own handler documents:
      // an execution context that cannot hold this call open cannot run a gated DELETE at all.
      if (!ctx.emitSurface) {
        throw new Error(
          "custom_credential_make_request: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a DELETE cannot be gated here. Nothing was sent."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open({ toolId: MAKE_CREDENTIALED_REQUEST_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface);
      const ui = buildDeleteRequestConfirmationResource({
        label: target.label,
        host: target.url.host,
        path: `${target.url.pathname}${target.url.search}`,
        exchangeId: exchange.id,
      });

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      let decision: Awaited<ReturnType<typeof resolveMakeRequestDeleteDecision>>;
      try {
        decision = await resolveMakeRequestDeleteDecision(exchange, ui);
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
      if (!decision.confirmed) return decision.result;

      return makeCredentialedRequest(requestDeps, { workspaceId: routeDeps.workspaceId, label, method: "DELETE", url, headers: input.headers, body: input.body });
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
