/**
 * @file The ONE header set every public page carries, wherever it is served from. The live server
 * sends it as response headers (`server/inbound/public-http/middleware/public-page-security-headers.ts`,
 * which documents each header and why the CSP is report-only); a static export carries it as the
 * host's own header config or an HTML `<meta>` (`features/site-export/static-security-headers.ts`).
 * Lives in `contracts/` because `features/site-export` never imports from `server/inbound/**`.
 * Change a value here and both follow; never copy these values anywhere else.
 */

export const REPORT_ONLY_HEADER = "Content-Security-Policy-Report-Only";
export type SecurityHeaderSet = Readonly<Record<string, string>>;

/** Exact https origins a page's plugin exports declared, per policy directive. */
export interface DeclaredPageHosts {
  readonly script: readonly string[];
  readonly frame: readonly string[];
  readonly connect: readonly string[];
}

/** Shipped theme resource data, shared by live headers and static exports. */
export interface PublicThemeResources {
  readonly scripts: readonly string[];
  readonly styles: readonly string[];
  readonly fonts: readonly string[];
  readonly fontPreconnects: Readonly<Record<string, readonly { readonly url: string; readonly crossorigin?: boolean }[]>>;
  readonly legacyFontStylesheetTemplate?: string;
}

/**
 * Format Tovu's report-only policy using declared theme origins; this never creates an enforced CSP.
 * @param required Theme-owned resource origins. Provider frame declarations extend only their own directive.
 * @returns The same header set for live pages, publishing and static exports. No I/O or mutation.
 * @complexity O(r) declared resource URLs; URL parsing rejects malformed data.
 */
export function createPublicPageSecurityHeaderSet({ resources }: { resources: PublicThemeResources }, { frameOrigins = [] }: { frameOrigins?: readonly string[] } = {}): SecurityHeaderSet {
  const origins = (urls: readonly string[]) => [...new Set(urls.map(url => new URL(url).origin))].join(' ');
  const csp = [
    "default-src 'self'",
    "img-src 'self' data: https:",
    "media-src 'self' https:",
    `script-src 'self' 'unsafe-inline' ${origins(resources.scripts)}`.trimEnd(),
    `style-src 'self' 'unsafe-inline' ${origins(resources.styles)}`.trimEnd(),
    `font-src 'self' data: ${origins(resources.fonts)}`.trimEnd(),
    `frame-src 'self' ${[...new Set(['https://www.youtube-nocookie.com', 'https://www.youtube.com', 'https://player.vimeo.com', ...frameOrigins.filter(isDeclaredFrameOrigin)])].join(' ')}`,
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");

  return Object.freeze({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy-Report-Only": csp,
  });
}

const HOST_DIRECTIVES: ReadonlyArray<readonly [keyof DeclaredPageHosts, string]> = [["script", "script-src"], ["frame", "frame-src"], ["connect", "connect-src"]];

/**
 * Adds declared plugin-export hosts to the directives they belong to. Anything but an exact origin is
 * dropped, so a declaration can never become policy syntax.
 * @returns The extended policy; a policy without a directive is left without it. O(directives × hosts), no I/O.
 */
export function addDeclaredHostsToPolicy({ policy, hosts }: { policy: string; hosts: DeclaredPageHosts }, _optional: Record<string, never> = {}): string {
  return policy.split("; ").map(directive => {
    const kind = HOST_DIRECTIVES.find(([, name]) => directive === name || directive.startsWith(`${name} `))?.[0];
    if (!kind) return directive;
    const present = directive.split(" ");
    return [directive, ...[...new Set(hosts[kind])].filter(host => isDeclaredFrameOrigin(host) && !present.includes(host))].join(" ");
  }).join("; ");
}

/** A header set with `hosts` added to its report-only policy; the rest is unchanged. O(addDeclaredHostsToPolicy). */
export function withDeclaredHosts({ headers, hosts }: { headers: SecurityHeaderSet; hosts: DeclaredPageHosts }, _optional: Record<string, never> = {}): SecurityHeaderSet {
  const policy = headers[REPORT_ONLY_HEADER];
  return policy === undefined ? headers : { ...headers, [REPORT_ONLY_HEADER]: addDeclaredHostsToPolicy({ policy, hosts }) };
}

/** Plugin declarations add exact HTTP(S) origins, never CSP syntax or a URL path. */
function isDeclaredFrameOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin === value;
  } catch { return false; }
}
