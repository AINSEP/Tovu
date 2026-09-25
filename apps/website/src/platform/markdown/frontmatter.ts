import { load, FAILSAFE_SCHEMA } from "js-yaml";

/**
 * @file One `key: value` reader over a markdown document's `---`-delimited YAML frontmatter block —
 * shared by `features/skills/tool-registrations.ts` (`parseSkillFrontmatter`) and
 * `features/agent-plugins/tool-registrations.ts` (`extractFrontmatterDescription`), which each used
 * to carry their own copy of a single-line `^key:\s*(.+)$` regex. That regex reads a YAML block
 * scalar's OWN marker line, not the value it introduces — `description: >` (folded) or
 * `description: |` (literal), each followed by indented continuation lines, matched only the `>` or
 * `|` character itself. See ADS-memory/.local-artifacts/fix-plan-web-medium-2026-09-24.md row 32.
 *
 * {@link readFrontmatterField} parses the isolated block as YAML instead, under `FAILSAFE_SCHEMA` (no
 * bool/int/float/null resolution — every scalar stays a string, matching how frontmatter has always
 * been read here). Real YAML parsing can throw on a document a regex would have skimmed past
 * harmlessly, so any throw falls back to that same single-line regex plus quote-trim: no `SKILL.md`
 * or plugin frontmatter that loads today stops loading because its YAML is not, strictly, valid YAML.
 *
 * Platform library: pure, no I/O.
 */

/** Collapses any run of whitespace (including the newlines a block scalar joins with) to one space
 *  and trims the ends. Applied uniformly to both the YAML and fallback paths, so a caller sees the
 *  same shape of value regardless of which one resolved it. */
function collapseWhitespace(raw: string): string | undefined {
  const value = raw.replace(/\s+/g, " ").trim();
  return value.length > 0 ? value : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Today's original single-line reader, kept verbatim as the fallback for frontmatter that YAML
 *  itself refuses to parse — trims the value and strips one layer of surrounding quotes. */
function readFieldByRegex(frontmatter: string, key: string): string | undefined {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  const raw = match?.[1];
  if (!raw) return undefined;
  return collapseWhitespace(raw.trim().replace(/^["']|["']$/g, ""));
}

/**
 * Reads one field out of a markdown document's `---`-delimited YAML frontmatter block.
 *
 * @returns `undefined` when the document has no frontmatter block, the block has no `\n---` close,
 * the key is absent, or its value is empty after whitespace-collapsing — the same "not usably
 * present" contract both prior single-purpose readers already had.
 * @complexity O(n) in the frontmatter block's own length.
 */
export function readFrontmatterField(markdown: string, key: string): string | undefined {
  if (!markdown.startsWith("---")) return undefined;
  const end = markdown.indexOf("\n---", 3);
  if (end === -1) return undefined;
  const frontmatter = markdown.slice(3, end);

  let parsed: unknown;
  try {
    parsed = load(frontmatter, { schema: FAILSAFE_SCHEMA });
  } catch {
    return readFieldByRegex(frontmatter, key);
  }

  if (!isPlainObject(parsed)) return undefined;
  const raw = parsed[key];
  if (typeof raw === "string") return collapseWhitespace(raw);
  // A value YAML reads as a sequence/map (e.g. `description: [Beta]`) was a plain string to the old
  // regex; keep reading it that way so such a skill doesn't silently stop loading.
  return raw === undefined || raw === null ? undefined : readFieldByRegex(frontmatter, key);
}
