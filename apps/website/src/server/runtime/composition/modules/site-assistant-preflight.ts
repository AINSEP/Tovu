import type { Request, Response } from "express";
import type { RouteDeps } from "#src/server/routes/types";
import { resolveProviderProtocol, type ProviderProtocol } from "@jini-ai/agent-runtime/providers/tool-turn";
import { resolveBoundedHistory, isPublicAssistantEnabled, resolvePublicAssistantAvailability, type SiteAssistantErrorReporter, type ResolvedSiteAssistantCredential, type SiteAssistantHistoryTurn, type SiteAssistantModeResolution } from "#src/assistant/index";
import { resolveClientIp } from "#src/contracts/core/rate-limit/rate-limit";
import { readVisitorTurnId } from "#src/assistant/site/visitor-turn-dedupe";
import { readVisitorChatInput, type VisitorChatWire } from "./site-assistant-ag-ui.js";

/** Bounds a single visitor message. Long enough for a real question, short enough that the prompt
 *  cost of one request cannot be driven up arbitrarily by an anonymous caller. */
const MAX_MESSAGE_CHARS = 2000;
const DEFAULT_MODEL = "gemini-flash-latest";

/**
 * `gemini-flash-latest` rather than a pinned version.
 *
 * The original justification here recorded that, measured 2026-08-03 on a live key,
 * `gemini-2.5-flash`/`-lite` returned **404** and `gemini-2.0-flash` reported quota `limit: 0` — so
 * pinning a 2.x model would ship a route dead on arrival. **Re-measured 2026-08-04 on a live key,
 * that is no longer true**: `POST .../models/gemini-2.5-flash:generateContent` returns HTTP 200, and
 * the model appears in the account's own catalogue (42 models via `listProviderModels`). Both
 * statements were almost certainly correct on their own date — which is the actual finding here.
 * Google moves these aliases underneath us, so a measurement of provider availability has a
 * shelf life measured in days and must not be treated as a standing fact.
 *
 * The alias is therefore kept for the reason that does NOT expire: it tracks whatever Google
 * currently considers current, so this route cannot go dead on a rename. It is no longer kept
 * because 2.x is broken — do not re-derive that conclusion from the paragraph above. Overridable via
 * `TOVU_SITE_ASSISTANT_MODEL` so an operator is never stuck waiting on a code change.
 *
 * NOTE, because it surprises people: the admin "Execution mode" screen's BYOK `model` field is a
 * different setting for a different assistant and has no effect here. The field that DOES decide
 * this route's model is the "Visitor's AI Assistant" tab's own model (stored on the site credential
 * row), which wins over this env var — see {@link resolveModel}. Until 2026-09-16 this function was
 * the only input and the stored value was ignored entirely.
 */
/**
 * The model this turn runs, in priority order: the operator's stored model, then
 * `TOVU_SITE_ASSISTANT_MODEL` for `google` only (see {@link siteAssistantEnvFallbacks}), then the
 * Google default — and `""` when there is none, which the caller turns into an explicit refusal.
 *
 * The stored value wins over the env var deliberately, reversing nothing that ever worked: before
 * 2026-09-16 no stored model reached this route at all, so no deployment can be relying on the env
 * var beating one. It has to win now, because a model id is provider-specific: a
 * `TOVU_SITE_ASSISTANT_MODEL=gemini-flash-latest` left over from a Google deployment would
 * otherwise be sent to Anthropic the moment the operator switched providers in the admin tab — a
 * value the admin screen shows as something else, silently overriding the one the operator can see.
 * That leftover-gemini-id-sent-to-Anthropic failure mode can no longer happen at all now: the env
 * var itself is gated to `google` by {@link siteAssistantEnvFallbacks}, not just outranked here.
 *
 * Only `google` gets a default. `DEFAULT_MODEL`'s own doc above explains why an alias is safe for
 * Gemini; there is no equivalent for the others, and an invented Anthropic/OpenAI/Azure model id
 * buys an opaque provider 404 in place of the one clear sentence the operator actually needs.
 *
 * @complexity O(1).
 */
