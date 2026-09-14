/**
 * @file Project scoping for a federated connection to Supabase's hosted MCP server (SPEC-052).
 *
 * Supabase's hosted endpoint takes its scope from the connection URL itself: `project_ref` limits
 * every tool to one project, and `read_only=true` makes Supabase's own server refuse writes. A
 * connection to that host WITHOUT a `project_ref` reaches every project in the account, so
 * `external-mcp-store.ts`'s `readEnabledExternalMcpConfigs` never offers one (INV-04) and reports
 * {@link supabaseMcpScopeFailure}'s reason instead.
 *
 * Keyed on the HOST, not on the `supabase` connection id: an operator who hand-types the same
 * endpoint under a different id gets the same protection.
 *
 * Pure: no I/O and no imports, so both the store and `features/supabase-connect` can share it.
 */

export const SUPABASE_MCP_HOST = "mcp.supabase.com";
export const SUPABASE_MCP_URL = "https://mcp.supabase.com/mcp";

/** Supabase project refs are short lowercase alphanumerics (20 characters today). Bounded so a
 *  malformed value can never grow the stored URL. */
const PROJECT_REF_PATTERN = /^[a-z0-9]{1,64}$/;

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/** Whether `url` points at Supabase's hosted MCP server. @complexity O(n) in the URL length. */
export function isSupabaseMcpUrl(url: string | null): boolean {
  if (url === null) return false;
  return parseUrl(url)?.hostname === SUPABASE_MCP_HOST;
}

/**
 * Reads the scope a Supabase MCP URL carries. `readOnly` is `true` only for an explicit
 * `read_only=true`, matching how Supabase's server itself reads the parameter.
 *
 * @complexity O(n) in the URL length.
 */
export function readSupabaseMcpScope(url: string): { projectRef: string | null; readOnly: boolean } {
  const params = parseUrl(url)?.searchParams;
  const projectRef = params?.get("project_ref") ?? "";
  return { projectRef: projectRef === "" ? null : projectRef, readOnly: params?.get("read_only") === "true" };
}

/**
 * Returns `url` scoped to one project, with `read_only=true` set or removed.
 *
 * @throws {Error} When `projectRef` is not a Supabase project ref.
 * @complexity O(n) in the URL length.
 */
export function buildScopedSupabaseMcpUrl(input: { url: string; projectRef: string; readOnly: boolean }): string {
  if (!PROJECT_REF_PATTERN.test(input.projectRef)) {
    throw new Error("that is not a Supabase project ref (lowercase letters and digits only)");
  }
  const scoped = parseUrl(input.url) ?? new URL(SUPABASE_MCP_URL);
  scoped.searchParams.set("project_ref", input.projectRef);
  if (input.readOnly) scoped.searchParams.set("read_only", "true");
  else scoped.searchParams.delete("read_only");
  return scoped.toString();
}

/**
 * Why a connection must not be offered yet, or `null` when scoping does not block it — either it is
 * not a Supabase connection, or it already names a project.
 *
 * @complexity O(n) in the URL length.
 */
export function supabaseMcpScopeFailure(url: string | null): string | null {
  if (url === null || !isSupabaseMcpUrl(url)) return null;
  if (readSupabaseMcpScope(url).projectRef !== null) return null;
  return "no Supabase project has been selected yet — pick one with supabase_set_project_scope before any Supabase tool is offered";
}
