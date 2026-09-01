import type { AgentToolSideEffect } from "@jini-ai/cms/core";

/**
 * @file Agent-tool catalog for `features/custom-credentials` — closes the gap the admin's Access
 * Tokens "Add custom provider" form leaves open: the assistant could already SEE that a custom
 * credential (e.g. "name.com", "fly.io") is saved, but had no way to actually USE one. Two tools,
 * both wired in this directory's sibling `tool-registrations.ts`:
 *
 * - `custom_credential_verify` — checks ONE saved credential against its own real provider, live,
 *   and reports valid/invalid/unreachable.
 * - `custom_credential_make_request` — an authenticated GET/POST/PUT/PATCH/DELETE through a saved
 *   credential, at parity with what a human can already do from the site itself (2026-08-31 owner
 *   override — an earlier revision restricted this to GET only; see `credentialed-request.ts`'s
 *   header for the full history). DELETE is the one verb gated behind an in-chat confirmation
 *   (`tool-registrations.ts`'s handler) — the owner's own call: "the only thing we maybe should be
 *   worried about is deletion, but we can gate that with MCP-UI." GET/POST/PUT/PATCH run immediately,
 *   no ceremony, matching what a human can already do from the browser.
 *
 * Neither schema below carries a token field of any kind: the credential's own SAVED allowed-origin
 * set (`baseUrl` plus any `additionalHosts` — set by a human through the Access Tokens form, never by
 * either tool call) is the per-credential host allowlist a caller-supplied `url`'s origin is checked
 * against, and the real Authorization header is injected server-side — see `credentialed-request.ts`'s
 * header, "Security design", for the full reasoning.
 *
 * Architectural role: `features/custom-credentials` domain logic. No dependencies.
 */

/** Local declaration, not shared — same "duplicate the tiny type, never share across
 *  features/files" convention `features/deployments/publish-agent-tools.ts`'s own
 *  `AgentToolDefinition` doc establishes. */
export interface AgentToolDefinition {
  name: string;
  description: string;
  sideEffects: AgentToolSideEffect;
  authorization: { permission: string };
  inputSchema?: Readonly<Record<string, unknown>>;
}

const LABEL_FIELD_DESCRIPTION =
  "The exact display name of a saved custom credential, from the admin's Access Tokens page 'Add custom provider' section (e.g. 'name.com', 'fly.io'). Case-sensitive — must match exactly. If unsure of the exact label, ask the human rather than guessing.";

const VERIFY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label"],
  properties: {
    label: { type: "string", description: LABEL_FIELD_DESCRIPTION },
  },
} as const;

const MAKE_REQUEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "method", "url"],
  properties: {
    label: { type: "string", description: LABEL_FIELD_DESCRIPTION },
    method: {
      type: "string",
      enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      description:
        "HTTP method. All five are supported. DELETE shows the human an in-chat confirmation naming the label, host, method, and path before it actually runs — this ONE call raises the dialog and waits, then completes once answered; there is no second call to make. GET/POST/PUT/PATCH run immediately with no confirmation, matching what a human can already do from the site.",
    },
    url: {
      type: "string",
      description:
        "A FULL absolute URL (e.g. 'https://api.fly.io/v1/apps/my-app'), not a bare path. Its host MUST be one of this credential's saved hosts (its base URL, or one of its saved additional hosts, e.g. a fly.io credential saved with both api.fly.io and api.machines.dev) — a URL naming any other host is refused before any request is sent, and the error names which hosts ARE allowed for this credential if you guess wrong. The credential's own saved hosts are never sent to you otherwise, so if you don't already know them, try once and read the error, or ask the human which host to use.",
    },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
      description:
        "Optional extra request headers (e.g. 'Accept', 'Content-Type'). Do not set 'Authorization', 'Cookie', 'Host', or 'Proxy-Authorization' — the server injects the real credential's own Authorization header itself and refuses a call that tries to set any of these.",
    },
    body: {
      type: "string",
      description:
        "Optional request body, sent exactly as given (e.g. a JSON string for a 'Content-Type: application/json' request). Omit for a request with no body. Bounded in size — a very large body is refused.",
    },
  },
} as const;

/**
 * This domain's fixed agent-tool catalog.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const customCredentialsAgentToolCatalog: AgentToolDefinition[] = [
  {
    name: "custom_credential_verify",
    description:
      "Checks ONE saved custom provider credential (Access Tokens page → 'Add custom provider', e.g. name.com, fly.io) against its own real API, live, right now: makes one bounded, read-only, authenticated GET to the credential's own saved base URL and reports 'valid' (the provider accepted it), 'invalid' (the provider rejected it — expired, revoked, or wrong scopes), or 'unreachable' (a network failure, timeout, or an ambiguous response — this does NOT mean the credential is bad, try again or check network access). Never exposes the token, and never returns the provider's response body — only the tri-state result plus a human-readable message. Call this before custom_credential_make_request if you are not already confident the credential works, or whenever a human asks whether a saved custom credential is still good.",
    sideEffects: "none",
    authorization: { permission: "custom-credentials.read" },
    inputSchema: VERIFY_SCHEMA,
  },
  {
    name: "custom_credential_make_request",
    description:
      "Makes an authenticated GET/POST/PUT/PATCH/DELETE request to a saved custom provider credential's own API (Access Tokens page → 'Add custom provider', e.g. name.com, fly.io) and returns the real response ({status, headers, bodyText}) — full parity with what a human operating this credential could already do from a terminal or the provider's own console. The server resolves the saved credential and injects its Authorization header itself — you name a label and a full URL (never a token), and the token never appears anywhere in this tool's input or output. The target URL's host must be one of this credential's own saved hosts; anything else is refused before any request is sent (see the 'url' field). DELETE is human-gated: this ONE call shows an interactive confirmation naming the label, resolved host, method, and path, and WAITS — it does not return until the human answers. If confirmed, the SAME call performs the DELETE and returns {executed: true, status, headers, bodyText}; if declined or unanswered it returns {executed: false, cancelled, reason?} and nothing is sent. GET/POST/PUT/PATCH return {executed: true, status, headers, bodyText} immediately, with no confirmation. Bounded: one request, a short timeout, a capped response size, and a capped request body size — do not rely on this for a large upload or download. If the label does not match a saved credential, or the url's host is not on the credential's saved list, this call is refused with a clear reason before any network request is made.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "custom-credentials.write" },
    inputSchema: MAKE_REQUEST_SCHEMA,
  },
];
