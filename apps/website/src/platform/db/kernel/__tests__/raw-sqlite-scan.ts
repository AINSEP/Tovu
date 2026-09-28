import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

/**
 * @file The scanner behind `no-raw-sqlite.boundary.test.ts`: which files talk SQLite directly,
 * how many times per rule, with comments blanked out first. See that test for the ratchet rules.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../../../../../..");
const SCAN_ROOTS = ["apps/website/src", "packages"];
export const BASELINE_PATH = path.join(import.meta.dirname, "raw-sqlite-baseline.json");

/** Where raw SQLite belongs, with the reason. Directory entries end in `/`. */
const ALLOWED: ReadonlyMap<string, string> = new Map([
  ["apps/website/src/platform/db/kernel/", "the storage kernel: drivers and dialect helpers are the one place a dialect is spelled"],
]);

const RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  {
    id: "better-sqlite3-import",
    pattern: /(?:from\s*|require\(\s*|import\(\s*)["'](?:better-sqlite3|drizzle-orm\/better-sqlite3(?:\/[\w-]+)?)["']/g,
  },
  // A statement is always prepared FROM something; a bare `.prepare()` is some other API's hook
  // (the boot lifecycle's `module.prepare()`), not better-sqlite3.
  { id: "prepare", pattern: /\.prepare\s*\(\s*[^\s)]/g },
  // Drizzle's better-sqlite3 terminals run synchronously; pg-core has none of them. (`Map#get`,
  // `Promise.all` always take an argument, so the empty call is specific.)
  { id: "sync-terminal", pattern: /\.(?:all|get|run)\(\)/g },
  // better-sqlite3's transaction takes a SYNC callback: `db.transaction((tx) => …)`.
  { id: "sync-transaction", pattern: /\.transaction\(\s*(?:\(\s*\w*\s*\)|\w+)\s*=>/g },
  { id: "$client", pattern: /\$client\b/g },
  { id: "in-transaction", pattern: /\.inTransaction\b/g },
  { id: "pragma", pattern: /\bPRAGMA\s|\bpragma_[a-z_]+\s*\(|\.pragma\s*\(/gi },
  { id: "sqlite-catalog", pattern: /\bsqlite_(?:master|schema|sequence|temp_master)\b/g },
  {
    id: "begin-transaction",
    pattern: /\bBEGIN\s+(?:IMMEDIATE|EXCLUSIVE|DEFERRED)\b|["'`]\s*BEGIN(?:\s+TRANSACTION)?\s*;?\s*["'`]/gi,
  },
  {
    id: "sqlite-json",
    pattern:
      /\bjson_(?:extract|set|insert|replace|remove|patch|each|tree|group_array|group_object|valid|type|quote|array_length)\s*\(/gi,
  },
  { id: "insert-or", pattern: /\bINSERT\s+OR\s+(?:IGNORE|REPLACE|ABORT|FAIL|ROLLBACK)\b/gi },
  { id: "sqlite-time", pattern: /\bstrftime\s*\(|\bjulianday\s*\(|\bdatetime\s*\(\s*['"]now/gi },
  { id: "autoincrement", pattern: /\bAUTOINCREMENT\b/gi },
  { id: "fts5", pattern: /\bfts5\b|\bbm25\s*\(/gi },
  { id: "sqlite-file-ops", pattern: /\bVACUUM\b|\.backup\s*\(|\bwal_checkpoint\b/g },
];

/** Cheap pre-filter: a file with no raw match cannot have one after comments are removed. */
const ANY_RULE = new RegExp(RULES.map((rule) => rule.pattern.source).join("|"), "i");

export type Counts = Record<string, Record<string, number>>;

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", "dist", "__tests__", "__fixtures__"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue;
    out.push(full);
  }
  return out;
}

/** `text` with every comment replaced by spaces (newlines kept), per the TypeScript parser. */
export function stripComments(fileName: string, text: string): string {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const chars = text.split("");
  const blank = (range: ts.CommentRange) => {
    for (let at = range.pos; at < range.end; at += 1) if (chars[at] !== "\n") chars[at] = " ";
  };
  const seen = new Set<number>();
  const visit = (node: ts.Node) => {
    const children = node.getChildren(source);
    if (children.length === 0) {
      // Comments on the lines before a token are its leading trivia; comments after it on the same
      // line are its trailing trivia. The file ends with an EndOfFile token, so none are missed.
      if (!seen.has(node.pos)) {
        seen.add(node.pos);
        for (const range of ts.getLeadingCommentRanges(text, node.pos) ?? []) blank(range);
        for (const range of ts.getTrailingCommentRanges(text, node.end) ?? []) blank(range);
      }
      return;
    }
    for (const child of children) visit(child);
  };
  visit(source);
  return chars.join("");
}

export function countRawSqlite(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const rule of RULES) {
    const hits = text.match(rule.pattern)?.length ?? 0;
    if (hits > 0) counts[rule.id] = hits;
  }
  return counts;
}

function isAllowed(relative: string): boolean {
  for (const key of ALLOWED.keys()) {
    if (key.endsWith("/") ? relative.startsWith(key) : relative === key) return true;
  }
  return false;
}

export function scan(): Counts {
  const found: Counts = {};
  for (const root of SCAN_ROOTS) {
    for (const file of listSourceFiles(path.join(REPO_ROOT, root))) {
      const relative = path.relative(REPO_ROOT, file).split(path.sep).join("/");
      if (isAllowed(relative)) continue;
      const text = fs.readFileSync(file, "utf8");
      if (!ANY_RULE.test(text)) continue;
      const counts = countRawSqlite(stripComments(file, text));
      if (Object.keys(counts).length > 0) found[relative] = counts;
    }
  }
  return found;
}

export function sorted(counts: Counts): Counts {
  const out: Counts = {};
  for (const file of Object.keys(counts).sort()) {
    out[file] = {};
    for (const rule of Object.keys(counts[file]!).sort()) out[file]![rule] = counts[file]![rule]!;
  }
  return out;
}
