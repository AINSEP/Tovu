import { useEffect, useState } from "react";

import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import { t as translate } from "../plugins-i18n";
import {
  describeApiError,
  packageFilesViewState,
  type PackageFilesRead,
  type PackageFilesStatus,
  type PackageFileView,
} from "../rules";
import { defaultPluginsPort } from "./plugins-dependencies.hooks";
import type { PluginsPort } from "./plugins-port.hooks";

/**
 * @file `PluginPackageFilesModal`'s data: one `PLUGIN_FILES` read for the inspected plugin, mapped
 * onto the shared `PackageFilesModal`'s row shape, plus which file is selected. The Agent Plugins
 * counterpart (`use-agent-plugin-details-modal.hooks.ts`) reads a compile-time catalog instead; both
 * return the same `files`/`selectedFile`/`selectFile` trio so the two screens drive one component.
 *
 * `useX(dependencies)` / `useWiredX()` pair, same as `use-plugins.hooks.ts`: a test composes
 * {@link usePluginPackageFiles} with `createFakePluginsPort`.
 */

export interface PluginPackageFilesDependencies {
  readonly pluginId: string;
  readonly port: Pick<PluginsPort, "getPluginFiles">;
  readonly t: Translate;
}

export interface PluginPackageFilesController {
  /** `[]` until the listing settles, and after a failed load. */
  files: readonly PackageFileView[];
  /** The selected file, else the first listed one; `null` only while `files` is empty. */
  selectedFile: PackageFileView | null;
  /** Selects by `relativePath`. An unknown path falls back to the first file rather than clearing. */
  selectFile: (relativePath: string) => void;
  /** Loading, failure (`role: "alert"`), or an empty package — `null` once there are files. */
  status: PackageFilesStatus | null;
  /** Set when the server's caps left some files out. */
  listNotice: string | null;
  /** Bound translator — the modal's only source of copy. */
  t: Translate;
}

/** The last settled read, tagged with the plugin it was for. */
interface SettledRead extends PackageFilesRead {
  readonly pluginId: string;
}

/**
 * Loads one plugin's package files once per `pluginId`.
 *
 * A read that settles after `pluginId` changed (or after unmount) is dropped by the effect's cleanup
 * flag, and a stored read for a different id is never rendered — so a slow response for the
 * previously inspected plugin can never show under the current one's title. Mapping the read onto
 * rows, selection, and status is `rules.ts`'s {@link packageFilesViewState}.
 *
 * @complexity One GET per `pluginId`; O(files) per render to map rows (capped server-side at 200).
 */
export function usePluginPackageFiles({ pluginId, port, t }: PluginPackageFilesDependencies): PluginPackageFilesController {
  const [settled, setSettled] = useState<SettledRead | null>(null);
  const [selectedPath, setSelectedPath] = useState("");

  useEffect(() => {
    let current = true;
    port.getPluginFiles(pluginId).then(
      (listing) => {
        if (current) setSettled({ pluginId, listing, error: null });
      },
      (error: unknown) => {
        if (current) setSettled({ pluginId, listing: null, error: describeApiError(error, t("failed to load package files")) });
      },
    );
    return () => {
      current = false;
    };
  }, [pluginId]);

  const read = settled?.pluginId === pluginId ? settled : null;
  return { ...packageFilesViewState(read, selectedPath, t), selectFile: setSelectedPath, t };
}

/** Binds the real `/api/.../plugins/:id/files` client and a `plugins-i18n.ts` translator for the
 *  current admin locale. */
export function useWiredPluginPackageFiles(pluginId: string): PluginPackageFilesController {
  const locale = useAdminLocale();
  const t = (key: string): string => translate(locale, key);
  return usePluginPackageFiles({ pluginId, port: defaultPluginsPort, t });
}
