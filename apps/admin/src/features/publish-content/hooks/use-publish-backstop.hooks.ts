import { useEffect, useRef, useState } from "react";
import type { Translate } from "@/lib/dictionary-translator";
import { defaultPublishBackstopPort } from "./publish-backstop-dependencies.hooks";
import type { BackstopGap, BackstopPeer, BackstopPlan, BackstopRow, BackstopRun, BackstopSelection, BackstopSendResult, BackstopUndoResult, PublishBackstopPort } from "./publish-backstop-port.hooks";
import { backstopPlanRows, destinationUndoHref, parseBackstopRow, rowAddress } from "./publish-backstop.rules";

export function usePublishBackstop(
  { port = defaultPublishBackstopPort, t, runId, canPublish = true }: { port?: PublishBackstopPort; t: Translate; runId?: string; canPublish?: boolean },
  _optional: Record<string, never> = {},
) {
  const [allowed, setAllowed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [peers, setPeers] = useState<readonly BackstopPeer[]>([]);
  const [peerId, setPeerId] = useState("");
  const [gaps, setGaps] = useState<readonly BackstopGap[]>([]);
  const [rows, setRows] = useState<readonly BackstopRow[]>([]);
  const [files, setFiles] = useState<readonly string[]>([]);
  const [rowTable, setRowTable] = useState("");
  const [rowPk, setRowPk] = useState("");
  const [filePath, setFilePath] = useState("");
  const [reason, setReasonState] = useState("");
  const [typedHost, setTypedHost] = useState("");
  const [plan, setPlan] = useState<BackstopPlan | null>(null);
  const [overwriteKeys, setOverwriteKeys] = useState<readonly string[]>([]);
  const [result, setResult] = useState<BackstopSendResult | null>(null);
  const [run, setRun] = useState<BackstopRun | null>(null);
  const [undoResult, setUndoResult] = useState<BackstopUndoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gapError, setGapError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const snapshot = useRef<BackstopSelection | null>(null);
  const activePeer = peers.find((peer) => peer.id === peerId);
  let host = "";
  try { if (activePeer) host = new URL(activePeer.baseUrl).host; } catch { /* Bad saved URL disables send. */ }
  const planRows = backstopPlanRows({ plan, t });
  const writable = planRows.filter((row) => row.writes);
  // Older peers cannot provide a value review. Fail closed rather than displaying hashes as
  // though they were live values; installing BS6 on both sites completes this contract.
  const valuesReviewed = writable.every((row) => plan?.plan?.backstopPreview?.some((preview) => preview.entityType === row.entityType && preview.entityId === row.entityId && !preview.unavailableReason));
  const canCheck = allowed && installed && canPublish && !busy && !!activePeer && rows.length + files.length > 0 && reason.trim().length >= 10 && reason.length <= 2000 && !result;
  const canSend = allowed && installed && canPublish && !busy && !!plan?.logId && !plan.plan?.details.refused && writable.length > 0 && valuesReviewed && typedHost === host && !!host && !result;
  const canUndo = allowed && installed && !busy && !!run?.canUndo && !undoResult;

  function describe(error: unknown): string {
    if (error && typeof error === "object" && "code" in error && error.code === "BACKSTOP_NOT_INSTALLED") return t("Send by hand needs audit storage installed on both sites.");
    return error instanceof Error ? t(error.message) : t("This send could not complete.");
  }
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    port.status().then(async (status) => {
      if (cancelled) return;
      setAllowed(status.allowed); setInstalled(status.installed);
      if (!status.allowed) { if (runId) setError(t("This send could not complete.")); return; }
      if (runId && !status.installed) { setError(t("Send by hand needs audit storage installed on both sites.")); return; }
      if (runId && status.installed) {
        try { const next = await port.run({ runId }); if (!cancelled) setRun(next); }
        catch (failure) { if (!cancelled) setError(describe(failure)); }
      }
    }).catch((failure) => { if (!cancelled && runId) setError(describe(failure)); });
    return () => { cancelled = true; mounted.current = false; generation.current++; };
  }, [port, runId]);

  async function loadGaps() {
    try { const response = await port.gaps(); if (mounted.current) { setGaps(response.gaps); setGapError(null); } }
    catch { if (mounted.current) setGapError(t("Publishing gaps could not be read.")); }
  }
  async function open() {
    if (!allowed) return;
    setExpanded(true);
    if (peers.length > 0 || !canPublish || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const response = await port.listPeers();
      // Loading destinations is discovery; only the operator may choose where to send.
      if (mounted.current) setPeers(response.peers);
      await loadGaps();
    } catch (failure) { if (mounted.current) setError(describe(failure)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  function invalidate({ keepOverwrite = false } = {}) { generation.current++; snapshot.current = null; setPlan(null); setTypedHost(""); setError(null); if (!keepOverwrite) setOverwriteKeys([]); }
  function selectPeer(id: string) { invalidate(); setPeerId(id); }
  function setReason(value: string) { invalidate(); setReasonState(value); }
  function addRow() {
    if (inFlight.current || result) return;
    const row = parseBackstopRow({ table: rowTable.trim(), pk: rowPk });
    if (!row) { setError(t("Choose a table and a complete primary key as JSON with text or safe numbers.")); return; }
    if (rows.length >= 200) { setError(t("Choose at most 200 rows and 50 files.")); return; }
    if (rows.some((selected) => rowAddress({ row: selected }) === rowAddress({ row }))) { setError(t("Choose each item once.")); return; }
    invalidate(); setRows([...rows, row]);
  }
  function addFile() {
    if (inFlight.current || result) return;
    const path = filePath.trim();
    if (!path || path.length > 512 || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..")) {
      setError(t("Choose a regular file by its site-relative path.")); return;
    }
    if (files.length >= 50) { setError(t("Choose at most 200 rows and 50 files.")); return; }
    if (files.includes(path)) { setError(t("Choose each item once.")); return; }
    invalidate(); setFiles([...files, path]); setFilePath("");
  }
  function removeRow(index: number) { if (inFlight.current || result) return; invalidate(); setRows(rows.filter((_, i) => i !== index)); }
  function removeFile(path: string) { if (inFlight.current || result) return; invalidate(); setFiles(files.filter((file) => file !== path)); }
  async function runCheck({ keys = overwriteKeys } = {}) {
    if (!canCheck || inFlight.current) return;
    invalidate({ keepOverwrite: true }); const ticket = generation.current;
    const selection: BackstopSelection = { peerId, reason: reason.trim(), rows: [...rows], files: [...files], ...(keys.length > 0 ? { overwriteEntityKeys: [...keys] } : {}) };
    inFlight.current = true; setBusy(true);
    try {
      const next = await port.plan(selection);
      if (mounted.current && generation.current === ticket) { snapshot.current = selection; setPlan(next); }
    } catch (failure) { if (mounted.current && generation.current === ticket) setError(describe(failure)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function check() { await runCheck(); }
  async function toggleOverwrite(key: string) {
    if (busy || inFlight.current || result || !planRows.some((row) => row.key === key && (row.canOverwrite || overwriteKeys.includes(key)))) return;
    const keys = overwriteKeys.includes(key) ? overwriteKeys.filter((selected) => selected !== key) : [...overwriteKeys, key];
    setOverwriteKeys(keys); await runCheck({ keys });
  }
  async function send() {
    if (!canSend || !snapshot.current || !plan?.logId || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try {
      const next = await port.send({ ...snapshot.current, typedHost, logId: plan.logId });
      if (mounted.current) { setResult(next); setTypedHost(""); }
      await loadGaps();
    } catch (failure) {
      // A pending audit/consumed token may already exist after a network failure. Never offer
      // automatic resend of that plan; the next check re-inspects live state and makes a new log.
      if (mounted.current) { invalidate(); setError(describe(failure)); }
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  async function undo() {
    if (!canUndo || !runId || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { const next = await port.undo({ runId }); if (mounted.current) setUndoResult(next); }
    catch (failure) { if (mounted.current) setError(describe(failure)); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  }
  const undoHref = result ? destinationUndoHref({ baseUrl: result.destination, runId: result.runId }) : null;
  return { t, undoRequested: !!runId, rowKeys: rows.map((row) => rowAddress({ row })), toggleExpanded: () => { if (expanded) setExpanded(false); else void open(); },
    allowed, installed, expanded, peers, peerId, host, gaps, rows, files, rowTable, rowPk, filePath, reason, typedHost, plan, result, run, undoResult, error, gapError, busy,
    canCheck, canSend, canUndo, planRows, valuesReviewed, undoHref, canPublish, overwriteKeys, toggleOverwrite,
    resultRows: result?.details?.rows ?? result?.report?.rows ?? [],
    open, close: () => setExpanded(false), selectPeer, setRowTable, setRowPk, setFilePath, setReason, setTypedHost, addRow, addFile, removeRow, removeFile, check, send, undo };
}
