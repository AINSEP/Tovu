import type { AgentToolSideEffect } from "@jini-ai/cms/core";

/**
 * @file Agent-tool catalog for `features/custom-credentials` — closes the gap the admin's Access
 * Tokens "Add custom provider" form leaves open: the assistant could already SEE that a custom
 * credential (e.g. "name.com", "fly.io") is saved, but had no way to actually USE one. Two tools,
 * both wired in this directory's sibling `tool-registrations.ts`:
 *
 * - `custom_credential_verify` — checks ONE saved credential against its own real provider, live,
 *   and reports valid/invalid/unreachable.
 * - `custom_credential_make_request` — an authenticated GET through a saved credential.
 *
 * Both are GET-only in this slice — see `credentialed-request.ts`'s header for why write methods
 * are a deliberate, disclosed omission.
 *
 * Neither schema below carries a token, host, or full-URL field of any kind: the credential's own
 * SAVED `baseUrl` (set by a human through the Access Tokens form, never by either tool call) is the
 * per-credential host allowlist, and the real Authorization header is injected server-side — see
 * `credentialed-request.ts`'s header, "Security design", for the full reasoning.
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
  required: ["label", "method", "path"],
  properties: {
    label: { type: "string", description: LABEL_FIELD_DESCRIPTION },
    method: {
      type: "string",
      enum: ["GET"],
      description: "HTTP method. Only 'GET' is supported today — write methods (POST/PUT/PATCH/DELETE) are not wired yet, so any other value is refused.",
    },
    path: {
      type: "string",
      description:
        "A path relative to this credential's own saved API base URL, starting with exactly one '/' — e.g. '/v4/domains' or '/v1/apps/my-app'. Never a full URL and never a different host: this call always goes to the exact host saved on the credential, and a path that looks like it names a scheme, host, or '//' is refused outright before any request is sent.",
    },
    headers: {
      type: "object",
      additionalProperties: { type: "string" },
      description:
        "Optional extra request headers (e.g. 'Accept'). Do not set 'Authorization', 'Cookie', 'Host', or 'Proxy-Authorization' — the server injects the real credential's own Authorization header itself and refuses a call that tries to set any of these.",
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
      "Makes an authenticated GET request to a saved custom provider credential's own API (Access Tokens page → 'Add custom provider', e.g. name.com, fly.io) and returns the real response ({status, headers, bodyText}). The server resolves the saved credential and injects its Authorization header itself — you name a label and a path, never a token, host, or full URL, and the token never appears anywhere in this tool's input or output. The request always goes to the exact host saved on that credential; it can never be redirected elsewhere. Only 'GET' is supported today (see the 'method' field) — write methods are not wired yet. Bounded: one request, a short timeout, and a capped response size — do not rely on this for a large download. If the label does not match a saved credential, or the path looks like it names a different host, this call is refused with a clear reason before any network request is made.",
    sideEffects: "none",
    authorization: { permission: "custom-credentials.read" },
    inputSchema: MAKE_REQUEST_SCHEMA,
  },
];
