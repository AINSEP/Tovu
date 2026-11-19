import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_PROVIDER_PRESETS } from "@jini-ai/integrations/media-providers/catalog";
import { resolveSelectedPreset, type ExecutionConfig } from "@jini-ai/ui";

import { createExecutionPort } from "@/lib/execution-settings";
import { applyExecutionConfigChange, persistExecutionConfigWrite } from "../execution-config-write";

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
function useByokModels(
  { executionConfig, createPort }: { executionConfig: ExecutionConfig; createPort: typeof createExecutionPort },
  _options: Record<string, never> = {},
) {
  const executionPort = useRef(createPort());
  const [byokModels, setByokModels] = useState<readonly { id: string; label: string }[]>([]);
  const { apiKey: byokApiKey, baseUrl: byokBaseUrl, protocol: byokProtocol } = executionConfig.byok;
  const byokConfig = useRef(executionConfig.byok);
  byokConfig.current = executionConfig.byok;

  // Keyed on the credential and endpoint only — editing `model` must not re-ask the provider
  // which models exist, and would loop against the write-back below if it did.
  useEffect(() => {
    if (executionConfig.mode !== "byok" || !byokApiKey.trim()) {
      setByokModels([]);
      return undefined;
    }
    let cancelled = false;
    executionPort.current
      .listModels?.({ ...byokConfig.current, apiKey: byokApiKey, baseUrl: byokBaseUrl, protocol: byokProtocol })
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
  }, [executionConfig.mode, byokApiKey, byokBaseUrl, byokProtocol]);
  return byokModels;
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
 * @param options.createPort - Model-discovery IO factory; defaults to the existing execution adapter.
 * @param options.persistWrite - Write seam for component tests; defaults to the shared dock writer.
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
  { createPort = createExecutionPort, persistWrite = persistExecutionConfigWrite, useModels = useByokModels }: {
    useModels?: typeof useByokModels;
    createPort?: typeof createExecutionPort;
    persistWrite?: typeof persistExecutionConfigWrite;
  } = {},
): UseByokRuntime {
  const byokModels = useModels({ executionConfig, createPort });

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
   */
  const handleByokModelChange = useCallback(
    (model: string) => {
      const write = applyExecutionConfigChange({ setExecutionConfig, change: (previous) =>
        previous.byok.model === model ? previous : { ...previous, byok: { ...previous.byok, model } } });
      if (write) persistWrite({ write, failureLog: "[AssistantDock] failed to save BYOK model" });
    },
    [setExecutionConfig, persistWrite],
  );

  return { byokRuntime, handleByokModelChange };
}

/**
 * Brand mark for a BYOK provider, keyed by `ProviderPreset.id`, resolved against the artwork this
 * host actually ships in `Jini packages/ui/src/react/components/agent-icons/`.
 *
 * Maps to CLI-agent icon ids because that is the asset set `AgentIcon` reads and the marks are the
 * vendors' own — `gemini.svg` is Google's logo whether a Gemini CLI or a Gemini API key is what
 * runs. A preset absent from this table (Azure OpenAI, OpenRouter, Ollama — no artwork on disk)
 * deliberately yields nothing, and the picker shows a generic API glyph. That is honest; pointing
 * `AgentIcon` at an id with no file would render a broken image or an unrelated initial-letter
 * badge, and inventing a nearby vendor's logo would be worse than showing none.
 *
 * Lives here, next to `useByokRuntime` (its only consumer), rather than in `AssistantDock.tsx`
 * where it previously sat — that component file no longer touches provider-icon resolution at all
 * once this hook owns it.
 */
const BYOK_PRESET_ICON_IDS: Readonly<Record<string, string>> = {
  anthropic: "claude",
  openai: "codex",
  "google-gemini": "gemini",
};

export function useByokRuntimeSeam(
  { override, input }: {
    override: typeof useByokRuntime | undefined;
    input: { executionConfig: ExecutionConfig; setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>> };
  },
  _options: Record<string, never> = {},
): UseByokRuntime {
  return (override ?? useByokRuntime)(input);
}

