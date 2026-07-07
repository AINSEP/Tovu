# Directus AI Chat And MCP

**Source files analyzed:**
- `other-repos/directus/api/src/app.ts`
- `other-repos/directus/api/src/services/server.ts`
- `other-repos/directus/api/src/controllers/mcp.ts`
- `other-repos/directus/api/src/ai/chat/router.ts`
- `other-repos/directus/api/src/ai/chat/controllers/chat.post.ts`
- `other-repos/directus/api/src/ai/chat/middleware/load-settings.ts`
- `other-repos/directus/api/src/ai/chat/constants/system-prompt.ts`
- `other-repos/directus/api/src/ai/chat/lib/create-ui-stream.ts`
- `other-repos/directus/api/src/ai/chat/models/chat-request.ts`
- `other-repos/directus/api/src/ai/chat/utils/chat-request-tool-to-ai-sdk-tool.ts`
- `other-repos/directus/api/src/ai/chat/utils/format-context.ts`
- `other-repos/directus/api/src/ai/mcp/index.ts`
- `other-repos/directus/api/src/ai/mcp/server.ts`
- `other-repos/directus/api/src/ai/mcp/transport.ts`
- `other-repos/directus/api/src/ai/mcp/types.ts`
- `other-repos/directus/api/src/ai/tools/index.ts`
- `other-repos/directus/api/src/ai/tools/types.ts`
- `other-repos/directus/api/src/ai/tools/schema.ts`
- `other-repos/directus/api/src/ai/tools/{system,items,files,folders,assets,flows,operations,collections,fields,relations,trigger-flow}/index.ts`
- `other-repos/directus/api/src/ai/tools/{system,items,files,folders,assets,flows,operations,collections,fields,relations,trigger-flow}/prompt.md`
- `other-repos/directus/packages/system-data/src/fields/settings.yaml`
- `other-repos/directus/packages/types/src/settings.ts`
- `other-repos/directus/app/src/modules/settings/routes/ai/overview.vue`
- `other-repos/directus/app/src/modules/settings/components/navigation.vue`
- `other-repos/directus/app/src/stores/server.ts`
- `other-repos/directus/app/src/stores/settings.ts`
- `other-repos/directus/app/src/ai/stores/use-ai.ts`
- `other-repos/directus/app/src/ai/stores/use-ai-tools.ts`
- `other-repos/directus/app/src/components/v-form/composables/use-ai-tools.ts`
- `other-repos/directus/app/src/ai/composables/use-prompts.ts`
- `other-repos/directus/app/src/views/private/private-view/components/private-view-sidebar.vue`
- `other-repos/directus/app/src/modules/visual/components/editing-layer.vue`
- `other-repos/directus/api/src/database/migrations/20251103A-add-ai-settings.ts`
- `other-repos/directus/api/src/database/migrations/20260110A-add-ai-provider-settings.ts`
- `other-repos/directus/api/src/database/migrations/20250813A-add-mcp.ts`

---

## 1. Purpose

This slice of Directus defines two related AI surfaces:

- the `/ai/chat` runtime used by the Directus app assistant
- the `/mcp` runtime used by external MCP clients and prompt consumers

They are separate entrypoints, but they share the same underlying settings record, schema/accountability context, and tool registry. The runtime contract is:

- Directus app users can talk to AI only when AI is enabled and at least one provider is configured
- MCP clients can enumerate tools and prompts only when MCP is enabled
- destructive or schema-changing operations are gated by admin status, settings flags, and tool-specific validation

This is not a generic LLM integration. It is a Directus-specific adapter layer that exposes Directus schema, content, files, flows, and prompt templates through curated tool contracts.

---

## 2. Boot And Route Placement

`api/src/app.ts` mounts the AI routes late in the middleware chain, after authentication, schema resolution, sanitization, and cache middleware.

The relevant order is:

