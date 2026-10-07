import { SITE_NAME_MAX_LENGTH } from './contracts/site-name.ts';

const normalized = (name: string): string => name.trim().toLowerCase();

/** Cards and tabs need distinct names even when different folders contain the same site title. */
export function uniqueSiteName(
  { name, names }: { name: string; names: readonly string[] }, _optional = {},
): string {
  const base = name.trim();
  const occupied = new Set(names.map(normalized));
  if (!occupied.has(normalized(base))) return base;
  for (let number = 2; ; number += 1) {
    const suffix = ` ${number}`;
    // The automatic suffix must not turn an otherwise valid Create into a CLI validation failure.
    const candidate = base.slice(0, SITE_NAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
    if (!occupied.has(normalized(candidate))) return candidate;
  }
}

/** Rename is an explicit choice, so silently substituting a different name would be misleading. */
export function duplicateSiteNameError(
  { name, names }: { name: string; names: readonly string[] }, _optional = {},
): string | null {
  return names.some((existing) => normalized(existing) === normalized(name))
    ? `A website named "${name.trim()}" is already tracked. Choose a different name.` : null;
}
