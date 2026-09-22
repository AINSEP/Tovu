import type { AgentToolSideEffect } from "@jini-ai/cms/core";

import { CUSTOM_CREDENTIAL_CATEGORIES } from "./types.js";
import { WRITE_FILES_LIMITS } from "./write-files-validation.js";

/**
 * @file Agent-tool catalog for `features/custom-credentials` — closes the gap the admin's Access
 * Tokens "Add custom provider" form leaves open: the assistant could already SEE that a custom
 * credential (e.g. "name.com", "fly.io") is saved, but had no way to actually USE one, or (until
 * `content_read.custom_credential` below) even discover what labels exist without a human typing them out.
 * Six tools, all wired in this directory's sibling `tool-registrations.ts`:
 *
 * - `content_read.custom_credential` — added 2026-09-01. Read-back for every saved custom credential: label
 *   (the exact value the other three tools' `label` field expects — call this first to chain straight
 *   into `custom_credential_verify`/`custom_credential_make_request`/`custom_credential_set_username`
 *   without asking a human to retype a name.com or fly.io label the system already has), category,
 *   baseUrl/additionalHosts, and created/updated timestamps. Built on `store.ts`'s existing
 *   non-decrypting `listCustomCredentials` read model — never touches `sealer`/`keyring`, so it cannot
 *   fail on a misconfigured master secret and, structurally, cannot leak a token:
 *   `CustomCredentialSummary` has no field capable of carrying one (see `types.ts`'s own doc). Also
 *   reports the credential's `username` when it has one (2026-09-01). That was NOT true when this tool
 *   shipped: `username` used to live inside the same sealed ciphertext as the token, so surfacing it
 *   would have meant decrypting every row on every list call — the exact "never touch the sealer for a
 *   read model" contract this store's own header documents twice. The fix was to move the field rather
 *   than to widen the tool: a username is an account identifier, not a secret, so it now has its own
 *   plaintext column beside `base_url` (`db/schema.sqlite.ts`'s `customCredentialSets.username`) and this tool
 *   reads it with zero decrypts, exactly like `category`/`baseUrl`. The token remains sealed and
 *   remains unreachable from here.
 * - `custom_credential_verify` — checks ONE saved credential against its own real provider, live, and
 *   reports valid/invalid/unreachable. A 401/403 ("invalid") result carries `authDiagnostic` (see
 *   `credentialed-request.ts`'s header, "Authentication-failure diagnostics") — read it before
 *   reporting a bare failure back to the human; see `custom_credential_set_username` below for the fix
 *   half of that diagnosis.
 * - `custom_credential_make_request` — an authenticated GET/POST/PUT/PATCH/DELETE through a saved
 *   credential, at parity with what a human can already do from the site itself (2026-08-31 owner
 *   override — an earlier revision restricted this to GET only; see `credentialed-request.ts`'s
 *   header for the full history). DELETE is the one verb gated behind an in-chat confirmation
 *   (`tool-registrations.ts`'s handler) — the owner's own call: "the only thing we maybe should be
 *   worried about is deletion, but we can gate that with MCP-UI." GET/POST/PUT/PATCH run immediately,
 *   no ceremony, matching what a human can already do from the browser. A 401/403 executed result
 *   ALSO carries `authDiagnostic`, for the identical reason.
 * - `custom_credential_set_username` — added 2026-09-01, the FIX half of the diagnostic the two tools
 *   above now carry: sets (or, with `username: null`, clears) ONLY the plaintext `username` column on
 *   one saved credential, so the assistant can close the loop in-chat ("ask the human for the missing
 *   username, save it, retry") instead of telling them to go edit Access Tokens by hand. Structurally
 *   cannot accept, read, or write a token — see `tool-registrations.ts`'s
 *   `rejectUnexpectedSetUsernameFields` for the enforcement, and that file's header for why this is the
 *   one write tool in this domain left un-confirmed on top of DELETE.
 * - `custom_credential_set_token` — added 2026-09-01, an MCP-UI surface for setting or rotating a
 *   saved credential's TOKEN itself, holding up the governing rule this whole domain now follows: not
 *   "an agent must never write a token" but "a token must never pass through the model's context". The
 *   model supplies only `label` — its input schema has no token-shaped field at all (see
 *   `SET_TOKEN_SCHEMA` below) — and the handler opens an interactive form the HUMAN types the token
 *   into directly; that keystroke travels browser -> `mcp-ui-tool-calls-route.ts` ->
 *   `SurfaceExchangeStore` -> the parked handler, and is sealed via `store.ts`'s existing
 *   `updateCustomCredential({..., connection})`, never touching the spawned agent CLI's stdio and
 *   therefore never reaching the model, the chat transcript, or `agent_tool_attempts`' audit detail.
 *   The tool's own result is value-free by construction (`{saved: true}` or `{saved: false, reason}`)
 *   — see `tool-registrations.ts`'s `handleSetTokenAnswer` and `custom-credential-set-token-ui.ts`'s
 *   header for the full mechanism, including why it uses `askThenReport` rather than `askOnce`.
 * - `custom_credential_create` — added 2026-09-03, closing the gap `custom_credential_set_token`
 *   itself cannot close: that tool can only ROTATE a token on a credential that already exists (it
 *   resolves an existing row by `label` before ever opening its form), so an agent that found no saved
 *   credential for a provider had no way to finish the job in chat — it had to dead-end the human with
 *   directions to Admin -> Access Tokens -> "Add custom provider" instead. This tool is that missing
 *   capability: the model may optionally supply `label`/`baseUrl`/`category` as non-secret PRE-FILL
 *   hints (e.g. from earlier in the conversation), and the handler opens an interactive form
 *   collecting those three fields plus an optional username and the token itself — the SAME
 *   "token never passes through the model's context" mechanism `custom_credential_set_token` uses,
 *   driven by the same `askThenReport` for the same reason (see `custom-credential-create-ui.ts`'s
 *   header). A submitted label that collides with an existing saved credential is refused outright —
 *   this tool creates ONLY new rows, never overwrites one, and its refusal message names
 *   `custom_credential_set_token` as the correct tool for a rotation instead. On success, returns the
 *   SAME summary shape `content_read.custom_credential` does (safe in full — see that tool's own bullet above
 *   for why `CustomCredentialSummary` can never carry a token) — never the token itself.
 * - `custom_credential_write_files` — added 2026-09-09, a general-purpose, human-confirmed multi-file
 *   commit through a saved credential (e.g. the `tovu-deploy-fly` plugin's `fly.toml` +
 *   `.github/workflows/fly-deploy.yml`, but not hardcoded to that pair — any future caller can write
 *   any named files). Unlike `custom_credential_make_request`, EVERY call is gated: the dialog names
 *   the credential, repository, branch, and every path being written (each labeled create or update,
 *   resolved against the branch's real current state before the dialog is ever shown), with an extra,
 *   more prominent warning for any `.github/workflows/**` path. Confirmed writes land as ONE atomic
 *   commit built on the branch's current tree — see `tool-registrations.ts`'s own header for the full
 *   design and why neither existing write path (`source_control_execute_commit`'s separate credential
 *   table, or `make_request`'s un-gated POST/PUT/PATCH) fit this job.
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
  "The exact display name of a saved custom credential, from the admin's Access Tokens page 'Add custom provider' section (e.g. 'name.com', 'fly.io'). Case-sensitive — must match exactly. If unsure of the exact label, call content_read.custom_credential rather than guessing.";

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
        "A FULL absolute URL (e.g. 'https://api.fly.io/v1/apps/my-app'), not a bare path. Its host MUST be one of this credential's saved hosts (its base URL, or one of its saved additional hosts, e.g. a fly.io credential saved with both api.fly.io and api.machines.dev) — a URL naming any other host is refused before any request is sent, and the error names which hosts ARE allowed for this credential if you guess wrong. If you don't already know them, call content_read.custom_credential first: each credential's baseUrl (its scheme and host) and additionalHosts there are the hosts allowed here.",
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

const SET_USERNAME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "username"],
  properties: {
    label: { type: "string", description: LABEL_FIELD_DESCRIPTION },
    username: {
      type: ["string", "null"],
      description:
        "The account username/login to save for this credential (e.g. an email address or account handle) — an account identifier, never a secret. Pass null to explicitly clear a previously saved username. This field is REQUIRED on every call (there is no 'leave unchanged' — call this tool only when you actually mean to set or clear it). Do NOT pass a token, API key, password, or any other secret here: this tool has no field capable of accepting one, and a call naming any field other than 'label'/'username' is refused outright.",
    },
  },
} as const;

/** `custom_credential_set_token`'s ENTIRE input shape — `label` only. There is no `token` property to
 *  fill in, mistakenly or otherwise: the schema itself is the first of two independent enforcement
 *  layers (`tool-registrations.ts`'s `rejectUnexpectedSetTokenFields` is the second, since a JSON
 *  Schema's `additionalProperties: false` is descriptive only — the kernel neither parses nor
 *  validates a tool's schema, per `@jini-ai/core`'s own `ToolDescriptor.inputSchema` doc). */
