import {
  buildDomainRegistrations,
  indexCatalogById,
  requireInputRecord,
  requireNoInput,
  requireString,
  requireToolPermission,
  type AgentToolSideEffect,
  type DerivedRiskByToolId,
  type ToolHandler,
  type ToolRegistration,
} from "@jini-ai/cms/core";
import type { UIResource } from "@jini-ai/ui/mcp-ui/surfaces";

import type { AuthorizeFn } from "../../contracts/core/commands/index.js";
import { askOnce, askThenReport, SURFACE_DISMISSED_PARAM, type AssistantSurfaceDeps, type SurfaceExchange, type SurfaceMessage } from "../../contracts/core/tool-surface-exchanges.js";
// `SurfaceEmission` itself is `@jini-ai/core`'s own type (`tool-surface-exchanges.ts` re-exports the
// functions that use it, but not the type) — imported directly here so `handleSetTokenAnswer` below
// can name its `askThenReport`-shaped return type explicitly, mirroring `features/deployments/
// publish-agent-tools.ts`'s identical import for the same reason.
import type { SurfaceEmission } from "@jini-ai/core";
import type { HttpClientPort } from "../../platform/http/index.js";
import type { KeyringPort, SecretSealerPort } from "../webhooks/index.js";
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
import { buildSetTokenFormResource, buildSetTokenOutcomeResource, SET_TOKEN_TOOL_ID } from "./custom-credential-set-token-ui.js";
import { buildDeleteRequestConfirmationResource, MAKE_CREDENTIALED_REQUEST_TOOL_ID } from "./delete-request-confirmation-ui.js";
import { CustomCredentialNotFoundError, CustomCredentialValidationError, describeCredentialByLabel, listCustomCredentials, updateCustomCredential } from "./store.js";
import type { CustomCredentialSetRepoPort, CustomCredentialSummary } from "./types.js";

