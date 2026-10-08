/** Local folder/ZIP sources are explicitly opt-in, even for admins. The one switch the admin
 *  install routes, the plugin list's `installSources` and the assistant's `plugins_install` read. */
export function sitePluginLocalInstallEnabled(required: { env: Readonly<Record<string, string | undefined>> }, _optional = {}): boolean {
  return required.env.TOVU_PLUGIN_LOCAL_INSTALL === "1";
}
