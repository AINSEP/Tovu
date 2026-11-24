import { existsSync, realpathSync } from "node:fs";
import path from "node:path";

/**
 * @file Where a Jini package's TypeScript sources live, for scripts that read them as text. A source ref
 * written `@jini-ai/<pkg>/<path under src>` resolves through the linked `node_modules/@jini-ai/<pkg>` symlink's
 * real path (so it follows a `file:../Jini/packages/*` link wherever Jini is checked out), falling back to
 * `$JINI_PACKAGES_DIR/<pkg>` for an unlinked install. A published tarball ships no `src/`, so a ref with no
 * sources on disk resolves to `null` and the caller treats it as missing.
 */

/** A `@jini-ai/<pkg>` prefix and the path under that package's `src/`, or `null` for any other ref. */
export function parseJiniSourceRef({ ref }: { ref: string }, _optional = {}): { pkg: string; rest: string } | null {
  const match = /^@jini-ai\/([^/]+)(?:\/(.*))?$/.exec(ref);
  return match ? { pkg: match[1]!, rest: match[2] ?? "" } : null;
}

/** The `src/` directory of Jini package `pkg`, or `null` when neither the link nor the env fallback has one. */
export function resolveJiniPackageSrc({ repoRoot, pkg, env }: { repoRoot: string; pkg: string; env: { JINI_PACKAGES_DIR?: string | undefined } }, _optional = {}): string | null {
  const linked = path.join(repoRoot, "node_modules", "@jini-ai", pkg);
  const candidates = [
    ...(existsSync(linked) ? [path.join(realpathSync(linked), "src")] : []),
    ...(env.JINI_PACKAGES_DIR ? [path.join(env.JINI_PACKAGES_DIR, pkg, "src")] : []),
  ];
  return candidates.find((dir) => existsSync(dir)) ?? null;
}

/** An `@jini-ai/<pkg>/...` source ref as an absolute path, or `null` when the package's sources are not on disk. */
export function jiniSourcePath({ ref, repoRoot, env }: { ref: string; repoRoot: string; env: { JINI_PACKAGES_DIR?: string | undefined } }, _optional = {}): string | null {
  const parsed = parseJiniSourceRef({ ref });
  const src = parsed ? resolveJiniPackageSrc({ repoRoot, pkg: parsed.pkg, env }) : null;
  return parsed && src ? path.join(src, parsed.rest) : null;
}
