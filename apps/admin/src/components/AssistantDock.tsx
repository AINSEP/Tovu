import { useCallback, useEffect, useRef, useState } from "react";
import { useMemo } from "react";
import {
  A2uiSurfaceCard,
  ChatPane,
  ConversationList,
  JiniChatProvider,
  createDaemonAttachmentUploader,
  createMcpUiToolCaller,
  registerExtEventRenderer,
  registerMcpUiSurfaceRenderer,
  type ChatPaneAgent,
  type ChatPaneAgentSelection,
  type FrontendSessionBridge,
} from "@jini-ai/chat/react";
import { isTerminalRunStatus, type ChatMessage } from "@jini-ai/chat/core";
import { DEFAULT_PROVIDER_PRESETS, resolveSelectedPreset, type ExecutionConfig } from "@jini-ai/ui";

import { createA2uiActionPoster } from "../lib/a2ui-action-poster";
import { createTovuAssistantTransport } from "../lib/assistant-transport";
import { publishSettingsRefresh } from "../lib/settings-refresh-bus";
import {
  DEFAULT_EXECUTION_CONFIG,
  EXECUTION_NAMESPACE,
  createExecutionPort,
  hasUsableAdminKey,
  loadAdminExecutionCredential,
  loadExecutionConfig,
  saveExecutionConfig,
  selectedLocalCliModel,
} from "../lib/execution-settings";
import { useWiredAssistantChats, type UseAssistantChats } from "../hooks/use-assistant-chats.hooks";
import "../styles/assistant.css";
// The runtime picker's BYOK model row renders `@jini-ai/ui`'s `SearchableModelSelect`, whose
// styles (including the body-portaled `.jini-select-menu`) live in this sheet. The settings
// screens import it too, but the dock is mounted on every admin route — relying on a screen the
// operator may never open would leave the dropdown unstyled exactly when it is used most.
import "@jini-ai/ui/settings-dialog.css";

/**
 * Brand mark for a BYOK provider, keyed by `ProviderPreset.id`, resolved against the artwork this
 * host actually ships in `src/public/agent-icons/`.
 *
 * Maps to CLI-agent icon ids because that is the asset set `AgentIcon` reads and the marks are the
 * vendors' own — `gemini.svg` is Google's logo whether a Gemini CLI or a Gemini API key is what
 * runs. A preset absent from this table (Azure OpenAI, OpenRouter, Ollama — no artwork on disk)
 * deliberately yields nothing, and the picker shows a generic API glyph. That is honest; pointing
 * `AgentIcon` at an id with no file would render a broken image or an unrelated initial-letter
 * badge, and inventing a nearby vendor's logo would be worse than showing none.
 */
const BYOK_PRESET_ICON_IDS: Readonly<Record<string, string>> = {
  anthropic: "claude",
  openai: "codex",
  "google-gemini": "gemini",
};

/**
 * Renders the MCP-UI surfaces the daemon withholds from tool results, and wires the dialog's
 * confirmed click back to Tovu's own redemption endpoint (ADR-053 Decision 3).
 *
 * Module scope, once, deliberately — `registerMcpUiSurfaceRenderer` populates `@jini-ai/chat`'s
 * ext-event renderer registry, which every `ChatPane` consults thereafter; calling it inside a
 * component would re-register on each render for no benefit. This is the whole of the host-side
 * wiring: `ChatPane` itself is untouched, and an admin build that never imports this module simply
 * renders nothing for `mcp-ui` events rather than breaking.
 *
 * `onToolCall: createMcpUiToolCaller("", { path: "/api/admin/v1/mcp-ui/tool-calls" })` is what
 * completes the confirmation loop: when a human clicks "Delete" in the rendered dialog, the View
 * posts a `tools/call`, and this relays it (same-origin, session cookie) to Tovu's own
 * admin-session-authenticated proxy (`src/server/modules/assistant.ts`), which forwards it to the
 * daemon-side redemption route (`src/assistant/mcp-ui-tool-calls-route.ts`) — the one place that
 * actually holds the `content_post_delete` handler and its `PendingConfirmationStore`. `path` is
 * required rather than the library's own bare-daemon default (`/api/mcp-ui/tool-calls`): Tovu mounts
 * this behind the admin-session-gated `/api/admin/v1` prefix, exactly the case
 * `CreateMcpUiToolCallerOptions.path`'s own doc calls out ("hosts mounting the redemption route
 * inside an already-authenticated admin API will need this"). With `onToolCall` wired, the dialog no
 * longer refuses every tool call — a real confirmed click now redeems the token and completes the
 * delete.
 *
 * The other half of the contract lives in `../lib/assistant-transport.ts`'s `case "mcp-ui"`, which
 * unwraps the wire envelope to the bare `EmbeddedResource` this renderer's `parseUIResource`
 * requires. All three pieces are needed; any one missing renders an empty frame or a dialog that
 * cannot complete its action.
 */
registerMcpUiSurfaceRenderer({
  onToolCall: createMcpUiToolCaller("", { path: "/api/admin/v1/mcp-ui/tool-calls" }),
});

/**
 * A2UI's counterpart to the MCP-UI wiring above — same module-scope-once posture, same "one line
 * completes the loop" shape. `@jini-ai/chat/react`'s `A2uiSurfaceCard` renders any run event
 * `assistant-transport.ts`'s `case "a2ui"` unwraps to a bare `AgentToRendererMessage`; when a
 * rendered `Button`'s action is agent-directed (as opposed to a `local` client-side function call,
 * which the card already resolves and displays itself), `onAgentAction` is what gives that action
 * somewhere real to go — `createA2uiActionPoster` posts it to `a2ui-actions-route.ts` (proxied,
 * same as every other assistant route), which delivers it into the held-open exchange
 * `assistant_demo_a2ui` (or any future A2UI-opening tool) is waiting on.
 *
 * Without this line, `A2uiSurfaceCard` still renders correctly but falls back to its own honest
 * "this host has not wired up a live agent-action relay yet" notice on every agent-directed click
 * (see that component's own module doc) — exactly the gap `examples/reference-web/src/A2uiLab.tsx`
 * leaves open deliberately, because a demo fixture has no real backend to relay to. Tovu does now.
 */
