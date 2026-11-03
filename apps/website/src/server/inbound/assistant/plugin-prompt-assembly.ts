/** Pure prompt assembly shared by daemon launch and site plugin preparation. Keep it separate
 * from plugin lifecycle imports: the daemon receives the prepared prefix from the site owner. */
/** Prepend the already resolved site prefix, preserving an empty prefix byte for byte.
 * @param basePrompt The daemon's run prompt; retained positional ABI for existing callers.
 * @param pluginPromptPrefix Prepared by the site plugin owner.
 * @returns Combined prompt, with one blank line between non-empty sections.
 * @complexity O(prompt + prefix bytes) time/space; pure, no lifecycle or filesystem work.
 */
export function assemblePromptWithPluginPrefix(basePrompt: string, pluginPromptPrefix: string): string {
  return pluginPromptPrefix.length > 0 ? `${pluginPromptPrefix}\n\n${basePrompt}` : basePrompt;
}
