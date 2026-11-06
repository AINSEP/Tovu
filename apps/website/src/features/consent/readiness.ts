/** Admin-only declaration diagnostics. Sampled HTML is inspected, never converted or returned rewritten. */
import { CATEGORIES, type DeclaredScript } from '@jini-ai/cookie-consent';
import { validateScripts } from '@jini-ai/cookie-consent/policy';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { ConsentProblem } from './validation.js';

type Node = DefaultTreeAdapterMap['childNode'];
export interface ConsentWarning extends ConsentProblem { source?: string | null; tag?: string; attributes?: string[] }
export interface ConsentDeclarationEvidence { scripts: unknown; runtimeSlot: boolean; problems?: readonly string[] }
const LIMIT = 200;

/** Diagnostics never disclose URL credentials, query values, fragments or inline code. */
function sourceLabel(value: string | undefined): string | null {
  if (!value) return null;
  try { const url = new URL(value, 'https://site.invalid'); return `${url.origin === 'https://site.invalid' ? '' : url.origin}${url.pathname}`.slice(0, 500); }
  catch { return '[invalid resource URL]'; }
}

function executableScript(node: DefaultTreeAdapterMap['element'], attrs: Map<string, string>): boolean {
  if (node.tagName !== 'script' || attrs.has('data-jini-declared-script')) return false;
  if (/^\/_consent\/(?:client-[\w-]+\.min\.js|extensions\.min\.js)$/.test(attrs.get('src') ?? '')) return false;
  return ['', 'module', 'text/javascript', 'application/javascript'].includes((attrs.get('type') ?? '').toLowerCase());
}

function unmanaged(node: DefaultTreeAdapterMap['element']): ConsentWarning | null {
  const attrs = new Map(node.attrs.map(attr => [attr.name, attr.value]));
  const handlers = node.attrs.filter(attr => /^on[a-z]+$/i.test(attr.name)).map(attr => attr.name);
  if (!executableScript(node, attrs) && handlers.length === 0) return null;
  return { code: 'UNMANAGED_CONTENT', message: 'Executable page content is outside declared-script consent. Review its authoring before moving this site.',
    tag: node.tagName, source: sourceLabel(attrs.get('src')), ...(handlers.length ? { attributes: handlers } : {}) };
}

/** Templates are inert authored content, not a promise that their future descendants are controlled. */
function unmanagedWarnings(html: string, available: number): { warnings: ConsentWarning[]; truncated: boolean } {
  const nodes: Node[] = [...parse(html).childNodes];
  const warnings: ConsentWarning[] = [];
  while (nodes.length) {
    const node = nodes.pop()!;
    if (!('tagName' in node)) continue;
    const warning = unmanaged(node);
    if (warning) {
      if (warnings.length === available) return { warnings, truncated: true };
      warnings.push(warning);
    }
    if (node.tagName !== 'template') nodes.push(...node.childNodes);
  }
  return { warnings, truncated: false };
}

const declarationOverflow = (scripts: unknown, limit: number) => Array.isArray(scripts) && scripts.length > limit;

/** Validate declarations and label gaps separately. No allowance simulation or page rewriting.
 * @complexity O(sample bytes + declarations), at most 1 MB and 200 returned diagnostic entries. */
export function consentDeclarationReadiness({ html, scripts, runtimeSlot, problems: evidenceProblems = [] }: { html: string } & ConsentDeclarationEvidence, _options = {}) {
  const declarationLimit = runtimeSlot ? LIMIT : LIMIT - 1;
  const input = Array.isArray(scripts) ? scripts.slice(0, declarationLimit) : scripts;
  const checked = validateScripts({ scripts: input });
  const declarations: DeclaredScript[] = checked.scripts.map(script => ({ ...script, src: sourceLabel(script.src)! }));
  const problems: ConsentProblem[] = [...evidenceProblems, ...checked.problems].map(message => ({ code: 'INVALID_SCRIPT_DECLARATION', message }));
  const categories = CATEGORIES.map(id => ({ id, required: id === 'necessary', editable: false }));
  if (Buffer.byteLength(html, 'utf8') > 1_000_000) return { declarations, warnings: [] as ConsentWarning[], categories, truncated: true,
    problems: [...problems, { code: 'PAGE_UNAVAILABLE', message: 'The page exceeds the 1 MB audit limit.' }] };
  const inventory = unmanagedWarnings(html, LIMIT - declarations.length - (runtimeSlot ? 0 : 1));
  if (!runtimeSlot) inventory.warnings.unshift({ code: 'MISSING_RUNTIME_SLOT', message: 'This full-document theme has no supported runtime loading slot. Review the theme before moving this site.' });
  const truncated = inventory.truncated || declarationOverflow(scripts, declarationLimit);
  if (truncated) problems.push({ code: 'INVENTORY_TRUNCATED', message: 'More than 200 diagnostic entries. Inspect a smaller page sample.' });
  return { declarations, warnings: inventory.warnings, categories, problems, truncated };
}