/**
 * @file Wires `agent-tools.ts`'s three-tool catalog onto `credentialed-request.ts`'s domain logic (plus
 * `store.ts`'s existing `listCustomCredentials` for the read-back tool) — the same
 * `contribute<Domain>Tools()` shape every other domain's `tool-registrations.ts` uses (see
 * `features/deployments/tool-registrations.ts`'s own header for the catalog/wiring split this
 * mirrors).
 *
 * `custom_credential_list` and `custom_credential_verify` are both `custom-credentials.read`-gated:
 * neither durably mutates anything on Tovu's own side (`custom_credential_list` doesn't even touch an
 * external provider — it's a pure repo read). `custom_credential_make_request` is
 * `custom-credentials.write`-gated (2026-08-31, owner override widened this tool from GET-only to all
 * five methods — see `credentialed-request.ts`'s header): it can now perform a real external mutation
 * through the saved credential, so it sits on the write permission rather than read, the same
 * distinction the admin route (`server/inbound/admin-http/routes/system/custom-credentials.ts`)
 * already draws between reading and writing this table — this is a NEW dot-namespaced permission
 * pair, matching that route's own established per-feature convention; the seeded owner's wildcard
 * grant authorizes both immediately with no seed edit required.
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
 *
 * ## `custom_credential_set_username` — the self-healing fix, not just the diagnosis (2026-09-01)
 *
 * The live incident this closes: name.com's API accepts ONLY HTTP Basic `username:token`;
 * `credentialed-request.ts`'s `buildAuthorizationHeader` only sends Basic when the saved connection
 * carries a `username`; the owner's saved name.com credential had none, so every call 401'd with no
 * explanation. `credentialed-request.ts`'s own `AuthFailureDiagnostic` (see that file's header) is the
 * DIAGNOSIS half — this tool is the FIX half, so the assistant can ask the operator for the missing
 * username in chat and save it itself, with no token retype and no trip to the Access Tokens page.
 *
 * `custom-credentials.write`-gated, the SAME permission `custom_credential_make_request` uses — this
 * durably writes a Tovu-side column, which `custom_credential_list`/`custom_credential_verify`'s read
 * permission was never meant to cover. Per the owner's own standing instruction against over-gating
 * ("no GET-only slices, no confirm ceremonies" — this domain's DELETE gate is the one owner-named
 * exception, not a template to extend), this tool raises NO in-chat confirmation: it writes exactly one
 * plaintext, non-secret column, the same class of edit `custom_credential_list` already exposes for
 * reading, so ceremony here would be exactly the friction this feature exists to remove.
 *
 * Reuses `store.ts`'s existing `updateCustomCredential({..., username})` field verbatim — added
 * 2026-09-01 for precisely this fix (see that field's own doc for the full `username`/`connection`
 * precedence writeup) — rather than a second write path. The one thing this wiring layer owns on top
 * of that already-proven function: resolving the tool's `label` input to the row's `id`
 * (`updateCustomCredential` addresses by id, not label — same non-decrypting
 * `describeCredentialByLabel` lookup `resolveRequestTarget` above already uses), the permission check,
 * and — the property that makes skipping confirmation defensible — refusing any call that carries a
 * field other than `label`/`username` at all, so there is no way to even ATTEMPT smuggling a token
 * through this tool (see `rejectUnexpectedSetUsernameFields`'s own doc).
 *
 * ## `custom_credential_set_token` — an MCP-UI surface for the SECRET itself (2026-09-01)
 *
 * The principle this tool holds up is narrower, and stricter, than "an agent must never write a
 * token": it is "a token must never pass through the model's context" at all, in either direction. A
 * human typing a token into ordinary chat text already violates that — it lands in `ai_chat_messages`
 * in plaintext, in the model's own context (so, the provider), and in the CLI's session history, which
 * is exactly why every rotation elsewhere in this app ends with "now go rotate it". This tool is the
 * escape from that: `custom_credential_set_token`'s own input schema (`SET_TOKEN_SCHEMA`,
 * `agent-tools.ts`) carries only `label` — no field on it could carry a token even if the model tried —
 * and its handler opens the SAME held-open `SurfaceExchangeStore` exchange mechanism the DELETE gate
 * above uses, but to show a masked FORM rather than a confirm/cancel dialog
 * (`custom-credential-set-token-ui.ts`'s `buildSetTokenFormResource`). The human's keystrokes travel
 * browser -> `mcp-ui-tool-calls-route.ts` -> `SurfaceExchangeStore` -> `handleSetTokenAnswer` below,
 * entirely inside this process, and never through the spawned agent CLI's stdio — so they never reach
 * the model, the chat transcript, or (see `describeInput`, `assistant/tool-executor-audit.ts`) even
 * the durable audit trail, which records only the ORIGINAL call's input KEY NAMES (`label`), never any
 * value.
 *
 * Driven by `askThenReport`, not `askOnce` — the identical reason `deployment_execute_static_publish`
 * (`features/deployments/publish-agent-tools.ts`) already made this switch: for a held-open exchange,
 * the form's own `tools/call` round trip resolves the instant `mcp-ui-tool-calls-route.ts` DELIVERS the
 * submission to this parked call (`202 {delivered:true}`), long before `updateCustomCredential` has
 * even run. `askThenReport`'s second send (`buildSetTokenOutcomeResource`, reusing the form's own
 * `ui://` URI) is what corrects "Done." into the real outcome once the seal actually finishes.
 *
 * `WRITE`-gated like `custom_credential_set_username`, and — the same defensible-to-skip-confirmation
 * property that tool's own doc names — this handler refuses any call carrying a field other than
 * `label` (`rejectUnexpectedSetTokenFields`), so there is no schema-level OR handler-level path for a
 * token to ride in on the model-issued call itself; the only place a token can ever enter is the
 * rendered form. Unlike `assistant_ask_choice`/`deployment_execute_static_publish`, this handler has NO
 * fallback second-call path when `ctx.emitSurface` is absent: it fails closed instead (mirroring the
 * DELETE gate's own posture), because that fallback shape is exactly a fresh MODEL-ISSUED tool call
 * carrying the human's answer as its input — the one shape this whole design exists to make impossible
 * for a secret.
 */

