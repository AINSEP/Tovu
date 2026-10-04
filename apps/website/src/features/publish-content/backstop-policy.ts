import { checkTreePath } from "./file-tree-policy.js";
import { scanTextForSecrets } from "#src/features/webhooks/secret-scan-guard";

/** CMS-specific, immutable boundaries, run on BOTH peers. Neither a grant nor a confirmation
 * can relax these. Plugin tables are allowed (owner B3, 2026-10-04), subject to the same rules. */
export const BACKSTOP_DENIED_TABLE_PATTERNS: readonly RegExp[] = [
  /(?:^|_)(?:members?|identity|principals?|sessions?|roles?|polic(?:y|ies))(?:_|$)/i,
  /^api_keys(?:_|$)/i, /credential/i, /^composio_/i,
  /^(?:origin_settings|deployment|publish_content|publish_trust|publish_backstop|webhook|form_submissions|analytics|redirect_hits|change_sets|outbox|trashed_items)(?:_|$)/i,
  /^(?:sqlite_|__?drizzle|drizzle_|migration)/i,
  /^(?:tovu_(?:chat_)?migrations|schema_migrations)(?:_|$)/i,
];
export const BACKSTOP_DENIED_COLUMN_PATTERN = /secret|token|password|_hash$|key/i;
export const BACKSTOP_DENIED_FILE_ROOTS = [
  "agent-plugins", "plugins", "skills", "uploads", "ops", "out", ".git", "node_modules", ".publish-staging", ".publish-previous",
] as const;
export const BACKSTOP_LIMITS = { rows: 200, files: 50, bytes: 50 * 1024 * 1024, scanBytes: 1024 * 1024 } as const;

export function checkRawTable(
  { table, columns }: { table: string; columns: readonly string[] },
  _optional: Record<string, never> = {},
): string | null {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return "The table name is not a valid database identifier.";
  if (BACKSTOP_DENIED_TABLE_PATTERNS.some((pattern) => pattern.test(table))) {
    return `Table '${table}' holds private or per-install data and is never sent.`;
  }
  for (const column of columns) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(column) || column === "__proto__") return "The column name is not a valid database identifier.";
    if (BACKSTOP_DENIED_COLUMN_PATTERN.test(column)) return `Column '${column}' may hold a key or password; this row is never sent.`;
  }
  return null;
}

export function checkRawFilePath(
  { relPath, isSymbolicLink = false }: { relPath: string; isSymbolicLink?: boolean },
  _optional: Record<string, never> = {},
): string | null {
  if (isSymbolicLink) return "Links are never sent; choose a regular file inside the site folder.";
  // A raw file can start at the site root, unlike a typed tree. Apply the deny-list at EVERY
  // component so a directory named .env (or a nested database backup) cannot evade it.
  const shape = checkTreePath(relPath);
  if (shape) return shape;
  if (/[:%\x01-\x1f\x7f]/.test(relPath)) return `File '${relPath}' has an unsafe path shape.`;
  for (const part of relPath.split("/")) {
    const lower = part.toLowerCase();
    if (BACKSTOP_DENIED_FILE_ROOTS.some((root) => root === lower) || lower.startsWith("restore-point-") ||
      lower.startsWith(".env") || /^\.mcp(?:\..*)?\.json$/.test(lower) ||
      [".npmrc", ".netrc", ".fs-custom-root.json", ".site-meta.json", ".storage-secret.json", "config.json"].includes(lower) ||
      /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/.test(lower) || /\.(?:pem|key|p12|pfx)(?:[.-]|$)/.test(lower) || /\.(?:db.*|sqlite.*)$/.test(lower)) {
      return `File '${relPath}' holds private data or belongs to a protected site folder and is never sent.`;
    }
  }
  return null;
}

export function checkRawValues(
  { values, table }: { values: Readonly<Record<string, unknown>>; table?: string },
  _optional: Record<string, never> = {},
): string | null {
  if (table?.toLowerCase().startsWith("setting_values_")) {
    if (values.secret === 1 || values.secret === true || values.secret === "1") return "Secret settings are never sent.";
    const key = values.key;
    if (typeof key === "string" && (/^core\.(?:execution|privacy)\./.test(key) ||
      key === "core.instructions.custom" || key === "site.assistant.public_enabled")) {
      return `Setting '${key}' belongs to this installation and is never sent.`;
    }
  }
  for (const [column, value] of Object.entries(values)) {
    if (typeof value !== "string") continue;
    const hit = scanTextForSecrets(value)[0];
    if (hit) return `Value '${column}' looks like it holds a key (${hit.patternName}); it was not sent.`;
  }
  return null;
}

export function gapLabelFor(
  item: { entityType: "raw-row"; table: string } | { entityType: "raw-file"; relPath: string },
  _optional: Record<string, never> = {},
): string {
  return item.entityType === "raw-row" ? `table:${item.table}` : `folder:${item.relPath.split("/").slice(0, 2).join("/")}`;
}
