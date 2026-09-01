import type { AgentToolSideEffect } from "@jini-ai/cms/core";

/**
 * @file Agent-tool catalog for `features/custom-credentials` — closes the gap the admin's Access
 * Tokens "Add custom provider" form leaves open: the assistant could already SEE that a custom
 * credential (e.g. "name.com", "fly.io") is saved, but had no way to actually USE one, or (until
 * `custom_credential_list` below) even discover what labels exist without a human typing them out.
 * Three tools, all wired in this directory's sibling `tool-registrations.ts`:
 *
 * - `custom_credential_list` — added 2026-09-01. Read-back for every saved custom credential: label
 *   (the exact value the other two tools' `label` field expects — call this first to chain straight
 *   into `custom_credential_verify`/`custom_credential_make_request` without asking a human to retype
 *   a name.com or fly.io label the system already has), category, baseUrl/additionalHosts, and
 *   created/updated timestamps. Built on `store.ts`'s existing non-decrypting `listCustomCredentials`
 *   read model — never touches `sealer`/`keyring`, so it cannot fail on a misconfigured master secret
 *   and, structurally, cannot leak a token: `CustomCredentialSummary` has no field capable of carrying
 *   one (see `types.ts`'s own doc). Deliberately does NOT report the connection's `username` — unlike
 *   `baseUrl`/`category`, `username` is NOT a plaintext column; it lives inside the same sealed
 *   ciphertext as the token (`types.ts`'s `CustomProviderConnectionInput`), so surfacing it would mean
 *   decrypting every row on every list call — the exact "never touch the sealer for a read model"
 *   contract this store's own header documents twice (once for itself, once for `vendor-credentials/
 *   store.ts`). A human who needs to confirm a saved username can already see it in the admin's Access
 *   Tokens edit form.
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
 * No schema below carries a token field of any kind: the credential's own SAVED allowed-origin
 * set (`baseUrl` plus any `additionalHosts` — set by a human through the Access Tokens form, never by
 * any tool call) is the per-credential host allowlist a caller-supplied `url`'s origin is checked
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
  "The exact display name of a saved custom credential, from the admin's Access Tokens page 'Add custom provider' section (e.g. 'name.com', 'fly.io'). Case-sensitive — must match exactly. If unsure of the exact label, call custom_credential_list rather than guessing.";

/** No arguments — parameterless read tool. Same shape every other domain's own `NO_INPUT_SCHEMA`
 *  declares (see e.g. `deployments/publish-agent-tools.ts`'s own copy) — declared locally rather than
 *  shared, per this codebase's "duplicate the tiny type, never share across features/files"
 *  convention (this file's own header cites `publish-agent-tools.ts`'s `AgentToolDefinition` doc for
 *  the same reasoning). */