function resolveModel(
  { protocol, storedModel, envModel }: { protocol: ProviderProtocol; storedModel: string | null; envModel: string | undefined },
  _optional = {},
): string {
  return storedModel?.trim() || envModel || (protocol === "google" ? DEFAULT_MODEL : "");
}

/**
 * The endpoint this turn dials, in the same priority order {@link resolveModel} uses: the
 * operator's stored `baseUrl` (the admin tab's own field), then `TOVU_SITE_ASSISTANT_BASE_URL` for
 * `google` only (see {@link siteAssistantEnvFallbacks}), then `undefined` — which leaves each
 * provider adapter's own public default in effect (`@jini-ai/agent-runtime`'s
 * `DEFAULT_GOOGLE_BASE_URL` and friends).
 *
 * The env var is Google-only. Its audiences are the Google env-key deployment (an operator routing
 * through Vertex AI, a regional endpoint, or an enterprise proxy with no stored credential) and this
 * route's own Google-path scoped tests, which point it at a loopback stub server instead of a real
 * provider (see `stub-provider-server.ts`'s doc for why that redirect is the only interception
 * point left: every `run*ToolTurn` dials via `pinnedFetch` — `node:https`/`node:http` directly —
 * not `globalThis.fetch`). A non-Google workspace with no stored endpoint gets the adapter's own
 * public default instead — Azure has none, and `runAzureTurn` reports that itself as a turn error;
 * this function does not special-case it, so that workspace gets the adapter's own message rather
 * than a second, divergent copy of it here. The adapter still validates whatever URL is chosen
 * (SSRF: `validateBaseUrlResolved`), unchanged by this function's gating.
 *
 * **Pairing rule (t91 F3.1-A, 2026-09-16):** this function must be called ONLY when the key paying
 * for the turn is the workspace's own STORED key. `resolveProviderFromCredential` — the only
 * caller — skips it entirely and uses `envFallbacks.baseUrl` alone whenever the key is env-sourced
 * (`choice.apiKey == null`). A stored `baseUrl` is written by whoever holds
 * `ADMIN_ASSISTANT_PERMISSION` for THIS workspace, a different principal than whoever controls the
 * server's process environment; pairing an env-sourced key with a row that principal wrote — even a
 * keyless row, or a row a deleted key left behind (`deleteSiteAssistantCredential` clears only the
 * key) — would let that admin silently redirect the operator's own key to a host of the admin's
 * choosing. So: stored key -> stored-or-env baseUrl (this function); env key -> env-or-default
 * baseUrl only, never a stored one.
 *
 * @complexity O(1).
 */
function resolveBaseUrl(
  { storedBaseUrl, envBaseUrl }: { storedBaseUrl: string | null; envBaseUrl: string | undefined },
  _optional = {},
): string | undefined {
  return storedBaseUrl?.trim() || envBaseUrl || undefined;
}

/** Everything the turn below needs to reach the RIGHT provider: which protocol adapter runs, the
 *  key that pays for it, where it dials, and what model it asks for. Resolved as one unit so no
 *  caller can pick a provider from one source and a model or endpoint from another. */
export interface SiteAssistantProviderConfig {
  readonly protocol: ProviderProtocol;
  readonly apiKey: string;
  readonly baseUrl: string | undefined;
  readonly model: string;
}

type SiteAssistantPreflight =
  | { ok: false }
  | { ok: true; message: string; priorTurns: SiteAssistantHistoryTurn[]; provider: SiteAssistantProviderConfig; turnId: string | null; wireIds: { threadId: string; runId: string } | undefined };

type MessageGuardResult =
  | { ok: false }
  | { ok: true; message: string; priorTurns: SiteAssistantHistoryTurn[]; turnId: string | null; wireIds: { threadId: string; runId: string } | undefined };

/**
 * The visibility, shape, and budget gates: is the workspace's public assistant on at all, is
 * `message` a usable non-empty string within bounds, and is this IP still under its rate-limit
 * window. Each one can end the request on its own before anything downstream (mode, credentials)
 * is even looked at.
 */
