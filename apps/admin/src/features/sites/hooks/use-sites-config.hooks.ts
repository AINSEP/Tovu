import { useCallback, useEffect, useState } from "react";
import { useAsyncAction } from "@jini-ai/ui/panel-kit";
import { useInvalidate } from "@jini-ai/ui/fetch-query";
import { api, type SitesUserConfig, type SitesUserConfigPatch } from "@/lib/api";
import { KEYS } from "../rules";

/** Shared local settings effects stay here, including explicit sync-warning remedies. Saving
 * placement affects new DBs; the manual stopped-site mover applies it to existing databases.
 * Extra folders are a row list (add/remove per row, 2026-10-09 settings redesign); `roots`/`setRoots`
 * keep the one-per-line text view of the same list, and blank rows are dropped on save.
 * @complexity O(n) root strings; one API operation per action.
 */
export function useSitesConfig(_required = {}, { port = api }: { port?: Pick<typeof api, "getSitesConfig" | "setSitesConfig"> } = {}) {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<SitesUserConfig | null>(null);
  const [home, setHome] = useState("");
  const [rootList, setRootList] = useState<string[]>([]);
  // The row a click on "Add folder" just made, so the dialog can focus it; null otherwise.
  const [addedIndex, setAddedIndex] = useState<number | null>(null);
  const [databases, setDatabases] = useState<"inSite" | "appData">("inSite");
  const [loadError, setLoadError] = useState<string | null>(null);
  const invalidate = useInvalidate();
  const { saving, error, run } = useAsyncAction();
  const accept = useCallback((next: SitesUserConfig) => {
    setConfig(next); setHome(next.sitesHome); setRootList(next.siteRoots); setAddedIndex(null); setDatabases(next.databases);
  }, []);
  useEffect(() => {
    let active = true;
    void port.getSitesConfig().then((next) => { if (active) accept(next); }).catch((failure: unknown) => {
      if (active) setLoadError(failure instanceof Error ? failure.message : String(failure));
    });
    return () => { active = false; };
  }, [accept, port]);
  const change = useCallback((patch: SitesUserConfigPatch) => run({ action: async () => {
    accept(await port.setSitesConfig(patch)); setLoadError(null); invalidate({ key: KEYS.list });
  }, describeError: (failure) => failure instanceof Error ? failure.message : String(failure) }), [accept, port, run, invalidate]);
  const save = useCallback(() => change({ databases,
    ...(!config?.overrides.sitesHome ? { sitesHome: home } : {}),
    ...(!config?.overrides.siteRoots ? { siteRoots: rootList.map((root) => root.trim()).filter(Boolean) } : {}),
  }), [change, config, home, rootList, databases]);
  return { open, show: () => setOpen(true), close: () => setOpen(false), config, home, setHome,
    roots: rootList.join("\n"), setRoots: (text: string) => setRootList(text.split("\n")),
    rootList, addedIndex,
    setRootAt: (index: number, value: string) => setRootList((list) => list.map((root, at) => at === index ? value : root)),
    addRoot: () => { setAddedIndex(rootList.length); setRootList((list) => [...list, ""]); },
    removeRoot: (index: number) => { setAddedIndex(null); setRootList((list) => list.filter((_, at) => at !== index)); },
    databases, setDatabases, save, saving, error: error ?? loadError,
    useAppData: () => change({ databases: "appData" }),
    useLocalHome: () => (config?.warning ? change({ sitesHome: config.warning.localHome }) : Promise.resolve()),
  };
}
