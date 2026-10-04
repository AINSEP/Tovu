import { useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { useFocusTrap } from "@/hooks/use-focus-trap.hooks";
import type { Translate } from "@/lib/dictionary-translator";
import type { PluginInstallPort, PluginInstallPreview, PluginInstallSource } from "./plugin-install-port.hooks";

function errorKey(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.code === "PLUGIN_CHANGED_SINCE_PREVIEW") return "Package changed. Review it again before installing.";
  if (error.code === "PLUGIN_LOCAL_INSTALL_DISABLED") return "Local folder installs are disabled on this server.";
  if (error.code === "PLUGIN_IN_TRASH") return "This plugin is already in the Trash. Restore or delete it there first.";
  if (error.code === "PLUGIN_ENABLED") return "Turn this plugin off in every workspace before installing.";
  if (error.status === 413 || error.code === "PLUGIN_PACKAGE_TOO_LARGE") return "ZIP exceeds the upload or expanded package size limit.";
  if (error.status === 409) return "Installation conflicts with an existing plugin. Check its version and replacement option.";
  if (error.status === 400) return "Invalid plugin package. Check its manifest, integrity and folder.";
  return fallback;
}

export function usePluginInstall(required: { port: PluginInstallPort; t: Translate; onInstalled: () => Promise<void> }, _optional = {}) {
  const [isOpen, setOpen] = useState(false);
  const [folder, setFolder] = useState("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<PluginInstallPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const locked = useRef(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(dialogRef, isOpen);
  useEffect(() => () => { sequence.current++; }, []);
  function invalidate() { sequence.current++; setPreview(null); setError(null); }
  function close() { if (locked.current) return; invalidate(); setOpen(false); }
  useEffect(() => {
    if (!isOpen) return;
    function keydown(event: KeyboardEvent) { if (event.key === "Escape" && !locked.current) { sequence.current++; setPreview(null); setOpen(false); } }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); returnFocus.current?.focus(); };
  }, [isOpen]);
  async function perform(install: boolean) {
    if (locked.current || (!folder.trim() && !zipFile) || (install && !preview)) return;
    locked.current = true; setBusy(true); setError(null);
    const generation = ++sequence.current;
    const source: PluginInstallSource = { source: zipFile ? { kind: "zip", file: zipFile } : { kind: "folder", path: folder.trim() }, replace };
    try {
      if (install) {
        await required.port.install({ ...source, expectedDigest: preview!.digest });
        if (generation !== sequence.current) return;
        setOpen(false); setPreview(null);
        await required.onInstalled();
      } else {
        const result = await required.port.preview(source);
        if (generation === sequence.current) setPreview(result.plugin);
      }
    } catch (e) {
      if (generation === sequence.current) {
        setPreview(null);
        setError(required.t(errorKey(e, install ? "Failed to install plugin." : "Failed to preview plugin.")));
      }
    } finally { locked.current = false; setBusy(false); }
  }
  return {
    isOpen, folder, zipFile, zipInputRef, replace, preview, busy, error, dialogRef, t: required.t,
    reviewDisabled: busy || (!folder.trim() && !zipFile),
    previewDisplay: preview ? {
      title: `${preview.name} (${preview.id})`,
      version: preview.upgradeFrom ? `${preview.upgradeFrom} → ${preview.version}` : preview.version,
      capabilities: preview.capabilities.join(", ") || "—",
      hooks: preview.hooks.join(", ") || "—",
    } : null,
    open: () => { if (locked.current) return; returnFocus.current = document.activeElement as HTMLElement | null; invalidate(); setFolder(""); setZipFile(null); setReplace(false); setOpen(true); }, close,
    setFolder: (value: string) => { invalidate(); setFolder(value); setZipFile(null); if (zipInputRef.current) zipInputRef.current.value = ""; },
    setZipFile: (file: File | null) => {
      invalidate(); setFolder("");
      if (file && file.size > 32 * 1024 * 1024) {
        setZipFile(null); if (zipInputRef.current) zipInputRef.current.value = "";
        setError(required.t("ZIP exceeds the upload or expanded package size limit."));
      } else setZipFile(file);
    },
    setReplace: (value: boolean) => { invalidate(); setReplace(value); },
    review: () => perform(false), install: () => perform(true),
  };
}
export type PluginInstallController = ReturnType<typeof usePluginInstall>;