async function guardMessageAndRateLimit(req: Request, res: Response, deps: RouteDeps, reportError: SiteAssistantErrorReporter, wire: VisitorChatWire): Promise<MessageGuardResult> {
  // `public-assistant-settings.ts`'s file header spells out the contract this line exists to
  // satisfy: "publicEnabled: false means the public page ships NO assistant bundle and exposes NO
  // assistant endpoint... registers the visitor-facing assistant route(s) conditionally, or has
  // them 404 when off." Checked first, before parsing anything else in the request, so a disabled
  // workspace is indistinguishable from this route never having been registered at all — never a
  // 503/403 that would confirm the feature exists but is off.
  const enabled = await isPublicAssistantEnabled(
    { settingsRepo: deps.settingsRepo, getEffective: deps.getEffective },
    { workspaceId: deps.workspaceId }
  );
  if (!enabled) {
    respondPublicError({ res, status: 404, reportError, code: "ASSISTANT_DISABLED", diagnostic: "site assistant is disabled" });
    return { ok: false };
  }

  // Both wires normalize here, so the legacy body and an AG-UI `RunAgentInput` pass the same
  // shape, length, rate-limit and dedupe gates in the same order.
  const input = readVisitorChatInput({ body: req.body, wire, readTurnId: readVisitorTurnId, maxMessageChars: MAX_MESSAGE_CHARS });
  if (!input.ok) {
    respondPublicError({ res, status: input.status, reportError, code: input.code, diagnostic: input.diagnostic });
    return { ok: false };
  }
  const { message } = input;
  // SPEC-046 REQ-3: `body.history` is client-supplied and untrusted — it can be forged, so it
  // is bounded and fail-soft (malformed shapes degrade to less context, never a 4xx) rather
  // than validated-and-rejected the way `message` above is. See `assistant/site/history.ts`'s
  // own doc for why that asymmetry is correct: `message` is the live turn the visitor is
  // actively sending; `history` is passive background context they did not just author.
  const priorTurns = resolveBoundedHistory({ rawHistory: input.rawHistory });

  // SPEC-046 REQ-7: checked before any mode/config branch below, so a caller already over
  // budget never reaches the provider call (or its 501/503 config-error branches either) —
  // the 429 is the cheapest possible response to an excess request. A clean JSON error here
  // (not an SSE frame — `beginStream` has not run yet) is what lets the widget's transport
  // read `body.error` off a normal failed `fetch()` the same way it already does for 4xx/5xx.
  const rateLimitResult = await deps.siteAssistantRateLimiter.check({ key: resolveClientIp(req) });
  if (!rateLimitResult.allowed) {
    res.setHeader("Retry-After", String(rateLimitResult.retryAfterSeconds));
    respondPublicError({ res, status: 429, reportError, code: "RATE_LIMIT_EXCEEDED",
      diagnostic: "too many messages from this address — please wait before trying again",
      details: { retryAfterSeconds: rateLimitResult.retryAfterSeconds },
    });
    return { ok: false };
  }

  return { ok: true, message, priorTurns, turnId: input.turnId, wireIds: input.wireIds };
}

/** The stored `provider` string, narrowed to a protocol this route can actually dispatch, or `null`
 *  when it names something else. Case- and whitespace-insensitive because the column is free-form.
 *  `site_assistant_credentials.provider` is a plain text column and `put-site-credential.ts`
 *  accepts any string, so anything outside the four protocols `@jini-ai/agent-runtime/providers/tool-turn` dispatches
 *  is a real operator mistake that has to be named rather than rounded to Google.
 *  @complexity O(n) in provider length. */
function toByokProtocol({ provider }: { provider: string }, _optional = {}): ProviderProtocol | null {
  return resolveProviderProtocol({ provider });
}

