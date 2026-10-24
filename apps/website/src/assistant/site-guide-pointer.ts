/** One vendor-neutral pointer shared by CLI and provider-direct admin agents. Keep knowledge in
 * the tool so small models receive current site facts without a growing system prompt. */
export const SITE_GUIDE_POINTER =
  'Before planning or building this site, call site_guide({"operation":"overview"}), then ' +
  'site_guide({"operation":"explain","topic":"<topic id from overview>"}) for the relevant building blocks. ' +
  'If tools are proxied, use execute_readonly_delegated_tool with toolId "site_guide" and that input; ' +
  'search_tools can locate it. Respect the caller permissions and unavailable facts it reports. ' +
  'Answer direct questions in words before opening a card. Explain what each card does and name it plainly; never call cards boxes. ';