const SET_TOKEN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label"],
  properties: {
    label: { type: "string", description: LABEL_FIELD_DESCRIPTION },
  },
} as const;

/** `custom_credential_create`'s entire input shape — three OPTIONAL, non-secret pre-fill hints, no
 *  required field at all (a call with none of them is valid; the human fills in everything on the
 *  form). There is no `token`/`username`/`connection` property to fill in, mistakenly or otherwise —
 *  the same two-layer guarantee `SET_TOKEN_SCHEMA`'s own doc gives (JSON Schema's
 *  `additionalProperties: false` is descriptive only, per `@jini-ai/core`'s own
 *  `ToolDescriptor.inputSchema` doc) — this schema simply has no field capable of carrying one in the
 *  first place. */
const CREATE_CREDENTIAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [],
  properties: {
    label: {
      type: "string",
      description:
        "Optional pre-fill hint for the form's Label field — the display name to save this credential under (e.g. 'github', 'fly.io'), from earlier in the conversation. Non-secret; the human can change it before submitting. Must be unique in this workspace — a submitted label that collides with an existing saved credential is refused, and the refusal names custom_credential_set_token as the tool to use instead (this tool only creates NEW credentials, it never overwrites one).",
    },
    baseUrl: {
      type: "string",
      description: "Optional pre-fill hint for the form's Base URL field (e.g. 'https://api.github.com'). Non-secret.",
    },
    category: {
      type: "string",
      enum: [...CUSTOM_CREDENTIAL_CATEGORIES],
      description: `Optional pre-fill hint for the form's Category field — one of: ${CUSTOM_CREDENTIAL_CATEGORIES.join(", ")}.`,
    },
  },
} as const;

