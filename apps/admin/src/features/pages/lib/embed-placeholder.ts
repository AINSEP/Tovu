import { hasAttributeOnAnyNodeShape, type CanvasEmbedPlaceholderDescriptor } from "@jini-ai/ui/html-editor";
import { embedMarkerTarget, parseEmbedMarkerConfig, type EmbedMarkerTarget } from "@tovu/embed-marker";

import type { Translate } from "@/lib/dictionary-translator";

/**
 * @file Bug A (2026-09-23 interactive-bugs plan, Slice A2): the Tovu-specific adapter
 * `PageEditor.tsx` (Slice A3) hands to `@jini-ai/ui/html-editor`'s generic `InteractiveHtmlEditor` as
 * `isProtectedElement`/`describeEmbedPlaceholder` — the same two-function shape Jini's own
 * `InteractiveHtmlEditor.tsx` adapter used to supply from inside the Jini package. Moving it here lets
 * this describer read `@tovu/embed-marker`'s `parseEmbedMarkerConfig`/`embedMarkerTarget` (Slice A1)
 * directly instead of Jini's adapter carrying its own second copy of "which key names the target" —
 * see the root-cause report (`ADS-memory/.local-artifacts/pages-redo-2026-09-23/interactive-bugs-plan.md`,
 * Bug A) for why that second copy is exactly what produced "Placeholder — Widget / no id set" for a
 * marker addressed by `slug`.
 */

/** The attribute either the current (`data-embed-type`) or legacy (`data-widget-embed`,
 *  `data-form-embed`) convention uses to mark a Page HTML embed placeholder div — ported verbatim
 *  from Jini's own `InteractiveHtmlEditor.tsx` adapter (`EMBED_MARKER_ATTRIBUTES`).
 *
 *  **Does NOT include `data-embed-config`, the CURRENT marker attribute** — a known, separately
 *  tracked gap (Jini's own adapter carries the identical disclosure): an embed marker written the
 *  current way is still editable/draggable/removable in this editor today. Widening this list is a
 *  one-line change but alters real interaction behavior, which deserves its own change rather than
 *  riding in on this placeholder-card fix. */
const EMBED_MARKER_ATTRIBUTES = ["data-embed-type", "data-widget-embed", "data-form-embed"] as const;

/** True when `el` carries any embed marker attribute this convention recognizes. Uses
 *  `hasAttributeOnAnyNodeShape` because this predicate is invoked from inside GrapesJS's
 *  `isComponent` callback, which is not always called with a real DOM `Element` — see that helper's
 *  own doc in `@jini-ai/ui/html-editor`. */
export function isProtectedEmbedElement(el: Element): boolean {
  return EMBED_MARKER_ATTRIBUTES.some((attr) => hasAttributeOnAnyNodeShape(el, attr));
}

/**
 * Friendly card heading, as a `t()` KEY, for every embed `type` value this codebase names. Reuses
 * "Content" — the one key `page-editor-i18n.ts` already routes to the Posts editor's own translator
 * (`postEditorKeys`) — rather than declaring a second, independently-translated copy of that exact
 * word. Every other key here is declared fresh in `page-editor-i18n.ts`'s markup dictionary.
 *
 * Covers the same set Jini's own adapter labeled (`media`/`widget`/`post`/`content`, the four types
 * `isPageEmbedType` accepts; `partial`/`menu`, theme-only but labeled defensively), plus the two types
 * that adapter could not know about because it never imported the shared marker-target rule:
 * `collection` and `post-previews`.
 */
const EMBED_KIND_LABEL_KEYS: Readonly<Record<string, string>> = {
  media: "Media",
  widget: "Widget",
  post: "Post",
  content: "Content",
  partial: "Partial",
  menu: "Menu",
  collection: "Collection",
  "post-previews": "Post previews",
};

/** Upper-cases just the first character — the fallback for a `type` {@link EMBED_KIND_LABEL_KEYS}
 *  doesn't (yet) name, so the card still reads as a word rather than a raw lower-case config value.
 *  Never routed through `t()`: an unrecognized type is a free string with no translation to look up,
 *  same as Jini's own adapter's identical `titleCase` fallback. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** How much of a target value (id/slug/typeKey) to show before truncating with an ellipsis — long
 *  enough that two real values are still visually distinct, short enough the card stays a small chip.
 *  32, not Jini's own adapter's 8-character `ID_PREVIEW_LENGTH`: that bound was sized for a raw id
 *  preview only; a slug is authored to be human-readable (`"contact-form"`), so truncating it as
 *  aggressively as an opaque id would defeat the point of showing it at all. */
