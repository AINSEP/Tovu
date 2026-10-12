import { toSlug } from "../../platform/html/slug.js";

export const MAX_SLUG_LENGTH = 120;
export const DERIVED_SLUG_SUFFIX_ROOM = "-999".length;

/** Leave room for the bounded collision suffix so every derived slug remains editable. */
export function derivePostSlugBase({ title }: { title: string }, _optional: Record<string, never> = {}): string {
  return toSlug(title).slice(0, MAX_SLUG_LENGTH - DERIVED_SLUG_SUFFIX_ROOM).replace(/-+$/, "") || "untitled";
}

/** Automatic slugs are inferred from the stored title, never from an extra preference flag. */
export function isAutomaticPostSlug({ title, slug }: { title: string; slug: string }, _optional: Record<string, never> = {}): boolean {
  const base = derivePostSlugBase({ title });
  return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && /^\d+$/.test(slug.slice(base.length + 1)));
}
