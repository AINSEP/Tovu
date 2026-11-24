import { CONTENT_ANALYZER_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/content-analyzer/index";
import { WORD_COUNT_RUNTIME_SOURCE } from "#src/features/plugin-runtime/built-ins/word-count/index";
import { RECHARTS_RUNTIME_SOURCE } from "./charts-recharts-source.js";

/** Every plugin that ships inside the product. The CLI installer reads its "cannot shadow a built-in"
 *  ids from here so a built-in added to this list is protected there too, without a second copy to forget. */
export const BUILT_IN_RUNTIME_SOURCES = [WORD_COUNT_RUNTIME_SOURCE, CONTENT_ANALYZER_RUNTIME_SOURCE, RECHARTS_RUNTIME_SOURCE] as const;

/** The ids of {@link BUILT_IN_RUNTIME_SOURCES}. @complexity O(n) in built-ins. */
export function builtInPluginIds(_required: Record<string, never> = {}, _optional = {}): string[] {
  return BUILT_IN_RUNTIME_SOURCES.map((source) => source.manifest.id);
}