1. authenticate
2. schema resolution
3. query sanitization
4. cache
5. built-in API routes
6. `/mcp` if `MCP_ENABLED === true`
7. `/ai/chat` if `AI_ENABLED === true`
8. custom extension endpoints
9. not found and error handlers

That placement matters:

- both AI entrypoints run with `req.schema` and `req.accountability`
- both are behind the normal Directus auth and permission model
- neither route is mounted unless its env flag is enabled

`/mcp` is handled by `api/src/controllers/mcp.ts`, which reads the singleton settings row on each request and rejects access if `mcp_enabled` is false.

`/ai/chat` is handled by `api/src/ai/chat/router.ts`, which chains a settings loader middleware before the chat POST handler.

---

## 3. Server Flags And App Visibility

`ServerService.serverInfo()` exposes two runtime booleans to authenticated users:

- `mcp_enabled`
- `ai_enabled`

The values come from env, defaulting to `true` when the env var is unset:

- `MCP_ENABLED ?? true`
- `AI_ENABLED ?? true`

The app uses those flags in two places:

- the settings navigation shows the AI section when either flag is enabled
- the private sidebar and visual editor gate the AI assistant UI on `ai_enabled`

The app-side AI settings page also disables the AI or MCP form sections individually when the server info flags are false, and shows an environment warning notice.

---

## 4. AI Chat Runtime

### 4.1 Request Contract

`POST /ai/chat` accepts a `ChatRequest` that is a discriminated union over provider type plus the shared chat payload.

The request must include:

- `provider`: `openai`, `anthropic`, `google`, or `openai-compatible`
- `model`: string
- `messages`: non-empty array
- `tools`: array of either tool names or custom tool descriptors
- optional `toolApprovals`
- optional `context`

The controller rejects the request if:

- `req.accountability?.app` is not true
- the payload fails Zod validation
- the provider/model pair is not allowed by settings for standard providers
- the messages array is empty
- a requested server tool does not exist

The model allowlist rules are asymmetric:

- standard providers must have the requested model in the configured allowlist
- `openai-compatible` skips the allowlist check entirely because the user has explicitly configured the custom model list

### 4.2 Settings Loaded For Chat

`load-settings.ts` reads the AI-related singleton settings fields and stores them in `res.locals.ai`:

- provider API keys
- OpenAI-compatible base URL, name, headers, and model list
- provider allowlists
- `ai_system_prompt`

The controller then uses `res.locals.ai.settings` to:

- build the provider registry
- enforce provider/model availability
- pass model-specific provider options
- inject the system prompt

### 4.3 Provider Registry And Model Routing

The AI stream is built from provider configs assembled from settings:

- OpenAI requires `ai_openai_api_key`
- Anthropic requires `ai_anthropic_api_key`
- Google requires `ai_google_api_key`
- OpenAI-compatible requires both `ai_openai_compatible_api_key` and `ai_openai_compatible_base_url`

OpenAI-compatible can also carry:

- provider display name
- custom headers
- custom model metadata

The UI layer only offers providers whose keys are actually configured in `settings.availableAiProviders`.

### 4.4 System Prompt And Context

The chat runtime uses:

- the app-provided `ai_system_prompt` when present
- otherwise the built-in Directus system prompt constant

`formatContextForSystemPrompt()` appends structured context to the system prompt. It groups attachments into:

- prompt attachments
- user-added item attachments
- visual editing attachments

The context block also injects the current date and current page metadata. Visual editing attachments are explicitly framed as item updates, and the prompt instructs the model to use the `items` tool for mutations.

### 4.5 Tool Execution Path

The app sends a mixed tool list:

- server-side Directus tools by name
- client-side local tools with JSON schema only

`chatRequestToolToAiSdkTool()` converts each request tool into an AI SDK tool wrapper.

For Directus tools:

- the tool is looked up from `ALL_TOOLS`
- the tool-specific `validateSchema` is applied before execution
- the handler receives `{ args, accountability, schema }`
- `toolApprovals` control whether the tool needs user approval

