import { resolveSiteAssistantApiKey } from "#src/assistant/index";
import type { AssistantExecutionRouteDeps } from "./execution-deps";

/**
 * @file The single chokepoint deciding WHICH key a BYOK probe sends and WHERE it sends it, shared by
 * `test-connection.ts` and `list-models.ts`.
 *
 * ## The boundary this exists to hold
 *
 * ADR-058 makes the SITE credential write-only: `get-site-credential.ts` returns `isSet` + `masked`
 * and never the key, so not even an `admin.assistant.manage` holder can read back a key someone else
 * saved. Both probe routes then take `useStoredCredential: true`, decrypt that key server-side, and
 * make one outbound call with it.
 *
 * Those two facts are only compatible if the CALLER cannot choose the destination. Before this
 * module they could: `baseUrl` came from the request body, so a single authenticated request could
 * name any host and have the server deliver the decrypted key to it — turning a write-only secret
 * into a readable one, silently, with nothing persisted and nothing to notice afterwards.
 *
 * The SSRF guard in `@jini-ai/agent-runtime`'s `connection-guard.ts` does not close this and was
 * never meant to. It blocks loopback/RFC1918/link-local/CGNAT/multicast — *internal* address space,
 * to stop a caller pivoting into the server's own network. A public host an attacker controls is
 * exactly what it is designed to let through, because that is what every real provider is.
 *
 * ## The rule
 *
 * A key the caller supplied goes wherever the caller says. It is their secret, typed into their own
 * form; sending it to a host they named is the operation they asked for, and `AiAssistant.tsx`'s
 * `runKeyTest` documents that consent explicitly.
 *
 * A key the caller CANNOT read goes only where the server already recorded it belongs. The stored
 * row carries its own `baseUrl` (`site-credential-store.ts`'s `ResolvedSiteAssistantCredential`);
 * that value, not the request body's, is what reaches the wire. The distinction is consent: an
 * operator can consent with their own credential and cannot consent with one they have never seen.
 *
 * ## Why a mismatch is a 400 rather than a silent substitution
 *
 * Both are equally safe — either way the caller's string never reaches the network. Rejecting is
 * chosen because substituting would make the probe answer a question nobody asked: an operator who
 * switched the endpoint field to Anthropic and pressed "Test connection" would get a green result
 * measured against the stored Google endpoint, and reasonably read it as "Anthropic works". A 400
 * naming both endpoints is the honest answer, and it is also the correct one on the merits — a key
 * issued for one provider cannot meaningfully be probed against another. Type a key for the new
 * endpoint, or save the endpoint first.
 *
 * ## What this deliberately does NOT close
 *
 * `put-site-credential.ts` lets the same `admin.assistant.manage` principal write `baseUrl`. Such a
 * principal can therefore still point the stored credential at a host they control and have the key
 * delivered there. That path is not silent the way this one was: it persists, `get-site-credential`
 * reports it back, it shows in the admin UI, and it breaks the live visitor assistant
 * (`server/modules/site-assistant.ts` uses the same stored endpoint) — so it is self-revealing where
 * a body parameter left no trace at all. Closing it properly means constraining which endpoints may
 * be STORED, which is an allow-list and a product decision: `connection-guard.ts` deliberately
 * permits loopback for local Ollama, and real deployments point at custom gateways. That belongs in
 * the credential-write route with an explicit policy, not smuggled in here.
 */

/** Mirrors `connection-guard.ts`'s own `validateBaseUrl` normalization (`trim()` then strip trailing
 *  slashes) so this comparison agrees with the string the guard would actually parse — a stored
 *  `"https://x/"` and a requested `"https://x"` are the same endpoint and must not read as a
 *  mismatch. Deliberately does NOT lowercase: a URL's host is case-insensitive but its path is not,
 *  and folding case here would let `/V1` and `/v1` compare equal. */
function normalizeEndpoint(baseUrl: string): string {
  return String(baseUrl).trim().replace(/\/+$/, "");
}