const postA2uiAction = createA2uiActionPoster("", { path: "/api/admin/v1/a2ui/actions" });
registerExtEventRenderer("a2ui", (props) => <A2uiSurfaceCard {...props} onAgentAction={postA2uiAction} />);

declare global {
  interface Window {
    /**
     * Debug-only live transcript mirror, driven by `ChatPane`'s `onMessagesChange` — lets a test
     * driver (Playwright, etc.) read exactly what the pane rendered (including every
     * `tool_use`/`tool_result` event) without scraping the DOM. Not a security surface: it only
     * ever holds the current admin's own already-visible conversation.
     */
    __tovuAssistantMessages?: ChatMessage[];
  }
}

/**
 * @file The global assistant dock (ADR-049) — every admin page gets the same chat pane on the
 * right, not a routed `/admin/assistant` page. Mounted once in `App.tsx`, outside the routed
 * `content` switch, and toggled via `hidden` (never conditional render) so the conversation
 * survives both a FAB close/reopen AND navigating to a different admin section — matches
 * `examples/reference-web/src/AgentLab.tsx`'s own pane in Jini's own repo: "the pane keeps its
 * conversation across toggles... it also drops out of layout and the tab order when closed, so
 * the page genuinely resizes rather than reserving a gap."
 *
 * Hosts `@jini-ai/chat/react`'s `<ChatPane>` against Tovu's own `@jini-ai/core`+`@jini-ai/daemon`
 * kernel (`src/assistant/agent-daemon-server.ts`, proxied by `src/server/modules/assistant.ts`).
 * Tool execution is not a prop here — it happens server-side: the spawned coding-agent CLI gets
 * `.mcp.json`-injected access to Tovu's registered tools (`src/assistant/tool-registrations.ts`)
 * and calls them through the daemon's `/api/delegated-tool-calls` gate, which shows up in this
 * same transcript as ordinary `tool_use`/`tool_result` events — `ChatPane` renders those itself.
 *
 * `uploadAttachments`/`attachmentAccept` below wire the composer's existing (host-agnostic,
 * `@jini-ai/chat/react`-native) drag-and-drop and file-picker mechanism to this daemon's own
 * `/api/attachments` route — see that route's registration in `src/assistant/agent-daemon-server.ts`
 * and its proxy pass-through in `src/server/modules/assistant.ts` for the rest of the chain
 * (`onStarted` claims the upload and hands the daemon's `AgentExecutor.run()` real `imagePaths`).
 *
 * `styles/assistant.css` themes the pane. Note that the package does NOT ship zero CSS, contrary to
 * what this comment used to claim: `ChatPane` injects its own complete default theme as a `<style>`
 * tag at mount, appended last in the cascade. Host overrides therefore need either the
 * `--jini-chat-*` custom-property seam or a descendant selector — a flat `.jini-*` rule in
 * `assistant.css` loses even at equal specificity. See that file's header for the full account.
 */

const AGENTS_URL = "/api/agents";

async function fetchAgents(): Promise<ChatPaneAgent[]> {
  const response = await fetch(AGENTS_URL, { credentials: "same-origin" });
  if (!response.ok) return [];
  const { agents } = (await response.json()) as { agents: ChatPaneAgent[] };
  return agents;
}

export interface UseExecutionConfig {
  executionConfig: ExecutionConfig;
  /** Same object as `executionConfig`, mirrored into a ref — see the field's own doc below for why. */
  executionConfigRef: React.MutableRefObject<ExecutionConfig>;
  setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
  handleExecutionModeChange: (mode: "local" | "api") => void;
  /**
   * Whether this admin has a BYOK credential saved server-side (2026-08-05) — `null` until the
   * initial GET settles, then `true`/`false`. See {@link AssistantDock}'s `apiModeAvailable` for why
   * this exists: `executionConfig.byok.apiKey` alone is no longer enough to answer "is BYOK
   * usable", because the key is write-only and empty on every fresh load even when one is stored.
   */
  hasStoredAdminKey: boolean | null;
  /**
   * True once the initial ledger GET (`loadExecutionConfig()`) has settled — resolved OR
   * rejected — false only during that first in-flight load. Added (2026-08-05) for
   * {@link useLocalCliSelection}'s one-time hydration: `executionConfig.localCli.agentId` starts
   * `null` in `DEFAULT_EXECUTION_CONFIG`, and a load that resolves to "nothing was ever saved"
   * ALSO leaves it `null` — those two states are indistinguishable from `executionConfig` alone,
   * so a separate "has the GET settled at all" signal is what lets that hook's hydration effect
   * fire exactly once instead of never (waiting on a non-null `agentId` that may never arrive) or
   * too early (before the load has had any chance to run).
   */
  configLoaded: boolean;
}

/**
 * Owns the runtime picker's Local CLI / API · BYOK state (ADR-049's picker, 2026-08-04 wiring) and
 * the mode-switch write-back. Split out of `AssistantDock` so the config-load failure path (the
 * `.catch()` below) and the mode-switch persistence path can be driven directly with `renderHook`
 * against a mocked `execution-settings.ts`, rather than only indirectly through a full dock mount.
 *
 * @returns `executionConfig` (the live value), `executionConfigRef` (read-fresh mirror for
 *   consumers that must not capture a stale closure), `setExecutionConfig`, and
 *   `handleExecutionModeChange` (persists a mode switch back through the ADR-028 chokepoint).
 * @example
 * const { executionConfig, handleExecutionModeChange } = useExecutionConfig();
 */
