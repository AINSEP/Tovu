import type { BackstopPlan, BackstopRow } from "./publish-backstop-port.hooks";
import type { Translate } from "@/lib/dictionary-translator";

export function parseBackstopRow({ table, pk }: { table: string; pk: string }, _optional = {}): BackstopRow | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return null;
  try {
    const value: unknown = JSON.parse(pk);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length === 0) return null;
    if (Object.entries(value).some(([key, scalar]) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || key === "__proto__" ||
      !(typeof scalar === "string" || (typeof scalar === "number" && Number.isFinite(scalar) && (!Number.isInteger(scalar) || Number.isSafeInteger(scalar)))))) return null;
    return { table, pk: Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) };
  } catch { return null; }
}
export function rowAddress({ row }: { row: BackstopRow }, _optional = {}): string { return `${row.table}:${JSON.stringify(row.pk)}`; }

/** Relative to the saved peer's public base path; no publishing credential in the link. Undo
 * runs under the destination's own human session, preserving BS5's credential boundary. */
export function destinationUndoHref({ baseUrl, runId }: { baseUrl: string; runId: string }, _optional = {}): string | null {
  try {
    const base = new URL(baseUrl);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) return null;
    if (!base.pathname.endsWith("/")) base.pathname += "/";
    const url = new URL("admin/", base);
    url.searchParams.set("backstopRun", runId);
    return url.toString();
  } catch { return null; }
}
export function backstopRunFromSearch({ search }: { search: string }, _optional = {}): string | undefined {
  const runId = new URLSearchParams(search).get("backstopRun");
  return runId && /^[A-Za-z0-9_-]{1,128}$/.test(runId) ? runId : undefined;
}
export function backstopPlanRows({ plan, t }: { plan: BackstopPlan | null; t: Translate }, _optional = {}) {
  const value = (raw: unknown, unavailable: string | null) => unavailable || (raw === null ? t("Does not exist") : JSON.stringify(raw, null, 2));
  return (plan?.plan?.details.rows ?? []).map((row) => {
    const preview = plan?.plan?.backstopPreview?.find((item) => item.entityType === row.entityType && item.entityId === row.entityId);
    return { ...row, key: `${row.entityType}:${row.entityId}`, status: t(row.writes ? "Will send" : "Skipped"),
      before: preview ? value(preview.before, preview.unavailableReason) : t("Live values unavailable; update live first."),
      after: preview ? value(preview.after, null) : t("Live values unavailable; update live first.") };
  });
}
