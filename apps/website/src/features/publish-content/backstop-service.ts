import type { BackstopAuditPort, BackstopAuditRecord, BackstopMetadata } from "./backstop-audit.js";
import type { BackstopSelection } from "./backstop-ports.js";
import { BACKSTOP_LIMITS, checkRawValues, gapLabelFor } from "./backstop-policy.js";
import type { PackedEntity } from "./type-registry.js";

export const BACKSTOP_FORBIDDEN = "Only the owner and built-in admins can send items by hand.";

export async function mayUseBackstop(
  { actorId, ownerId, roles }: { actorId: string; ownerId: string; roles: { list(): Promise<readonly { name: string; isBuiltin: boolean }[]> } },
  _optional: Record<string, never> = {},
): Promise<boolean> {
  return actorId === ownerId || (await roles.list()).some((role) => role.isBuiltin && (role.name === "admin" || role.name === "owner"));
}

export function validateBackstopRequest(
  { body, destinationHost }: { body: unknown; destinationHost: string },
  _optional: Record<string, never> = {},
): { error: string } | { request: { reason: string; typedHost: string; selection: BackstopSelection } } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Choose items to send." };
  const b = body as Record<string, unknown>;
  if (typeof b.reason !== "string" || b.reason.trim().length < 10 || b.reason.length > 2000) return { error: "Explain why you need this send in at least 10 characters." };
  if (b.typedHost !== destinationHost) return { error: `Type ${destinationHost} to confirm where this send will go.` };
  const rows = b.rows ?? [];
  const files = b.files ?? [];
  if (!Array.isArray(rows) || !Array.isArray(files) || rows.length > BACKSTOP_LIMITS.rows || files.length > BACKSTOP_LIMITS.files) return { error: "Choose at most 200 rows and 50 files per send." };
  if (rows.some((row) => !row || typeof row !== "object" || typeof row.table !== "string" || !row.pk || typeof row.pk !== "object" || Array.isArray(row.pk) || Object.keys(row.pk).length === 0) ||
    files.some((file) => typeof file !== "string") || rows.length + files.length === 0) return { error: "Choose rows by their complete primary keys and files by their site-relative paths." };
  if (new Set(files).size !== files.length || new Set(rows.map((row) => `${row.table}:${JSON.stringify(Object.fromEntries(Object.entries(row.pk).sort(([a], [b]) => a.localeCompare(b))))}`)).size !== rows.length) return { error: "Choose each item once." };
  const reason = b.reason.trim();
  const secret = checkRawValues({ values: { reason } });
  if (secret) return { error: secret };
  return { request: { reason, typedHost: destinationHost, selection: { rows, files } } };
}

/** Persist a pending event BEFORE dialing live so failures leave a source-side record too. */
export async function runAuditedBackstop<T extends Record<string, unknown>>(
  { audit, record, work, successResult = "success" }: { audit: BackstopAuditPort; record: BackstopAuditRecord; work: () => Promise<T>; successResult?: "success" | "planned" },
  _optional: Record<string, never> = {},
): Promise<T> {
  if (!(await audit.ready())) throw new Error("Send by hand needs its audit storage installed before it can send anything.");
  await audit.save({ record: { ...record, result: "pending" } });
  try {
    const result = await work();
    await audit.save({ record: { ...record, result: successResult, runId: typeof result.runId === "string" ? result.runId : record.runId, details: result } });
    return result;
  } catch (error) {
    await audit.save({ record: { ...record, result: "failure", details: { error: error instanceof Error ? error.message : "This send failed." } } });
    throw error;
  }
}

/** Destination trusts only authenticated bundle metadata, validates it again, and derives gaps
 * itself. Metadata lives outside state so an audit reason never changes content equality. */
export function readBackstopMetadata(
  { entities }: { entities: readonly PackedEntity[] },
  _optional: Record<string, never> = {},
): BackstopMetadata | null {
  const raw = entities.filter((e) => e.entityType === "raw-row" || e.entityType === "raw-file");
  if (raw.length === 0) return null;
  if (raw.length !== entities.length) throw new Error("Send by hand cannot include normally published items.");
  if (new Set(raw.map((e) => `${e.entityType}:${e.id}`)).size !== raw.length) throw new Error("Choose each item once.");
  const first = raw[0]?.backstop;
  if (!first || first.mode !== "backstop" || typeof first.reason !== "string" || first.reason.trim().length < 10 || first.reason.length > 2000 ||
    typeof first.sourceActor !== "string" || first.sourceActor.length === 0 || first.sourceActor.length > 512 ||
    typeof first.destinationHost !== "string" || first.destinationHost.length > 512) throw new Error("This send is missing its reason, destination confirmation or source actor.");
  try { if (new URL(`https://${first.destinationHost}`).host !== first.destinationHost) throw new Error(); }
  catch { throw new Error("This send has an invalid destination address."); }
  if (raw.some((e) => JSON.stringify(e.backstop) !== JSON.stringify(first))) throw new Error("Every item in this send must have the same audit details.");
  const rows = raw.filter((e) => e.entityType === "raw-row");
  const files = raw.filter((e) => e.entityType === "raw-file");
  if (rows.length > BACKSTOP_LIMITS.rows || files.length > BACKSTOP_LIMITS.files || files.reduce((n, e) => n + (typeof e.state.size === "number" ? e.state.size : Infinity), 0) > BACKSTOP_LIMITS.bytes) throw new Error("Choose at most 200 rows and 50 files totaling at most 50 MB per send.");
  const secret = checkRawValues({ values: { reason: first.reason } });
  if (secret) throw new Error(secret);
  return { ...first, gapLabels: [...new Set(raw.map((e) => e.entityType === "raw-row"
    ? gapLabelFor({ entityType: "raw-row", table: String(e.state.table) }) : gapLabelFor({ entityType: "raw-file", relPath: e.id })))].sort() };
}
