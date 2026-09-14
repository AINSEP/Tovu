import type { AdminPlugin } from "@/lib/api";
import { PackageFilesModal } from "./PackageFilesModal";
import { useWiredPluginPackageFiles } from "./hooks/use-plugin-package-files.hooks";

/**
 * @file The Plugins screen's read-only package-files viewer — the same `PackageFilesModal` the Agent
 * Plugins screen opens, fed by the server's `PLUGIN_FILES` listing rather than a build-time catalog
 * (a `.tovu-plugin` lands in the install directory at runtime, so no catalog could know its files).
 * Opened from a row's eye button on the Installed and Downloaded tabs (`PluginRow`'s `onInspect`).
 */

export interface PluginPackageFilesModalProps {
  readonly plugin: Pick<AdminPlugin, "id" | "name">;
  readonly onClose: () => void;
  /** Injectable seam for the listing. Defaults to the real {@link useWiredPluginPackageFiles}. */
  readonly useFiles?: typeof useWiredPluginPackageFiles;
}

export function PluginPackageFilesModal({ plugin, onClose, useFiles = useWiredPluginPackageFiles }: PluginPackageFilesModalProps) {
  const { files, selectedFile, selectFile, status, listNotice, t } = useFiles(plugin.id);

  return (
    <PackageFilesModal
      title={`${plugin.name} ${t("package files")}`}
      subtitle={t("Read-only view of this plugin's files; nothing runs from this screen.")}
      files={files}
      selectedFile={selectedFile}
      onSelectFile={selectFile}
      status={status}
      listNotice={listNotice}
      handlePrefix="plugin-file"
      t={t}
      onClose={onClose}
    />
  );
}
