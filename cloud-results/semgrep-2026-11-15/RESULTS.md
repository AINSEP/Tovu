# Semgrep scan 2026-11-15 (branch refactor/terra; Tovu b28d38c6, Jini b7666092)

## Versions / commands
- semgrep 1.185.0 (OSS, `--oss-only --metrics=off`), semgrep-rules clone @ a5ad171.
- **Deviation:** `semgrep.dev` is blocked by the sandbox proxy (403), so the repos' `p/typescript|javascript|nodejs|secrets|owasp-top-ten` registry packs could not be fetched. Substituted local checkout of semgrep-rules dirs `javascript/`, `typescript/`, `generic/secrets/` plus each repo's own `.semgrep` rules (Tovu `.semgrep/tests`, Jini `.semgrep`). Findings therefore differ from the repo's `quality:semgrep`; `p/nodejs`/`owasp-top-ten` curation is approximated by the broader directories (438 rules).
- Rule tests: `semgrep --test .semgrep --oss-only` -> 6/6 pass in both repos (raw/semgrep-test-*.txt).
- Scan: `semgrep scan --oss-only --json -c <rules>/javascript -c <rules>/typescript -c <rules>/generic/secrets -c <repo rules> .` (raw/semgrep-<repo>.json/.txt; counts in raw/counts-*.txt).

## Counts
- Tovu: 13,169 findings, 114 analysis errors (11,382 files). Jini: 8,427 findings, 198 analysis errors (9,185 files). Full per-rule/severity tables: raw/counts-Tovu.txt, raw/counts-Jini.txt.
- Top rules are volume noise: missing-template-string-indicator (3284/2124), no-raw-fetch (4505/349), i18next-key-format (2003/1447), react-props-spreading, html-in-template-string, no-secret-literals-in-tests (411/661), no-as-any.

## Triage scope (honest note)
Not every one of ~21.6K findings was individually read. All security-class rules (listed below, ~330 findings) were triaged by file path plus source inspection of every non-test location; style/volume rules were triaged by class. No source was edited.

## TRUE-POSITIVE
None confirmed as exploitable. Items worth a human look (low risk, defense-in-depth):
1. **Tovu apps/admin/src/features/plugins/hooks/use-admin-surface-frame.hooks.ts:104,114,131,134,143** (wildcard-postmessage-configuration): plugin bootstrap data + theme posted to the surface iframe with targetOrigin `"*"`. Likely required for an opaque-origin sandboxed frame, and a load-count guard unmounts the frame on re-navigation, so exposure is low; verify the iframe is `sandbox` without `allow-same-origin`, otherwise pin the origin. Risk: bootstrap payload reaching a navigated-away frame.
2. **Tovu apps/website/src/server/runtime/composition/modules/assistant.ts:126** (direct-response-write): streams upstream body with upstream Content-Type passed through. If upstream could return text/html this is reflected content; upstream is the configured daemon, so low. Suggest forcing an allowlisted content type + `X-Content-Type-Options: nosniff`.
3. **Jini packages/ui/src/utils/markdown-scroll-sync.ts:207** (insecure-innerhtml): `mirror.innerHTML = buildMirrorMarkup(...)` on a hidden measurement mirror; confirm buildMirrorMarkup escapes `text` (not verified in depth).
4. **Jini packages/admin/src/media/react/components/MediaCard.tsx:14** (react-href-var): `href={vm.src}` – confirm src cannot be a `javascript:` URL (media URLs from user-uploaded/imported content). Suggest scheme allowlist (http/https/blob/relative).

