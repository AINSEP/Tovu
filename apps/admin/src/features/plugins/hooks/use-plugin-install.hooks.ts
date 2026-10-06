import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import type { Translate } from "@/lib/dictionary-translator";
import type { PluginInstallPort, PluginInstallPreview, PluginInstallSource } from "./plugin-install-port.hooks";
import { pluginInstallPreviewDisplay } from "../rules";
import { useZipDrop } from "../../../components/InstallTabCard/use-zip-drop.hooks";

const ZIP_MAX_BYTES = 32 * 1024 * 1024;
const TOO_LARGE = "ZIP exceeds the upload or expanded package size limit.";

/** Server refusal code → dictionary key. */
const ERROR_CODE_KEYS: Readonly<Record<string, string>> = {
  PLUGIN_CHANGED_SINCE_PREVIEW: "Package changed. Review it again before installing.",
  PLUGIN_LOCAL_INSTALL_DISABLED: "Local folder installs are disabled on this server.",
  PLUGIN_IN_TRASH: "This plugin is already in the Trash. Restore or delete it there first.",
  PLUGIN_ENABLED: "Turn this plugin off in every workspace before installing.",
  PLUGIN_PACKAGE_TOO_LARGE: TOO_LARGE,
};
/** HTTP status → dictionary key, for a refusal without a known code. */
const ERROR_STATUS_KEYS: Readonly<Record<number, string>> = {
  413: TOO_LARGE,
  409: "Installation conflicts with an existing plugin. Check its version and replacement option.",
  400: "Invalid plugin package. Check its manifest, integrity and folder.",
};

function errorKey(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  return (error.code ? ERROR_CODE_KEYS[error.code] : undefined) ?? ERROR_STATUS_KEYS[error.status] ?? fallback;
}

/**
 * The Plugins "Add a plugin" tab's state: a server folder or one uploaded `.zip` (picker or drop),
 * the replace option, the preview (trust review) and the install it unlocks. Changing any input
 * invalidates the preview, so an install always matches what was reviewed. Moved from the retired
 * "Install plugin" popup (2026-10-06); the flow is unchanged.
 */
export function usePluginInstall(required: { port: PluginInstallPort; t: Translate; onInstalled: () => Promise<void> }, _optional = {}) {
  const [folder, setFolder] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<PluginInstallPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installedName, setInstalledName] = useState<string | null>(null);
  const sequence = useRef(0);
  const locked = useRef(false);
  useEffect(() => () => { sequence.current++; }, []);
  function invalidate() { sequence.current++; setPreview(null); setError(null); setInstalledName(null); }
  function clearZipInput() { if (zipInputRef.current) zipInputRef.current.value = ""; }
  function chooseZip(file: File | null) {
    invalidate(); setFolder(""); clearZipInput();
    if (file && file.size > ZIP_MAX_BYTES) { setZipFile(null); setError(required.t(TOO_LARGE)); }
    else setZipFile(file);
  }
  function chooseFolder(value: string) { invalidate(); setFolder(value); setZipFile(null); clearZipInput(); }
  function chooseReplace(value: boolean) { invalidate(); setReplace(value); }
  function hasSource() { return folder.trim() !== "" || zipFile !== null; }
  function canRun(install: boolean) { return !locked.current && hasSource() && (!install || preview !== null); }
  function currentSource(): PluginInstallSource {
    return { source: zipFile ? { kind: "zip", file: zipFile } : { kind: "folder", path: folder.trim() }, replace };
  }
  /** Runs one preview or install under the lock; a result is dropped if the inputs changed meanwhile. */
  async function perform(install: boolean) {
    if (!canRun(install)) return;
    locked.current = true; setBusy(true); setError(null); setInstalledName(null);
    const generation = ++sequence.current;
    const source = currentSource();
    try {
      await (install ? installReviewed(source, preview!, generation) : reviewSource(source, generation));
    } catch (e) {
      if (generation === sequence.current) {
        setPreview(null);
        setError(required.t(errorKey(e, install ? "Failed to install plugin." : "Failed to preview plugin.")));
      }
    } finally { locked.current = false; setBusy(false); }
  }
  async function reviewSource(source: PluginInstallSource, generation: number) {
    const result = await required.port.preview(source);
    if (generation === sequence.current) setPreview(result.plugin);
  }
  async function installReviewed(source: PluginInstallSource, reviewed: PluginInstallPreview, generation: number) {
    await required.port.install({ ...source, expectedDigest: reviewed.digest });
    if (generation !== sequence.current) return;
    setInstalledName(reviewed.name); setPreview(null); setFolder(""); setZipFile(null); setReplace(false); clearZipInput();
    await required.onInstalled();
  }
  const drop = useZipDrop({ isLocked: () => locked.current, onDropFiles: (files) => chooseZip(files[0] ?? null) });
  return {
    folder, zipFile, zipInputRef, replace, preview, busy, error, drop, t: required.t,
    zipSizeLabel: zipFile ? `${(zipFile.size / (1024 * 1024)).toFixed(1)} MiB` : "",
    reviewDisabled: busy || !hasSource(),
    previewDisplay: preview ? pluginInstallPreviewDisplay(preview, required.t) : null,
    installedMessage: installedName ? required.t("{name} is installed and switched off. Turn it on in Downloaded.").replace("{name}", installedName) : null,
    setFolder: chooseFolder,
    onFolderChange: (event: ChangeEvent<HTMLInputElement>) => chooseFolder(event.target.value),
    onSubmitFolder: (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void perform(false); },
    setZipFile: chooseZip,
    onChooseZip: () => zipInputRef.current?.click(),
    onZipChange: (event: ChangeEvent<HTMLInputElement>) => chooseZip(event.target.files?.[0] ?? null),
    setReplace: chooseReplace,
    onReplaceChange: (event: ChangeEvent<HTMLInputElement>) => chooseReplace(event.target.checked),
    cancelReview: () => { if (!locked.current) invalidate(); },
    review: () => perform(false), install: () => perform(true),
  };
}
export type PluginInstallController = ReturnType<typeof usePluginInstall>;
