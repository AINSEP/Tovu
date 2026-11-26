import { createPluginInstallSourceSchema } from "@jini-ai/core/contracts/headless/plugin-install-source";

export const PLUGIN_INSTALL_SOURCE_SCHEMA = createPluginInstallSourceSchema({
  pathDescription: "Absolute path on the machine Tovu runs on. Exactly one of path/attachmentRef.",
});
