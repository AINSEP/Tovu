import { SITE_NAME_MAX_LENGTH } from './contracts/site-name.ts';

const normalized = (name: string): string => name.trim().toLowerCase();

/** Cards and tabs need distinct names even when different folders contain the same site title. */
export function uniqueSiteName(
  { name, names }: { name: string; names: readonly string[] }, _optional = {},
): string {
  const base = name.trim();
  const occupied = new Set(names.map(normalized));
  if (!occupied.has(normalized(base))) return base;
  // The search ends on its own condition (a finite `occupied` always leaves a free number), so the
  // loop has no exit path that no input can reach.
  let number = 2;
  while (occupied.has(normalized(withSuffix(base, number)))) number += 1;
  return withSuffix(base, number);
}

/** `base` with ` <number>` appended, trimmed first so the result stays within the CLI's name limit. */
function withSuffix(base: string, number: number): string {
  const suffix = ` ${number}`;
  // The automatic suffix must not turn an otherwise valid Create into a CLI validation failure.
  return base.slice(0, SITE_NAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
}

/** Rename is an explicit choice, so silently substituting a different name would be misleading. */
export function duplicateSiteNameError(
  { name, names }: { name: string; names: readonly string[] }, _optional = {},
): string | null {
  return names.some((existing) => normalized(existing) === normalized(name))
    ? `A website named "${name.trim()}" is already tracked. Choose a different name.` : null;
}
