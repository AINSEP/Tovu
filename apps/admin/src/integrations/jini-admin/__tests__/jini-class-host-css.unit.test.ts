import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** @file The Content analysis card and the Cookie Consent page (`@jini-ai/admin/screens/*`) render
 * only `jini-*` classes. Neither sits inside a `.jini-page`, so the host repaints their shared shapes
 * in its own sheets with the SAME declarations the app's generic rules in styles.css carry. This
 * reads the declared rules as text (jsdom drops `var()` shorthands) and holds each mapped rule to its
 * generic original, so the rename cannot drift the look. */

type Decls = Record<string, string>;

function splitTopLevel(text: string, sep: string): string[] {
  const parts: string[] = []; let depth = 0; let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === sep && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean);
}

/** Top-level rules only (media/supports blocks are skipped), selector lists expanded, later wins. */
function topLevelRules(file: string): Map<string, Decls> {
  const css = readFileSync(resolve(process.cwd(), file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = new Map<string, Decls>();
  let depth = 0; let selStart = 0; let bodyStart = 0; let selector = '';
  for (let i = 0; i < css.length; i += 1) {
    if (css[i] === '{') {
      if (depth === 0) { selector = css.slice(selStart, i); bodyStart = i + 1; }
      depth += 1;
    } else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        if (!selector.trim().startsWith('@')) {
          const decls = Object.fromEntries(splitTopLevel(css.slice(bodyStart, i), ';').map((d) => {
            const at = d.indexOf(':');
            return [d.slice(0, at).trim(), d.slice(at + 1).trim()];
          }));
          for (const sel of splitTopLevel(selector, ',')) rules.set(sel, { ...rules.get(sel), ...decls });
        }
        selStart = i + 1;
      }
    }
  }
  return rules;
}

function merged(rules: Map<string, Decls>, selectors: string[]): Decls {
  return selectors.reduce<Decls>((acc, sel) => {
    const decls = rules.get(sel);
    if (!decls) throw new Error(`no top-level rule for ${sel}`);
    return { ...acc, ...decls };
  }, {});
}

const app = topLevelRules('src/styles.css');

function expectParity(file: string, pairs: Array<[string[], string[]]>) {
  const host = topLevelRules(file);
  for (const [generic, mapped] of pairs) {
    expect({ mapped, decls: merged(host, mapped) }).toEqual({ mapped, decls: merged(app, generic) });
  }
}

const shared = (scope: string): Array<[string[], string[]]> => [
  [['.card-title'], [`${scope} .jini-card-title`]],
  [['.card-lead'], [`${scope} .jini-card-lead`]],
  [['.btn-secondary:hover'], [`${scope} .jini-btn-secondary:hover`]],
  [['.btn-secondary:where(:hover)'], [`${scope} .jini-btn-secondary:where(:hover)`]],
  [['.btn-secondary:where(:not(:disabled):active)'], [`${scope} .jini-btn-secondary:where(:not(:disabled):active)`]],
  [['.btn-secondary:disabled'], [`${scope} .jini-btn-secondary:disabled`]],
  [['.status'], [`${scope} .jini-status`]],
  [['.status-ok'], [`${scope} .jini-status-ok`]],
  [['.status-neutral'], [`${scope} .jini-status-neutral`]],
];

describe('host CSS for the Jini screens keeps the generic look', () => {
  it('content analysis card (styles/editor.css)', () => {
    const scope = ':where(.jini-content-analysis)';
    expectParity('src/styles/editor.css', [
      ...shared(scope),
      [['.card'], ['.jini-card:where(.jini-content-analysis)']],
      [['.btn-secondary'], [`${scope} .jini-btn-secondary`]],
      [['.editor-actions'], [`${scope} .jini-editor-actions`]],
      [['.save-error'], [`${scope} .jini-save-error`]],
      [['.dash-stat-label'], [`${scope} .jini-stat-label`]],
      [['.dash-stat-value'], [`${scope} .jini-stat-value`]],
      [['.dash-stat-meta'], [`${scope} .jini-stat-meta`]],
      [['.field-label'], [`${scope} .jini-field-label`]],
      [['.field-hint'], [`${scope} .jini-field-hint`]],
      [['.status-warning'], [`${scope} .jini-status-warning`]],
      [['.status-error'], [`${scope} .jini-status-error`]],
      [[':where(.card p, .card li, .notice)'], [':where(.jini-content-analysis p, .jini-content-analysis li)']],
    ]);
  });

  it('cookie consent page (integrations/jini-admin/consent-screen.css)', () => {
    const scope = ':where(.jini-consent-page)';
    const buttonShape = `${scope} :is(.jini-btn-primary, .jini-btn-secondary)`;
    expectParity('src/integrations/jini-admin/consent-screen.css', [
      ...shared(scope),
      [['.page'], ['.jini-consent-page']],
      [['.page > .tab-bar'], ['.jini-consent-page > .tab-bar']],
      [['.page-header'], [`${scope} .jini-page-header`]],
      [['.page-header-text'], [`${scope} .jini-page-header-text`]],
      [['.page-header .page-kicker'], [`${scope} .jini-page-header .jini-page-kicker`]],
      [['.page-header .page-title'], [`${scope} .jini-page-header .jini-page-title`]],
      [['.page-header .page-description'], [`${scope} .jini-page-header .jini-page-description`]],
      [['.page-actions'], [`${scope} .jini-page-actions`]],
      [['.card'], [`${scope} .jini-card`]],
      [['.card-head'], [`${scope} .jini-card-head`]],
      [['.card-head .card-title'], [`${scope} .jini-card-head .jini-card-title`]],
      [['.card-head .status'], [`${scope} .jini-card-head .jini-status`]],
      [[':where(.card p, .card li, .notice)'], [':where(.jini-consent-page .jini-card p, .jini-consent-page .jini-card li, .jini-consent-page .jini-notice)']],
      [['.notice'], [`${scope} .jini-notice`]],
      [['.notice.error'], [`${scope} .jini-notice.jini-notice-error`]],
      [['.notice.warning'], [`${scope} .jini-notice.jini-notice-warning`]],
      [['.notice.warning label'], [`${scope} .jini-notice.jini-notice-warning label`]],
      [['.notice.warning > .btn-secondary + .btn-secondary'], [`${scope} .jini-notice.jini-notice-warning > .jini-btn-secondary + .jini-btn-secondary`]],
      [['.btn-primary'], [buttonShape, `${scope} .jini-btn-primary`]],
      [['.btn-primary:hover:not(:disabled)'], [`${scope} .jini-btn-primary:hover:not(:disabled)`]],
      [['.btn-secondary'], [buttonShape, `${scope} .jini-btn-secondary`]],
    ]);
  });
});