For local tools:

- the request just contributes the JSON schema
- execution stays on the client

The controller also fixes malformed error tool calls before converting messages to AI SDK messages, because error states may carry `rawInput` without `input`.

### 4.6 Stream Behavior

`createUiStream()` uses the AI SDK `streamText()` call with:

- the resolved provider registry
- the selected model
- converted UI messages
- a 10-step stop condition
- provider-specific options
- Directus tools

If context is present, the runtime reuses a precomputed full system prompt on each step so tool continuation steps keep the same context block.

Usage metrics are reported back to the client as SSE-style `data-usage` messages.

---

## 5. MCP Runtime

### 5.1 Transport And Entry Point

`POST /mcp` and `GET /mcp` both route to the same handler in `controllers/mcp.ts`.

The handler:

1. reads MCP settings from the singleton settings row
2. rejects the request if `mcp_enabled` is false
3. instantiates `DirectusMCP` with the configured prompt collection, delete flag, and system prompt settings
4. delegates to `handleRequest(req, res)`

The `DirectusTransport` implementation is JSON-only. The server explicitly rejects non-JSON requests with HTTP 405 instead of supporting `text/event-stream`.

### 5.2 Authentication And Request Shape

`DirectusMCP.handleRequest()` rejects public access. It requires at least one of:

- `req.accountability.user`
- `req.accountability.role`
- `req.accountability.admin === true`

The request body must parse as a JSON-RPC message.

The response is asynchronous and event-driven:

- initialized notification returns HTTP 202
- JSON-RPC responses are written back through the transport

### 5.3 Tool Listing

The `tools/list` handler enumerates the shared tool registry from `ALL_TOOLS`.

Tool filtering rules:

- non-admin callers do not see tools marked `admin: true`
- `system-prompt` is hidden when `systemPromptEnabled` is false

Each listed tool includes:

- name
- description
- JSON Schema converted from the tool input schema
- annotations

### 5.4 Tool Calling

The `tools/call` handler resolves a tool by name, validates its arguments, and executes its handler with Directus accountability and schema.

Security and behavior rules:

- non-admin callers are blocked from `admin: true` tools
- `system-prompt` is special-cased to inject the configured prompt override
- stringified `data`, `keys`, and `query` arguments are parsed back to JSON before validation
- delete actions are blocked when `allowDeletes === false`
- tool execution errors are normalized into JSON-RPC error content

Successful text results are wrapped as:

- `content: [{ type: 'text', text: JSON.stringify({ raw, url }) }]`

If the tool result resolves to a single created/read/updated/imported item, the runtime tries to add an admin URL using the tool’s `endpoint()` callback and `PUBLIC_URL`.

### 5.5 Prompt Listing And Rendering

The MCP server also exposes prompt discovery and retrieval.

`prompts/list` and `prompts/get` require a configured `mcp_prompts_collection`. They read prompt records through `ItemsService` with the current accountability and schema.

Prompt records are expected to contain:

- `name`
- `description`
- `system_prompt`
- `messages`

Variable extraction uses `micromustache` tokenization across both the system prompt and message bodies. The server builds prompt arguments from every token name it finds.

`prompts/get` renders:

- the system prompt as the first assistant message, if present
- each valid message in order

The response is converted into MCP prompt format with an optional description.

---

## 6. Tool Architecture

### 6.1 Shared Registry

`ALL_TOOLS` is the canonical MCP/AI server tool registry.

Registered tools are:

- `system`
- `items`
- `files`
- `folders`
- `assets`
- `flows`
- `triggerFlow`
- `operations`
- `schema`
- `collections`
- `fields`
- `relations`

The registry exposes helper lookup functions:

- `getAllMcpTools()`
- `findMcpTool(name)`

### 6.2 Tool Contract

Each tool has:

