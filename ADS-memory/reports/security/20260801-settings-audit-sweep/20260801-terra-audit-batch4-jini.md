# Terra audit — batch 4, Jini `ui-core/src/features` (61 files, ~5,700 lines)

Generated: 2026-07-31 ~21:31 local.
Auditor: **`gpt-5.6-terra`, `model_reasoning_effort=xhigh`** via `codex exec` as an external reviewer
(`--ignore-rules --ignore-user-config --ephemeral`).
Packet: `terra-audit-scope/packet-batch4-jini.md`. Raw: `terra-audit-scope/runs/batch4-jini.jsonl`.

Run health (checked): errors=0, turn.failed=0, turn.completed=1, stderr empty.
Usage: 3,300,952 input (3,094,272 cached), 16,014 output, 11,392 reasoning.

Scope: the entire framework-free logic layer — `rules.ts`, `ports.ts`, `types.ts`, `constants.ts`,
`dependencies.ts`, `index.ts` across all 13 feature domains. **Terra confirms it read all 13 and
triaged none away unread.**

The packet's premise was that `rules.ts` files are usually the *only* validation, so the question
asked was what each rule wrongly ACCEPTS rather than what it rejects. Six of the ten findings are
exactly that.

> **UNVERIFIED.** Terra's claims, reproduced verbatim. Batch 1's verification pass killed two of six
> HIGH findings. Verify before fixing.

## Coordinator notes

1. **The privacy finding deserves attention beyond its severity label.** Tovu's own agent-writable
   settings decision (`20260731-agent-writable-settings-foundation.md`) deliberately withheld
   `core.privacy.telemetry.*` from agent writability on the grounds that it is "a consent record
   whose purpose is to attest that a HUMAN decided." If `privacy/rules.ts:65` lets a decline silently
   preserve an unrecognized scope, then the human decision itself is not being recorded faithfully —
   which undercuts the reasoning that justified withholding it. Worth checking whether Tovu's
   consent path actually goes through this rule.

2. **Three of the six HIGH findings are the same shape**: a URL/endpoint rule that validates scheme
   only, then blesses a value that a host adapter later fetches. Batch 1 already CONFIRMED a real
   SSRF-via-redirect in `agent-runtime/src/providers/connection-test.ts:321`. These are the
   validation layer that should have stopped it earlier. Consider one shared endpoint-policy fix
   rather than three.

3. **The shell-injection finding (`integrations/rules.ts:58`) is the one with no batch-1 precedent**
   and no obvious mitigating layer — it generates a command string a human is instructed to paste
   into a shell. Verify `McpInstallInfo`'s actual provenance before rating it: if `serverName` can
   only come from a trusted local catalog the severity drops, and if it can come from a remote MCP
   registry it does not.

---

**[SEVERITY: HIGH] Source URL validation permits SSRF targets and URL credentials**
- **File:** `packages/ui-core/src/features/source-config-list/rules.ts:22`
- **What is wrong:** `isValidHttpUrl` accepts every HTTP(S) URL, including userinfo and loopback/link-local/private addresses. The add form treats this result as sufficient before calling `testSource` or `addSource`.
- **Failure scenario:** `http://token:secret@169.254.169.254/latest/meta-data` or `https://evil.com@127.0.0.1:2375/` validates successfully; the UI enables Test and forwards it to a host adapter that probes the endpoint, enabling SSRF and also retaining/displaying the credential-bearing URL.
- **Fix:** Reject URL credentials and non-public/reserved IP ranges by default; make local-network access an explicit trusted-source opt-in. The host adapter must resolve DNS and re-check every redirect target before connecting.

**[SEVERITY: HIGH] BYOK connection testing accepts internal endpoints**
- **File:** `packages/ui-core/src/features/execution/rules.ts:27`
- **What is wrong:** `isValidApiBaseUrl` only restricts the scheme. `missingRequiredFields` therefore considers loopback, link-local, private, and userinfo-obscured destinations valid and enables `ExecutionPort.testConnection`.
- **Failure scenario:** With a nonblank key and model, `https://evil.example@169.254.169.254/latest/meta-data` passes validation and the Test button sends it to the host’s connection-test implementation, which can fetch internal metadata or follow a redirect there.
- **Fix:** Replace scheme-only validation with an endpoint policy that rejects credentials and reserved/private destinations unless a trusted preset explicitly permits local access; enforce the same DNS/IP and redirect policy in `ExecutionPort` implementations.

**[SEVERITY: HIGH] Media-provider endpoints are persisted without any safety validation**
- **File:** `packages/ui-core/src/features/media-providers/rules.ts:130`
- **What is wrong:** `resolveProviderBaseUrl` accepts any nonblank string, and `MediaProvidersPort.saveMediaProviders` accepts that map without a validation contract.
- **Failure scenario:** An operator enters `file:///etc/passwd`, `http://127.0.0.1:2375/`, or `http://169.254.169.254/` in the Base URL field; it is saved and a host later uses it for authenticated media generation requests.
- **Fix:** Add a validated endpoint type/policy before save, reject non-HTTP(S), userinfo, and private/reserved destinations by default, and require host-side DNS and redirect enforcement.

