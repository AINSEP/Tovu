import { useFetchQuery, useFetchMutation, useCachedLoader } from "@jini-ai/ui/fetch-query";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAdminLocale } from "@/hooks/use-admin-locale.hooks";
import { t as translate } from "../plugins-memory-i18n";
import { defaultAgentPluginMemoryPort } from "./agent-plugin-memory-dependencies.hooks";
import type { AgentPluginMemoryPort, PluginMemoryListing } from "./agent-plugin-memory-port.hooks";
import type { Translate } from "@jini-ai/ui/panel-kit";

type MemoryStatus = { pluginId: string; message: string } | null;

function memoryStatusMessage({ pluginId, status, error, listing, t }: {
  pluginId: string;
  status: MemoryStatus;
  error: Error | null;
  listing: PluginMemoryListing | null;
  t: Translate;
}, _optional = {}): string | null {
  if (status?.pluginId === pluginId) return status.message;
  if (error) return t("Could not load memory.");
  if (!listing) return t("Loading memory…");
  return null;
}

export function useAgentPluginMemory(required: { pluginId: string; port: AgentPluginMemoryPort; t: Translate }, _optional = {}) {
  const { pluginId, port, t } = required;
  const fieldId = useId();
  const key = useMemo(() => ["agent-plugins", "memory", pluginId] as const, [pluginId]);
  const fetchMemory = useCallback(() => port.read({ pluginId }), [port, pluginId]);
  const query = useFetchQuery({ key, fetch: fetchMemory }, { staleTime: 0 });
  const loader = useCachedLoader({ key, fetch: fetchMemory }, { staleTime: 0 });
  const write = useFetchMutation({ run: ({ input }: { input: { pluginId: string; entryPath: string; text: string } }) => port.saveNote(input) }, { invalidates: [key] });
  const [draft, setDraft] = useState({ pluginId, entryPath: "project.md", text: "" });
  const [status, setStatus] = useState<MemoryStatus>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const generation = useRef(0);
  const hydrated = useRef<string | null>(null);
  const saving = useRef(false);
  useEffect(() => {
    generation.current++;
    setStatus(null);
    return () => { generation.current++; };
  }, [pluginId, port]);
  useEffect(() => {
    let cancelled = false;
    // Notes have no version check: filling from retained data could silently overwrite a newer note.
    // Join the fresh read and hydrate once; later listing refreshes never replace typed text.
    void loader.load().then(listing => {
      if (cancelled || hydrated.current === pluginId) return;
      const first = listing.notes.find(file => file.relativePath === "project.md") ?? listing.notes[0];
      hydrated.current = pluginId;
      setDraft({ pluginId, entryPath: first?.relativePath ?? "project.md", text: first?.text ?? "" });
    }).catch(() => {}); // The reactive query exposes this read's error.
    return () => { cancelled = true; };
  }, [pluginId, loader]);
  const listing = query.data ?? null;
  const current = draft.pluginId === pluginId ? draft : { pluginId, entryPath: "project.md", text: "" };
  const setText = (text: string) => setDraft({ ...current, text });
  const setPath = (entryPath: string) => setDraft({ pluginId, entryPath, text: listing?.notes.find(file => file.relativePath === entryPath)?.text ?? "" });
  const save = async () => {
    if (saving.current || !listing || hydrated.current !== pluginId) return;
    saving.current = true;
    const requestGeneration = generation.current;
    setSavingId(pluginId);
    try {
      const response = await write.mutate({ input: { pluginId, entryPath: current.entryPath, text: current.text } });
      if (generation.current !== requestGeneration) return;
      loader.replace({ value: response }); setStatus({ pluginId, message: t("Note saved.") });
    } catch { if (generation.current === requestGeneration) setStatus({ pluginId, message: t("Could not save note.") }); }
    finally { saving.current = false; setSavingId(null); }
  };
  return { t, listing, entryPath: current.entryPath, text: current.text, setPath, setText, save,
    saving: savingId === pluginId, status: memoryStatusMessage({ pluginId, status, error: query.error, listing, t }),
    editorDisabled: savingId === pluginId || !listing || hydrated.current !== pluginId,
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