- `name`
- `description`
- `inputSchema`
- optional `validateSchema`
- optional `admin` flag
- optional `endpoint()` for admin URL generation
- optional MCP annotations
- handler returning either text or binary asset content

The architecture splits the contract into two layers:

- `inputSchema` is the public schema exposed to clients
- `validateSchema` is the stricter runtime schema used before handler execution

That gives MCP and chat clients a stable request shape while still letting the runtime enforce Directus-specific rules.

### 6.3 Read-Only Tool

`schema` is the discovery tool. It is not admin-only.

Behavior:

- no `keys` or empty `keys` returns a lightweight list of real collections, folder collections, and collection notes
- `keys` returns detailed field and relation structure for the named collections
- alias/UI-only fields are skipped in the detailed view

This is the tool Directus expects the assistant to use first when it needs structure.

### 6.4 Content And Mutation Tools

`items`, `files`, `folders`, `collections`, `fields`, `relations`, `flows`, `operations`, and `trigger-flow` cover the main Directus content and configuration surfaces.

Important tool-level distinctions:

- `items`, `files`, `folders`, `assets`, `schema`, `trigger-flow`, and `system-prompt` are not admin-only
- `collections`, `fields`, `relations`, `flows`, and `operations` are admin-only
- destructive actions are still subject to the MCP server-wide `allowDeletes` flag

The mutation tools generally re-read and return the updated entity after write operations so the assistant gets an updated server-side view rather than a blind success response.

### 6.5 Endpoint URLs

Some tools expose an endpoint path that the server uses to construct an admin URL for a single returned record.

The URL is only added when:

- `PUBLIC_URL` exists
- the tool defines `endpoint()`
- the tool returned exactly one item for create/read/update/import style actions

---

## 7. System Prompt And Prompt Tools

### 7.1 Built-In System Prompt

`api/src/ai/tools/system/prompt.md` is the built-in Directus assistant prompt. It instructs the model to:

- be concise
- match the user’s technical level
- discover schema before acting
- ask for clarification when uncertain
- confirm before schema changes
- avoid deletions and bulk mutation without confirmation
- use semantic HTML in content fields

The prompt description file says the tool should be called first.

### 7.2 Prompt Override

The `system-prompt` tool accepts `promptOverride`.

Behavior:

- if an override is provided, the tool returns that text
- otherwise it returns the built-in prompt

In the MCP server, when `system-prompt` is executed, the server injects the configured settings prompt as `promptOverride`. That makes the tool the runtime bridge between settings and the prompt text exposed to clients.

### 7.3 Prompt Collection Contract

`mcp_prompts_collection` points to a Directus collection that stores reusable prompt templates.

The app-side prompt helper expects prompt items shaped like:

- `id`
- `name`
- `description`
- `status`
- `system_prompt`
- `messages`

The app fetches only `status = published` records. That means prompt templates are treated as authored content, but only published prompts are exposed to the assistant UI.

Prompt rendering rules in the app and MCP server are aligned:

- the system prompt becomes an assistant/system message first
- prompt variables are extracted from both the system prompt and messages
- prompt text is rendered with `micromustache`

---

## 8. App-Facing AI Settings And Contracts

The settings schema defines a dedicated AI block and a dedicated MCP block in `packages/system-data/src/fields/settings.yaml`.

### 8.1 AI Settings

The AI section includes:

- `ai_openai_api_key`
- `ai_anthropic_api_key`
- `ai_google_api_key`
- `ai_openai_compatible_api_key`
- `ai_openai_compatible_base_url`
- `ai_openai_compatible_name`
- `ai_openai_compatible_models`
- `ai_openai_compatible_headers`
- `ai_openai_allowed_models`
- `ai_anthropic_allowed_models`
- `ai_google_allowed_models`
- `ai_system_prompt`

The app’s `availableAiProviders` getter derives the enabled providers from configured credentials:

- OpenAI requires an OpenAI key
- Anthropic requires an Anthropic key
- Google requires a Google key
- OpenAI-compatible requires both a key and a base URL

The AI model selector only includes models that are both:

- supported by the active provider
- allowed by the configured allowlist

OpenAI-compatible custom models are always available if they are explicitly configured.

### 8.2 MCP Settings

The MCP section includes:

- `mcp_enabled`
- `mcp_allow_deletes`
- `mcp_prompts_collection`
- `mcp_system_prompt_enabled`
- `mcp_system_prompt`

The UI treats these as separate concerns:

- `mcp_enabled` gates the whole MCP server
- `mcp_allow_deletes` blocks delete actions at runtime
- `mcp_prompts_collection` enables reusable prompt discovery
- `mcp_system_prompt_enabled` decides whether the built-in system prompt is exposed
- `mcp_system_prompt` overrides the default prompt text

The settings screen saves AI and MCP edits together through the same singleton settings update path.

### 8.3 App UX Contracts

The app uses these settings in several places:

- AI assistant sidebar is shown only when `ai_enabled` is true
- the visual editor sends `aiEnabled` to embedded pages only if `ai_enabled` is true and at least one provider is configured
- the settings page shows environment warnings and disables form sections when the corresponding server flag is off

---

## 9. Operational And Security Implications

The design is intentionally permission-aware, but there are still sharp edges worth noting.

- AI chat only serves app users, not public anonymous traffic.
- MCP only serves authenticated users, and admin tools remain admin-only even inside MCP.
- The server does not trust client-side tool definitions for mutations. Server tools always validate through `validateSchema` and receive the current Directus schema and accountability.
- Delete operations are blocked centrally by `allowDeletes`, which is a coarse safety gate.
- The prompt collection is a content surface. If you point `mcp_prompts_collection` at editable content, prompt authorship becomes part of your security model.
- OpenAI-compatible provider headers are stored in settings and transformed into outbound request headers, so they should be treated as privileged configuration.
- The AI chat runtime forwards context attachments and page metadata into the system prompt, so sensitive content attached in the UI can influence model behavior and should be treated as user-visible prompt context.
- The MCP server builds admin URLs from `PUBLIC_URL`, so a missing or invalid public URL can reduce the usefulness of returned links even when the tool operation succeeds.

At a product level, the important contract is that AI in Directus is not a separate runtime. It is a set of authenticated adapters into the existing Directus permission, settings, and schema model.

---

## 10. Tovu Reconstruction Notes

### 10.1 Why this exists

This subsystem exists so AI can act on the platform through governed interfaces instead of bypassing the normal content, schema, and permission model. Directus is treating AI as another authenticated operator surface, not as a privileged backdoor.

### 10.2 What Tovu should preserve

- Provider/model configuration as settings, not hardcoded SDK calls inside core logic
- A permission-aware tool registry rather than direct model access to arbitrary server functions
- A clear separation between internal assistant UX and external MCP-style protocol exposure
- Structured context assembly so page state and staged content are explicit inputs to model behavior

### 10.3 What Tovu can simplify

- V1 can ship the internal assistant before external MCP support
- Tovu can start with a smaller curated tool set
- Provider-specific edge cases can live in adapters as long as the core AI/tool contract stays swappable
- Advanced OpenAI-compatible headers and provider metadata can come later

### 10.4 Possible Tovu seams

- `src/features/ai-assistant/` for chat/session/tool orchestration
- `src/features/prompt-catalog/` for reusable prompt content
- `src/core/ports/LLMProviderPort.ts` for provider execution
- `src/core/ports/AIToolRegistryPort.ts` for tool lookup and execution gating
- `src/core/ports/ContextAssemblyPort.ts` for staged content/page-context assembly

### 10.5 Suggested priority

- `V1`: internal assistant, settings-backed provider selection, explicit tool registry, permission-aware execution
- `Later`: external MCP surface, broader tool catalog, richer provider compatibility features