/**
 * The exact sentence an operator needs when no usable key was found, which differs by WHY.
 *
 * The `google` wording is the pre-2026-09-16 message, kept verbatim: that path is unchanged and an
 * operator who has seen it before should not have to re-read a reworded version of the same thing.
 * The non-Google wording exists because the old message was actively misleading there — it offered
 * `GEMINI_API_KEY` as a remedy for a workspace that had asked for Anthropic, where setting it would
 * have done nothing (and, before this fix, would have quietly answered as Google instead).
 *
 * `storedKeyPresent` separates "no key was ever saved" from "a key is saved but this server could
 * not open it" — a missing `TOVU_SITE_KEY` or a ciphertext written under a different
 * site key. Both reach here as "no key", and telling an operator to save one they can plainly see
 * in the admin tab is the kind of answer that costs an afternoon.
 *
 * @complexity O(1).
 */
function describeMissingKey({ protocol, storedKeyPresent }: { protocol: ProviderProtocol; storedKeyPresent: boolean }, _optional = {}): string {
  const unopenable = storedKeyPresent
    ? " A key IS stored for this workspace but could not be decrypted — check that the server's TOVU_SITE_KEY is the same one it was saved under, then re-save the key."
    : "";
  if (protocol === "google") {
    return `site assistant is not configured — save a key on the Visitor's AI Assistant admin tab, or set GEMINI_API_KEY in the server environment.${unopenable}`;
  }
  return (
    `site assistant is configured for the "${protocol}" provider but has no usable ${protocol} key — ` +
    `save one on the Visitor's AI Assistant admin tab. GEMINI_API_KEY is a Google key and is deliberately ` +
    `not used for ${protocol}.${unopenable}`
  );
}

/** `res.status(503).json(...)`, in the one shape the site-chat widget's transport already reads off
 *  a failed `fetch()` (`site-assistant-transport.ts` reads `body.error`). Always returns `null` so
 *  each caller below is a single `return respondUnavailable(...)`. */
function respondUnavailable(
  { res, reportError, code, error }: { res: Response; reportError: SiteAssistantErrorReporter; code: string; error: unknown },
  _optional = {},
): null {
  respondPublicError({ res, status: 503, reportError, code, diagnostic: error });
  return null;
}

/** Keep JSON errors in the widget's existing body.error contract, with a stable code and lookup id. */
export function respondPublicError(
  { res, status, reportError, code, diagnostic, details }: {
    res: Response; status: number; reportError: SiteAssistantErrorReporter; code: string;
    diagnostic: unknown; details?: { retryAfterSeconds: number };
  },
  _options = {},
): void {
  const { message, ...metadata } = reportError({ code, diagnostic });
  res.status(status).json({ error: message, ...metadata, ...(details ? { details } : {}) });
}

/**
 * Resolves the provider for this turn and its key, endpoint, and model. Returns the resolved
 * config, or `null` after already writing the response.
 *
 * Every refusal here happens BEFORE `beginStream`, so it reaches the visitor as a normal JSON error
 * body with a status code rather than an SSE `error` frame — which is what lets the widget's
 * transport surface the reason through its `!response.ok` branch, and what keeps a misconfigured
 * workspace from looking like a model that answered with nothing.
 *
 * @complexity O(1) — one credential read on the configured path, plus one extra (non-decrypting)
 *   read only on the fallback path, where the row is the sole record of which provider was chosen.
 */
