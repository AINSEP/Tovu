import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import { parse } from "postcss";
import { describe, expect, it } from "vitest";

/**
 * @file C017: every `.jini-*` class `jini-media.css` styles is a class something really emits.
 *
 * The file is the host presentation for Jini's prefixed markup, but a block of it was written against
 * class names no emitter ever produced (`.jini-card-head`, `.jini-media-picker-grid`, `.jini-tab-bar-dot`,
 * …): Tovu's own screens and Jini's `TabBar`/`RowMenu` emit the UNPREFIXED names (`.card-head`,
 * `.media-picker-grid`, `.tab-bar-dot`), which `styles.css` already styles. A rule that matches nothing
 * reads as live styling in review, so it must not stay.
 *
 * "Emitted" means: the literal token appears in the built `@jini-ai/admin`, `@jini-ai/ui-kit` or
 * `@jini-ai/ui` output or in Tovu's own admin source, or it is one of the template-built families
 * below. The family values are written out (not wildcarded) because a wildcard would accept the dead
 * `jini-status-ok`.
 */

/** Template-built classes, with the values their emitters can produce (file named per family). */
const DYNAMIC_FAMILIES: Record<string, readonly string[]> = {
  // ui-kit Controls.hooks.ts: `jini-btn-${variant}`, `ButtonProps.variant` (ui-kit react/types.ts).
  "jini-btn-": ["primary", "secondary", "danger", "warning", "ghost"],
  // ui-kit Controls.hooks.ts: `jini-notice-${tone}` with tone `danger` mapped to `error`.
  "jini-notice-": ["info", "success", "warning", "error"],
  // admin media MediaCard.hooks.ts (`active`|`trashed`) and seo AnalyzePanel.tsx (`success`|`warning`|`failure`).
  "jini-status-": ["active", "trashed", "success", "warning", "failure"],
};

const CSS = path.resolve(process.cwd(), "src/integrations/jini-admin/jini-media.css");
const SRC = path.resolve(process.cwd(), "src");
const TOKEN = /jini-[A-Za-z0-9_-]+/g;

function walk(dir: string, accept: (file: string) => boolean, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, accept, out);
    else if (accept(full)) out.push(full);
  }
  return out;
}

/** Every `jini-…` token found in the given files. */
function tokensIn(files: string[]): Set<string> {
  const found = new Set<string>();
  for (const file of files) for (const token of readFileSync(file, "utf8").match(TOKEN) ?? []) found.add(token);
  return found;
}

function emittedTokens(): Set<string> {
  const packages = path.dirname(realpathSync(path.resolve(process.cwd(), "node_modules/@jini-ai/admin")));
  const dists = ["admin", "ui-kit", "ui"].map((name) => path.join(packages, name, "dist"));
  const jiniFiles = dists.flatMap((dist) => walk(dist, (file) => /\.js$/.test(file) && !/\.test\./.test(file)));
  expect(jiniFiles.length, "Jini dist is not built; run the Jini build first").toBeGreaterThan(0);
  const tovuFiles = walk(SRC, (file) => /\.(tsx?|jsx?)$/.test(file) && !/\.test\./.test(file));
  return new Set([...tokensIn(jiniFiles), ...tokensIn(tovuFiles)]);
}

function stylesheetClasses(): Map<string, number> {
  const classes = new Map<string, number>();
  parse(readFileSync(CSS, "utf8")).walkRules((rule) => {
    for (const [, name] of rule.selector.matchAll(/\.(jini-[A-Za-z0-9_-]+)/g)) {
      if (name && !classes.has(name)) classes.set(name, rule.source?.start?.line ?? 0);
    }
  });
  return classes;
}

function isDynamicEmit(name: string): boolean {
  return Object.entries(DYNAMIC_FAMILIES).some(([prefix, values]) => name.startsWith(prefix) && values.includes(name.slice(prefix.length)));
}

describe("jini-media.css selectors", () => {
  it("styles only classes that Jini or the host really emits", () => {
    const emitted = emittedTokens();
    const dead = [...stylesheetClasses()].filter(([name]) => !emitted.has(name) && !isDynamicEmit(name))
      .map(([name, line]) => `${name} (first at line ${line})`);
    expect(dead).toEqual([]);
  });
});
