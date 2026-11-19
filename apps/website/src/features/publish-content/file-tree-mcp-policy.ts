/**
 * §2's structural secret rule for an agent-plugin's own `mcp.json`/`.mcp.json`: every `env`/`headers`
 * value must be empty or a `${VAR}` placeholder — never a literal token. Exported for `agent-plugin`'s
 * own contributor (S-F5) to call directly on a candidate file's text; not invoked by
 * {@link checkTreeFiles} itself, since only `agent-plugin` trees ever carry this file shape and
 * {@link checkTreeFiles} has no per-file "this one is mcp.json" signal to key off of without adding a
 * caller contract every other kind would have to satisfy for nothing.
 *
 * @returns A reason naming the first offending key, or `null` when every `env`/`headers` value (at
 *   any nesting, including each server's own sections) is empty or a `${...}` placeholder, or when the JSON
 *   does not parse (a malformed `mcp.json` is a different tree's own problem, not this check's).
 * @complexity O(n) in the JSON text length.
 */
export function checkMcpJsonSecretPlaceholders({ jsonText }: { jsonText: string }, _optional = {}): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;

  return mcpConfigReason({ value: parsed, path: "" });
}

/** Find env/header sections in server declarations as well as the legacy root shape.
 * @complexity O(n) JSON nodes; traversal uses O(depth) stack space. */
function mcpConfigReason({ value, path }: { value: unknown; path: string }, _options = {}): string | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  for (const key of ["env", "headers"] as const) {
    const section = path ? `${path}.${key}` : key;
    const reason = mcpSectionReason({ section, value: record[key] });
    if (reason) return reason;
  }
  return mcpNestedConfigReason({ record, path });
}

/** Search child declarations only after this node's env/headers have passed.
 * @complexity O(n) JSON nodes; traversal uses O(depth) stack space. */
function mcpNestedConfigReason(
  { record, path }: { record: Record<string, unknown>; path: string },
  _options: Record<string, never> = {}
): string | null {
  for (const [key, entry] of Object.entries(record)) {
    if (key === "env" || key === "headers") continue;
    const reason = mcpConfigReason({ value: entry, path: path ? `${path}.${key}` : key });
    if (reason) return reason;
  }
  return null;
}

/** Check every string leaf in an MCP section, including nested objects and arrays.
 * @complexity O(n) section nodes; O(depth) stack space. */
function mcpSectionReason({ section, value }: { section: string; value: unknown }, _options = {}): string | null {
  if (typeof value === "string") {
    return value.length === 0 || /^\$\{[^}]+\}$/.test(value) ? null
      : `has a key written into mcp.json (${section}); move it to live's settings`;
  }
  if (typeof value !== "object" || value === null) return null;
  for (const [key, entry] of Object.entries(value)) {
    const reason = mcpSectionReason({ section: `${section}.${key}`, value: entry });
    if (reason) return reason;
  }
  return null;
}
