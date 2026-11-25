import { buildCustomCredentialsAgentToolCatalog } from "@jini-ai/integrations/custom-credentials/agent-tools";

import { WRITE_FILES_LIMITS } from "@jini-ai/integrations/custom-credentials/write-files-validation";

export const WRITE_FILES_TOOL_ID = "custom_credential_write_files";

/**
 * @file Custom-credential read, verification, request, username and file-write tool catalog: this
 * host's tool names, permissions and model-facing words, bound to the generic schema shapes of
 * `@jini-ai/integrations/custom-credentials/agent-tools`.
 * The schema rationale (token-free schemas, DELETE confirmation, label reuse) lives with the
 * shapes there; credential-save-tool.ts owns creation/rotation schemas and tool-registrations.ts
 * the wiring.
 */

const LABEL_FIELD_DESCRIPTION =
  "The exact display name of a saved custom credential, from the admin's Access Tokens page 'Add custom provider' section (e.g. 'registrar', 'hosting-prod'). Case-sensitive — must match exactly. If unsure of the exact label, call content_read.custom_credential rather than guessing.";

/**
 * This domain's fixed agent-tool catalog.
 *
 * @complexity O(1) — a fixed, statically-defined list.
 */
export const customCredentialsAgentToolCatalog = buildCustomCredentialsAgentToolCatalog({
  ids: {
    list: "custom_credential_list",
    verify: "custom_credential_verify",
    makeRequest: "custom_credential_make_request",
    setUsername: "custom_credential_set_username",
    writeFiles: WRITE_FILES_TOOL_ID,
  },
  permissions: { read: "custom-credentials.read", write: "custom-credentials.write" },
  writeFilesLimits: WRITE_FILES_LIMITS,
  copy: {
    labelField: LABEL_FIELD_DESCRIPTION,
    makeRequestFields: {
      method:
        "HTTP method. All five are supported. DELETE shows the human an in-chat confirmation naming the label, host, method, and path before it actually runs — this ONE call raises the dialog and waits, then completes once answered; there is no second call to make. GET/POST/PUT/PATCH run immediately with no confirmation, matching what a human can already do from the site.",
      url:
        "A FULL absolute URL (e.g. 'https://api.example.com/v1/apps/my-app'), not a bare path. Its host MUST be one of this credential's saved hosts (its base URL, or one of its saved additional hosts, e.g. a hosting credential saved with both api.example.com and machines.example.com) — a URL naming any other host is refused before any request is sent, and the error names which hosts ARE allowed for this credential if you guess wrong. If you don't already know them, call content_read.custom_credential first: each credential's baseUrl (its scheme and host) and additionalHosts there are the hosts allowed here.",
      headers:
        "Optional extra request headers (e.g. 'Accept', 'Content-Type'). Do not set 'Authorization', 'Cookie', 'Host', or 'Proxy-Authorization' — the server injects the real credential's own Authorization header itself and refuses a call that tries to set any of these.",
      body:
        "Optional request body, sent exactly as given (e.g. a JSON string for a 'Content-Type: application/json' request). Omit for a request with no body. Bounded in size — a very large body is refused.",
    },
    setUsernameFields: {
      username:
        "The account username/login to save for this credential (e.g. an email address or account handle) — an account identifier, never a secret. Pass null to explicitly clear a previously saved username. This field is REQUIRED on every call (there is no 'leave unchanged' — call this tool only when you actually mean to set or clear it). Do NOT pass a token, API key, password, or any other secret here: this tool has no field capable of accepting one, and a call naming any field other than 'label'/'username' is refused outright.",
    },
    writeFilesFields: {
      owner: "The repository owner or organization name that owns the target repository (e.g. 'example-owner').",
      repo: "The repository name, without the owner prefix (e.g. 'my-site').",
      branch:
        "The exact branch to commit onto. This branch MUST already exist — this tool never creates one. It does NOT default to the repository's default branch, so name it explicitly (ask the human, or check with custom_credential_make_request first, if unsure).",
      commitMessage: "The git commit message for this write, 1-500 characters.",
      path:
        "A repository-relative file path (e.g. 'deploy.toml', 'docs/index.md'). Never absolute, never containing a '..' segment, and never naming or nesting under the reserved '.git' directory — any of those is refused before anything is written.",
      content: `The file's exact new text content, written verbatim. Capped at ${WRITE_FILES_LIMITS.maxFileBytes} bytes per file and ${WRITE_FILES_LIMITS.maxTotalBytes} bytes across all files in one call.`,
      files: `1-${WRITE_FILES_LIMITS.maxFiles} files to write in one atomic commit. Runs immediately after validation and authorization; overwritten bytes remain recoverable in Git history.`,
    },
    tools: {
      list:
        "THIS IS HOW TO DISCOVER SAVED CREDENTIALS BEFORE MAKING AN OUTBOUND REQUEST. Call this FIRST — before reaching for a shell command like curl/wget/httpie — any time a task touches a domain name, DNS record, domain registrar, hosting account, deployment target, or any other third-party API: there may already be a saved credential for it, and using one through custom_credential_make_request is both less work and safer than a raw shell request (the real token never reaches you or a shell either way). Lists every custom provider credential saved in this workspace's Access Tokens page ('Add custom provider' section — e.g. a registrar, a hosting provider, or any other registrar/host/deployment/API provider a human has connected). Answers questions like 'what credentials are saved', 'what API keys or tokens do I have', 'do I have a registrar token', 'what did I save for my hosting provider', 'what third-party accounts are connected', or 'what can I use instead of curl for this'. For each one, returns: id, label (the exact value to pass as 'label' to custom_credential_verify or custom_credential_make_request — both take the SAME identifier shape, so you can go list → verify → call without guessing or asking the human to retype a name they already entered once), credentialType (custom), worksFor (explicit compatible host or vendor IDs, independent of the display label), category (source-control, hosting, media, ai, ops, or general), baseUrl and additionalHosts (the credential's own saved allowlist — the only hosts custom_credential_make_request will let a request reach), username (the saved account login, e.g. an email address or handle — an account identifier, not a secret; the field is absent when none is saved), configured (always true for this table — every saved row has a secret; there is no 'saved but empty' state here), createdAt/updatedAt, and pluginId/usedFor (display-only purposes from an active plugin API card with this exact saved label; not permission or verification). Never returns a token, secret, or any part of one — this tool has no field capable of carrying one. Returns an empty list, not an error, when nothing is saved yet — that IS the signal to fall back to a shell command or ask the human to save one first.",
      verify:
        "Checks whether a saved API key or token still works — 'is my hosting token still valid', 'check if this API key works', 'test my saved credential', 'has my registrar token expired'. Checks ONE saved custom provider credential (Access Tokens page → 'Add custom provider', e.g. a registrar, a hosting provider, or any other registrar/host/deployment provider) against its own real API, live, right now: makes one bounded, read-only, authenticated GET to the credential's own saved base URL and reports 'valid' (the provider accepted it), 'invalid' (the provider rejected it — expired, revoked, or wrong scopes), or 'unreachable' (a network failure, timeout, or an ambiguous response — this does NOT mean the credential is bad, try again or check network access). An 'invalid' result also carries authDiagnostic ({schemeSent, usernameStored}), which reports facts only. A 401 or 403 does not establish that the provider needs Basic authentication. Bearer-token APIs do not need a username. Check the documented authentication scheme, token status, permissions and account scope; use credential_save to rotate a rejected token through the secure card, then retry once. Never exposes the token, and never returns the provider's response body — only the tri-state result plus a human-readable message (and, on 'invalid', the diagnostic above). If you don't already know the exact saved label, call content_read.custom_credential first rather than guessing or asking the human to retype one. Call this before custom_credential_make_request if you are not already confident the credential works, or whenever a human asks whether a saved custom credential is still good.",
      makeRequest:
        "THIS IS HOW TO CALL A THIRD-PARTY API — a DNS registrar, hosting account, deployment target, or any other saved custom provider — USING A SAVED CREDENTIAL, instead of a raw shell command (curl/wget/httpie/etc). Reach for this whenever the target might have a saved credential (call content_read.custom_credential first if you don't already know the exact saved label); a raw curl through Bash bypasses this entirely and either fails outright or forces you to find and paste a token by hand, which this tool exists specifically to avoid. Makes an authenticated GET/POST/PUT/PATCH/DELETE request to a saved custom provider credential's own API (Access Tokens page → 'Add custom provider', e.g. a registrar, a hosting provider — DNS records, certs, apps, machines, deployments, any endpoint that credential's saved base URL/additionalHosts cover) and returns the real response ({status, headers, bodyText}) — full parity with what a human operating this credential could already do from a terminal or the provider's own console. The server resolves the saved credential and injects its Authorization header itself — you name a label (the SAME identifier content_read.custom_credential returns and custom_credential_verify accepts) and a full URL (never a token), and the token never appears anywhere in this tool's input or output. The target URL's host must be one of this credential's own saved hosts; anything else is refused before any request is sent (see the 'url' field). DELETE is human-gated: this ONE call shows an interactive confirmation naming the label, resolved host, method, and path, and WAITS — it does not return until the human answers. If confirmed, the SAME call performs the DELETE and returns {executed: true, status, headers, bodyText}; if declined or unanswered it returns {executed: false, cancelled, reason?} and nothing is sent. GET/POST/PUT/PATCH return {executed: true, status, headers, bodyText} immediately, with no confirmation. A response with status 401 or 403 also carries authDiagnostic ({schemeSent, usernameStored}) alongside the provider bodyText. These are facts, not a diagnosis of the required authentication scheme. Bearer-token APIs do not need a username; ask for one only when provider documentation explicitly requires HTTP Basic. Check token status, permissions and account scope; use credential_save to rotate a rejected token, then retry once. Bounded: one request, a short timeout, a capped response size, and a capped request body size — do not rely on this for a large upload or download. If the label does not match a saved credential, or the url's host is not on the credential's saved list, this call is refused with a clear reason before any network request is made.",
      setUsername:
        "Sets the username only for a provider whose documented authentication scheme explicitly requires HTTP Basic. Never suggest this for a Bearer-token API or infer it merely from a 401/403 or a missing stored username. Ask the human for the documented account identifier and never invent one. Sets (or, with username: null, clears) ONLY the plaintext 'username' column on ONE saved custom credential (Access Tokens page → 'Add custom provider'), matched by its exact saved 'label' — call content_read.custom_credential first if you are not sure of it. This tool can NEVER accept, read, or write the credential's token: it takes exactly two fields, 'label' and 'username', and a call naming anything else (a 'token', 'connection', 'secret', or any other field) is refused outright before anything is written — there is no field on this tool capable of carrying a secret at all. The existing sealed token, if any, is left completely untouched (byte-for-byte, not merely 'still decrypts the same') — this is a metadata fix, not a credential rotation, and it never opens or re-seals the stored ciphertext. Returns the updated credential summary, same shape as content_read.custom_credential's own rows, with the new username reflected (or absent, if you passed null to clear it).",
      writeFiles:
        "Writes 1–25 named files to an existing repository branch in one atomic commit through a saved custom credential. Runs immediately with {label, owner, repo, branch, commitMessage, files:[{path, content}]}. Call content_read.custom_credential to find the saved label. Requires custom-credentials.write; never accepts or exposes the token. Returns {executed:true, commitSha, commitUrl, filesWritten}, or {executed:false, cancelled:false, reason:'error', message} if the branch moved or the host rejected the commit. Nothing else in the branch is changed. Refuses invalid/duplicate paths, absolute paths, '..' or '.git' segments, a missing branch, files over 1 MiB each or 4 MiB total. Workflow files can change automated builds; follow the user's requested files. Git history retains prior content.",
    },
  },
});
