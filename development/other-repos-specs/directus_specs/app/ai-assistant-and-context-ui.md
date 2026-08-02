# Directus AI Assistant And Context UI

**Source files analyzed:**
- `other-repos/directus/app/src/ai/models.ts`
- `other-repos/directus/app/src/ai/stores/use-ai.ts`
- `other-repos/directus/app/src/ai/stores/use-ai-context.ts`
- `other-repos/directus/app/src/ai/stores/use-ai-tools.ts`
- `other-repos/directus/app/src/ai/composables/use-context-staging.ts`
- `other-repos/directus/app/src/ai/composables/use-prompts.ts`
- `other-repos/directus/app/src/ai/components/ai-sidebar-detail.vue`
- `other-repos/directus/app/src/ai/components/ai-conversation.vue`
- `other-repos/directus/app/src/ai/components/ai-header.vue`
- `other-repos/directus/app/src/ai/components/ai-input.vue`
- `other-repos/directus/app/src/ai/components/ai-context-menu.vue`
- `other-repos/directus/app/src/ai/components/ai-settings-menu.vue`
- `other-repos/directus/app/src/views/private/private-view/components/private-view-sidebar.vue`
- `other-repos/directus/app/src/modules/visual/components/editing-layer.vue`
- `other-repos/directus/app/src/components/v-form/composables/use-ai-tools.ts`
- `other-repos/directus/app/src/modules/settings/routes/ai/overview.vue`

---

## 1. Overview

The Directus AI assistant is not implemented as a detached chat page. It is a cross-cutting app surface that combines:

- a sidebar-mounted conversation UI
- persistent client-side chat, context, and tool state
- server-backed `/ai/chat` transport
- MCP-backed reusable prompts
- visual-editor context capture
- local form tools that can read or stage edits from the current screen
- an admin settings screen for AI and MCP configuration

The important architectural point is that Directus treats AI as a governed operator surface inside the admin app, not as a free-form browser widget.

---

## 2. Availability And Gating

The assistant is gated at multiple layers.

### 2.1 Sidebar-level gating

`private-view-sidebar.vue` always renders the normal module accordion, but only mounts `AiSidebarDetail` when `serverStore.info.ai_enabled` is true.

That means:

- the sidebar shell exists regardless
- the AI toggle and conversation surface do not render when the server disables AI
- the sidebar layout reserves space for the AI collapsible only when enabled

### 2.2 Conversation-level gating

`ai-conversation.vue` computes `hasProviders` from `aiStore.models.length > 0`.

Empty states split into three cases:

- AI is enabled but no providers are configured and the user is an admin: show a settings CTA to `/settings/ai`
- AI is enabled but the current user cannot configure providers: show a read-only explanation
- providers exist but the conversation is empty: show the normal “build with assistant” intro state

### 2.3 Prompt/MCP gating

`ai-context-menu.vue` only exposes prompt insertion when:

- `serverStore.info.mcp_enabled` is true
- `settingsStore.settings?.mcp_prompts_collection` is configured
- published prompts can be loaded

So MCP prompt staging is a stricter subset of the broader AI UI.

---

## 3. Core Store Model

The assistant state is split across three Pinia stores with clear responsibilities.

### 3.1 `useAiStore`

`useAiStore` is the conversation and transport orchestrator.

Its responsibilities include:

- `chatOpen` persistence in local storage
- draft input state
- model selection and allowed-model filtering
- chat transport setup against `/ai/chat`
- message persistence in session storage
- tool approval and tool-call response handling
- token-usage tracking
- UI event hooks for visual highlighting, input focus, and submit events

The store derives allowed models from:

- built-in `DEFAULT_AI_MODELS`
- user-configured OpenAI-compatible models
- per-provider allowed-model settings from `directus_settings`
- currently available providers exposed by the settings store

The selected model is stored as `provider:model`, with explicit support for model ids that contain colons.

### 3.2 Request body contract

The chat transport sends a structured request body, not just raw chat text. Each request can include:

- `provider`
- `model`
- `tools`
- `toolApprovals`
- `context.page`
- `context.attachments`

`context.page` is derived from the active route and may include:

- `path`
- `collection`
- `item`
- `module`

That makes the conversation state aware of the current Directus surface even when no extra attachments are staged.

### 3.3 Message lifecycle

Before submit, `useAiStore` snapshots staged context by calling `contextStore.fetchContextData()`.

On submit it then:

1. sends the user message with attachment metadata
2. clears only non-visual staged context
3. preserves visual context until the visual editing session changes or ends

This distinction is deliberate. Visual context is treated as navigation-bound, while prompt and item staging is treated as one-shot conversation context.

### 3.4 Local and server tool behavior

`onToolCall` in `useAiStore` distinguishes between:

- server tools, including dynamic tools and known system tools
- local tools registered in the browser

Local tools are executed in the client and their results are written back through `chat.addToolResult()`. Failures become `output-error` tool results rather than crashing the chat session.

The store also watches completed assistant parts and forwards successful system-tool outputs through `toolsStore.triggerSystemToolResult(...)`.

### 3.5 `useAiContextStore`

`useAiContextStore` owns pending context attachments.

It maintains:

- `pendingContext`
- `visualElementContextUrl`
- derived `visualElements`
- max pending context limit of `10`

The store supports three attachment classes:

- prompt context
- item context
- visual-element context

When attachments are fetched for a request, item and visual-element context are resolved against the API so the backend receives a snapshot rather than just an id reference.

### 3.6 `useAiToolsStore`

`useAiToolsStore` manages:

- approval mode per system tool in local storage
- the static system tool set
- registered local UI tools
- an event hook for system tool results