export function useExecutionConfig(): UseExecutionConfig {
  /**
   * Loaded once from `execution-settings.ts`'s ledger+localStorage-backed store — the SAME source
   * the Execution-mode settings tab reads/writes — so a mode chosen there is reflected here without
   * a page reload, and a mode picked directly from this dock persists back the same way.
   *
   * Held in a ref (kept in sync below) rather than read directly by the memoized `transport`: the
   * transport is built once (see its own comment) and reads this via `getExecutionConfig()` on every
   * `startRun` call, so a mode change mid-session takes effect on the NEXT message without forcing a
   * new transport instance — the same "read fresh, don't capture" pattern `runContext`'s
   * `frontendBindToken` already uses a few lines down.
   */
  const [executionConfig, setExecutionConfigState] = useState<ExecutionConfig>(DEFAULT_EXECUTION_CONFIG);
  const executionConfigRef = useRef(executionConfig);
  executionConfigRef.current = executionConfig;

  /**
   * True once THIS mount has made its own local write — a mode switch from
   * `handleExecutionModeChange` below, or (through the wrapped `setExecutionConfig` this hook
   * exposes) a BYOK model pick from `useByokRuntime`'s `handleByokModelChange`. Guards the
   * mount-load effect just below: without it, an operator who switches modes before the initial
   * `loadExecutionConfig()` resolves would see the switch silently revert. The load starts on
   * mount and reads whatever the server held BEFORE the switch's own `saveExecutionConfig` call;
   * if it resolves after the switch (a real race — both are ordinary network calls with no
   * ordering guarantee), applying it unconditionally overwrites the operator's just-made,
   * already-persisted choice with the stale pre-switch value. That leaves the UI showing a
   * different mode than the server holds — exactly the disagreement
   * `handleExecutionModeChange`'s own doc comment says the ADR-028 chokepoint exists to prevent.
   *
   * A ref, not state: flipping it must not itself trigger a render, and it needs to be readable
   * synchronously inside the functional `setExecutionConfigState` updater below.
   */
  const localWriteRef = useRef(false);

  /** Backs {@link UseExecutionConfig.configLoaded} — see that field's own doc. */
  const [configLoaded, setConfigLoaded] = useState(false);

  /**
   * The `Dispatch` this hook exposes — to its own `handleExecutionModeChange` below, and to
   * `useByokRuntime`'s `handleByokModelChange` (passed `executionConfig`/`setExecutionConfig` as
   * an input pair). Wraps the raw state setter so any update that actually changes the value
   * marks {@link localWriteRef}.
   *
   * Relies on the "return `previous` unchanged to bail out" convention every updater passed
   * through here already follows (`handleExecutionModeChange`'s and `handleByokModelChange`'s own
   * `if (previous.… === next) return previous;` guards) rather than re-deriving no-op-ness itself:
   * comparing the updater's result to `previous` by reference is enough to tell a genuine write
   * apart from a no-op, so an operator re-picking the mode/model already active does not
   * permanently block a legitimate mount-load from applying.
   *
   * Note: React 18 Strict Mode invokes a functional state updater twice to surface impure
   * updaters. Setting a boolean ref to `true` twice is idempotent, so that double-invoke is safe
   * here — it would only matter if the ref were toggled off anywhere, which it never is.
   */
  const setExecutionConfig = useCallback<React.Dispatch<React.SetStateAction<ExecutionConfig>>>((action) => {
    setExecutionConfigState((previous) => {
      const next = typeof action === "function"
        ? (action as (current: ExecutionConfig) => ExecutionConfig)(previous)
        : action;
      if (next !== previous) localWriteRef.current = true;
      return next;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadExecutionConfig()
      .then((config) => {
        // Goes through the raw setter, not the wrapped `setExecutionConfig` above: applying a
        // load must never itself count as a "local write" (see `localWriteRef`'s doc) — only an
        // operator action should. Skipped once a local write has landed — see that doc for why.
        if (!cancelled && !localWriteRef.current) setExecutionConfigState(config);
      })
      // The dock is mounted on EVERY admin route, so an unhandled rejection here is not a
      // localized failure — it fires on any page load where the settings read fails (server
      // down, a 5xx, a body without `data`). `DEFAULT_EXECUTION_CONFIG` is already this
      // state's initial value, so swallowing to a log leaves the picker on Local CLI rather
      // than blanking the dock. Same shape as `handleExecutionModeChange`'s save catch below.
      .catch((error: unknown) => {
        console.error("[AssistantDock] failed to load execution config", error);
      })
      // Runs regardless of resolve/reject — `configLoaded` means "the GET settled", not "it
      // succeeded"; a failed load still leaves `useLocalCliSelection` free to hydrate off
      // whatever `executionConfig` ends up holding (the `DEFAULT_EXECUTION_CONFIG` this state
      // already initialized to) rather than waiting forever for a load that already gave up.
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Whether a BYOK credential is stored server-side for this admin — see {@link UseExecutionConfig.hasStoredAdminKey}'s
   * own doc for why `apiModeAvailable` cannot be answered from `executionConfig.byok.apiKey` alone
   * any more. Read-only and independent of the ledger load above: a failed GET here leaves this
   * `null`/`false` (picker reads as "not configured"), which is the same fail-soft posture the
   * ledger load's own `.catch` takes — never blocks the dock, only degrades one affordance.
   */
  const [hasStoredAdminKey, setHasStoredAdminKey] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadAdminExecutionCredential()
      .then((view) => {
        if (!cancelled) setHasStoredAdminKey(view.isSet);
      })
      .catch((error: unknown) => {
        console.error("[AssistantDock] failed to load stored BYOK credential state", error);
        if (!cancelled) setHasStoredAdminKey(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Persists a mode switch made from THIS dock's own picker back through the same
   * `saveExecutionConfig` chokepoint the Execution-mode settings tab uses (ADR-028's single write
   * chokepoint), so the two surfaces can never disagree about which mode is active. Functional
   * `setExecutionConfig` update (not `executionConfigRef.current`) to avoid a stale-closure write
   * racing a config the settings tab saved in another tab in the same instant.
   */
  const handleExecutionModeChange = useCallback((mode: "local" | "api") => {
    const nextMode: ExecutionConfig["mode"] = mode === "api" ? "byok" : "local-cli";
    setExecutionConfig((previous) => {
      if (previous.mode === nextMode) return previous;
      const next: ExecutionConfig = { ...previous, mode: nextMode };
      void saveExecutionConfig(next, previous).catch((error: unknown) => {
        console.error("[AssistantDock] failed to save execution mode", error);
      });
      return next;
    });
  }, []);

  return {
    executionConfig,
    executionConfigRef,
    setExecutionConfig,
    handleExecutionModeChange,
    hasStoredAdminKey,
    configLoaded,
  };
}

export interface UseByokRuntime {
  byokRuntime: {
    providerLabel?: string;
    iconId?: string;
    model: string;
    models: readonly { id: string; label: string }[];
  };
  handleByokModelChange: (model: string) => void;
}

/**
 * Owns the BYOK model-discovery state and the composer's write-back for a model chosen there. Split
 * out of `AssistantDock` so the discovery-failure path (models stay empty rather than throwing into
 * the composer) is directly assertable via `renderHook`.
 *
 * @param input.executionConfig - The live execution config; only `executionConfig.byok` and
 *   `executionConfig.mode` are read.
 * @param input.setExecutionConfig - The setter {@link useExecutionConfig} returns, so a model
 *   picked here writes back through the same state.
 * @returns `byokRuntime` (provider identity, model, and discovered options for the picker) and
 *   `handleByokModelChange`.
 * @example
 * const { byokRuntime, handleByokModelChange } = useByokRuntime({ executionConfig, setExecutionConfig });
 */
export function useByokRuntime(
  {
    executionConfig,
    setExecutionConfig,
  }: {
    executionConfig: ExecutionConfig;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
  },
): UseByokRuntime {
  /**
   * Models the saved BYOK credential can actually run — the same list `features/ai-assistant/AiAssistant.tsx`'s
   * and `features/settings/SettingsUi.tsx`'s Model fields show, discovered through the same
   * `createExecutionPort().listModels` call.
   *
   * Discovered here rather than passed down because the dock outlives any settings screen: a
   * picker whose options only existed while the settings tab was open would be empty in the case
   * that matters. Empty on failure, which downgrades the picker's model row to read-only text
   * rather than offering an empty dropdown.
   *
   * SAFE with respect to the keystroke-leak finding
   * (`ADS-memory/reports/findings/2026-08-04-byok-discovery-keystroke-key-leak.md`): the endpoint
   * here comes from SAVED config, which an operator committed with an explicit Save, never from a
   * field being typed into. There is no partial-hostname state for this effect to walk.
   */
  const executionPort = useRef(createExecutionPort());
  const [byokModels, setByokModels] = useState<readonly { id: string; label: string }[]>([]);
  const { apiKey: byokApiKey, baseUrl: byokBaseUrl, protocol: byokProtocol } = executionConfig.byok;

  useEffect(() => {
    if (executionConfig.mode !== "byok" || !byokApiKey.trim()) {
      setByokModels([]);
      return;
    }
    let cancelled = false;
    executionPort.current
      .listModels?.(executionConfig.byok)
      .then((models) => {
        if (!cancelled) setByokModels(models.map((id) => ({ id, label: id })));
      })
      // Silent: a failed discovery must not put an error in a chat composer. The visible
      // consequence is only that the model row stays a plain value instead of a picker.
      .catch(() => {
        if (!cancelled) setByokModels([]);
      });
    return () => {
      cancelled = true;
    };
    // Keyed on the credential and endpoint only — editing `model` must not re-ask the provider
    // which models exist, and would loop against the write-back below if it did.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionConfig.mode, byokApiKey, byokBaseUrl, byokProtocol]);

  /**
   * The provider identity, model, and option list the runtime picker shows while BYOK is active.
   *
   * `resolveSelectedPreset` rather than a protocol-to-name map: the same protocol backs several
   * presets (OpenRouter and Ollama are both `openai`-protocol gateways), so keying off `protocol`
   * alone would label a gateway with the wrong vendor's name. A hand-typed custom endpoint matches
   * no preset and correctly yields no label and no icon, which the picker renders as a generic mode
   * name and glyph rather than inventing a vendor.
   */
  const byokRuntime = useMemo(
    () => {
      const preset = resolveSelectedPreset(DEFAULT_PROVIDER_PRESETS, executionConfig.byok);
      const iconId = preset ? BYOK_PRESET_ICON_IDS[preset.id] : undefined;
      return {
        ...(preset ? { providerLabel: preset.title } : {}),
        ...(iconId ? { iconId } : {}),
        model: executionConfig.byok.model,
        models: byokModels,
      };
    },
    [executionConfig.byok, byokModels],
  );

  /**
   * Write-back for a model chosen in the composer's picker — the "stay in sync" half.
   *
   * Goes through `saveExecutionConfig`, the same ADR-028 chokepoint the settings screens and
   * {@link useExecutionConfig}'s `handleExecutionModeChange` use, so the composer and both settings
   * surfaces are three views of one stored value rather than three copies of it. `publishSettingsRefresh`
   * then tells an already-open settings tab to re-read, which is what stops it from sitting on the
   * model the operator just changed. Namespace-scoped so unrelated slices do not refetch.
   *
   * Functional update for the same stale-closure reason `handleExecutionModeChange` documents.
   */
  const handleByokModelChange = useCallback(
    (model: string) => {
      setExecutionConfig((previous) => {
        if (previous.byok.model === model) return previous;
        const next: ExecutionConfig = { ...previous, byok: { ...previous.byok, model } };
        void saveExecutionConfig(next, previous)
          .then(() => publishSettingsRefresh([EXECUTION_NAMESPACE]))
          .catch((error: unknown) => {
            console.error("[AssistantDock] failed to save BYOK model", error);
          });
        return next;
      });
    },
    [setExecutionConfig],
  );

  return { byokRuntime, handleByokModelChange };
}

export interface UseLocalCliSelection {
  /** The Local CLI picker's current agent+model choice — fully controlled, fed straight into
   *  `<ChatPane selection={...}>` (see {@link AssistantDock}'s JSX). */
  localCliSelection: ChatPaneAgentSelection;
  handleLocalCliSelectionChange: (selection: ChatPaneAgentSelection) => void;
}

/**
 * Owns the Local CLI picker's agent+model choice as a fully controlled `ChatPane` selection,
 * persisted through the same ADR-028 `saveExecutionConfig` chokepoint `useByokRuntime`'s
 * `handleByokModelChange` already uses — so a pick here survives a reload the same way BYOK's
 * model and the mode switch already do (`executionConfig.localCli.agentId`/`.modelByAgentId`,
 * `execution-settings.ts`'s `loadExecutionConfig`/`selectedLocalCliModel` — real, persisted state
 * that nothing read the run-start path from until this hook existed, 2026-08-05).
 *
 * Split out of `AssistantDock` for the same reason `useByokRuntime` is: the hydration-once and
 * write-back paths are directly assertable via `renderHook`, without mounting a full dock or a
 * real `ChatPane`.
 *
 * `ChatPane` accepts `selection`/`onSelectionChange` as a genuinely controlled pair (confirmed in
 * `@jini-ai/chat`'s `useChatPane.hooks.ts`: `requestedSelection = options.selection ?? internalSelection`,
 * and its `setSelection`/`AgentRuntimePicker`-driven change handler always calls
 * `options.onSelectionChange` even when controlled) — chosen over the dock's previously-hardcoded
 * `initialSelection` prop because that prop is read exactly once, inside `useChatPane`'s own
 * `useState` initializer, at `ChatPane`'s first mount. The ledger load is an async GET
 * (`loadExecutionConfig`'s `api.getSettingsEffective` call) that resolves AFTER that first
 * render — a value hydrated from it into `initialSelection` would arrive too late to ever take
 * effect without a synthetic remount. A fully controlled `selection` has no such one-shot window:
 * it is read on every render, so the transition from the hardcoded default to the hydrated value
 * flows straight through like any other prop update.
 *
 * @param input.executionConfig - The live execution config; only `.localCli` is read.
 * @param input.setExecutionConfig - The setter {@link useExecutionConfig} returns, so a pick made
 *   here writes back through the same state (and the same `localWriteRef` race guard)
 *   `useByokRuntime` already shares it with.
 * @param input.configLoaded - {@link UseExecutionConfig.configLoaded} — gates the one-time
 *   hydration below so it fires exactly once, after the ledger's first GET has settled, never
 *   before and never twice.
 * @returns `localCliSelection` (the controlled value) and `handleLocalCliSelectionChange`
 *   (`ChatPane`'s `onSelectionChange`).
 * @example
 * const { localCliSelection, handleLocalCliSelectionChange } =
 *   useLocalCliSelection({ executionConfig, setExecutionConfig, configLoaded });
 */
export function useLocalCliSelection(
  { executionConfig, setExecutionConfig, configLoaded }: {
    executionConfig: ExecutionConfig;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
    configLoaded: boolean;
  },
): UseLocalCliSelection {
  /**
   * Same hardcoded starting point the dock always used (`{ agentId: "claude" }`) before this hook
   * existed — now just the value shown for the brief window before the ledger's GET settles, or
   * permanently for an operator who has never picked anything.
   */
  const [localCliSelection, setLocalCliSelection] = useState<ChatPaneAgentSelection>({ agentId: "claude" });

  /**
   * Guards the one-time hydration effect below against the same two races `useExecutionConfig`'s
   * own `localWriteRef` documents for `executionConfig` itself: `hydratedRef` stops it from
   * re-applying on every later `executionConfig` change (it must apply the ledger's value at most
   * once, not resync on an unrelated BYOK/mode write); `touchedRef` stops it from silently
   * overwriting a selection the operator already picked with their own hand before the ledger's
   * GET happened to resolve — the load and a fast first pick are both in-flight/interactive with
   * no ordering guarantee between them.
   */
  const hydratedRef = useRef(false);
  const touchedRef = useRef(false);

  useEffect(() => {
    if (!configLoaded || hydratedRef.current || touchedRef.current) return;
    hydratedRef.current = true;
    const agentId = executionConfig.localCli.agentId ?? "claude";
    const model = selectedLocalCliModel(executionConfig);
    setLocalCliSelection({ agentId, ...(model ? { model } : {}) });
  }, [configLoaded, executionConfig]);

  /**
   * `ChatPane`'s `onSelectionChange` — fires only for a genuine change (`useChatPane`'s own dedup,
   * see this hook's own doc above). Updates the controlled value immediately, so the picker
   * reflects the pick without waiting on a round trip, and persists through the same ADR-028
   * chokepoint `handleByokModelChange` uses, so a Local CLI pick and a BYOK model pick can never
   * disagree about which write path is authoritative.
   *
   * Writes `selection.model ?? ""` for the picked agent specifically (not a conditional spread)
   * so reverting a model choice back to "default" persists that reversion — an omitted key would
   * leave a stale non-default value from an earlier pick sitting in the ledger for this agent,
   * silently un-reverting on the next reload.
   */
  const handleLocalCliSelectionChange = useCallback((selection: ChatPaneAgentSelection) => {
    touchedRef.current = true;
    setLocalCliSelection(selection);
    setExecutionConfig((previous) => {
      const nextAgentId = selection.agentId || null;
      const next: ExecutionConfig = {
        ...previous,
        localCli: {
          agentId: nextAgentId,
          modelByAgentId: nextAgentId
            ? { ...previous.localCli.modelByAgentId, [nextAgentId]: selection.model ?? "" }
            : previous.localCli.modelByAgentId,
        },
      };
      void saveExecutionConfig(next, previous)
        .then(() => publishSettingsRefresh([EXECUTION_NAMESPACE]))
        .catch((error: unknown) => {
          console.error("[AssistantDock] failed to save Local CLI selection", error);
        });
      return next;
    });
  }, [setExecutionConfig]);

  return { localCliSelection, handleLocalCliSelectionChange };
}

/**
 * Whether a completed run's messages-change delta should trigger `publishSettingsRefresh()`, and
 * what the next `settledRunMessageId` marker should be. Pulled out of `handleMessagesChange` so the
 * "fire once per finished run, not once per streaming delta" dedup logic is directly assertable
 * without a live `ChatPane`.
 *
 * Deliberately triggered by RUN COMPLETION rather than by inspecting the transcript for a settings
 * tool call. Matching tool names here would put a list of them in the admin shell, where it would
 * fall out of date the first time the catalog grows — and the whole cost of being wrong is a few
 * sub-millisecond SQLite reads per run. Ignorance is cheaper than coupling.
 *
 * @param input.messages - The full transcript as of this `onMessagesChange` event.
 * @param input.settledRunMessageId - The last message id already published for, or `null`.
 * @returns `publish` (whether to call `publishSettingsRefresh()` now) and `nextSettledRunMessageId`
 *   (what the caller's ref should hold next — unchanged when `publish` is `false`).
 * @example
 * const { publish, nextSettledRunMessageId } = shouldPublishOnMessagesChange({
 *   messages,
 *   settledRunMessageId: settledRunMessageId.current,
 * });
 */
export function shouldPublishOnMessagesChange(
  { messages, settledRunMessageId }: { messages: ChatMessage[]; settledRunMessageId: string | null },
): { publish: boolean; nextSettledRunMessageId: string | null } {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") {
    return { publish: false, nextSettledRunMessageId: settledRunMessageId };
  }
  if (!isTerminalRunStatus(last.runStatus) || settledRunMessageId === last.id) {
    return { publish: false, nextSettledRunMessageId: settledRunMessageId };
  }
  return { publish: true, nextSettledRunMessageId: last.id };
}

/**
 * Builds the per-call run context the daemon reads `frontendBindToken`/`model` out of
 * (`assistant-transport.ts`'s `contextRef` wiring). Omits each key entirely when absent, rather
 * than sending it as `undefined` or an empty string, matching the daemon's own "absent means
 * default" contract for both fields.
 *
 * `model` is forwarded opaque and unfiltered — including the `'default'` sentinel
 * (`DEFAULT_MODEL_OPTION.id`, `@jini-ai/agent-runtime`) that `ChatPane`'s own selection resolution
 * falls back to when nothing else is picked. Every agent def's `buildArgs` (and
 * `resolveModelForAgent`) already treats `'default'`/absent identically as "omit `--model`, defer
 * to the CLI's own config" — that is the one place this decision is made; duplicating the check
 * here would only be a second copy of it to keep in sync.
 *
 * @param input.bindToken - The current tab's page-control bind token, or `undefined` if unbound.
 * @param input.model - The Local CLI picker's live model selection, or `undefined` before a
 *   selection has resolved (e.g. no agents detected yet).
 * @returns The context object to merge into a run's `contextRef`.
 * @example
 * const context = resolveRunContext({ bindToken: agentBridge?.bindToken(), model: selection.model });
 */
export function resolveRunContext(
  { bindToken, model }: { bindToken: string | undefined; model?: string },
): { frontendBindToken?: string; model?: string } {
  return {
    ...(bindToken === undefined ? {} : { frontendBindToken: bindToken }),
    ...(typeof model === "string" && model.length > 0 ? { model } : {}),
  };
}

export interface AssistantDockProps {
  /**
   * This tab's page-control connection, owned by `App.tsx` (it outlives this pane, which unmounts
   * with the dock). `null` until the daemon has attached the surface, or if it never does.
   */
  agentBridge?: FrontendSessionBridge | null;
  /**
   * The conversation-state hook, overridable so a test can drive this component against a fake
   * port without stubbing `fetch` — the `useX`/`useWiredX` consumption shape used throughout
   * `@jini-ai/ui` (`ChatComposer`'s `useWorkingDir = useWiredWorkingDirStatus` is the precedent).
   *
   * Passing a *hook* rather than the port itself is what keeps this component dumb: it never has to
   * know a port exists, only that something supplies it conversation state.
   */
  useChats?: () => UseAssistantChats;
}

export function AssistantDock({ agentBridge = null, useChats = useWiredAssistantChats }: AssistantDockProps) {
  const { executionConfig, executionConfigRef, setExecutionConfig, handleExecutionModeChange, hasStoredAdminKey, configLoaded } = useExecutionConfig();
  const { byokRuntime, handleByokModelChange } = useByokRuntime({ executionConfig, setExecutionConfig });
  const { localCliSelection, handleLocalCliSelectionChange } = useLocalCliSelection({
    executionConfig,
    setExecutionConfig,
    configLoaded,
  });

  // The transport holds no per-render state; rebuilding it each render would drop in-flight runs.
  const transport = useMemo(
    () => createTovuAssistantTransport({ getExecutionConfig: () => executionConfigRef.current }),
    [],
  );
  /**
   * `''` baseUrl: `createDaemonAttachmentUploader` builds `${baseUrl}/api/attachments`, so an
   * empty string resolves to the same bare `/api/attachments` relative path `AGENTS_URL`/`RUNS_URL`
   * already use — same-origin, proxied by `src/server/modules/assistant.ts` to the agent daemon,
   * matching every other request this dock makes. Memoized for the same reason `transport` is: it
   * owns internal per-uploader batch-quota state (`create-daemon-attachment-uploader.ts`'s
   * `batchUsage` map), so rebuilding it on every render would silently reset a turn's running quota
   * mid-upload.
   */
  const uploadAttachments = useMemo(() => createDaemonAttachmentUploader(""), []);
  const runtimeAccess = useMemo(
    () => ({
      listAgents: fetchAgents,
      rescanAgents: async () => {
        const response = await fetch(`${AGENTS_URL}/rescan`, { method: "POST", credentials: "same-origin" });
        if (!response.ok) return fetchAgents();
        const { agents } = (await response.json()) as { agents: ChatPaneAgent[] };
        return agents;
      },
      daemonOnline: async () => {
        const response = await fetch(AGENTS_URL, { credentials: "same-origin" });
        return response.ok;
      },
    }),
    [],
  );
  const chats = useChats();

  /**
   * Last assistant message id seen in a terminal state, so a run's completion fires the settings
   * refresh below exactly once. `onMessagesChange` runs on every delta of a streaming reply, and
   * the terminal message keeps arriving in later calls after it settles.
   */
  const settledRunMessageId = useRef<string | null>(null);

  const handleMessagesChange = useCallback(
    (messages: ChatMessage[]) => {
      window.__tovuAssistantMessages = messages;
      // Persistence is selective, not per-delta — see `lib/assistant-chats.ts`'s
      // `persistableMessages` for why a streaming reply is written once rather than per token.
      chats.onMessagesChange(messages);

      /**
       * A finished run may have written a setting — `settings_set_ui_preference` is agent-callable
       * — so the mounted settings tabs re-read. Without this the write lands in `content.db` and
       * the open tab keeps rendering the value it fetched at mount, which reads as the tool having
       * silently done nothing.
       *
       * Deliberately triggered by RUN COMPLETION rather than by inspecting the transcript for a
       * settings tool call. Matching tool names here would put a list of them in the admin shell,
       * where it would fall out of date the first time the catalog grows — and the whole cost of
       * being wrong is a few sub-millisecond SQLite reads per run. Ignorance is cheaper than
       * coupling.
       *
       * `undefined` scope (rather than a namespace list) for the same reason: this publisher does
       * not know what changed, and saying so is more honest than guessing.
       */
      const { publish, nextSettledRunMessageId } = shouldPublishOnMessagesChange({
        messages,
        settledRunMessageId: settledRunMessageId.current,
      });
      settledRunMessageId.current = nextSettledRunMessageId;
      if (publish) publishSettingsRefresh();
    },
    [chats],
  );

  /**
   * Tells the daemon which tab this run is allowed to drive, so `page.navigate` and friends have
   * an addressee. `assistant-transport.ts` reads `frontendBindToken` out of this and puts it in
   * the run's `contextRef`.
   *
   * A function, and the token read *inside* it, because `EventSource` reconnects on its own — a
   * daemon restart, a sleeping laptop, an ordinary blip — and every reattach mints a new session
   * and a new token. Capturing the value once would keep sending a dead one, and the only symptom
   * would be the agent being told "no frontend is bound to this run" on every page call, long
   * after the reconnect that caused it.
   *
   * Depends on `agentBridge` identity rather than reading a ref: the bridge object is stable for
   * the tab's lifetime, so this rebuilds only when page control genuinely appears or goes away.
   * Also depends on `localCliSelection.model` (not the whole `localCliSelection` object, which
   * would rebuild on every keystroke-equivalent picker interaction that leaves the model alone)
   * so a run started right after a model pick carries it — `useLocalCliSelection` owns the
   * picker's live value, and this is the one place that value needs to leave React state.
   */
  const runContext = useMemo(
    () => () => resolveRunContext({ bindToken: agentBridge?.bindToken(), model: localCliSelection.model }),
    [agentBridge, localCliSelection.model],
  );

  return (
    <JiniChatProvider transport={transport}>
      {/* ChatPane takes `transport` directly as well as via the provider — the package's
          components read their dependencies from props, not implicitly from context. */}
      <ChatPane
        // Remounts the pane on a conversation switch. `ChatPane` owns its transcript and takes
        // `initialMessages` only at mount, so re-keying is how a different conversation's history
        // gets in — pushing new messages into a live pane would fight its own state.
        key={chats.paneKey}
        transport={transport}
        runtimeAccess={runtimeAccess}
        // Fully controlled (`selection`/`onSelectionChange`), not `initialSelection` — see
        // `useLocalCliSelection`'s own doc for why an uncontrolled prop can't be hydrated from
        // the ledger's async load. `useLocalCliSelection` starts at the same `{agentId: "claude"}`
        // this literal used to hardcode, then hydrates once the ledger settles.
        selection={localCliSelection}
        onSelectionChange={handleLocalCliSelectionChange}
        {...(chats.activeId ? { conversationId: chats.activeId } : {})}
        initialMessages={chats.initialMessages}
        // The Local CLI / API · BYOK row (`AgentRuntimePicker`, `@jini-ai/chat`) — previously
        // hardcoded to `executionMode: 'local'` / `apiModeAvailable: false` (never passed at all),
        // which made "API · BYOK" permanently disabled with a "not configured" label that was
        // literally true: nothing wired it. `apiModeAvailable` is now a real fact — not a hardcoded
        // default — and selecting the row genuinely changes where a message goes
        // (`assistant-transport.ts`'s `startRun` branches on this same `executionConfig`).
        //
        // `hasUsableAdminKey`, not `executionConfig.byok.apiKey.trim().length > 0` alone (2026-08-05):
        // the admin's own BYOK credential is encrypted server-side and write-only now
        // (`execution-settings.ts`'s header), so `byok.apiKey` is empty on every fresh load even
        // when a credential IS stored — gating on it alone would make this row permanently disabled
        // for exactly the case the server-side store exists to support. `hasStoredAdminKey` is
        // `null` until its own GET settles, which `hasUsableAdminKey` treats as "nothing confirmed
        // stored yet" (same as `false`) — a brief false-negative on first paint, never a
        // false-positive, and it corrects itself the moment the GET resolves.
        executionMode={executionConfig.mode === "byok" ? "api" : "local"}
        apiModeAvailable={hasUsableAdminKey(executionConfig.byok.apiKey, { isSet: hasStoredAdminKey === true })}
        onExecutionModeChange={handleExecutionModeChange}
        // What the picker names as the runtime while BYOK is the active mode. Without it the
        // popover described the DETECTED CLI in both modes — an agent list with one row marked
        // "selected", a model reading "Default (CLI config)", and a Rescan PATH button — none of
        // which has any bearing on an API turn, and all of which named the wrong provider. The
        // model is the one `assistant-transport.ts` will actually send (`byok.model`), read from
        // the same config object that decides the branch, so the two cannot disagree.
        byokRuntime={byokRuntime}
        onByokModelChange={handleByokModelChange}
        /**
         * Replaces `ChatPane`'s default header, which is not merely a styling preference.
         *
         * That default ships a "New thread" button wired to the pane's own `onReset`, which
         * clears the local transcript and nothing else. With durable history that is actively
         * wrong: the pane would empty while `activeId` still pointed at the previous
         * conversation, so the next message would silently append to the chat the user thought
         * they had just left. `chats.create` makes a real conversation row and switches to it.
         *
         * The switcher belongs here rather than in `leadingAccessory` for the same reason — that
         * slot sits above the composer, so the dropdown opened over the input instead of below
         * the title where a history control is looked for.
         */
        header={
          <div className="jini-chat-pane__header">
            <div className="jini-chat-pane__heading">
              <span className="jini-chat-pane__eyebrow">Workspace chat</span>
              {/* Was an `<h1>` — the dock mounts on every route (ADR-049, one conversation for
                  the whole session), so every admin screen had two `<h1>`s: its own page title
                  and this one, with no signal to a screen-reader user navigating by heading which
                  was the real page title. `<h2>` inside this `aria-label="Assistant"` complementary
                  region (see `App.tsx`'s `<aside>`) reads correctly as a subsection heading
                  instead of competing with the page's own `<h1>`. Class names, not the element
                  type, drive this component's styling (`styles/assistant.css`), so the tag change
                  is visually inert. */}
              <h2 className="jini-chat-pane__title">
                {chats.conversations.find((c) => c.id === chats.activeId)?.title ?? "Tovu assistant"}
              </h2>
            </div>
            <ConversationList
              conversations={chats.conversations}
              activeConversationId={chats.activeId}
              onSelect={chats.select}
              onCreate={chats.create}
              onDelete={chats.remove}
              onRename={chats.rename}
            />
          </div>
        }
        title="Tovu assistant"
        placeholder="Ask the assistant to do something…"
        onMessagesChange={handleMessagesChange}
        runContext={runContext}
        uploadAttachments={uploadAttachments}
        // Restricts the composer's file picker to image MIME types. Not a security boundary —
        // `detectAttachmentKind` sniffs magic bytes server-side regardless of what a renamed file
        // or a drag-drop bypassing this filter claims to be (see `attachments.ts`) — this only
        // keeps the picker's own dialog from offering non-image files the daemon-side pipeline
        // isn't built to do anything useful with yet.
        attachmentAccept="image/*"
        // Purely a label — `workingDirectoryAccess` (native folder picker) is intentionally
        // omitted, and the daemon's real `cwd` (`agent-daemon-server.ts`'s
        // `process.env.TOVU_AGENT_CWD ?? process.cwd()`) isn't round-tripped back to the client
        // today, so this can't reflect that exact value; it's not load-bearing for execution
        // either way (confirmed: `cwd` is resolved daemon-side per run, never from this prop).
        // Matches Jini's own reference app's approach — a static, host-chosen label.
        initialWorkingDirectory="Tovu"
        // suggestions={[
        //   "Summarise what content types this site defines.",
        //   "List the agent-callable tools and the permission each one needs.",
        //   "Which admin sections exist, and what does each one manage?",
        // ]}
      />
    </JiniChatProvider>
  );
}
