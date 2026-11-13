### jini:packages/ui/src/features/html-editor/css.ts
- **Over:** `prettifyCss` 110 (file 111, fine)
- **Phase:** now · **Batch:** size-37
- **Tests:** `src/features/html-editor/__tests__/css.characterization.test.ts`, `src/features/html-editor/__tests__/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `INDENT`, `out`, `depth`, `parenDepth`, `quote`, `atDeclStart`, `i`, `n` | tokenizer cursor state |
| B | `skipWhitespace`, `consumeValue` | skip whitespace / copy quoted + parenthesised value chars verbatim |
| C | `openRule`, `closeRule`, `endDeclaration`, `separateValue`, `consumeStructure` | emit structure (braces, `;`, first `:`) with indentation |
| D | `while (i < n) { … }`, `return out.trim();` | driver loop — stays in `prettifyCss` |

- **Splits** (same file; all new declarations at module level above `prettifyCss`, in this order):
  1. `const CSS_INDENT = '  ';` (was local `INDENT`) and `interface CssCursor { readonly css: string; readonly n: number; i: number; out: string; depth: number; parenDepth: number; quote: '"' | "'" | null; atDeclStart: boolean }` (module-private).
  2. Each step closure becomes a module-level function taking ONE object, bodies verbatim with every cursor local `x` rewritten to `cur.x` (and `INDENT` → `CSS_INDENT`), and each inner call `skipWhitespace({}, {})` → `skipWhitespace({ cur })`, `openRule({}, {})` → `openRule({ cur })` etc.:
     `skipWhitespace({ cur }: { cur: CssCursor }): void` · `consumeValue({ cur, ch }: { cur: CssCursor; ch: string }): boolean` · `openRule({ cur }: { cur: CssCursor }): boolean` · `closeRule({ cur }: { cur: CssCursor }): boolean` · `endDeclaration({ cur }: { cur: CssCursor }): boolean` · `separateValue({ cur }: { cur: CssCursor }): boolean` · `consumeStructure({ cur, ch }: { cur: CssCursor; ch: string }): boolean`. Name the input types `CssStepInput` (`{ cur: CssCursor }`) and `CssCharStepInput` (`{ cur: CssCursor; ch: string }`). The `_input`/`_options` placeholder params disappear.
  3. `prettifyCss(css: string): string` keeps its big doc comment (word for word) and becomes: `const cur: CssCursor = { css, n: css.length, i: 0, out: '', depth: 0, parenDepth: 0, quote: null, atDeclStart: false };` then the `while` loop with `cur.` prefixes and step calls `consumeValue({ cur, ch })` / `consumeStructure({ cur, ch })` / `skipWhitespace({ cur })`, then `return cur.out.trim();`.
  4. Comments inside `closeRule` and above `separateValue` move with them word for word.
- **Importers to update:** none (`prettifyCss` stays; helpers are module-private).
- **After:** file ~125; `prettifyCss` ~18; largest helper `consumeValue` ~30.
- **Risks / notes:** pure mechanical rewrite of closure variables to a cursor object — the characterization test pins output. The two pre-existing non-null assertions (`css[i]!`) become `cur.css[cur.i]!`; they are moved, not new — leave them exactly (do not "fix"). `quote` assignment `cur.quote = ch` needs `ch` narrowed as today (inside the `ch === '"' || ch === "'"` branch) — TS narrows the same way.
