/** Tovu reserved surfaces; repeat the server boundary before any browser location assignment. */
export function allowsVisitorPath({ path }: { path: string }, _options = {}): boolean {
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\\u0000-\u0020]/.test(path)) return false;
  try {
    let decoded = path;
    for (let i = 0; i < 5; i++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    const normalized = new URL(decoded, 'https://visitor.invalid').pathname;
    return !/[?#\\\u0000-\u0020%]/.test(decoded) && !/^\/(?:admin|api)(?:\/|$)/i.test(normalized) && !decoded.startsWith('//');
  } catch { return false; }
}