const LIST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {},
} as const;

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
    name: "custom_credential_list",
    description:
      "THIS IS HOW TO DISCOVER SAVED CREDENTIALS BEFORE MAKING AN OUTBOUND REQUEST. Call this FIRST — before reaching for a shell command like curl/wget/httpie — any time a task touches a domain name, DNS record, domain registrar, hosting account, deployment target, or any other third-party API: there may already be a saved credential for it, and using one through custom_credential_make_request is both less work and safer than a raw shell request (the real token never reaches you or a shell either way). Lists every custom provider credential saved in this workspace's Access Tokens page ('Add custom provider' section — e.g. name.com, fly.io, or any other registrar/host/deployment/API provider a human has connected). Answers questions like 'what credentials are saved', 'what API keys or tokens do I have', 'do I have a name.com token', 'what did I save for fly.io', 'what third-party accounts are connected', or 'what can I use instead of curl for this'. For each one, returns: label (the exact value to pass as 'label' to custom_credential_verify or custom_credential_make_request — both take the SAME identifier shape, so you can go list → verify → call without guessing or asking the human to retype a name they already entered once), category (source-control, hosting, media, ai, ops, or general), baseUrl and additionalHosts (the credential's own saved allowlist — the only hosts custom_credential_make_request will let a request reach), configured (always true for this table — every saved row has a secret; there is no 'saved but empty' state here), and createdAt/updatedAt. Never returns a token, secret, or any part of one — this tool has no field capable of carrying one. Does NOT return a saved 'username', even when one was set at save time: unlike baseUrl/category, username is not a plaintext column on this table — it lives inside the same encrypted blob as the token, so exposing it here would mean decrypting every saved credential on every list call; if you need to confirm a saved username, tell the human to check the Access Tokens edit form. Returns an empty list, not an error, when nothing is saved yet — that IS the signal to fall back to a shell command or ask the human to save one first.",
    sideEffects: "none",
    authorization: { permission: "custom-credentials.read" },
    inputSchema: LIST_SCHEMA,
  },
  {
    name: "custom_credential_verify",
    description:
      "Checks whether a saved API key or token still works — 'is my fly.io token still valid', 'check if this API key works', 'test my saved credential', 'has my name.com token expired'. Checks ONE saved custom provider credential (Access Tokens page → 'Add custom provider', e.g. name.com, fly.io, or any other registrar/host/deployment provider) against its own real API, live, right now: makes one bounded, read-only, authenticated GET to the credential's own saved base URL and reports 'valid' (the provider accepted it), 'invalid' (the provider rejected it — expired, revoked, or wrong scopes), or 'unreachable' (a network failure, timeout, or an ambiguous response — this does NOT mean the credential is bad, try again or check network access). Never exposes the token, and never returns the provider's response body — only the tri-state result plus a human-readable message. If you don't already know the exact saved label, call custom_credential_list first rather than guessing or asking the human to retype one. Call this before custom_credential_make_request if you are not already confident the credential works, or whenever a human asks whether a saved custom credential is still good.",
    sideEffects: "none",
    authorization: { permission: "custom-credentials.read" },
    inputSchema: VERIFY_SCHEMA,
  },
  {
    name: "custom_credential_make_request",
    description:
      "THIS IS HOW TO CALL A THIRD-PARTY API — a DNS registrar, hosting account, deployment target, or any other saved custom provider — USING A SAVED CREDENTIAL, instead of a raw shell command (curl/wget/httpie/etc). Reach for this whenever the target might have a saved credential (call custom_credential_list first if you don't already know the exact saved label); a raw curl through Bash bypasses this entirely and either fails outright or forces you to find and paste a token by hand, which this tool exists specifically to avoid. Makes an authenticated GET/POST/PUT/PATCH/DELETE request to a saved custom provider credential's own API (Access Tokens page → 'Add custom provider', e.g. name.com, fly.io — DNS records, certs, apps, machines, deployments, any endpoint that credential's saved base URL/additionalHosts cover) and returns the real response ({status, headers, bodyText}) — full parity with what a human operating this credential could already do from a terminal or the provider's own console. The server resolves the saved credential and injects its Authorization header itself — you name a label (the SAME identifier custom_credential_list returns and custom_credential_verify accepts) and a full URL (never a token), and the token never appears anywhere in this tool's input or output. The target URL's host must be one of this credential's own saved hosts; anything else is refused before any request is sent (see the 'url' field). DELETE is human-gated: this ONE call shows an interactive confirmation naming the label, resolved host, method, and path, and WAITS — it does not return until the human answers. If confirmed, the SAME call performs the DELETE and returns {executed: true, status, headers, bodyText}; if declined or unanswered it returns {executed: false, cancelled, reason?} and nothing is sent. GET/POST/PUT/PATCH return {executed: true, status, headers, bodyText} immediately, with no confirmation. Bounded: one request, a short timeout, a capped response size, and a capped request body size — do not rely on this for a large upload or download. If the label does not match a saved credential, or the url's host is not on the credential's saved list, this call is refused with a clear reason before any network request is made.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "custom-credentials.write" },
    inputSchema: MAKE_REQUEST_SCHEMA,
  },
];
