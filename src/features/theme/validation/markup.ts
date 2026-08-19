import { scanEmbedMarkers } from "#src/core/embeds/marker";
import type { ThemeValidationIssue } from "./profiles.js";

/**
 * @file Theme markup checks: the admin-only `data-agent-element` attribute must never appear in
 * theme-authored markup, `data-embed-config` markers must use the real, current embed vocabulary and
 * the real (single-quoted) attribute shape the runtime actually recognizes, and a `data-tovu-agent`
 * handle (once implemented) gets a minimal presence check.
 *
 * Vocabulary verified directly against the runtime that owns it, not assumed from the design doc,
 * which had drifted (see `theme-authoring-guide-v2.md` §8's 2026-08-18 correction): `widget`,
 * `media`, `post`, `content` resolve via `resolver-service.ts`'s `HTML_EMBED_RESOLVERS`; `menu` and
 * `partial` resolve via `static-render.ts`'s `THEME_OWNED_MARKER_TYPES`. `form` was removed
 * 2026-08-10 (`resolver-service.ts`'s own doc comment) and is deliberately absent — a manifest or
 * marker naming it is now an error here, not a silent pass-through.
 */

/** The complete, current `data-embed-config` `type` vocabulary — six values, kept in sync with
 * `resolver-service.ts`'s `HTML_EMBED_RESOLVERS` (widget/media/post/content) plus
 * `THEME_OWNED_MARKER_TYPES` (menu/partial). Duplicated here rather than imported: those two are
 * `resolver-service.ts`-internal (`const`, not exported), and this validator is a different feature's
 * territory to own — same reasoning `THEME_OWNED_MARKER_TYPES`'s own doc gives for its own,
 * independent duplication of the same two literals. Re-verify against current `HEAD` if this drifts. */
const KNOWN_EMBED_TYPES: ReadonlySet<string> = new Set(["widget", "media", "post", "content", "menu", "partial"]);

/** Tolerant pre-scan for `data-embed-config` written with a quote style the REAL runtime scanner
 * (`core/embeds/marker.ts`'s `MARKER_PATTERN`) does not recognize — double-quoted or unquoted. The
 * real scanner requires single quotes BY DESIGN (so the JSON payload's own double quotes need no
 * escaping — see that module's file header); a marker spelled any other way is not a runtime bug to
 * fix there, it is a silently-inert marker an author needs to be told about, which is what this
 * pre-scan exists to catch. Matches loosely on purpose (it only needs to prove the attribute is
 * PRESENT in a shape the real scanner will miss, not to parse its JSON payload). */
const MALFORMED_QUOTE_PATTERN = /data-embed-config\s*=\s*(?!')(?:"[^"]*"|[^\s>]+)/g;

const DATA_AGENT_ELEMENT_PATTERN = /data-agent-element\b/;

/**
 * Check one file's markup content. Caller supplies the theme-relative path purely for message/finding
 * context — this function does no filesystem I/O itself.
 *
 * @complexity O(m) in the markup's own length (two bounded regex passes plus one call into the real
 * marker scanner, itself linear).
 */
export function checkMarkupFile(
  required: { relativePath: string; content: string },
  _optional: Record<string, never> = {}
): ThemeValidationIssue[] {
  const { relativePath, content } = required;
  const issues: ThemeValidationIssue[] = [];

  if (DATA_AGENT_ELEMENT_PATTERN.test(content)) {
    issues.push({
      ruleId: "markup-data-agent-element-forbidden",
      message: `'${relativePath}' uses 'data-agent-element' — that attribute is the ADMIN page-authoring convention (features/pages), never valid in theme markup`,
      path: relativePath,
    });
  }

  for (const match of content.matchAll(MALFORMED_QUOTE_PATTERN)) {
    issues.push({
      ruleId: "markup-embed-config-not-single-quoted",
      message: `'${relativePath}' has a data-embed-config attribute not written with single quotes (found: ${match[0].slice(0, 60)}) — the runtime scanner only recognizes the single-quoted form and will leave this marker unresolved, silently`,
      path: relativePath,
    });
  }

  const { markers, rejected } = scanEmbedMarkers(content);
  for (const rejection of rejected) {
    issues.push({
      ruleId: "markup-embed-config-unparseable",
      message: `'${relativePath}': data-embed-config marker #${rejection.occurrence} could not be parsed (${rejection.problem.kind})`,
      path: relativePath,
    });
  }
  for (const marker of markers) {
    if (!KNOWN_EMBED_TYPES.has(marker.type)) {
      issues.push({
        ruleId: "markup-embed-config-unknown-type",
        message: `'${relativePath}': data-embed-config type '${marker.type}' is not a recognized embed type — expected one of ${[...KNOWN_EMBED_TYPES].join(", ")}${marker.type === "form" ? " ('form' was removed 2026-08-10 — embed a contact-form widget instead: {\"type\":\"widget\",\"id\":\"<contact-form widget entry id>\"})" : ""}`,
        path: relativePath,
      });
    }
  }

  return issues;
}

/**
 * Minimal presence check for `data-tovu-agent` — deliberately NOT a full syntax/grammar validation.
 * `theme-authoring-guide-v2.md` §8 marks this attribute `[TARGET, NOT YET IMPLEMENTED]`: zero code
 * anywhere defines its value grammar yet, so enforcing one here would invent a contract nothing else
 * agrees to. This only catches the one unambiguous mistake possible before that contract exists: the
 * attribute present with an empty value, which cannot be a valid agent handle under any future
 * grammar. Tighten this once `data-tovu-agent`'s real syntax is settled and implemented.
 */
export function checkTovuAgentAttributePresence(
  required: { relativePath: string; content: string },
  _optional: Record<string, never> = {}
): ThemeValidationIssue[] {
  const { relativePath, content } = required;
  const issues: ThemeValidationIssue[] = [];
  const emptyValuePattern = /data-tovu-agent\s*=\s*(['"])\s*\1/g;
  if (emptyValuePattern.test(content)) {
    issues.push({
      ruleId: "markup-tovu-agent-empty",
      message: `'${relativePath}' has a data-tovu-agent attribute with an empty value`,
      path: relativePath,
    });
  }
  return issues;
}