System tool approval modes are:

- `always`
- `ask`
- `disabled`

Only non-disabled system tools are included in outbound chat requests.

---

## 4. Conversation Shell And Sidebar Integration

`AiSidebarDetail` is mounted at the bottom of the private-view sidebar and wrapped in a collapsible.

The open state is bound directly to `aiStore.chatOpen`, so the UI shell and store state are the same switch.

The sidebar behavior is coupled to the main sidebar store:

- opening the AI panel expands the sidebar
- collapsing the sidebar forcibly closes the AI panel

Inside the panel:

- `AiHeader` exposes model selection, conversation reset, and settings
- `AiConversation` owns empty states, error notices, message rendering, and scroll behavior
- `AiInput` owns pending context chips, the add-context menu, textarea, and submit/stop/retry actions

This makes the assistant a persistent module-side detail pane rather than a route transition.

---

## 5. Context Assembly And Prompt Staging

`AiContextMenu` is the main UI for attaching extra context.

It supports two top-level context sources:

- reusable MCP prompts
- content items from collections

### 5.1 Prompt flow

`usePrompts()` loads published prompt records from the configured prompts collection and extracts template variables from:

- `system_prompt`
- `messages[].text`

Template variables are parsed through micromustache after sanitizing `{{ variable: description }}` syntax down to the actual variable name.

If variables exist, the UI opens `AiPromptVariablesModal`. Otherwise the prompt is staged immediately.

Prompt staging stores:

- a display name
- the rendered prompt text
- the original prompt definition and variable values

### 5.2 Item staging flow

For item context, the menu:

1. lets the user choose a non-alias collection
2. opens `DrawerCollection`
3. stages selected item ids through `stageItems()`

`stageItems()` resolves display labels using the collection display template and the collection primary key, then stores each selected item as pending context.

### 5.3 Visual-element staging flow

`stageVisualElement()` is used when context comes from the visual editor.

It:

- detects duplicate visual-element attachments by collection, item, and sorted fields
- resolves a display label from either a selected field value or the collection display template
- opens the AI chat automatically
- requests input focus

If the action originates from a popup window, it forwards the staging request to the opener window instead of duplicating state.

---

## 6. Visual Editing And Local Form Tooling

Two separate app integrations make the assistant route-aware and editor-aware.

### 6.1 Visual editor bridge

`modules/visual/components/editing-layer.vue` bridges the website iframe and the AI context system.

It listens for cross-window messages such as:

- `connect`
- `navigation`
- `edit`
- `addToContext`

The bridge:

- syncs visual context to the current frame URL
- stages visual elements into the AI store
- highlights elements back inside the frame when the assistant asks to focus them
- sends a synthetic “saved” message to the frame whenever the `items` system tool performs a non-read mutation

This is the key link between AI actions and live preview refresh behavior.

### 6.2 Local form tools

`components/v-form/composables/use-ai-tools.ts` registers form-scoped browser tools with `defineTool(...)`.

The two built-in local tools are:

- `read-form-values-<uid>`
- `set-form-values-<uid>`

They operate only on the currently open form and explicitly do not query or mutate the database directly.

The write tool is collab-aware. It skips fields currently focused by another user and reports partial failures in its output.

---

## 7. Settings Surface

`modules/settings/routes/ai/overview.vue` is the operator-facing configuration screen for AI and MCP.

It:

- reads `directus_settings` field metadata through `useCollection('directus_settings')`
- filters fields into `ai_group` and `mcp_group`
- binds both groups through `VForm`
- persists edits through `settingsStore.updateSettings(...)`
- rehydrates server info after save
- warns when AI or MCP is disabled by environment flags

The page also uses an edits guard and `meta+s` save shortcut, which makes AI configuration part of the normal Directus settings workflow rather than a one-off modal.

---

## 8. Operational Constraints And Caveats

- The conversation history is session-scoped, not permanently stored in the browser.
- The open/closed chat state and selected model are persisted locally.
- Non-visual staged context is cleared after submit; visual context is navigation-bound.
- Only configured and allowed models appear in the selector.
- MCP prompts do not exist unless a prompts collection is configured and MCP is enabled.
- System tools are available only through explicit approval state and can be disabled entirely in the UI.
- Local tools are page-scoped helpers and should not be treated as general backend capabilities.

---

## 9. Tovu Reconstruction Notes

### 9.1 Why this exists

This UI exists so AI can participate in authoring and operations from inside the admin workspace instead of living in a disconnected chatbot window. The staged-context model is the key idea: the user explicitly tells the assistant what page, item, or visual element it should reason about.

### 9.2 What Tovu should preserve

- AI as a native admin-shell surface, not a bolted-on iframe or separate product
- Explicit staged context rather than implicit scraping of the current page
- A distinction between server tools and local UI tools
- Settings and availability gating so the UI reflects actual runtime capability

### 9.3 What Tovu can simplify

- V1 can use one assistant panel instead of the full Directus sidebar behavior
- Visual-element staging can come after item/prompt context if the context model is already designed for it
- The first local tool set can be minimal as long as UI-scoped tool registration remains possible

### 9.4 Possible Tovu seams

- `src/features/ai-assistant/` for conversation/session orchestration
- `src/admin-shell/ai/` for assistant UI metadata and host components
- `src/core/ports/AssistantContextPort.ts` for staged-context assembly and hydration
- `src/core/ports/AssistantToolPort.ts` for local/server tool registration boundaries

### 9.5 Suggested priority

- `V1`: assistant panel, staged item/page context, settings gating, clear split between local and server tools
- `Later`: visual-editor context, prompt library UX, richer collaboration-aware local tools
