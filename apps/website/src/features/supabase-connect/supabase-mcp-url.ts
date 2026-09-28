/**
 * @file Recognises the `supabase` External MCP row's hosted endpoint, for `supabase_set_access_token`.
 *
 * Moved here from `assistant/supabase-mcp-scope.ts` on 2026-09-27, when the one-project picker that
 * file's `buildScopedSupabaseMcpUrl` served was deleted: vendor knowledge stays out of core. Leaves
 * with the rest of `features/supabase-connect` (plan v2 slice R2).
 *
 * Pure: no I/O and no imports.
 */

export const SUPABASE_MCP_HOST = "mcp.supabase.com";
export const SUPABASE_MCP_URL = "https://mcp.supabase.com/mcp";

/** Whether `url` points at Supabase's hosted MCP server. @complexity O(n) in the URL length. */
export function isSupabaseMcpUrl(url: string | null): boolean {
  if (url === null) return false;
  try {
    return new URL(url).hostname === SUPABASE_MCP_HOST;
  } catch {
    return false;
  }
}
