import { checkSiteRelativeTarget } from '@jini-ai/core/contracts/server/verified-origin';

/** Tovu reserved surfaces; repeat the server boundary before any browser location assignment. */
const VISITOR_RESERVED_SEGMENTS: ReadonlySet<string> = new Set(['admin', 'api']);
/** Visitor navigation names a published page only: never arbitrary query or fragment state. */
const QUERY_OR_FRAGMENT = /[?#]/;
const BACKSLASH_OR_WHITESPACE = /[\\\u0000- ]/;

/**
 * Strict raw visitor grammar layered on core `checkSiteRelativeTarget`: the raw path and its fully
 * decoded form (up to five percent-decode passes, so double-encoded `?`, `#`, `\` or `%` cannot
 * smuggle state past a decoding intermediary) must both pass the grammar and the core reserved-
 * segment rule. Core decodes once; the repeated decode here is the visitor-specific strictness.
 */
export function allowsVisitorPath({ path }: { path: string }, _options = {}): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || QUERY_OR_FRAGMENT.test(path) || BACKSLASH_OR_WHITESPACE.test(path)) return false;
  const decoded = decodeRepeatedly({ path });
  if (decoded === null || decoded.startsWith('//') || decoded.includes('%')) return false;
  if (QUERY_OR_FRAGMENT.test(decoded) || BACKSLASH_OR_WHITESPACE.test(decoded)) return false;
  return [path, decoded].every(raw => checkSiteRelativeTarget({ raw, reservedSegments: VISITOR_RESERVED_SEGMENTS }, {}).kind === 'ok');
}

function decodeRepeatedly({ path }: { path: string }, _options = {}): string | null {
  try {
    let decoded = path;
    for (let i = 0; i < 5; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    return decoded;
  } catch { return null; } // Malformed percent-encoding is never a published page.
}