export interface CustomCredentialsToolDeps {
  readonly authorize: AuthorizeFn;
  readonly workspaceId: string;
  readonly clock: { nowIso(): string };
  readonly customCredentialSetRepo: CustomCredentialSetRepoPort;
  readonly siteAssistantSecretSealer: SecretSealerPort;
  /** `updateCustomCredential`'s OTHER write dependency (`CustomCredentialWriteDeps.keyring`), needed
   *  ONLY so `custom_credential_set_username`'s handler can build the full write-deps shape that
   *  function requires — mirrors `server/inbound/admin-http/routes/system/custom-credentials.ts`'s own
   *  `writeDeps.keyring: deps.siteAssistantSecretKeyring` line exactly, reusing the same field name a
   *  caller building `RouteDeps` already has. A username-only update never actually calls
   *  `keyring.activeKey()` at runtime — `store.ts`'s own `updateCustomCredential` doc: the seal step
   *  (the only place `keyring` is read) runs only when `connection` is supplied, which this tool never
   *  does — this field exists purely to satisfy `CustomCredentialWriteDeps`'s required shape, not
   *  because this tool ever re-seals anything. */
  readonly siteAssistantSecretKeyring: KeyringPort;
  /** Same reasoning as `siteAssistantSecretKeyring` above: `CustomCredentialWriteDeps.idGen` mints a
   *  fresh id only for `createCustomCredential`; an update (this tool only ever updates) never calls
   *  it. Present only to satisfy the write-deps shape. */
  readonly idGen: { newId(): string };
  /** The guarded outbound-HTTP seam (ADR-038) two of this domain's three tools call through
   *  (`custom_credential_list` is a pure repo read and never touches this) — built ONLY by
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
  // -> listCustomCredentials: a non-decrypting repo read (store.ts's own "never touch sealer/keyring"
  // read model). No durable Tovu-side write, no external call, no decrypt of any kind.
  ["custom_credential_list", "none"],
  // -> resolveCustomCredentialByLabel (a decrypting read) plus one bounded outbound GET against the
  // credential's own saved base URL. No durable Tovu-side write of any kind.
  ["custom_credential_verify", "none"],
  // -> makeCredentialedRequest: a real outbound GET/POST/PUT/PATCH/DELETE against the third party's
  // own API using a write-scoped saved credential — genuinely can mutate external state (2026-08-31
  // owner override widened this from GET-only). No Tovu-side DB write, but the SAME external-mutation
  // classification `deployment_execute_static_publish`/`source_control_execute_commit` carry.
  ["custom_credential_make_request", "mutates-durable-state"],
  // -> updateCustomCredential's username-only path: a genuine Tovu-side DURABLE WRITE (the plaintext
  // `username` column), so this can never be "none" — but it is also the narrowest write this table
  // supports: no token field reachable, no re-seal, no external call at all (see this file's header,
  // "custom_credential_set_username", for the full reasoning this classification is drawn from).
  ["custom_credential_set_username", "mutates-durable-state"],
  // -> updateCustomCredential's connection-replacing path, via the human's own form submission: a
  // genuine Tovu-side DURABLE WRITE (a fresh sealed ciphertext) — the model-issued call itself performs
  // no write at all (it only opens the exchange and waits), but the classification here describes what
  // THIS TOOL ID can cause to happen, same convention every other entry in this map uses. No external
  // call, ever — see this file's header, "custom_credential_set_token", for the full reasoning.
  ["custom_credential_set_token", "mutates-durable-state"],
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

  // Fail closed: only an explicit `decision === "confirm"` proceeds — mirrors
  // `features/post/tool-registrations.ts`'s own `resolveDeleteDecision` fix. A missing, non-string, or
  // otherwise unrecognised value must never be read as consent for a live outbound DELETE.
  const decision = typeof answer.params["decision"] === "string" ? answer.params["decision"] : "";
  if (decision !== "confirm") {
    return { confirmed: false, result: { executed: false, cancelled: true } };
  }

  return { confirmed: true };
}

/** The exact keys `custom_credential_set_username` accepts — nothing else, ever. This is the
 *  structural half of "this tool can never accept a token" promised in `agent-tools.ts`'s own catalog
 *  description: `additionalProperties: false` on that catalog entry's `inputSchema` is descriptive
 *  only (the kernel "neither parses nor validates" a tool's schema — see `@jini-ai/core`'s own
 *  `ToolDescriptor.inputSchema` doc), so THIS handler-level check is the one that is actually
 *  enforced. */
const SET_USERNAME_ALLOWED_FIELDS: ReadonlySet<string> = new Set(["label", "username"]);

/**
 * Refuses a `custom_credential_set_username` call carrying any field other than `label`/`username` —
 * in particular, a `token`/`connection`/`secret`-shaped field a model might try to smuggle a
 * credential rotation through. This is the property that makes it defensible to leave this tool
 * un-confirmed (see this file's header): there is no field on this call shape capable of carrying a
 * secret, so there is nothing a confirmation dialog would even be protecting against.
 *
 * @throws {CustomCredentialValidationError} `input` carries a key other than `label`/`username`.
 * @complexity O(n) in the number of supplied input keys.
 */
function rejectUnexpectedSetUsernameFields(input: Record<string, unknown>): void {
  const unexpected = Object.keys(input).filter((key) => !SET_USERNAME_ALLOWED_FIELDS.has(key));
  if (unexpected.length > 0) {
    throw new CustomCredentialValidationError(
      `custom_credential_set_username accepts only 'label' and 'username' — refusing unexpected field(s): ${unexpected.join(", ")}. ` +
        "This tool writes ONLY the plaintext username column; it can never accept, read, or change a token."
    );
  }
}

/**
 * Reads and validates this tool's required `username` field: a non-empty string to set it, or `null`
 * to explicitly clear it. Unlike `store.ts`'s own `validateUsernamePatch` (which validates
 * `updateCustomCredential`'s OPTIONAL `username` patch, where omitting the field entirely means "leave
 * unchanged"), omitting the key here is itself a caller error — this tool exists for exactly one job,
 * set-or-clear, so "say nothing" is never a valid call into it. Mirrors that function's own two
 * non-omitted values and their exact wording for the one case they share (a blank string), so the two
 * surfaces never describe the same rule two different ways.
 *
 * @throws {CustomCredentialValidationError} `username` is omitted, or present but neither `null` nor a
 *   non-empty string.
 * @complexity O(1).
 */
function requireUsernameOrClearSentinel(input: Record<string, unknown>): string | null {
  if (input.username === undefined) {
    throw new CustomCredentialValidationError("'username' is required — pass a non-empty string to set it, or null to clear it");
  }
  if (input.username === null) return null;
  if (typeof input.username !== "string" || input.username.trim() === "") {
    throw new CustomCredentialValidationError("'username' must be a non-empty string, or null to clear it");
  }
  return input.username;
}

/** The exact keys `custom_credential_set_token` accepts on the MODEL-ISSUED call — `label`, nothing
 *  else, ever. `SET_TOKEN_SCHEMA` (`agent-tools.ts`) already has no `token` property to fill in, but
 *  `additionalProperties: false` is descriptive only (same caveat `SET_USERNAME_ALLOWED_FIELDS`'s own
 *  doc gives) — this is the layer that is actually enforced. */
const SET_TOKEN_ALLOWED_FIELDS: ReadonlySet<string> = new Set(["label"]);

/**
 * Refuses a `custom_credential_set_token` call carrying any field other than `label` — the ONLY
 * gate standing between "the model can never supply a token to this tool" and a future edit that adds
 * a second property to its schema without also widening this check. There is no legitimate reason for
 * this call to ever carry anything else: the token itself can only ever arrive later, through the
 * rendered form's own submission, which this function never sees (it validates the ORIGINAL call that
 * opens the exchange, before any form exists).
 *
 * @throws {CustomCredentialValidationError} `input` carries a key other than `label`.
 * @complexity O(n) in the number of supplied input keys.
 */
function rejectUnexpectedSetTokenFields(input: Record<string, unknown>): void {
  const unexpected = Object.keys(input).filter((key) => !SET_TOKEN_ALLOWED_FIELDS.has(key));
  if (unexpected.length > 0) {
    throw new CustomCredentialValidationError(
      `custom_credential_set_token accepts only 'label' — refusing unexpected field(s): ${unexpected.join(", ")}. ` +
        "The token itself can only be supplied by a human, through the form this tool renders — never by this call."
    );
  }
}

/** `custom_credential_set_token`'s ENTIRE agent-facing result shape — deliberately boolean-plus-reason
 *  and nothing richer, so there is no field this type could ever be widened to carry the submitted
 *  token in (contrast `CustomCredentialSummary`, which `custom_credential_set_username` safely returns
 *  in full because none of its fields are secret). */
type SetTokenResult = { saved: true } | { saved: false; reason: "cancelled" | "expired" | "abandoned" | "invalid" | "error"; message?: string };

/** Every dependency {@link handleSetTokenAnswer} needs to seal the submitted token and report the
 *  outcome — bundled so `custom_credential_set_token`'s own `askThenReport` call passes one object
 *  rather than the handler's whole closure, same shape `features/deployments/publish-agent-tools.ts`'s
 *  `PublishConfirmationContext` uses for the identical reason. */
interface SetTokenAnswerContext {
  readonly routeDeps: CustomCredentialsToolDeps;
  readonly existing: CustomCredentialSummary;
  readonly label: string;
  readonly exchange: SurfaceExchange;
}

/**
 * `custom_credential_set_token`'s `askThenReport` answer handling — extracted to a top-level function
 * so its own complexity is measured independently of the handler that opens the exchange and builds
 * the form, same reasoning `handlePublishConfirmationAnswer`
 * (`features/deployments/publish-agent-tools.ts`) gives for its own extraction.
 *
 * `askThenReport`, not `askOnce`: a submitted form's `tools/call` resolves the instant
 * `mcp-ui-tool-calls-route.ts` DELIVERS it to this parked call, before `updateCustomCredential` below
 * has even run — see `custom-credential-set-token-ui.ts`'s header for the full defect this avoids. Each
 * non-success branch that sends an `outcome` does so because the confirmation-turned-form's own script
 * would otherwise leave a bare "Done." on screen for work that has not actually happened yet; the
 * cancel/no-answer branches send none, because the form's own script already reports "Dismissed."/an
 * expiry locally the moment this call resolves, and that IS the truth for those two cases (nothing
 * asynchronous happens afterward that could still fail) — identical reasoning
 * `handlePublishConfirmationAnswer`'s own cancel branch documents.
 *
 * The token itself lives in a single local `const` for the width of this function and is never
 * assigned to any field this function returns, logged, or otherwise retained — the property
 * `agent-tools.ts`'s own catalog description promises the model.
 *
 * @complexity O(1) plus one `updateCustomCredential` call (validate, seal, write).
 */
async function handleSetTokenAnswer(answer: SurfaceMessage, ctx: SetTokenAnswerContext): Promise<{ result: SetTokenResult; outcome?: SurfaceEmission }> {
  const { routeDeps, existing, label, exchange } = ctx;

  if (answer.status !== "received") {
    return { result: { saved: false, reason: answer.status } };
  }
  if (answer.params[SURFACE_DISMISSED_PARAM] === true) {
    return { result: { saved: false, reason: "cancelled" } };
  }

  const token = typeof answer.params["token"] === "string" ? answer.params["token"] : "";
  if (token.trim() === "") {
    const message = "Token cannot be blank. Nothing was saved.";
    return {
      result: { saved: false, reason: "invalid", message },
      outcome: { channel: "mcp-ui", payload: { resource: buildSetTokenOutcomeResource({ exchangeId: exchange.id, label, state: "failure", message }) } },
    };
  }

  try {
    await updateCustomCredential(
      {
        repo: routeDeps.customCredentialSetRepo,
        sealer: routeDeps.siteAssistantSecretSealer,
        keyring: routeDeps.siteAssistantSecretKeyring,
        clock: routeDeps.clock,
        idGen: routeDeps.idGen,
      },
      {
        workspaceId: routeDeps.workspaceId,
        id: existing.id,
        // Carries the EXISTING username forward into the fresh connection. Replacing `connection`
        // WITHOUT it would silently CLEAR a saved username — `store.ts`'s own `updateCustomCredential`
        // doc: "replacing the connection replaces the username ... including clearing it, when the new
        // connection omits one". A token-only fix must never have that side effect, so this is the one
        // place this handler reads `existing.username` at all.
        connection: { token, ...(existing.username !== undefined ? { username: existing.username } : {}) },
      }
    );
  } catch (err) {
    // `err.message` only, never echoed alongside anything else — matches `store.ts`'s own error
    // classes, none of which ever embed a field VALUE (see e.g. `CustomCredentialValidationError`'s
    // and `CustomCredentialSecretStoreUnconfiguredError`'s own construction sites: names and reasons,
    // never a token).
    const message = err instanceof Error ? err.message : String(err);
    return {
      result: { saved: false, reason: "error", message },
      outcome: { channel: "mcp-ui", payload: { resource: buildSetTokenOutcomeResource({ exchangeId: exchange.id, label, state: "failure", message }) } },
    };
  }

  const message = `Token for '${label}' saved.`;
  return {
    result: { saved: true },
    outcome: { channel: "mcp-ui", payload: { resource: buildSetTokenOutcomeResource({ exchangeId: exchange.id, label, state: "success", message }) } },
  };
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
    // Non-decrypting read-back (added 2026-09-01) — see agent-tools.ts's own header for why this
    // exists and why it deliberately omits `username`. `listCustomCredentials` is `store.ts`'s
    // existing "never touch sealer/keyring" read model; this handler adds nothing beyond the
    // permission check and the empty-input contract every NO_INPUT_SCHEMA tool in this codebase uses
    // (e.g. `deployment_get_static_publish_capabilities`'s own handler).
    custom_credential_list: async (ctx): Promise<{ credentials: CustomCredentialSummary[] }> => {
      requireNoInput(ctx.input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: READ_PERMISSION, entityType: DOMAIN });
      const credentials = await listCustomCredentials({ repo: routeDeps.customCredentialSetRepo }, { workspaceId: routeDeps.workspaceId });
      return { credentials };
    },

