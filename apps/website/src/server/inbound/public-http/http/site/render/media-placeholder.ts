import type { JsonObject } from "@jini-ai/core/primitives";
import { escapeHtml } from "#src/platform/html/escape";
import { str } from "./value-readers.js";
import { safeAspectRatio } from "#src/platform/html/style-values";

/**
 * A labelled aspect-ratio box standing in for an image (no asset pipeline yet).
 *
 * `ratio` goes through {@link safeAspectRatio}'s numeric-shape allowlist rather than `escapeHtml`:
 * `escapeHtml` only stops the value from breaking out of the `style="…"` attribute, not from
 * smuggling a second declaration while staying inside it (`"1;background:url(//evil.example)"`).
 * An unrecognized shape falls back to the same `"16 / 9"` default an absent `ratio` already used.
 * `architecture-p2-plan-2026-09-24.md` §D3.
 */
export function mediaPlaceholder(props: JsonObject): string {
  const label = escapeHtml({ text: str({ value: props.label }, { fallback: "Image" }) });
  const ratio = safeAspectRatio({ value: str({ value: props.ratio }, { fallback: "" }) }) ?? "16 / 9";
  return `<figure class="media-ph" style="aspect-ratio:${ratio}"><span class="media-ph__label">${label}</span></figure>`;
}
