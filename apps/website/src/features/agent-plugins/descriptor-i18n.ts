import { parseDescriptorI18n as parseDescriptorI18nBlock, type DescriptorI18n } from "@jini-ai/core/text";

/**
 * @file The optional `i18n` block a plugin descriptor carries so its own person-facing text (labels,
 * help, guidance) renders in the viewer's language without core naming the plugin's strings.
 *
 * The parser lives in `@jini-ai/core/text`; this file keeps the host's positional signature for
 * every descriptor parser that has person-facing text (deploy targets,
 * `features/deployments/deploy-targets/registry.ts`; git hosts, `features/source-control/provider-registry.ts`).
 */

/** Locale → English source text → translation. */
export type { DescriptorI18n };

/**
 * A descriptor's `i18n` block (absent = English only), or the reason it is invalid.
 *
 * @complexity O(l·e) in locales times entries, both capped.
 */
export function parseDescriptorI18n(value: unknown, at: string): DescriptorI18n | undefined | string {
  return parseDescriptorI18nBlock({ value, at });
}
