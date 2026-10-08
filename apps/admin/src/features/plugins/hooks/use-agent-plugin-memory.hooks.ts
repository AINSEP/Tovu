import { useEffect, useId, useRef, useState } from "react";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../plugins-memory-i18n";
import { defaultAgentPluginMemoryPort } from "./agent-plugin-memory-dependencies.hooks";
import type { AgentPluginMemoryPort, PluginMemoryListing } from "./agent-plugin-memory-port.hooks";
import type { Translate } from "@jini-ai/ui/panel-kit";

export function useAgentPluginMemory(required: { pluginId: string; port: AgentPluginMemoryPort; t: Translate }, _optional = {}) {
  const { pluginId, port, t } = required;
  const fieldId = useId();
  const [read, setRead] = useState<{ pluginId: string; listing: PluginMemoryListing } | null>(null);
  const [draft, setDraft] = useState({ pluginId, entryPath: "project.md", text: "" });
  const [status, setStatus] = useState<{ pluginId: string; message: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const generation = useRef(0);
  const saving = useRef(false);
  useEffect(() => {
    const requestGeneration = ++generation.current;
    setStatus({ pluginId, message: t("Loading memory…") });
    port.read({ pluginId }).then(listing => {
      if (generation.current !== requestGeneration) return;
      setRead({ pluginId, listing });
      const first = listing.notes.find(file => file.relativePath === "project.md") ?? listing.notes[0];
      setDraft({ pluginId, entryPath: first?.relativePath ?? "project.md", text: first?.text ?? "" });
      setStatus(null);
    }, () => { if (generation.current === requestGeneration) setStatus({ pluginId, message: t("Could not load memory.") }); });
    return () => { generation.current++; };
  }, [pluginId, port]);
  const listing = read?.pluginId === pluginId ? read.listing : null;
  const current = draft.pluginId === pluginId ? draft : { pluginId, entryPath: "project.md", text: "" };
  const setText = (text: string) => setDraft({ ...current, text });
  const setPath = (entryPath: string) => setDraft({ pluginId, entryPath, text: listing?.notes.find(file => file.relativePath === entryPath)?.text ?? "" });
  const save = async () => {
    if (saving.current || !listing) return;
    saving.current = true;
    const requestGeneration = generation.current;
    setSavingId(pluginId);
    try {
      const response = await port.saveNote({ pluginId, entryPath: current.entryPath, text: current.text });
      if (generation.current !== requestGeneration) return;
      setRead({ pluginId, listing: response }); setStatus({ pluginId, message: t("Note saved.") });
    } catch { if (generation.current === requestGeneration) setStatus({ pluginId, message: t("Could not save note.") }); }
    finally { saving.current = false; setSavingId(null); }
  };
  return { t, listing, entryPath: current.entryPath, text: current.text, setPath, setText, save,
    saving: savingId === pluginId, status: status?.pluginId === pluginId ? status.message : null,
    editorDisabled: savingId === pluginId || !listing,
    pathInputId: `${fieldId}-path`, notesInputId: `${fieldId}-notes`,
    noteFilesHeadingId: `${fieldId}-note-files`, learnedHeadingId: `${fieldId}-learned`,
    // A pending or failed read is unknown, not empty: only explain a successfully loaded list.
    notesEmptyMessage: listing?.notes.length === 0 ? t("No note files yet. Save a project note to get started.") : null,
    learnedEmptyMessage: listing?.learned.length === 0 ? t("Nothing learned yet. The assistant saves what it verifies here.") : null };
}
export type AgentPluginMemoryController = ReturnType<typeof useAgentPluginMemory>;
export function useWiredAgentPluginMemory({ pluginId }: { pluginId: string }, _optional = {}) {
  const locale = useAdminLocale();
  return useAgentPluginMemory({ pluginId, port: defaultAgentPluginMemoryPort, t: key => translate({ locale: locale, key: key }) });
}
