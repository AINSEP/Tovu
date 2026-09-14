import type { HttpClientPort } from "../../platform/http/index.js";

/**
 * @file The one Supabase Management API call this feature makes: list the projects a credential can
 * see. It does double duty — it is the "lightweight authenticated probe" that validates a pasted
 * personal access token before it is sealed (EC-03), and it populates the project picker (EC-02).
 *
 * Supabase's raw response body never leaves this file (REQ-14): a failure is reduced to a closed
 * `reason` plus the HTTP status, and callers choose the plain-language message.
 */

export const SUPABASE_PROJECTS_URL = "https://api.supabase.com/v1/projects";
/** Per-request bound; the guarded client's egress policy separately caps connect time and body size. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Resource bound on the picker. An account with more projects sees the first 100 Supabase returns. */
export const MAX_SUPABASE_PROJECTS = 100;

export interface SupabaseProject {
  readonly ref: string;
  readonly name: string;
}

export type SupabaseProjectsResult =
  | { readonly ok: true; readonly projects: readonly SupabaseProject[] }
  | { readonly ok: false; readonly reason: "token-invalid" | "unavailable"; readonly status: number | null };

function readTrimmedString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value.trim() : "";
}

/** One project entry, or `null` for an entry with no usable ref. Reads `ref`, falling back to the
 *  older `id` field that carried the same value. @complexity O(1). */
function toProject(entry: unknown): SupabaseProject | null {
  if (typeof entry !== "object" || entry === null) return null;
  const record = entry as Record<string, unknown>;
  const ref = readTrimmedString(record, "ref") || readTrimmedString(record, "id");
  if (ref === "") return null;
  return { ref, name: readTrimmedString(record, "name") || ref };
}

/** Parses the projects array, or `null` when the body is not one. @complexity O(n) in the entry count. */
function parseProjects(bodyText: string): SupabaseProject[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  return parsed
    .map(toProject)
    .filter((project): project is SupabaseProject => project !== null)
    .slice(0, MAX_SUPABASE_PROJECTS);
}

/**
 * Lists the projects `token` can see.
 *
 * 401/403 means Supabase rejected the credential (`token-invalid`); a transport error, timeout, other
 * non-2xx status, or unparseable body is `unavailable`. Never throws, and never includes the token or
 * the response body in its result.
 *
 * @complexity O(n) in the returned entry count; one outbound GET.
 */
export async function listSupabaseProjects(deps: { httpClient: HttpClientPort }, input: { token: string }): Promise<SupabaseProjectsResult> {
  let response;
  try {
    response = await deps.httpClient.send({
      method: "GET",
      url: SUPABASE_PROJECTS_URL,
      headers: { authorization: `Bearer ${input.token}`, accept: "application/json" },
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
  } catch {
    return { ok: false, reason: "unavailable", status: null };
  }
  if (response.status === 401 || response.status === 403) return { ok: false, reason: "token-invalid", status: response.status };
  if (response.status < 200 || response.status >= 300) return { ok: false, reason: "unavailable", status: response.status };
  const projects = parseProjects(response.bodyText);
  return projects === null ? { ok: false, reason: "unavailable", status: response.status } : { ok: true, projects };
}