async function resolveProviderConfigOrRespond(
  { res, deps, env, reportError }: {
    res: Response;
    deps: RouteDeps;
    env: NodeJS.ProcessEnv;
    reportError: SiteAssistantErrorReporter;
  },
  _optional = {},
): Promise<SiteAssistantProviderConfig | null> {
  // Historical ADR-058 behavior, superseded by the owner's visitorai requirement below:
  // the SITE credential store (admin's "Visitor's AI Assistant" tab) was tried FIRST,
  // `env.GEMINI_API_KEY` second — additive over the pre-existing env-only path, never a
  // replacement (existing deployments and the E2E suite that only set the env var are
  // unaffected). `resolveSiteAssistantApiKey` never throws: a missing row, a missing master
  // secret, or a corrupt/tampered ciphertext all resolve to `null` here, logged once as a
  // warning.
  //
  // This is a DIFFERENT key from the admin's own Execution-mode BYOK key
  // (`apps/admin/src/lib/execution-settings.ts`, browser-local, powers the admin's own assistant
  // dock only) — see ADR-058's "Distinction from BYOK".
  // visitorai (owner, 2026-10-10): a stale enabled flag cannot revive a removed saved key/model
  // through the historical environment fallbacks described above.
  let credentialFailure: unknown;
  const availability = await resolvePublicAssistantAvailability({
    repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer, workspaceId: deps.workspaceId,
  }, { onCredentialFailure: ({ error }) => { credentialFailure = error; } });
  if (!availability.ready) return respondUnavailable({ res, reportError, code: availability.code, error: credentialFailure ?? availability.error });
  const stored = availability.credential;
  // Historical fallback rationale, superseded by visitorai's saved-credential requirement:
  // Read only when the key did NOT resolve. The row is then the sole surviving record of which
  // provider the operator chose, and that choice decides whether `GEMINI_API_KEY` is even an
  // eligible fallback — without it this route cannot tell "no credential at all" (Google's env key
  // is the documented answer) from "an Anthropic workspace whose key is missing or unreadable"
  // (where spending a Google key is the bug). Never decrypts, never throws (ADR-058 §4).
  return resolveProviderFromCredential({ res, env, choice: toCredentialChoice({ stored }), reportError });
}

/** The workspace's credential as the decision below needs to see it, folded from whichever of the
 *  two historical reads produced it. `apiKey` was `null` whenever the key did not open, and `keyStored` said
 *  whether one nonetheless EXISTS — the pair {@link describeMissingKey} needs to tell "never saved"
 *  from "saved but unreadable".
 *  The non-decrypting fallback read was split out purely to keep the configuration function's
 *  complexity under the shop ceiling. The saved-only gate now refuses that branch, so no second
 *  repository read remains on a visitor turn. */
export interface SiteAssistantCredentialChoice {
  readonly provider: string;
  readonly baseUrl: string | null;
  readonly model: string | null;
  readonly apiKey: string | null;
  readonly keyStored: boolean;
}

/** Folds the saved credential into one {@link SiteAssistantCredentialChoice}. Historically exactly
 *  one of two reads was non-null: `stored` when the key opened, `configured` when it did not.
 *  `getSiteAssistantCredential` already answers `"google"` for a workspace with no row at all,
 *  which was the default for the env-key path. visitorai now requires the stored key and model.
 *  @complexity O(1). */
function toCredentialChoice({ stored }: { stored: ResolvedSiteAssistantCredential }, _optional = {}): SiteAssistantCredentialChoice {
  return { provider: stored.provider, baseUrl: stored.baseUrl, model: stored.model, apiKey: stored.apiKey, keyStored: true };
}

/** Every value this route may take from the process environment for a provider turn. All three
 *  belong to the Google env-key deployment (the "no stored credential" path, where
 *  {@link getSiteAssistantCredential} answers `google`): `apiKey` <- `GEMINI_API_KEY`, `baseUrl` <-
 *  `TOVU_SITE_ASSISTANT_BASE_URL`, `model` <- `TOVU_SITE_ASSISTANT_MODEL`. A stored
 *  Anthropic/OpenAI/Azure credential must never be sent to an endpoint or model chosen for that
 *  deployment, because the endpoint receives the key (`x-api-key`, `Authorization: Bearer`,
 *  `api-key`). The key was gated to `google` here first (ed954257); the endpoint and model were
 *  not, until 2026-09-16 (t91 F3.1) — this single function is now the one place any of the three
 *  can leak from, so a future fourth env fallback cannot repeat that mistake by omission. */
export interface SiteAssistantEnvFallbacks {
  readonly apiKey: string | undefined;
  readonly baseUrl: string | undefined;
  readonly model: string | undefined;
}

const NO_ENV_FALLBACKS: SiteAssistantEnvFallbacks = { apiKey: undefined, baseUrl: undefined, model: undefined };

