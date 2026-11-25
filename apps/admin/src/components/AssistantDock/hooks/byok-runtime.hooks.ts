import { useCallback } from "react";
import { DEFAULT_PROVIDER_PRESETS } from "@jini-ai/integrations/media-providers/catalog";
import { resolveSelectedPreset } from "@jini-ai/ui";
import type { ExecutionConfig } from "@jini-ai/core/contracts/execution";
import { useByokModels, useByokRuntime as useAdminByokRuntime } from "@jini-ai/admin/shell/components/AssistantDock/hooks/byok-runtime.hooks";
import type { UseByokRuntime } from "@jini-ai/admin/shell/components/AssistantDock/hooks/byok-runtime.hooks";
import type { ExecutionWrite } from "@jini-ai/admin/shell/components/AssistantDock/hooks/execution-config.hooks";
import { createExecutionPort } from "@/lib/execution-settings";
import { applyExecutionConfigChange, persistExecutionConfigWrite } from "../execution-config-write";

export function useByokRuntime(
  { executionConfig, setExecutionConfig }: {
    executionConfig: ExecutionConfig;
    setExecutionConfig: React.Dispatch<React.SetStateAction<ExecutionConfig>>;
  },
  { createPort = createExecutionPort, persistWrite = persistExecutionConfigWrite, useModels = useByokModels }: {
    useModels?: typeof useByokModels;
    createPort?: typeof createExecutionPort;
    persistWrite?: typeof persistExecutionConfigWrite;
  } = {},
): UseByokRuntime {
  const persistModel = useCallback(({ write }: { write: ExecutionWrite }) =>
    persistWrite({ write, failureLog: "[AssistantDock] failed to save BYOK model" }), [persistWrite]);
  return useAdminByokRuntime({
    executionConfig, setExecutionConfig, createPort, useModelsHook: useModels,
    presets: DEFAULT_PROVIDER_PRESETS, resolvePreset: (args) => resolveSelectedPreset(args) ?? undefined, presetIconIds: BYOK_PRESET_ICON_IDS,
    applyChange: applyExecutionConfigChange, persistWrite: persistModel,
  });
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

