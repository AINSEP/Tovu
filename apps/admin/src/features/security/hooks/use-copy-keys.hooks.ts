import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type MouseEvent } from "react";
import type { Translate } from "@jini-ai/ui/panel-kit";
import { api, ApiError, type AdminCredentialCopySource, type AdminCredentialCopyResult } from "@/lib/api";
import { publishContentRefresh } from "@/lib/content-refresh-bus";
import { ACCESS_TOKENS_RESOURCE } from "../rules";
import { copyKeysResultText, copyKeysUpgradeMessage } from "../security-i18n";

export type CopyKeysPort = Pick<typeof api, "listCredentialCopySources" | "copyCredentials">;
type StartSite = (input: { id: string }) => Promise<unknown>;
type CopyKey = AdminCredentialCopySource["keys"][number];

const NEEDS_UPGRADE = "source-needs-upgrade";
const MAX_COPY_IDS = 100;

/** Adapt an existing desktop capability when present; browser admins cannot start local sites. */
function desktopStarter(): StartSite | undefined {
  const bridge = (window as unknown as { tovuRunner?: { startSite?: (id: string) => Promise<unknown> } }).tovuRunner;
  return bridge?.startSite ? ({ id }) => bridge.startSite!(id) : undefined;
}

/** Copy needs an idle dialog, an eligible selected source, and 1–100 selected IDs. */
function copyBlocked({ loading, pending, source, count }: {
  loading: boolean; pending: boolean; source: AdminCredentialCopySource | undefined; count: number;
}): boolean {
  const sourceBlocked = !source || !!source.reasonCode;
  const countOutOfRange = count === 0 || count > MAX_COPY_IDS;
  return loading || pending || sourceBlocked || countOutOfRange;
}

/** The desktop start for the selected upgrade source — only its own route-supplied hint, only with a desktop owner. */
function startRequest({ source, sourceSiteId, startSite }: {
  source: AdminCredentialCopySource | undefined; sourceSiteId: string; startSite: StartSite | undefined;
}): (() => Promise<unknown>) | undefined {
  const hint = source?.actionHint;
  if (source?.reasonCode !== NEEDS_UPGRADE || hint?.action !== "start-site" || hint.siteId !== sourceSiteId || !startSite) return undefined;
  return () => startSite({ id: hint.desktopSiteId });
}

/** Label, provider (or kind) and the server's hint, shown only when it is exactly four characters. */
function keyText(key: CopyKey): string {
  const hint = key.last4?.length === 4 ? " · …" + key.last4 : "";
  return `${key.label} · ${key.provider ?? key.kind}${hint}`;
}

/** Works-for ids win; publish hosts are the fallback only for an empty list. */
function worksForText({ key, t }: { key: CopyKey; t: Translate }): string {
  const worksFor = key.worksFor?.length ? key.worksFor : key.publishHosts ?? [];
  return worksFor.length ? `${t("Works for")}: ${worksFor.join(", ")}` : "";
}

function keyRows({ source, ids, t }: { source: AdminCredentialCopySource | undefined; ids: string[]; t: Translate }) {
  const selected = new Set(ids);
  return (source?.keys ?? []).map(key => ({ id: key.id, checked: selected.has(key.id), text: keyText(key), worksFor: worksForText({ key, t }) }));
}

/** Results render fixed copy only, prefixed by the source's label for IDs it still lists. */
function resultRows({ source, results, t }: {
  source: AdminCredentialCopySource | undefined; results: AdminCredentialCopyResult[]; t: Translate;
}) {
  const labels = new Map(source?.keys.map(key => [key.id, key.label] as const));
  return results.map((result, index) => {
    const label = labels.get(result.id);
    const prefix = label ? label + " · " : "";
    return { key: `${result.id}:${index}`, text: prefix + copyKeysResultText({ result, t }) };
  });
}

function sourceMessage({ source, t }: { source: AdminCredentialCopySource | undefined; t: Translate }): string | undefined {
  return source?.reasonCode === NEEDS_UPGRADE ? copyKeysUpgradeMessage({ site: source.name, t }) : source?.message;
}

function isEmptySource(source: AdminCredentialCopySource | undefined): boolean {
  return !!source && !source.reasonCode && source.keys.length === 0;
}

/** The copy route refused because the source must be upgraded first; any other failure stays generic. */
function isUpgradeRefusal(failure: unknown): boolean {
  return failure instanceof ApiError && failure.body?.reasonCode === NEEDS_UPGRADE;
}

/** The source site's keys are dropped and it is marked as needing an upgrade before copying. */
function markSourceNeedsUpgrade(sourceSiteId: string): (previous: AdminCredentialCopySource[]) => AdminCredentialCopySource[] {
  return (previous) => previous.map(item => item.siteId === sourceSiteId
    ? { ...item, keys: [], reasonCode: NEEDS_UPGRADE } : item);
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
    if (!open) return undefined;
    let live = true;
    setLoading(true);
    client.listCredentialCopySources({}).then(({ sources: next }) => {
      if (live) setSources(next);
    }).catch(() => { if (live) setError("Couldn't load projects. Try again."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [client, open, refresh]);
  const source = sources.find(item => item.siteId === sourceSiteId);
  const disabled = copyBlocked({ loading, pending, source, count: ids.length });
  const launch = startRequest({ source, sourceSiteId, startSite });
  /** One copy or start at a time: `busy` refuses a second call before `pending` re-renders. */
  const exclusive = async (work: () => Promise<void>) => {
    busy.current = true; setPending(true); setError("");
    try { await work(); }
    finally { busy.current = false; setPending(false); }
  };
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
    setResults([]);
    await exclusive(async () => {
      try {
        const response = await client.copyCredentials({ sourceSiteId, ids, overwrite });
        setResults(response.results);
        publishContentRefresh([ACCESS_TOKENS_RESOURCE]);
      } catch (failure) {
        if (!isUpgradeRefusal(failure)) { setError("Copying keys failed. Try again."); return; }
        setSources(markSourceNeedsUpgrade(sourceSiteId));
        setIds([]);
      }
    });
  };
  const start = async () => {
    if (!launch || busy.current) return;
    await exclusive(async () => {
      try { await launch(); setRefresh(value => value + 1); }
      catch { setError("Couldn't start this project. Try again."); }
    });
  };
  return {
    open, show, cancel, submit, loading, pending, disabled, sources, sourceSiteId, changeSource, changeKey,
    overwrite, changeOverwrite: (event: ChangeEvent<HTMLInputElement>) => setOverwrite(event.currentTarget.checked),
    error: error ? t(error) : "", canStart: !!launch, start,
    sourceMessage: sourceMessage({ source, t }),
    empty: isEmptySource(source),
    keys: keyRows({ source, ids, t }),
    results: resultRows({ source, results, t }),
  };
}

export type CopyKeysController = ReturnType<typeof useCopyKeys>;
/** Bind the existing HTTP and desktop owners; the presentation layer never imports either. */
export function useWiredCopyKeys(required: { t: Translate }): CopyKeysController {
  return useCopyKeys(required, { startSite: desktopStarter() });
}