/** @complexity O(1). */
export function siteAssistantEnvFallbacks({ env, protocol }: { env: NodeJS.ProcessEnv; protocol: ProviderProtocol }, _optional: Record<string, never> = {}): SiteAssistantEnvFallbacks {
  if (protocol !== "google") return NO_ENV_FALLBACKS;
  return {
    apiKey: nonBlank({ value: env.GEMINI_API_KEY }),
    baseUrl: nonBlank({ value: env.TOVU_SITE_ASSISTANT_BASE_URL }),
    model: nonBlank({ value: env.TOVU_SITE_ASSISTANT_MODEL }),
  };
}

/** `value` trimmed, or `undefined` when absent or whitespace-only. @complexity O(n) in its length. */
function nonBlank({ value }: { value: string | undefined }, _optional = {}): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * The decision half of {@link resolveProviderConfigOrRespond}, separated from its I/O so every
 * branch below is directly assertable without a repo or a sealer (exported for exactly that).
 *
 * @complexity O(1).
 */
export function resolveProviderFromCredential(
  { res, env, choice, reportError }: {
    res: Response;
    env: NodeJS.ProcessEnv;
    choice: SiteAssistantCredentialChoice;
    reportError: SiteAssistantErrorReporter;
  },
  _optional = {},
): SiteAssistantProviderConfig | null {
  const protocol = toByokProtocol({ provider: choice.provider });
  if (!protocol) {
    return respondUnavailable({ res, reportError, code: "PROVIDER_UNSUPPORTED", error: `site assistant is configured for an unsupported provider "${choice.provider}" — supported providers are anthropic, openai, azure, google.` });
  }

  const envFallbacks = siteAssistantEnvFallbacks({ env, protocol });

  const apiKey = choice.apiKey ?? envFallbacks.apiKey;
  if (!apiKey) {
    return respondUnavailable({ res, reportError, code: "NOT_CONFIGURED", error: describeMissingKey({ protocol, storedKeyPresent: choice.keyStored }) });
  }

  const model = resolveModel({ protocol, storedModel: choice.model, envModel: envFallbacks.model });
  if (!model) {
    return respondUnavailable({ res, reportError, code: "MODEL_NOT_CONFIGURED", error: `site assistant is configured for the "${protocol}" provider but no model is set — choose one on the Visitor's AI Assistant admin tab (only Google has a safe default).` });
  }

  // t91 F3.1-A: a STORED baseUrl applies only together with that SAME row's stored key. `choice.apiKey`
  // is null exactly when `apiKey` above came from `envFallbacks.apiKey` (the `!apiKey` check already
  // returned when neither was set) — an env-sourced key must never be dialed against a row an admin
  // wrote, only against the matching env endpoint or the provider's own default. See
  // {@link resolveBaseUrl}'s doc for the full pairing rule.
  const usingEnvSourcedKey = choice.apiKey == null;
  const baseUrl = usingEnvSourcedKey ? envFallbacks.baseUrl : resolveBaseUrl({ storedBaseUrl: choice.baseUrl, envBaseUrl: envFallbacks.baseUrl });

  return { protocol, apiKey, baseUrl, model };
}

/**
 * Every gate `handleChat` must clear before it is allowed to call the model, run once and in a
 * fixed order, each one still able to end the request on its own (a disabled workspace, a bad
 * message, an over-budget IP, or no configured key). Consolidated into one function so
 * `handleChat` itself is a single `if (!preflight.ok) return;` rather than one `if` per gate —
 * the gates themselves are unchanged, only where they live.
 */
export async function runSiteAssistantPreflight(
  req: Request,
  res: Response,
  deps: RouteDeps,
  env: NodeJS.ProcessEnv,
  _resolution: SiteAssistantModeResolution,
  reportError: SiteAssistantErrorReporter,
  wire: VisitorChatWire,
): Promise<SiteAssistantPreflight> {
  const guard = await guardMessageAndRateLimit(req, res, deps, reportError, wire);
  if (!guard.ok) return { ok: false };

  const provider = await resolveProviderConfigOrRespond({ res, deps, env, reportError });
  if (!provider) return { ok: false };

  return { ok: true, message: guard.message, priorTurns: guard.priorTurns, provider, turnId: guard.turnId, wireIds: guard.wireIds };
}

