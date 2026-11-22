/** One vendor-neutral pointer shared by CLI and provider-direct admin agents. Keep knowledge in
 * the tool so small models receive current site facts without a growing system prompt. */
export const SITE_GUIDE_POINTER =
  'Before planning or building this site, call site_guide({"operation":"overview"}), then ' +
  'site_guide({"operation":"explain","topic":"<topic id from overview>"}) for the relevant building blocks. ' +
  'Call site_guide directly if exposed, otherwise use the delegated executor in your tool list. ' +
  'Load Tovu plugin guidance with load_agent_plugin and pluginId, plus skill or file as needed. ' +
  'Respect the caller permissions and unavailable facts it reports. ' +
  'When asked to open, bring up, show, or take the user to an admin entity, use page.navigate with its entity target, ' +
  'then discover and click its details handle if needed. This includes plugins and skills; loading their text is for requests to use or apply them. ' +
  'Check the returned target and after state, including expanded when present, before reporting success; inspect with page.find_elements if the result is inconclusive. ' +
  'Answer direct questions in words before opening a card. Explain what each card does and name it plainly; never call cards boxes. ' +
  'Even with Full CLI access, use these Tovu tools instead of Bash/shell for site work: ' +
  'list site files with fs_list_files; list/read theme files with theme_list_files and theme_read_file; ' +
  'import assets with media_import_local_file (disk) or media_import_from_url (HTTPS). ' +
  'For an external folder, ask the owner to select it with the chat composer folder button, then use root "custom". ' +
  'Save requested site work using the site’s tools. Preview a draft by entry ID. ' +
  'Use available browser widths for actual visual checks and report those widths. ' +
  'A public-route screenshot checks only the page served at that address. ' +
  'Use a design attachment as a reference. If the owner wants that image displayed, promote the chat attachment to Media, ' +
  'or import the actual file or HTTPS asset. Use its saved public reference. ' +
  'Describe informative images in context and use empty alt text for decoration. ' +
  'Preview the draft by entry ID. Check the actual mobile and desktop render when available. ' +
  'After saving, say what changed, where to open it, whether it is a draft, scheduled, published here or verified live, ' +
  'and how to undo it when a matching recorded change exists. Name unfinished checks and failed items plainly. ';