    custom_credential_verify: async (ctx) => {
      const input = requireInputRecord(ctx.input);
      const label = requireString(input, "label");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: READ_PERMISSION, entityType: DOMAIN });
      return verifyCustomCredential(requestDeps, { workspaceId: routeDeps.workspaceId, label });
    },

    // The self-healing FIX half of the 401/403 diagnostic `custom_credential_verify`/
    // `custom_credential_make_request` now carry (`credentialed-request.ts`'s `AuthFailureDiagnostic`)
    // — see this file's header, "custom_credential_set_username", for the full incident and design.
    // Shape/security validation (`rejectUnexpectedSetUsernameFields`, `requireUsernameOrClearSentinel`)
    // runs BEFORE the permission check, same ordering `custom_credential_make_request` below uses — a
    // malformed call is refused on its own terms regardless of who is asking. WRITE-gated (this durably
    // changes a Tovu-side column), and — by the owner's own standing "no confirm ceremonies" instruction
    // — deliberately NOT wrapped in the DELETE-style confirmation dialog: this field is not a secret,
    // and there is structurally no way for this call to carry one.
    custom_credential_set_username: async (ctx): Promise<CustomCredentialSummary> => {
      const input = requireInputRecord(ctx.input);
      rejectUnexpectedSetUsernameFields(input);
      const label = requireString(input, "label");
      const username = requireUsernameOrClearSentinel(input);
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: WRITE_PERMISSION, entityType: DOMAIN });

      // Non-decrypting label->id resolution — same lookup `resolveRequestTarget` above uses for the
      // identical reason: a bad label should never cost a decrypt, and this update never needs one
      // either (see `CustomCredentialsToolDeps.siteAssistantSecretKeyring`'s own doc).
      const existing = await describeCredentialByLabel({ repo: routeDeps.customCredentialSetRepo }, { workspaceId: routeDeps.workspaceId, label });
      if (!existing) {
        throw new CustomCredentialNotFoundError(`no custom credential labeled '${label}' in this workspace`);
      }

      return updateCustomCredential(
        {
          repo: routeDeps.customCredentialSetRepo,
          sealer: routeDeps.siteAssistantSecretSealer,
          keyring: routeDeps.siteAssistantSecretKeyring,
          clock: routeDeps.clock,
          idGen: routeDeps.idGen,
        },
        { workspaceId: routeDeps.workspaceId, id: existing.id, username }
      );
    },

    // An MCP-UI surface for the SECRET itself — see this file's header, "custom_credential_set_token",
    // for the full mechanism and why it holds up "a token must never pass through the model's
    // context" rather than merely "an agent must never write one". Shape validation
    // (`rejectUnexpectedSetTokenFields`) and the label->id resolution both run BEFORE any exchange is
    // opened, same ordering `custom_credential_make_request`'s DELETE gate below uses: a malformed or
    // unresolvable call must never raise a dialog for a human to see. WRITE-gated, same permission
    // `custom_credential_set_username`/`custom_credential_make_request` use.
    custom_credential_set_token: async (ctx): Promise<SetTokenResult> => {
      const input = requireInputRecord(ctx.input);
      rejectUnexpectedSetTokenFields(input);
      const label = requireString(input, "label");
      await requireToolPermission(routeDeps, { principalId: ctx.principal.id, permission: WRITE_PERMISSION, entityType: DOMAIN });

      // Non-decrypting label->id resolution — same lookup `custom_credential_set_username` above uses,
      // and for the identical reason: a bad label should never cost a decrypt. `existing.username` is
      // also read here (never a decrypt — it is a plaintext column) so `handleSetTokenAnswer` can carry
      // it forward into the fresh connection without a second lookup after the human answers.
      const existing = await describeCredentialByLabel({ repo: routeDeps.customCredentialSetRepo }, { workspaceId: routeDeps.workspaceId, label });
      if (!existing) {
        throw new CustomCredentialNotFoundError(`no custom credential labeled '${label}' in this workspace`);
      }

      // Fail closed rather than degrade — and, unlike every OTHER gated tool in this codebase, there is
      // deliberately no fallback second-call shape for this one even in principle: that shape is a
      // fresh MODEL-ISSUED tool call carrying the human's answer as its own input, which is exactly the
      // path this tool exists to make impossible for a secret. See this file's header.
      if (!ctx.emitSurface) {
        throw new Error(
          "custom_credential_set_token: this execution context has no interactive confirmation channel " +
            "(no emitSurface), so a token cannot be collected here. Nothing was changed."
        );
      }

      const exchange: SurfaceExchange = surfaces.surfaceExchanges.open({ toolId: SET_TOKEN_TOOL_ID, principalId: ctx.principal.id }, ctx.emitSurface);
      const ui = buildSetTokenFormResource({ label, exchangeId: exchange.id });

      const closeOnAbort = () => exchange.close();
      ctx.signal.addEventListener("abort", closeOnAbort, { once: true });
      try {
        // `askThenReport`, not `askOnce` — see `handleSetTokenAnswer`'s own header for the full defect
        // this closes and why the handler is a separate top-level function rather than inlined here.
        const answerContext: SetTokenAnswerContext = { routeDeps, existing, label, exchange };
        return await askThenReport<SetTokenResult>(exchange, { channel: "mcp-ui", payload: { resource: ui } }, (answer) => handleSetTokenAnswer(answer, answerContext));
      } finally {
        ctx.signal.removeEventListener("abort", closeOnAbort);
      }
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
