import { scanEmbedMarkers } from "@jini-ai/cms/widgets/markers";
import type { ThemeValidationIssue } from "./profiles.js";
import { checkWebMcpMarkup } from './webmcp-markup.js';

/**
 * @file Theme markup checks: the admin-only `data-agent-element` attribute must never appear in
 * theme-authored markup, `data-embed-config` markers must use the real, current embed vocabulary and
 * the quoted attribute shapes the runtime actually recognizes. Browser-agent
 * actions now use tool* forms and data-tool* actions, replacing the unsettled data-tovu-agent.
 *
 * Vocabulary verified directly against the runtime that owns it, not assumed from the design doc,
 * which had drifted (see `theme-authoring-guide-v2.md` §8's 2026-08-18 correction): `widget`,
 * `media`, `post`, `content` resolve via `resolver-service.ts`'s `HTML_EMBED_RESOLVERS`; `menu` and
 * `partial` resolve via `static-render.ts`'s `THEME_OWNED_MARKER_TYPES`. `form`, restored by the
 * owner 2026-10-04, resolves through the contact-form widget path.
 */

/** The complete, current `data-embed-config` `type` vocabulary — eleven values, kept in sync with
 * `resolver-service.ts`'s `HTML_EMBED_RESOLVERS` (widget/form/taxonomy/media/post/content) plus
 * `THEME_OWNED_MARKER_TYPES` (menu/partial/post-previews/collection/featured-image). Duplicated here rather than
 * imported: both are `resolver-service.ts`-internal (`const`, not exported), and this validator is a
 * different feature's territory to own — same reasoning `THEME_OWNED_MARKER_TYPES`'s own doc gives for
 * its own, independent duplication of the same literals. Re-verify against current `HEAD` if this drifts. */
const KNOWN_EMBED_TYPES: ReadonlySet<string> = new Set([
  "widget",
  "form",
  "taxonomy",
  "media",
  "post",
  "content",
  "menu",
  "partial",
  "post-previews",
  "collection",
  "featured-image",
]);

/** Tolerant pre-scan for unquoted `data-embed-config` values the REAL runtime scanner
 * (`Jini/packages/cms/src/widgets/markers/marker.ts`'s `MARKER_PATTERN`) does not recognize. Single quotes were originally
 * required so JSON's own double quotes needed no escaping; since 2026-09-26 the scanner also accepts
 * browser-serialized, entity-encoded double-quoted values. Quoted payloads belong to that scanner,
 * while an unquoted marker remains silently inert and needs an author-facing finding. Matches loosely
 * on purpose: it only proves the attribute is present in a shape the runtime will miss, rather than
 * parsing JSON a second time. */
const UNQUOTED_EMBED_CONFIG_PATTERN = /data-embed-config\s*=\s*(?!['"])[^\s>]+/g;

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

  for (const match of content.matchAll(UNQUOTED_EMBED_CONFIG_PATTERN)) {
    issues.push({
      // Keep the historical rule id for callers; both quoted forms are now supported.
      ruleId: "markup-embed-config-not-single-quoted",
      message: `'${relativePath}' has an unquoted data-embed-config attribute (found: ${match[0].slice(0, 60)}) — the runtime scanner requires a single- or double-quoted value and will leave this marker unresolved, silently`,
      path: relativePath,
    });
  }

  const { markers, rejected } = scanEmbedMarkers({ html: content });
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
        message: `'${relativePath}': data-embed-config type '${marker.type}' is not a recognized embed type — expected one of ${[...KNOWN_EMBED_TYPES].join(", ")}`,
        path: relativePath,
      });
    }
  }

  return [...issues, ...checkWebMcpMarkup({ relativePath, content })];
}

/**
 * Legacy compatibility helper, no longer called by theme package validation.
 * The public validator now rejects every retired handle via checkWebMcpMarkup.
 * Retained so callers/tests of the earlier presence-only contract stay importable.
 *
 * Historical rationale: minimal presence check for `data-tovu-agent` — deliberately NOT a full syntax/grammar validation.
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
