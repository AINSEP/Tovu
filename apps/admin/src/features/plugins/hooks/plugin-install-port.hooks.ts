/** Site-plugin install transport; agent plugins have a separate lifecycle and store. */
export interface PluginInstallPreview {
  id: string; name: string; version: string; tier: "tier-3";
  capabilities: readonly string[]; hooks: readonly string[];
  hasCode: boolean; digest: string; upgradeFrom?: string;
}
export interface PluginInstallSource { source: { kind: "folder"; path: string } | { kind: "zip"; file: File }; replace?: boolean }
export interface PluginInstallPort {
  preview(required: PluginInstallSource, optional?: Record<string, never>): Promise<{ plugin: PluginInstallPreview }>;
  install(required: PluginInstallSource & { expectedDigest: string }, optional?: Record<string, never>): Promise<{ plugin: PluginInstallPreview }>;
}