/** `custom_credential_write_files`'s entire input shape. `files.maxItems` is bound to the SAME
 *  `WRITE_FILES_LIMITS.maxFiles` cap `write-files-validation.ts` actually enforces, so the schema the
 *  model sees can never silently drift from the real cap. */
const WRITE_FILES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["label", "owner", "repo", "branch", "commitMessage", "files"],
  properties: {
    label: { type: "string", description: LABEL_FIELD_DESCRIPTION },
    owner: { type: "string", description: "The GitHub owner or organization name that owns the target repository (e.g. 'octocat')." },
    repo: { type: "string", description: "The GitHub repository name, without the owner prefix (e.g. 'my-site')." },
    branch: {
      type: "string",
      description:
        "The exact branch to commit onto. This branch MUST already exist — this tool never creates one. It does NOT default to the repository's default branch, so name it explicitly (ask the human, or check with custom_credential_make_request first, if unsure).",
    },
    commitMessage: { type: "string", description: "The git commit message for this write, 1-500 characters." },
    files: {
      type: "array",
      minItems: 1,
      maxItems: WRITE_FILES_LIMITS.maxFiles,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: {
            type: "string",
            description:
              "A repository-relative file path (e.g. 'fly.toml', '.github/workflows/fly-deploy.yml'). Never absolute, never containing a '..' segment, and never naming or nesting under the reserved '.git' directory — any of those is refused before anything is written.",
          },
          content: {
            type: "string",
            description: `The file's exact new text content, written verbatim. Capped at ${WRITE_FILES_LIMITS.maxFileBytes} bytes per file and ${WRITE_FILES_LIMITS.maxTotalBytes} bytes across all files in one call.`,
          },
        },
      },
      description: `1-${WRITE_FILES_LIMITS.maxFiles} files to write in one atomic commit. Every path is shown to the human in the confirmation dialog before anything is written.`,
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
      "THIS IS HOW TO DISCOVER SAVED CREDENTIALS BEFORE MAKING AN OUTBOUND REQUEST. Call this FIRST — before reaching for a shell command like curl/wget/httpie — any time a task touches a domain name, DNS record, domain registrar, hosting account, deployment target, or any other third-party API: there may already be a saved credential for it, and using one through custom_credential_make_request is both less work and safer than a raw shell request (the real token never reaches you or a shell either way). Lists every custom provider credential saved in this workspace's Access Tokens page ('Add custom provider' section — e.g. name.com, fly.io, or any other registrar/host/deployment/API provider a human has connected). Answers questions like 'what credentials are saved', 'what API keys or tokens do I have', 'do I have a name.com token', 'what did I save for fly.io', 'what third-party accounts are connected', or 'what can I use instead of curl for this'. For each one, returns: id, label (the exact value to pass as 'label' to custom_credential_verify or custom_credential_make_request — both take the SAME identifier shape, so you can go list → verify → call without guessing or asking the human to retype a name they already entered once), category (source-control, hosting, media, ai, ops, or general), baseUrl and additionalHosts (the credential's own saved allowlist — the only hosts custom_credential_make_request will let a request reach), username (the saved account login, e.g. an email address or handle — an account identifier, not a secret; the field is absent when none is saved), configured (always true for this table — every saved row has a secret; there is no 'saved but empty' state here), and createdAt/updatedAt. Never returns a token, secret, or any part of one — this tool has no field capable of carrying one. Returns an empty list, not an error, when nothing is saved yet — that IS the signal to fall back to a shell command or ask the human to save one first.",
    sideEffects: "none",
    authorization: { permission: "custom-credentials.read" },
    inputSchema: LIST_SCHEMA,
  },
  {
    name: "custom_credential_verify",
    description:
      "Checks whether a saved API key or token still works — 'is my fly.io token still valid', 'check if this API key works', 'test my saved credential', 'has my name.com token expired'. Checks ONE saved custom provider credential (Access Tokens page → 'Add custom provider', e.g. name.com, fly.io, or any other registrar/host/deployment provider) against its own real API, live, right now: makes one bounded, read-only, authenticated GET to the credential's own saved base URL and reports 'valid' (the provider accepted it), 'invalid' (the provider rejected it — expired, revoked, or wrong scopes), or 'unreachable' (a network failure, timeout, or an ambiguous response — this does NOT mean the credential is bad, try again or check network access). An 'invalid' result ALSO carries an 'authDiagnostic' field ({schemeSent: 'Basic'|'Bearer', usernameStored: boolean, hint?, remedyToolId?}): ONLY on a 401, when schemeSent is 'Bearer' and usernameStored is false, 'hint' names the one honest, narrow guess this tool can make — this provider may need HTTP Basic with a saved username, and none is saved. That is a hypothesis to try, not a diagnosis: ask the human for the username (e.g. via assistant_ask_choice), save it with custom_credential_set_username, then retry ONCE — never more, and never invent a username. There is no hint when usernameStored is already true (a different, unguessable cause), and there is no hint on a 403 at all, regardless of scheme or username — a 403 means Forbidden, which covers causes unrelated to auth scheme (insufficient scopes, provider policy, a missing standard header), so the Basic-auth guess would be a false lead, not a hedge; report the failure plainly instead of guessing further. Never exposes the token, and never returns the provider's response body — only the tri-state result plus a human-readable message (and, on 'invalid', the diagnostic above). If you don't already know the exact saved label, call content_read.custom_credential first rather than guessing or asking the human to retype one. Call this before custom_credential_make_request if you are not already confident the credential works, or whenever a human asks whether a saved custom credential is still good.",
    sideEffects: "none",
    authorization: { permission: "custom-credentials.read" },
    inputSchema: VERIFY_SCHEMA,
  },
  {
    name: "custom_credential_make_request",
    description:
      "THIS IS HOW TO CALL A THIRD-PARTY API — a DNS registrar, hosting account, deployment target, or any other saved custom provider — USING A SAVED CREDENTIAL, instead of a raw shell command (curl/wget/httpie/etc). Reach for this whenever the target might have a saved credential (call content_read.custom_credential first if you don't already know the exact saved label); a raw curl through Bash bypasses this entirely and either fails outright or forces you to find and paste a token by hand, which this tool exists specifically to avoid. Makes an authenticated GET/POST/PUT/PATCH/DELETE request to a saved custom provider credential's own API (Access Tokens page → 'Add custom provider', e.g. name.com, fly.io — DNS records, certs, apps, machines, deployments, any endpoint that credential's saved base URL/additionalHosts cover) and returns the real response ({status, headers, bodyText}) — full parity with what a human operating this credential could already do from a terminal or the provider's own console. The server resolves the saved credential and injects its Authorization header itself — you name a label (the SAME identifier content_read.custom_credential returns and custom_credential_verify accepts) and a full URL (never a token), and the token never appears anywhere in this tool's input or output. The target URL's host must be one of this credential's own saved hosts; anything else is refused before any request is sent (see the 'url' field). DELETE is human-gated: this ONE call shows an interactive confirmation naming the label, resolved host, method, and path, and WAITS — it does not return until the human answers. If confirmed, the SAME call performs the DELETE and returns {executed: true, status, headers, bodyText}; if declined or unanswered it returns {executed: false, cancelled, reason?} and nothing is sent. GET/POST/PUT/PATCH return {executed: true, status, headers, bodyText} immediately, with no confirmation. A response with status 401 or 403 ALSO carries 'authDiagnostic' ({schemeSent, usernameStored, hint?, remedyToolId?}) alongside the untouched provider bodyText — read it rather than reporting a bare 401/403 back to the human: ONLY on a 401, when schemeSent is 'Bearer' and usernameStored is false, 'hint' is the one honest, narrow guess this tool can make (this provider may need HTTP Basic with a saved username). Treat that as a hypothesis to try, never a diagnosis: ask the human for the username via assistant_ask_choice, save it with custom_credential_set_username, then retry this SAME call exactly ONCE — never invent a username, and never loop past one retry. There is no hint when usernameStored is already true (a different, unguessable cause), and there is no hint on a 403 at all, regardless of scheme or username — 403 Forbidden covers causes unrelated to auth scheme (scopes, policy, a missing standard header), so the Basic-auth guess would be a false lead there; report the failure and the provider's own bodyText plainly instead of guessing further. Bounded: one request, a short timeout, a capped response size, and a capped request body size — do not rely on this for a large upload or download. If the label does not match a saved credential, or the url's host is not on the credential's saved list, this call is refused with a clear reason before any network request is made.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "custom-credentials.write" },
    inputSchema: MAKE_REQUEST_SCHEMA,
  },
  {
    name: "custom_credential_set_username",
    description:
      "THIS IS HOW TO FIX A SAVED CREDENTIAL THAT NEEDS A USERNAME — the self-healing repair step for the diagnostic custom_credential_verify/custom_credential_make_request return on a 401/403 (their 'authDiagnostic' field): when the failure was a 401, schemeSent is 'Bearer', and usernameStored is false, ask the human for the missing username in chat (e.g. via assistant_ask_choice — never guess or invent one), then call THIS tool with the exact answer, then retry the original custom_credential_verify/custom_credential_make_request call ONCE. Sets (or, with username: null, clears) ONLY the plaintext 'username' column on ONE saved custom credential (Access Tokens page → 'Add custom provider'), matched by its exact saved 'label' — call content_read.custom_credential first if you are not sure of it. This tool can NEVER accept, read, or write the credential's token: it takes exactly two fields, 'label' and 'username', and a call naming anything else (a 'token', 'connection', 'secret', or any other field) is refused outright before anything is written — there is no field on this tool capable of carrying a secret at all. The existing sealed token, if any, is left completely untouched (byte-for-byte, not merely 'still decrypts the same') — this is a metadata fix, not a credential rotation, and it never opens or re-seals the stored ciphertext. Returns the updated credential summary, same shape as content_read.custom_credential's own rows, with the new username reflected (or absent, if you passed null to clear it).",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "custom-credentials.write" },
    inputSchema: SET_USERNAME_SCHEMA,
  },
  {
    name: "custom_credential_set_token",
    description:
      "THIS IS HOW TO SET OR ROTATE A SAVED CREDENTIAL'S TOKEN — in chat, without the human going to the Access Tokens page, and WITHOUT the token ever passing through you. Call this when a saved custom credential (Access Tokens page → 'Add custom provider') needs a new or first token: a rotated fly.io/name.com/etc key, a token that expired, or filling in one that was never set. You supply ONLY the exact saved 'label' (call content_read.custom_credential first if unsure) — this tool has no field capable of accepting a token, and a call naming anything else is refused outright. Calling it shows the human an interactive form with a masked input; they type the token directly into it, and it is sealed on the server the instant they submit — it is never sent to you, never appears in this tool's result, and never enters the chat transcript. THIS ONE CALL raises that form and WAITS — it does not return until the human submits or cancels, or the form times out; there is no second call to make and no token to invent, guess, or pass yourself. If they submit a token, it is saved and this call returns {saved: true}. If they cancel, it returns {saved: false, reason: 'cancelled'}. If nobody answers before the form expires (or the run ends first), it returns {saved: false, reason: 'expired'|'abandoned'}. A blank submission is refused and returns {saved: false, reason: 'invalid'} with nothing changed. Any other failure (e.g. the server's secret store is unconfigured) returns {saved: false, reason: 'error', message} with an actionable message — never the token, never a raw error dump. The credential's existing saved username, if any, is left exactly as it was; use custom_credential_set_username separately to change that. Never echoes, logs, or otherwise reveals the token you asked to have set — treat every result from this tool as proof only of whether the save happened, nothing more.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "custom-credentials.write" },
    inputSchema: SET_TOKEN_SCHEMA,
  },
  {
    name: "custom_credential_create",
    description:
      "THIS IS HOW TO CREATE A BRAND-NEW SAVED CREDENTIAL — in chat, without the human going to the Access Tokens page, and WITHOUT the token ever passing through you. Call this when content_read.custom_credential shows NO saved credential for a provider you need (a DNS registrar, hosting account, deployment target, or any other third-party API) and the human wants to save one now — do NOT tell them to go add it themselves in Admin; use this tool instead. You may optionally pass 'label'/'baseUrl'/'category' as non-secret pre-fill hints if you already know them from the conversation (e.g. label: 'github', baseUrl: 'https://api.github.com', category: 'source-control') — the human can still change any of them before submitting, and omitting one just leaves that field blank for them to fill in. This tool has NO field capable of accepting a token, username, or any other secret — a call naming anything besides 'label'/'baseUrl'/'category' is refused outright by its own schema. Calling it shows the human an interactive form (label, base URL, category, an optional username, and a masked token field); they fill it in and submit directly, and the token is sealed on the server the instant they submit — it is never sent to you, never appears in this tool's result, and never enters the chat transcript. THIS ONE CALL raises that form and WAITS — it does not return until the human submits or cancels, or the form times out; there is no second call to make. On a successful save this returns { created: true, credential } where 'credential' is the SAME summary shape content_read.custom_credential returns (id, label, category, baseUrl, additionalHosts, username if one was set, configured, createdAt, updatedAt) — never the token. If the submitted label already matches an existing saved credential, NOTHING is created or overwritten: this returns { created: false, reason: 'duplicate-label', message } naming the collision, and the message points you at custom_credential_set_token to rotate that existing credential's token instead — call that tool, do not retry this one with a different label unless the human actually wants a second, separate credential. If they cancel, it returns { created: false, reason: 'cancelled' }. If nobody answers before the form expires (or the run ends first), it returns { created: false, reason: 'expired' | 'abandoned' }. A blank token, or any other invalid field (an unparseable base URL, a category outside the fixed set, a blank label), is refused and returns { created: false, reason: 'invalid', message } naming what was wrong — nothing is written. Any other failure (e.g. the server's secret store is unconfigured) returns { created: false, reason: 'error', message } with an actionable message — never the token, never a raw error dump. Never echoes, logs, or otherwise reveals the token you asked to have saved — treat every result from this tool as proof only of whether the save happened, nothing more.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "custom-credentials.write" },
    inputSchema: CREATE_CREDENTIAL_SCHEMA,
  },
  {
    name: "custom_credential_write_files",
    description:
      "THIS IS HOW TO WRITE ONE OR MORE FILES INTO A REPOSITORY THROUGH A SAVED CREDENTIAL, IN ONE ATOMIC COMMIT, WITH A REAL HUMAN CONFIRMATION FIRST. Reach for this whenever a task needs to add or update named files in an operator's own repository (e.g. a fly.toml and a GitHub Actions workflow for a deploy, a generated config file, a small script) using a saved credential (Access Tokens page -> 'Add custom provider', e.g. 'github') — never write files by shelling out to git or curl-ing GitHub's Contents API yourself; this tool exists specifically so you never have to. Call content_read.custom_credential first if you don't already know the exact saved label. Give it 'label' (the saved credential), 'owner'/'repo' (the target repository), 'branch' (MUST already exist — this tool never creates one, and it does not default to the repository's default branch, so name it explicitly), 'commitMessage', and 'files' (1-25 entries of {path, content} — 'path' is repository-relative, never absolute and never containing a '..' segment or a reserved '.git' segment; 'content' is the file's exact new text, capped at 1 MiB per file and 4 MiB total). EVERY call shows the human an interactive confirmation before anything is written — unlike custom_credential_make_request, there is no un-gated verb here. The dialog names the saved credential, the repository and branch, and every single path this call would write, each labeled as a create (new path) or an update (already exists on the branch) — resolved by checking the branch's REAL current state before the dialog is ever shown, never guessed. If any path is inside '.github/workflows/', the dialog carries an EXTRA, more prominent warning naming every such path and explaining that a workflow file controls what code runs automatically on every future push to the repository. THIS ONE CALL raises that dialog and WAITS — it does not return until the human answers; there is no second call to make. If confirmed, every file lands in ONE atomic commit (never one commit per file), built directly on the branch's current tree (nothing else already on the branch is touched, moved, or deleted), and this returns {executed: true, commitSha, commitUrl, filesWritten}. If declined, it returns {executed: false, cancelled: true} and nothing is written. If nobody answers before the confirmation expires (or the run ends first), it returns {executed: false, cancelled: false, reason: 'expired' | 'abandoned'}. If the branch moved since this call started (someone else pushed in the meantime) or GitHub itself rejects the write, it returns {executed: false, cancelled: false, reason: 'error', message} and nothing is written — this tool never leaves a half-written commit; retry fresh rather than assuming partial success. Refused before any confirmation or network call, with a clear reason naming what was wrong: the named branch does not exist; any file path is absolute, contains a '..' segment, is empty, contains a NUL byte, exceeds the path-length cap, or names/nests under the reserved '.git' directory; more than 25 files; a single file over the per-file byte cap; the files' combined size over the aggregate cap; or two files naming the same path. The credential's token is never sent to you and never appears in this tool's input or output.",
    sideEffects: "mutates-durable-state",
    authorization: { permission: "custom-credentials.write" },
    inputSchema: WRITE_FILES_SCHEMA,
  },
];
