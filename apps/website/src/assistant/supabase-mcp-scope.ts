/**
 * @file URL helpers for `features/supabase-connect`'s project picker (SPEC-052).
 *
 * Supabase's hosted endpoint takes an optional scope from the connection URL: `project_ref` limits
 * every tool to one project, and `read_only=true` makes Supabase's own server refuse writes. Core no
 * longer refuses an unscoped connection (the INV-04 block is gone): the `supabase` agent plugin
 * connects account-wide and passes `project_id` per tool call. This file leaves with
 * `features/supabase-connect` (plan v2 slice R2).
 *
 * Pure: no I/O and no imports.
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
