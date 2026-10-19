Software Architect(Direct): Software Architect + CodeBase Analyzer—personas loaded to assess ownership and trace the existing integration.

**A. Verdict**

**Use a first-class Jini provider-login adapter, rather than a “ChatGPT Connect” agent plugin.** Keep OAuth, credentials, inference and connection UI in their existing Jini owners; Tovu supplies site/session bindings. This follows [Jini First](/Users/la/Programming/Tovu/AGENTS.md:10).

**You can already use your ChatGPT plan through Local CLI → Codex:** install Codex, run `codex login` with ChatGPT, then rescan/select Codex in Tovu. Jini preserves the CLI’s native authentication, including refreshed credentials. API-key login instead uses API billing. [Codex authentication](https://learn.chatgpt.com/docs/auth), [native authentication binding](/Users/la/Programming/Jini/packages/daemon/src/agent-executor/mcp-bridge.ts:633).

Direct SIWC adds a useful alternative: **no Codex binary, Tovu-specific authorization and usage controls, and direct Responses API inference.**

| Area | Current implementation and implication |
|---|---|
| Setup UI | Tovu mounts Jini’s shared `ExecutionTab` in [SettingsUi.tsx:382](/Users/la/Programming/Tovu/apps/admin/src/features/settings/SettingsUi.tsx:382). The actual Local CLI/BYOK controls live in [ExecutionTab.tsx:206](/Users/la/Programming/Jini/packages/ui/src/features/execution/react/components/ExecutionTab.tsx:206). Reuse this surface. |
| Credentials | Personal execution credentials are scoped by workspace + principal, sealed through Jini’s vault; visitor credentials are separately workspace scoped. See [personal store](/Users/la/Programming/Tovu/apps/website/src/assistant/execution-credential-store.ts:7), [visitor store](/Users/la/Programming/Tovu/apps/website/src/assistant/site-credential-store.ts:24), and [vault binding](/Users/la/Programming/Tovu/apps/website/src/assistant/assistant-vault.ts:30). |
| “Works for” | Existing compatibility matching is explicit metadata, separate from payload shape and endpoint authorization. An OAuth token must not become an interchangeable OpenAI API key merely through `worksFor`. [provider-matches.ts:31](/Users/la/Programming/Jini/packages/platform/src/secrets/credential-sets/provider-matches.ts:31) |
| Chat execution | The browser uses Jini’s HTTP transport; Tovu resolves credentials and invokes Jini’s provider turn runner with its existing authorized tool surface. Reuse that lifecycle. [transport](/Users/la/Programming/Tovu/apps/admin/src/lib/assistant-transport.ts:14), [turn composition](/Users/la/Programming/Tovu/apps/website/src/server/runtime/composition/modules/assistant-byok.ts:493) |
| OpenAI adapter | **There is no OpenAI Responses inference adapter in the inspected source.** BYOK uses `/chat/completions`, streams, and sends its `apiKey` as Bearer. Its request contract has no `store:false` option and always supplies token-limit fields. It cannot serve SIWC unchanged. [openai-chat.ts:180](/Users/la/Programming/Jini/packages/agent-runtime/src/providers/openai-chat.ts:180) |

**Reuse these mechanisms:** `ExecutionTab`/`ExecutionPort`, `@jini-ai/oauth`, `createTokenRefresher`, `SecretsVaultService`/`SqlSecretsVaultRepo`, and `runProviderToolTurn` with the existing tool-execution boundary.

There are **two different plugin systems**:

- **Agent plugins**, including `content/agent-plugins/*`, package skills and MCP servers using `plugin.json`/`mcp.json`. They do not register inference providers or inject arbitrary admin settings. [package contract](/Users/la/Programming/Jini/packages/agent-plugins/README.md:30), [Composio example](/Users/la/Programming/Tovu/content/agent-plugins/composio/plugin.json:1).
- **Jini host plugins** use `jini.plugin.json`. Their SDK exposes routes, tools, public SSR widgets and content hooks. `adminSurfaces` remains unwired; `browserProviders` accepts **charts only**. No model/auth-provider contribution point exists. A trusted in-process plugin could technically open a listener, but that still leaves the admin and inference integration missing. [SDK](/Users/la/Programming/Jini/packages/plugins/src/host/ports.ts:16), [manifest](/Users/la/Programming/Jini/packages/plugins/src/host/manifest.ts:85), [browser-provider restriction](/Users/la/Programming/Jini/packages/plugins/src/host/browser-providers.ts:49).

An optional agent plugin could later provide guidance. It should call shared host capabilities, remain self-contained and never own a parallel credential/inference lifecycle or import another plugin. Keep tools generic by category, vendors as adapters, and commerce outside core.

**MCP is not required for SIWC.** This connection is OAuth/OIDC + Responses API. Existing MCP tools can remain behind Tovu’s tool executor; they are independent of provider authentication.

**B. UX**

Third tab: **Provider login**. Initially show only ChatGPT.

1. Open a modal explaining eligible Plus/Pro plan usage, app limits and optional credits. Use **Continue with ChatGPT**; the consent flow owns the per-app cap. Keep extra credits off by default.
2. Prepare a persistent opaque host ID and fresh state, nonce and PKCE. Start `http://127.0.0.1:<port>/auth/callback` **before** opening the system browser.
3. First authorization uses `dynamic_agent_client`; capture the issued `oaiapp_…` client ID. Exchange the code using that ID, the verifier, exact redirect URI and resource.
4. Verify JWKS signature, issuer, audience, expiry and nonce; confirm `chatgpt.tokens.use.direct`. Save account registrations separately and activate only the validated selection. [sign-in contract](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).
5. Show **Connected**, recognizable account label, account-specific model picker, **Manage usage**, **Switch account**, and **Sign out**. Show the first-use plan confirmation once and “Using ChatGPT plan” near the composer. [UI requirements](https://developers.openai.com/siwc/ui-ux-guidelines).
6. On limits, pause requests and offer Manage usage. Temporary availability failures preserve credentials and use bounded retry; ineligibility explains the restriction without OAuth loops. Never silently switch to BYOK billing. [recovery rules](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery).
7. Sign-out stops requests, attempts refresh-token revocation, then clears tokens while retaining account/client mapping and host ID. Report unconfirmed remote revocation. [session lifecycle](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions).

**C. Implementation outline**

| Piece | Owner/files | Size and required work |
|---|---|---|
| SIWC authorization adapter | Jini `packages/oauth/src/*`; agent-runtime provider adapter | **M.** Reuse PKCE, resource parameters and refresh. Add issued-client registration, OIDC verification and revocation. Existing [token parsing](/Users/la/Programming/Jini/packages/oauth/src/token-endpoint.ts:120) drops `id_token`; it needs extension. |
| Loopback lifecycle | Jini [oauth-callback-server.ts](/Users/la/Programming/Jini/packages/agent-runtime/src/providers/oauth-callback-server.ts:26) | **S–M.** Reuse listener; preserve callback `client_id`, enforce the SIWC path and state rules, support cancellation and ephemeral ports. Current success outcome carries only code/state. |
| Protected connection records | Jini platform/db vault; thin Tovu binding | **M.** Store access/refresh/ID tokens sealed, keyed by principal + issued client + verified account. Preserve multiple registrations. The current personal-execution store is a singleton, so it is not a drop-in account registry. Keep SIWC records out of generic credential-copy/export and visitor-key selection. |
| Responses adapter | Jini `packages/agent-runtime/src/providers/*`, extending [tool-turn dispatch](/Users/la/Programming/Jini/packages/agent-runtime/src/providers/tool-turn.ts:259) | **L.** Bearer authentication, account model catalog, Responses history/tool conversion, SSE terminal/error handling and SIWC request restrictions. Reuse tool authorization/execution and normalized events. |
| UI and transport | Jini `packages/ui/src/features/execution/*`, `packages/chat`; Tovu settings/transport/composition adapters | **M.** Extend the two-mode contract, add connection modal/status and pass a connection reference rather than browser-held tokens. Avoid a duplicate execution port in `packages/admin`: its [ownership rule](/Users/la/Programming/Jini/packages/admin/src/core/ports/README.md:10) explicitly forbids that. |
| Host eligibility | Tovu backend capability + admin policy; desktop browser opening | **S.** Enforce eligibility server-side and project it into the UI. Publish Jini packages before updating Tovu dependencies. |

Material risks:

- **Hosting:** local development and desktop’s local server fit the documented local flow. Desktop already spawns `tovu serve`; use that server’s loopback listener and the OS browser. [desktop topology](/Users/la/Programming/Tovu/apps/desktop/main.ts:25). **Disable SIWC registration and inference on hosted tovu.dev until OpenAI commercial approval**; hiding the tab alone is insufficient. User-owned self-hosted VMs have a separate documented path. [eligibility](https://developers.openai.com/siwc/token-sharing-open-source).
- **Host detection:** reuse the existing capability approach, but a desktop window attached to a remote origin must not automatically authorize remote SIWC. Current CLI policy uses runtime mode/desktop presence. [policy](/Users/la/Programming/Tovu/apps/admin/src/lib/tovu-execution-policy.ts:4).
- **Storage/rotation:** use the existing site-key-backed vault, protected local permissions, atomic replacement and per-session refresh serialization across processes. Jini already has coalescing, optional leases and persist-before-return behavior in [createTokenRefresher](/Users/la/Programming/Jini/packages/oauth/src/refresh.ts:50).
- **Tools—briefing updated:** official docs now explicitly support function/custom tools, with namespace or `additional_tools` packaging. They exclude hosted MCP/connectors and Responses `tool_search`. Tovu’s existing search/describe/execute **functions** remain plausible; their SIWC integration is unverified. Also require `store:false`, `stream:true`, complete history, and omit unsupported token-limit/system-message fields. [preview restrictions](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).
- Token lifetimes are now documented: access one hour; rotating refresh tokens 30 days. Use returned expiry data. [token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference).

**D. Claude and Gemini**

| Provider | Direct plan login | Existing Tovu/Jini path |
|---|---|---|
| Claude | Do not offer Claude.ai OAuth or collect its tokens. Use Console/provider credentials. Anthropic permits users to authenticate through its unmodified Claude Code binary under its stated conditions. [policy](https://code.claude.com/docs/en/legal-and-compliance) | **Claude Code Local CLI exists**, including auth probing and streaming execution. [claude.ts:77](/Users/la/Programming/Jini/packages/agent-runtime/src/defs/claude.ts:77) |
| Gemini | No supported consumer-plan inference login for Tovu was established. Gemini API has separate billing; Gemini CLI supports Google sign-in, but its OAuth services cannot be directly reused by third-party clients. [API billing](https://ai.google.dev/gemini-api/docs/billing), [CLI policy](https://geminicli.com/docs/resources/tos-privacy/) | **Gemini CLI was retired on October 6.** The current Google CLI entry is Antigravity (`agy`); that does not authorize reusing its login in a direct adapter. [registry.ts:65](/Users/la/Programming/Jini/packages/agent-runtime/src/registry.ts:65) |

**E. Owner choices—recommended defaults**

1. **Immediate plan usage or CLI-free onboarding?** Use existing Codex now; build SIWC for CLI-free onboarding.
2. **Initial surfaces?** Local/desktop admin assistant only; keep hosted and public visitor assistants excluded.
3. **Account scope?** Principal-owned registrations with an explicit active account, separate host identity and no automatic site-to-site credential copying.

Read-only investigation completed. No files changed; no tests, typechecks or builds ran. Conclusions are based on targeted source tracing and current official documentation, not live OAuth/inference validation.