export interface ProbeCredentialRejection {
  error: string;
  code: "STORED_CREDENTIAL_ENDPOINT_UNSET" | "STORED_CREDENTIAL_ENDPOINT_MISMATCH";
}

export type ProbeCredentialResolution =
  | { ok: true; apiKey: string; baseUrl: string }
  | { ok: false; failure: ProbeCredentialRejection };

export interface ResolveProbeCredentialInput {
  /** The endpoint from the request body. Used as-is for a caller-supplied key; used only as a
   *  equality check against the stored endpoint when the stored key is in play. */
  requestedBaseUrl: string;
  /** The key from the request body, if any. Non-empty always wins — see this file's header. */
  typedKey: string;
  /** `body.useStoredCredential === true`, already narrowed by the caller. Must stay an explicit
   *  opt-in and never be softened to "empty key ⇒ use the stored one": these routes are shared with
   *  Settings → Execution mode, whose key is a DIFFERENT credential (the admin's own, browser-local),
   *  and an implicit fallback would let an operator with an empty field silently probe with the
   *  visitor credential. */
  useStoredCredential: boolean;
}

/**
 * Resolves the `(apiKey, baseUrl)` pair a probe should actually use, or the rejection to return.
 *
 * @returns `ok: true` with the exact values to hand to `@jini-ai/agent-runtime`. When the stored
 * credential is used, `baseUrl` is the SERVER's own stored string rather than the caller's — the two
 * are known equal by then, so this changes no behavior, but it means the bytes on the wire are the
 * ones the server approved. Same pin-what-you-validated discipline `connection-guard.ts`'s
 * `pinnedFetch` applies to the resolved address.
 *
 * A missing row, an unset key, a missing master secret and a corrupt ciphertext all arrive from
 * `resolveSiteAssistantApiKey` as `null` and are treated identically to "no stored key": the probe
 * proceeds with an empty key against the requested endpoint, letting the provider return its own
 * auth error, which is a truer message than a synthesized one. Nothing is exposed by that path —
 * there is no secret to protect in any of those cases.
 *
 * @complexity O(1) — at most one repo read plus one decrypt. No unbounded collection, no per-item
 * I/O, no caller-controlled iteration: the resource-bounds pre-check has nothing to cap here.
 * @overallScore 100
 */
export async function resolveProbeCredential(
  deps: AssistantExecutionRouteDeps,
  input: ResolveProbeCredentialInput
): Promise<ProbeCredentialResolution> {
  if (input.typedKey.trim()) {
    return { ok: true, apiKey: input.typedKey, baseUrl: input.requestedBaseUrl };
  }
  if (!input.useStoredCredential) {
    return { ok: true, apiKey: "", baseUrl: input.requestedBaseUrl };
  }

  const stored = await resolveSiteAssistantApiKey(
    { repo: deps.siteAssistantCredentialRepo, sealer: deps.siteAssistantSecretSealer },
    { workspaceId: deps.workspaceId }
  );
  if (!stored) {
    return { ok: true, apiKey: "", baseUrl: input.requestedBaseUrl };
  }

  if (!stored.baseUrl?.trim()) {
    return {
      ok: false,
      failure: {
        error:
          "the stored site assistant credential has no saved endpoint, so this probe has no approved destination — save a base URL for the credential first, or supply an apiKey in this request",
        code: "STORED_CREDENTIAL_ENDPOINT_UNSET",
      },
    };
  }

  if (normalizeEndpoint(stored.baseUrl) !== normalizeEndpoint(input.requestedBaseUrl)) {
    return {
      ok: false,
      failure: {
        // Naming the stored endpoint leaks nothing: `get-site-credential.ts` already returns
        // `baseUrl` in full to this exact permission. Only the key is write-only.
        error: `the stored site assistant credential is saved for '${stored.baseUrl}' and cannot be probed against '${input.requestedBaseUrl}' — save the new endpoint first, or supply an apiKey for it in this request`,
        code: "STORED_CREDENTIAL_ENDPOINT_MISMATCH",
      },
    };
  }

  return { ok: true, apiKey: stored.apiKey, baseUrl: stored.baseUrl };
}
