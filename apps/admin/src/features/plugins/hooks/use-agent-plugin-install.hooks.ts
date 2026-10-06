import { useRef, useState, type ChangeEvent } from "react";

import { ApiError, type AdminAgentPlugin } from "@/lib/api";
import type { Translate } from "@/lib/dictionary-translator";
import { useZipDrop } from "../../../components/InstallTabCard/use-zip-drop.hooks";
import { useFolderUpload } from "../../../components/InstallTabCard/use-folder-upload.hooks";
import { agentPluginDisplayName } from "../rules";
import type { AgentPluginInstallPort } from "./agent-plugin-install-port.hooks";

/** The server's own cap (`install.ts`'s `maxArchiveBytes`), checked here first so an oversized file
 *  is refused before any bytes are hashed or sent. */
export const AGENT_PLUGIN_ZIP_MAX_BYTES = 32 * 1024 * 1024;

const TOO_LARGE = "The .zip is larger than the 32 MiB limit.";
const UNPACKED_TOO_LARGE = "The .zip is too big once unpacked: at most 4096 files, 16 MiB per file, 64 MiB in all.";
const RETRY = "Could not install the plugin. Try again.";
const NOT_ZIP = "This file is not a readable .zip.";
const ONE_ZIP = "Choose one .zip file.";

/** Server refusal code → dictionary key. Same plain words the route sends, translatable here. */
const ERROR_KEYS: Readonly<Record<string, string>> = {
  AGENT_PLUGIN_ARCHIVE_TOO_LARGE: TOO_LARGE,
  AGENT_PLUGIN_DIGEST_MISMATCH: "The upload arrived damaged. Try again.",
  AGENT_PLUGIN_MANIFEST_MISSING: "No plugin.json found. Put plugin.json at the top of the .zip, or inside one folder.",
  AGENT_PLUGIN_MANIFEST_INVALID: "plugin.json is not a valid Agent Plugin manifest.",
  AGENT_PLUGIN_ARCHIVE_UNREADABLE: NOT_ZIP,
  AGENT_PLUGIN_PLUGIN_ID_TAKEN: "A different plugin with this name is already installed.",
  AGENT_PLUGIN_TOO_MANY_ENTRIES: UNPACKED_TOO_LARGE,
  AGENT_PLUGIN_FILE_TOO_LARGE: UNPACKED_TOO_LARGE,
  AGENT_PLUGIN_DECOMPRESSION_BOMB: UNPACKED_TOO_LARGE,
  AGENT_PLUGIN_TOTAL_SIZE_EXCEEDED: UNPACKED_TOO_LARGE,
  AGENT_PLUGIN_ACTIVATIONS_BUSY: RETRY,
};

/** @complexity O(1). */
function errorKey(error: unknown): string {
  if (!(error instanceof ApiError)) return RETRY;
  const known = error.code ? ERROR_KEYS[error.code] : undefined;
  if (known) return known;
  if (error.status === 403) return "You don't have permission to install plugins.";
  if (error.status === 400) return "This .zip contains files or links that plugins may not include.";
  return RETRY;
}

/** Why `file` cannot be uploaded, as a dictionary key, or `null` when it can.
 *  @complexity O(1). */
function fileProblem(file: File): string | null {
  if (!file.name.toLowerCase().endsWith(".zip")) return ONE_ZIP;
  if (file.size === 0) return NOT_ZIP;
  if (file.size > AGENT_PLUGIN_ZIP_MAX_BYTES) return TOO_LARGE;
  return null;
}

/**
 * The "Add a plugin" tab's state: one chosen `.zip` (picker, drop, or a picked folder zipped in the
 * browser), its validation, and the upload. Installs never switch a plugin on; `onInstalled` hands the new row to the list so the
 * Installed tab shows it without a reload.
 */
export function useAgentPluginInstall(
  required: { port: AgentPluginInstallPort; t: Translate; onInstalled: (row: AdminAgentPlugin) => void },
  _optional: Record<string, never> = {},
) {
  const { port, t, onInstalled } = required;
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState<{ name: string; alreadyInstalled: boolean } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const locked = useRef(false);

  function choose(next: File | null): void {
    setError(null);
    setInstalled(null);
    if (inputRef.current) inputRef.current.value = "";
    const problem = next ? fileProblem(next) : null;
    setFile(problem ? null : next);
    if (problem) setError(t(problem));
  }

  async function install(): Promise<void> {
    if (locked.current || !file) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await port.installZip({ file, sha256: await port.sha256({ file }) });
      if (result.agentPlugin) onInstalled(result.agentPlugin);
      setInstalled({ name: result.agentPlugin ? agentPluginDisplayName(result.agentPlugin) : file.name, alreadyInstalled: result.alreadyInstalled });
      setFile(null);
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  const drop = useZipDrop({
    isLocked: () => locked.current,
    onDropFiles: (files) => {
      if (files.length === 1) choose(files[0]!);
      else {
        setInstalled(null);
        setError(t(ONE_ZIP));
      }
    },
  });

  // A picked folder becomes `<folder>.zip` and goes through `choose` like any picked zip.
  const folderUpload = useFolderUpload({
    maxBytes: AGENT_PLUGIN_ZIP_MAX_BYTES,
    tooLarge: TOO_LARGE,
    isLocked: () => locked.current,
    onZipped: choose,
    onError: (key) => {
      setInstalled(null);
      setFile(null);
      setError(t(key));
    },
  });

  const installedMessage = installed
    ? t(installed.alreadyInstalled ? "{name} is already installed." : "{name} is installed and switched off. Turn it on in Installed.").replace("{name}", installed.name)
    : null;

  return {
    t,
    file,
    fileSizeLabel: file ? `${(file.size / (1024 * 1024)).toFixed(1)} MiB` : "",
    drop,
    folderUpload,
    busy: busy || folderUpload.zipping,
    error,
    installedMessage,
    inputRef,
    installDisabled: busy || folderUpload.zipping || !file,
    onChooseFile: () => inputRef.current?.click(),
    onFileChange: (event: ChangeEvent<HTMLInputElement>) => choose(event.target.files?.[0] ?? null),
    onClearFile: () => choose(null),
    install: () => void install(),
  };
}

export type AgentPluginInstallController = ReturnType<typeof useAgentPluginInstall>;
