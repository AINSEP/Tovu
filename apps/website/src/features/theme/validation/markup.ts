import { parseGalleryConfig, scanEmbedMarkers } from "@jini-ai/cms/widgets/markers";
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

/** The complete, current `data-embed-config` `type` vocabulary — fourteen values, kept in sync with
 * `resolver-service.ts`'s `HTML_EMBED_RESOLVERS` (widget/form/taxonomy/media/post/content) plus
 * `THEME_OWNED_MARKER_TYPES` (menu/partial/post-previews/collection/featured-image/post-author/comments). Duplicated here rather than
 * imported: both are `resolver-service.ts`-internal (`const`, not exported), and this validator is a
 * different feature's territory to own — same reasoning `THEME_OWNED_MARKER_TYPES`'s own doc gives for
 * its own, independent duplication of the same literals. Re-verify against current `HEAD` if this drifts. */
const KNOWN_EMBED_TYPES: ReadonlySet<string> = new Set([
  "widget",
  "form",
  "taxonomy",
  "media",
  "gallery",
  "post",
  "content",
  "menu",
  "partial",
  "post-previews",
  "collection",
  "featured-image",
  "post-author",
  // The active comments provider's thread + form (`features/comments/public-markers.ts`).
  "comments",
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

type Issue = ThemeValidationIssue;
type FileInput = { relativePath: string; content: string };
type Marker = ReturnType<typeof scanEmbedMarkers>["markers"][number];
type Rejection = ReturnType<typeof scanEmbedMarkers>["rejected"][number];

function dataAgentElementIssues({ relativePath, content }: FileInput): Issue[] {
  if (!DATA_AGENT_ELEMENT_PATTERN.test(content)) return [];
  return [{
    ruleId: "markup-data-agent-element-forbidden",
    message: `'${relativePath}' uses 'data-agent-element' — that attribute is the ADMIN page-authoring convention (features/pages), never valid in theme markup`,
    path: relativePath,
  }];
}

function unquotedEmbedConfigIssues({ relativePath, content }: FileInput): Issue[] {
  return [...content.matchAll(UNQUOTED_EMBED_CONFIG_PATTERN)].map(match => ({
    // Keep the historical rule id for callers; both quoted forms are now supported.
    ruleId: "markup-embed-config-not-single-quoted",
    message: `'${relativePath}' has an unquoted data-embed-config attribute (found: ${match[0].slice(0, 60)}) — the runtime scanner requires a single- or double-quoted value and will leave this marker unresolved, silently`,
    path: relativePath,
  }));
}

const rejectionIssue = ({ relativePath, rejection }: { relativePath: string; rejection: Rejection }): Issue => ({
  ruleId: "markup-embed-config-unparseable",
  message: `'${relativePath}': data-embed-config marker #${rejection.occurrence} could not be parsed (${rejection.problem.kind})`,
  path: relativePath,
});

/** Gallery markers, and media markers carrying an inline gallery payload, matched case-insensitively. */
function isGalleryMarker({ marker }: { marker: Marker }): boolean {
  const type = marker.type.toLowerCase();
  const { content, items, html } = marker.config;
  return type === "gallery" || (type === "media" && (content !== undefined || items !== undefined || html !== undefined));
}

function galleryIssues({ relativePath, marker }: { relativePath: string; marker: Marker }): Issue[] {
  if (!isGalleryMarker({ marker })) return [];
  const result = parseGalleryConfig({ config: marker.config.content ?? marker.config }, { allowEmpty: true });
  const prefix = `'${relativePath}': gallery #${marker.occurrence}: `;
  return [
    ...result.errors.map(message => ({ ruleId: "markup-gallery-config-invalid", message: prefix + message, path: relativePath })),
    ...result.warnings.map(message => ({ ruleId: "markup-gallery-alt-missing", message: prefix + message, path: relativePath })),
  ];
}

function unknownTypeIssues({ relativePath, marker }: { relativePath: string; marker: Marker }): Issue[] {
  if (KNOWN_EMBED_TYPES.has(marker.type)) return [];
  return [{
    ruleId: "markup-embed-config-unknown-type",
    message: `'${relativePath}': data-embed-config type '${marker.type}' is not a recognized embed type — expected one of ${[...KNOWN_EMBED_TYPES].join(", ")}`,
    path: relativePath,
  }];
}

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
  const { markers, rejected } = scanEmbedMarkers({ html: content });
  return [
    ...dataAgentElementIssues(required),
    ...unquotedEmbedConfigIssues(required),
    ...rejected.map(rejection => rejectionIssue({ relativePath, rejection })),
    ...markers.flatMap(marker => [...galleryIssues({ relativePath, marker }), ...unknownTypeIssues({ relativePath, marker })]),
    ...checkWebMcpMarkup({ relativePath, content }),
  ];
}