## FALSE-POSITIVE (by class/location)
- tainted-sql-string Tovu routes/pages/delete.ts:56, posts/delete.ts:112: template string is a change-set `summary` label, not SQL.
- express-res-sendfile Tovu admin site-shares.ts:100, public site-share.ts:18: filename fixed to `${shareId}.tovu.zip` with `root:` and `dotfiles:"deny"`; `Content-Disposition` file is validated by `SHARE_FILE` regex in share-service.ts:26.
- cors-misconfiguration Tovu dev-cors.ts:12: origin strictly regex-matched to localhost/127.0.0.1 and echoed with Vary.
- raw-html-format Tovu site/render.ts:3367: server-rendered page shell of already-escaped fragments (confirm escaping at body build, not re-audited).
- spawn-shell-true Tovu desktop/scripts/check-gates.ts:78 and development/scripts/prepare-start.mjs:161: dev tooling, commands from repo-owned gate manifests / fixed npm args (shell only on win32).
- insecure-innerhtml/insecure-document-method Tovu site-chat/src/vanilla-host.ts:40 and Jini packages/ui/src/features/memory/react/render-markdown.tsx:23, `react-dangerouslysetinnerhtml`: input is micromark output with raw HTML escaped (code comments say so); Tovu additionally filters images.
- insecure-innerhtml/document-method in `__tests__` (Tovu 10, Jini ~20, plus packages/chat embed-widget lazy-loader.ts:49,84 not inspected, treat as unverified).
- All detected-* secrets, hardcoded-hmac-key, private-key, JWT, AWS key, GCM, generic-api-key, github-pat findings: in `__tests__` fixtures (redaction/sanitizer/credential-hygiene tests) with synthetic values (Tovu 4+, Jini ~60). All are test files per path list.
- wildcard-postmessage / insufficient-postmessage-origin-validation in Jini examples/reference-web (mcp-app.ts, McpUiLabHost.tsx) and ui `__tests__`: protocol-conformance fixtures; the early-message buffer records `origin`/`source` for the receiver to validate.
- gcm-no-tag-length Jini secret-sealer.aesgcm.ts:68: tag length is fixed by `AUTH_TAG_LENGTH_BYTES` and checked right above.
- remote-property-injection Jini daemon/src/http/run-credentials.ts:33: header name comes from a trusted decision object, lower-cased; Tovu counterpart is a test.
- detect-insecure-websocket / react-insecure-request: test and e2e harness `http://`/`ws://` localhost URLs.
- prototype-pollution-loop (Jini 5), detect-redos (22/54), detect-non-literal-regexp, unsafe-dynamic-method, incomplete-sanitization (non-test: scripts/lib/spec-aliases.ts, check-subpath-isolation.ts, development/quality): internal tooling over repo-controlled data; not individually verified.
- javascript-prompt owner-reset-input.ts:39-40 (Jini): server-side CLI prompt text, not browser prompt() (name collision).
- prohibit-jquery-html Jini examples/notes-app: example app, no jQuery.

## NOISE-RULE (tuning proposals)
- **no-provider-error-echo** (Tovu 33 / Jini 115, WARNING): fires on any `err.message` returned to a client, including validation errors from the app's own typed errors (e.g. ExternalMcpValidationError, ExecutionCredentialValidationError, ToolInputError) and in repo scripts/tests. Proposal: exclude `scripts/**`, `**/__tests__/**`, `examples/**`; add `pattern-not-inside` for `instanceof <KnownTypedError>` branches.
- **log-raw-error** (5 / 9): same, scripts/*.mjs and web-clone skill scripts; exclude scripts/** and skills/**/scripts/**.
- **no-raw-fetch** (4505 / 349): by far the largest; almost certainly unit tests or fetch wrappers. Restrict paths to non-test production code or key on specific unsafe patterns.
- **no-secret-literals-in-tests** (ERROR; 411 / 661): ERROR severity on test fixtures; downgrade to INFO or allow `fake-`/`test-`-prefixed literals.
- **missing-template-string-indicator** (3284/2124), **react-props-spreading** (932/1489), **jsx-not-internationalized**, **i18next-key-format** (2003/1447): style rules; drop from security scan or move to lint.
- **html-in-template-string** (780/386), **no-stringify-keys**, **no-replaceall**, **no-as-any**: style/lint; no-as-any belongs in tsc/eslint.
- **react-component-options-param** (ERROR; 20 / 85): style convention at ERROR severity; downgrade to WARNING.
- **insecure-innerhtml / insecure-document-method / detected-* / hardcoded-hmac-key**: add `paths.exclude` for `**/__tests__/**`, `*.test.*`.
- **unsafe-formatstring** (32): fires on logs using template literal with error object; low signal; exclude or tighten.
- 114 (Tovu) and 198 (Jini) analysis errors (parse errors, ~99.9% parsed): not investigated.