**[SEVERITY: HIGH] Generated Claude install command is shell-injectable**
- **File:** `packages/ui-core/src/features/integrations/rules.ts:58`
- **What is wrong:** `serverName` is emitted unquoted and the JSON argument is merely wrapped in single quotes, which breaks when `McpInstallInfo` contains an apostrophe.
- **Failure scenario:** A host supplies `serverName = 'jini; touch /tmp/pwned #'`; the copied snippet executes `touch /tmp/pwned` when pasted into a shell. An install path such as `x'; touch /tmp/pwned; echo '` in `info.args` has the same effect.
- **Fix:** Shell-quote every positional argument with a correct POSIX quoting routine (including embedded apostrophes), or emit a non-shell installation format only; validate server names for all generated config formats.

**[SEVERITY: HIGH] “Don’t share” preserves unrecognized telemetry scopes**
- **File:** `packages/ui-core/src/features/privacy/rules.ts:65`
- **What is wrong:** The decline and share transitions spread the existing telemetry object, preserving runtime-added scopes that this build does not know about.
- **Failure scenario:** A persisted newer config contains `{ metrics: true, content: true, diagnostics: true }`. Clicking “Don’t share” returns `{ metrics: false, content: false, diagnostics: true }`; a host that sends `diagnostics` telemetry continues sharing after the UI reports an opt-out.
- **Fix:** Normalize telemetry to a closed, versioned scope set before transitions; decline must explicitly clear every recognized stored scope and reject/disable unknown scopes until their consent semantics are defined.

**[SEVERITY: HIGH] Memory diagnostics render raw provider and connector errors**
- **File:** `packages/ui-core/src/features/memory/formatters.ts:36`
- **What is wrong:** `describeConnectorReadIssue`, `connectorAttemptDetail`, and the fallback branch of `describeExtractionFailure` include raw `error`/`message` strings in UI output.
- **Failure scenario:** A connector returns `request failed: Authorization: Bearer sk-live-secret`, or an unknown provider error includes `postgres://user:password@host`; those strings are rendered in the connected-app diagnostics or extraction-history card.
- **Fix:** Redact credentials, authorization headers, query secrets, and connection-string userinfo before formatting; for unknown provider errors, show a generic message and retain the raw diagnostic only in protected logs.

**[SEVERITY: MEDIUM] Server-provided “key tail” can disclose the whole key**
- **File:** `packages/ui-core/src/features/media-providers/rules.ts:168`
- **What is wrong:** `maskedKeyLabel` trusts `apiKeyTail` and renders it without limiting its length, although the type only documents it as a short tail.
- **Failure scenario:** A faulty or future daemon returns `{ apiKeyConfigured: true, apiKeyTail: 'sk-live-full-secret' }`; the settings card renders `••••sk-live-full-secret`.
- **Fix:** Always trim `apiKeyTail` to a fixed suffix length in `maskedKeyLabel`, regardless of what the port returns.

**[SEVERITY: MEDIUM] Project-location paths are only prose-constrained**
- **File:** `packages/ui-core/src/features/project-locations/ports.ts:16`
- **What is wrong:** The port promises an absolute chosen path only in a comment, while `saveableDrafts` accepts any nonblank path unchanged.
- **Failure scenario:** A buggy IPC implementation returns `../../sensitive` or a symlink escaping the permitted workspace. The hook saves it and calls `scanLocations`, allowing a host to scan or adopt an unintended filesystem root.
- **Fix:** Resolve and authorize paths in the host before returning them; model verified absolute paths as an opaque/validated value and reject relative, unresolved, and out-of-policy symlink targets on every save.

**[SEVERITY: MEDIUM] Media-provider full-map saves can resurrect a cleared credential**
- **File:** `packages/ui-core/src/features/media-providers/ports.ts:37`
- **What is wrong:** The port performs destructive whole-map replacement without an expected revision or serialization requirement.
- **Failure scenario:** Save `{alpha, beta}` starts; before it settles, Clear removes `alpha` and saves `{beta}`. If the older save reaches or returns after the clear, it can restore `alpha`, contrary to the UI’s decisive-clear behavior.
- **Fix:** Add revisions/ETags and reject stale writes, or require serialized saves and have the adapter return the authoritative revisioned state.

**[SEVERITY: MEDIUM] OAuth continuation URLs are stored and opened without validation**
- **File:** `packages/ui-core/src/features/connectors/rules.ts:93`
- **What is wrong:** Redirect URLs from `ConnectorActionResult` are persisted verbatim and later supplied to `openExternalUrl`; neither the rule nor the port contract restricts scheme or authorization host.
- **Failure scenario:** A connector response provides `javascript:...`, `file:...`, or an attacker-controlled phishing URL. The “Continue in browser” button opens it through the host adapter.
- **Fix:** Parse and allowlist HTTPS authorization URLs before storing or opening them; reject unsafe schemes, userinfo, and unexpected hosts, with host-side enforcement as the final check.

## Assessed and found clean

- `memory/async-commit-guard.ts`: correct latest-revision invalidation primitive; no latch/rejection or reset interleaving flaw found in its in-tree usages.
- Caller-owned-data mutation: no concrete affected mutation found in the audited rules/formatters.
- Constants: no hardcoded credentials, default passwords, or production secrets found.
- Public barrels: no missing exports needed by their exported rules/types found.

All 13 requested `ui-core` feature domains were read; none were triaged away unread.