import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { api, ApiError, type AdminCredentialCopySource, type AdminCredentialCopyResult } from "@/lib/api";
import { publishContentRefresh } from "@/lib/content-refresh-bus";
import { ACCESS_TOKENS_RESOURCE } from "../rules";
import { copyKeysResultText, copyKeysUpgradeMessage } from "../security-i18n";

export type CopyKeysPort = Pick<typeof api, "listCredentialCopySources" | "copyCredentials">;
type StartSite = (input: { id: string }) => Promise<unknown>;

/** Adapt an existing desktop capability when present; browser admins cannot start local sites. */
function desktopStarter(_required: Record<string, never>, _options = {}): StartSite | undefined {
  const bridge = (window as unknown as { tovuRunner?: { startSite?: (id: string) => Promise<unknown> } }).tovuRunner;
  return bridge?.startSite ? ({ id }) => bridge.startSite!(id) : undefined;
}

/** Owns this CMS copy flow; Jini owns the dialog and C2 owns eligibility/secret handling.
 * Lists on open, submits at most 100 IDs once, and broadcasts target inventory refresh on success.
 * Failures show fixed copy; raw errors stay private. O(s+k+r) for s sources, k keys and r results.
 */
export function useCopyKeys({ t }: { t: Translate }, {
  port = api, startSite,
}: { port?: CopyKeysPort; startSite?: StartSite } = {}) {
  const client = useRef(port).current;
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<AdminCredentialCopySource[]>([]);
  const [sourceSiteId, setSourceSiteId] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [results, setResults] = useState<AdminCredentialCopyResult[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setLoading(true);
    client.listCredentialCopySources({}).then(({ sources: next }) => {
      if (live) setSources(next);
    }).catch(() => { if (live) setError("Couldn't load projects. Try again."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client, open, refresh]);
  const source = sources.find(item => item.siteId === sourceSiteId);
  const selected = new Set(ids);
  const labels = new Map(source?.keys.map(key => [key.id, key.label] as const));
  const disabled = loading || pending || !source || !!source.reasonCode || ids.length === 0 || ids.length > 100;
  const show = (event: Pick<MouseEvent<HTMLButtonElement>, "currentTarget">) => {
    event.currentTarget.focus({ preventScroll: true });
    setSources([]); setSourceSiteId(""); setIds([]); setResults([]); setOverwrite(false); setError(""); setOpen(true);
  };
  const cancel = () => { if (!busy.current) setOpen(false); };
  const changeSource = (event: ChangeEvent<HTMLSelectElement>) => {
    setSourceSiteId(event.currentTarget.value); setIds([]); setResults([]); setError("");
  };
  const changeKey = (event: ChangeEvent<HTMLInputElement>) => {
    const { value, checked } = event.currentTarget;
    setIds(previous => checked ? [...previous, value] : previous.filter(id => id !== value));
  };
  const submit = async (event: Pick<FormEvent<HTMLFormElement>, "preventDefault">) => {
    event.preventDefault();
    if (disabled || busy.current) return;
    busy.current = true; setPending(true); setError(""); setResults([]);
    try {
      const response = await client.copyCredentials({ sourceSiteId, ids, overwrite });
      setResults(response.results);
      publishContentRefresh([ACCESS_TOKENS_RESOURCE]);
    } catch (failure) {
      if (failure instanceof ApiError && failure.body?.reasonCode === "source-needs-upgrade") {
        setSources(previous => previous.map(item => item.siteId === sourceSiteId
          ? { ...item, keys: [], reasonCode: "source-needs-upgrade" } : item));
        setIds([]);
      } else setError("Copying keys failed. Try again.");
    }
    finally { busy.current = false; setPending(false); }
  };
  const hint = source?.actionHint;
  const canStart = source?.reasonCode === "source-needs-upgrade" && hint?.action === "start-site" && hint.siteId === sourceSiteId && !!startSite;
  const start = async () => {
    if (!canStart || !startSite || !hint || busy.current) return;
    busy.current = true; setPending(true); setError("");
    try { await startSite({ id: hint.desktopSiteId }); setRefresh(value => value + 1); }
    catch { setError("Couldn't start this project. Try again."); }
    finally { busy.current = false; setPending(false); }
  };
  return {
    open, show, cancel, submit, loading, pending, disabled, sources, sourceSiteId, changeSource, changeKey,
    overwrite, changeOverwrite: (event: ChangeEvent<HTMLInputElement>) => setOverwrite(event.currentTarget.checked),
    error: error ? t(error) : "", canStart, start,
    sourceMessage: source?.reasonCode === "source-needs-upgrade" ? copyKeysUpgradeMessage({ site: source.name, t }) : source?.message,
    empty: !!source && !source.reasonCode && source.keys.length === 0,
    keys: (source?.keys ?? []).map(key => {
      const worksFor = key.worksFor?.length ? key.worksFor : key.publishHosts ?? [];
      return { id: key.id, checked: selected.has(key.id),
        text: `${key.label} · ${key.provider ?? key.kind}${key.last4?.length === 4 ? ` · …${key.last4}` : ""}`,
        worksFor: worksFor.length ? `${t("Works for")}: ${worksFor.join(", ")}` : "" };
    }),
    results: results.map((result, index) => {
      const label = labels.get(result.id);
      return { key: `${result.id}:${index}`, text: `${label ? `${label} · ` : ""}${copyKeysResultText({ result, t })}` };
    }),
  };
}

export type CopyKeysController = ReturnType<typeof useCopyKeys>;
/** Bind the existing HTTP and desktop owners; the presentation layer never imports either. */
export function useWiredCopyKeys(required: { t: Translate }, _options = {}): CopyKeysController {
  return useCopyKeys(required, { startSite: desktopStarter({}) });
}