const TARGET_VALUE_PREVIEW_LENGTH = 32;

/** `value`, unchanged if it fits {@link TARGET_VALUE_PREVIEW_LENGTH}, else cut to that length with a
 *  trailing "…". @complexity O(1). */
function truncateTargetValue(value: string): string {
  return value.length > TARGET_VALUE_PREVIEW_LENGTH ? `${value.slice(0, TARGET_VALUE_PREVIEW_LENGTH)}…` : value;
}

/**
 * The card's identity line for a marker with no authored `name` — the `embedMarkerTarget` outcome
 * turned into display text:
 *
 * - `{ key, value }` — `"<key> <truncated value>"`, e.g. `"slug contact-form"`. This is the exact
 *   line Bug A's root cause report says the admin could never produce before this slice, because
 *   `identityLabel` (Jini's adapter) only ever read `config.id`.
 * - `{ key: "none" }` (post-previews) — never "no id set": `t("Latest posts")`, with the marker's own
 *   `limit` appended when present, since a post-previews marker legitimately has no target to name.
 * - `undefined` (target missing) — `t("no id set")`, unchanged from Jini's own adapter's wording.
 *
 * @complexity O(1) — one `embedMarkerTarget` call (itself O(k) in a small fixed key list) plus one
 * bounded string truncation.
 */
function targetIdentityLabel(type: string, config: Readonly<Record<string, unknown>>, t: Translate): string {
  const target: EmbedMarkerTarget | undefined = embedMarkerTarget(type, config);
  if (target === undefined) return t("no id set");
  if (target.key === "none") {
    const limit = config.limit;
    return typeof limit === "number" ? `${t("Latest posts")} (${limit})` : t("Latest posts");
  }
  return `${target.key} ${truncateTargetValue(target.value)}`;
}

/**
 * Builds the `describeEmbedPlaceholder` callback `@jini-ai/ui/html-editor`'s `InteractiveHtmlEditor`
 * calls once per canvas marker element (via its `applyCanvasEmbedPlaceholders`) — bound once to `t`
 * by `PageEditor`'s hook (`use-page-editor.hooks.ts`, Slice A3) with `useMemo`, since the editor reads
 * this callback only at mount.
 *
 * A marker whose `data-embed-config` fails to parse, isn't an object, or has no `type` returns
 * `undefined` — the same degrade-quietly contract `scanEmbedMarkers` (the server-side scanner this
 * mirrors via `parseEmbedMarkerConfig`) uses for a rejected marker at render time. This runs on every
 * keystroke-adjacent canvas re-render, not at a write chokepoint, so it never warns or logs.
 *
 * `name`, when the marker's own config carries one, wins over every target key — an author's explicit
 * label is always more informative than a resolved reference, matching Jini's own adapter's identical
 * precedence.
 *
 * @complexity O(1) per call — one attribute read, one bounded JSON parse, one small table lookup, one
 * `targetIdentityLabel` call.
 */
export function createEmbedPlaceholderDescriber(t: Translate): (el: Element) => CanvasEmbedPlaceholderDescriptor | undefined {
  return (el: Element): CanvasEmbedPlaceholderDescriptor | undefined => {
    const raw = el.getAttribute("data-embed-config");
    if (!raw) return undefined;
    const result = parseEmbedMarkerConfig(raw);
    if ("problem" in result) return undefined;

    const { config } = result;
    const type = (config.type as string).toLowerCase();
    const kindLabelKey = EMBED_KIND_LABEL_KEYS[type];
    const kindLabel = kindLabelKey !== undefined ? t(kindLabelKey) : titleCase(type);

    const name = typeof config.name === "string" && config.name.length > 0 ? config.name : undefined;
    const identityLabel = name ?? targetIdentityLabel(type, config, t);

    return { kindLabel, identityLabel };
  };
}
