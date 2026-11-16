# E04 admin UI: CodeView wrap mode, toggle and hook -> `@jini-ai/ui` viewer-shell

Tovu `apps/admin/src/components/CodeView/CodeView.tsx` (WrappedCode, CodeView, CodeWrapToggle) and `use-code-wrap.hooks.ts` (useCodeWrap). Survey: "`CodeWithLines` as a `wrap` prop". Jini gets `CodeWithLines({ text, wrap })`, `CodeWrapToggle`, `useCodeWrap`; new elements use `jini-` classes, so Tovu renames its CSS selectors and test selectors (owner rule: jini- prefix). `preview-modal-icons.tsx` stays in Tovu.

## Guards
Tovu blobs: CodeView.tsx `9838e3c6145439ca2f0945cebd20b2d3764ea655`, use-code-wrap.hooks.ts `3bfdb72683c33faa4aadc129aa42ed4401bba5c8`, AgentPluginDetailsModal.unit.test.tsx `fc1da0732599f8297979f461f90c7ce1e0abf758`, ThemeExplore.unit.test.tsx `ca378e4fb69fc937575f59eb12d5aba8b4d0d209`, admin-layout.pins.journey.ts `12601375d5197097e7104214187513d5ac3a2bc9`. styles.css, ThemeExplore.tsx, TemplateSourceModal.tsx, PackageFilesModal.tsx: exact-text guards.
Jini blobs: CodeWithLines.tsx `82a09b0239a544af45eb13c6bcc159c832657d0e`, viewer-shell/index.ts `1d0fa25e234abe3362c857a1a053d3219dc9da6c`, __tests__/index.test.ts `253f65649a2b10ec974e252e8240edb48892fb0e`. `rg -n "CodeWrapToggle|useCodeWrap" packages/ui/src` must print nothing.

## Jini (commit 1), all under `packages/ui/src/features/viewer-shell/`
1. `react/components/CodeWithLines.tsx` -> full new content:
```tsx
import { Fragment } from 'react';

export interface CodeWithLinesProps {
  text: string;
  /** Wrap long lines. Default false: two `white-space: pre` blocks (gutter + code). */
  wrap?: boolean;
}

/**
 * Wrap-safe layout, used only while wrapping is on. The default layout renders the gutter and the
 * code as two independent `white-space: pre` blocks that stay aligned only because neither one
 * wraps — the instant a code line wraps to more than one visual row, every later gutter number
 * drifts out of sync with its line. This lays out one CSS grid row per source line instead
 * (`.jini-code-viewer--wrap`, styled by the host): a wrapped line's row simply grows taller, and
 * its own gutter number grows with it, so nothing downstream can ever desync.
 */
function WrappedCode({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="code-viewer jini-code-viewer--wrap">
      {lines.map((line, i) => (
        <Fragment key={i}>
          <span className="jini-code-viewer__line-number" aria-hidden>
            {i + 1}
          </span>
          <span className="jini-code-viewer__line-content">{line}</span>
        </Fragment>
      ))}
    </div>
  );
}

/** Plain text rendered with a line-number gutter; `wrap` switches to one grid row per line. */
export function CodeWithLines({ text, wrap = false }: CodeWithLinesProps) {
  if (wrap) return <WrappedCode text={text} />;
  const lines = text.split('\n');
  // Trailing newline produces a phantom empty line — keep gutter aligned.
  const gutter = lines.map((_, i) => `${i + 1}`).join('\n');
  return (
    <pre className="code-viewer">
      <code className="gutter" aria-hidden>
        {gutter}
      </code>
      <code className="lines">{text}</code>
    </pre>
  );
}
```
2. NEW `react/components/CodeWrapToggle.tsx`:
```tsx
import { agentHandle } from '@jini-ai/agentic';
import type { Translate } from '../../../i18n/dictionary-translator.js';

export interface CodeWrapToggleProps {
  wrap: boolean;
  onToggle: () => void;
  /** Labels: "Wrap: on" / "Wrap: off" keys from the host's dictionary. */
  t: Translate;
  agentHandleId: string;
  className?: string;
}

/** "Wrap: on" / "Wrap: off" — a pressed-state toggle for {@link CodeWithLines}'s `wrap`. */
export function CodeWrapToggle({ wrap, onToggle, t, agentHandleId, className }: CodeWrapToggleProps) {
  return (
    <button
      type="button"
      className={className}
      aria-pressed={wrap}
      onClick={onToggle}
      {...agentHandle({ handle: agentHandleId }, { role: 'button', label: 'Toggle line wrapping for this file' })}
    >
      {wrap ? t('Wrap: on') : t('Wrap: off')}
    </button>
  );
}
```
   STOP if `packages/ui/src/features/i18n/dictionary-translator.ts` does not export `type Translate`.
3. NEW `react/hooks/useCodeWrap.ts`: Tovu use-code-wrap.hooks.ts body, with the header rewritten neutral (why kept):
```ts
import { useState } from 'react';

/**
 * @file The line-wrap toggle for read-only code viewers. A caller keyed by the file it shows
 * remounts on a file switch, so the toggle resets to wrapped instead of carrying a manual override
 * across files.
 */

export interface CodeWrapController {
  /** `true` by default: long lines stay readable without horizontal scrolling. */
  wrap: boolean;
  toggleWrap: () => void;
}

/**
 * @returns Whether the shown code wraps, and a toggle.
 * @complexity O(1).
 */
export function useCodeWrap(): CodeWrapController {
  const [wrap, setWrap] = useState(true);
  return { wrap, toggleWrap: () => setWrap((prev) => !prev) };
}
```
4. `index.ts`: after `export type { CodeWithLinesProps } from './react/components/CodeWithLines.js';` insert:
```
export { CodeWrapToggle } from './react/components/CodeWrapToggle.js';
export type { CodeWrapToggleProps } from './react/components/CodeWrapToggle.js';
export { useCodeWrap } from './react/hooks/useCodeWrap.js';
export type { CodeWrapController } from './react/hooks/useCodeWrap.js';
```
5. Tests: `__tests__/index.test.ts` after `    expect(typeof viewerShell.CodeWithLines).toBe('function');` add `    expect(typeof viewerShell.CodeWrapToggle).toBe('function');` and `    expect(typeof viewerShell.useCodeWrap).toBe('function');`. In `__tests__/react/components/CodeWithLines.test.tsx` add inside the describe, after the last `it`:
```tsx
  it('wraps as one grid row per line, numbering each line once', () => {
    const { container } = render(<CodeWithLines text={'a\nb\nc'} wrap />);
    expect(container.querySelector('.jini-code-viewer--wrap')).not.toBeNull();
    const numbers = container.querySelectorAll('.jini-code-viewer__line-number');
    expect(Array.from(numbers).map((el) => el.textContent)).toEqual(['1', '2', '3']);
    expect(container.querySelector('.gutter')).toBeNull();
  });
```
6. NEW `.changeset/ui-code-wrap.md`: `"@jini-ai/ui": minor` / `\`CodeWithLines\` gains an optional \`wrap\` prop (one grid row per line, \`jini-code-viewer--wrap\`); add \`CodeWrapToggle\` and \`useCodeWrap\`.`
7. eslint the 6 .ts/.tsx files. Commit `E04-jini.msg`: `feat(ui): CodeWithLines wrap mode, CodeWrapToggle and useCodeWrap`. Paths: 4 edited, 3 new (2 components/hooks + changeset).

## Tovu (commit 2)
1. Census: `rg -n "components/CodeView/(CodeView|use-code-wrap)" apps content development --glob '!**/node_modules/**'` -> only the 6 import lines in ThemeExplore.tsx:4-5, TemplateSourceModal.tsx:3-4, PackageFilesModal.tsx:11-12. Else STOP.
2. Imports:
   - ThemeExplore.tsx: `import { CodeView, CodeWrapToggle } from "../../components/CodeView/CodeView";` + `import { useCodeWrap } from "../../components/CodeView/use-code-wrap.hooks";` -> one line `import { CodeWithLines, CodeWrapToggle, useCodeWrap } from "@jini-ai/ui";` (if the file already imports from `"@jini-ai/ui"` with a named `{ ... }` import, add the names there instead).
   - TemplateSourceModal.tsx lines 3-4 and PackageFilesModal.tsx lines 11-12: same replacement (same merge rule).
3. JSX: `<CodeView text={sourceLoaded ? source : ""} wrap={wrap} />` -> `<CodeWithLines text={sourceLoaded ? source : ""} wrap={wrap} />`; `stageContent = <CodeView text={fetchState.html} wrap={wrap} />;` -> `stageContent = <CodeWithLines text={fetchState.html} wrap={wrap} />;`; `return <CodeView text={file.content} wrap={wrap} />;` -> `return <CodeWithLines text={file.content} wrap={wrap} />;`. Comment `read-only \`CodeView\` at normal size` (ThemeExplore.tsx) -> `read-only \`CodeWithLines\` at normal size`. TemplateSourceModal.tsx line 28 comment needs no change.
4. Class rename, exactly these files and counts (do each replacement ONCE; the new text contains the old):
   - `apps/admin/src/styles.css`: `.code-viewer--wrap` -> `.jini-code-viewer--wrap` (9), `.line-number` -> `.jini-code-viewer__line-number` (4), `.line-content` -> `.jini-code-viewer__line-content` (4). Comments: `see \`WrappedCode\` in \`components/CodeView/CodeView.tsx\` for why` -> `see \`WrappedCode\` in Jini's \`CodeWithLines\` (\`@jini-ai/ui\`) for why`; `uses (see \`CodeView.tsx\`). */` -> `uses (see Jini's \`CodeWithLines\`). */`; `the shared \`CodeView\`` (line ~678) -> `the shared \`CodeWithLines\``.
   - `apps/admin/src/features/plugins/__tests__/AgentPluginDetailsModal.unit.test.tsx`: `".code-viewer--wrap"` -> `".jini-code-viewer--wrap"` (5), `".line-number"` -> `".jini-code-viewer__line-number"` (1, the querySelectorAll); comment text `` `.line-number` `` / `` `.line-content` `` -> `` `.jini-code-viewer__line-number` `` / `` `.jini-code-viewer__line-content` ``.
   - `apps/admin/src/features/themes/__tests__/ThemeExplore.unit.test.tsx`: `.code-viewer--wrap` -> `.jini-code-viewer--wrap` (2).
   - `development/e2e/journeys/admin-layout.pins.journey.ts`: `.code-viewer--wrap` -> `.jini-code-viewer--wrap` (1), `".line-number"` -> `".jini-code-viewer__line-number"` (2), `".line-content"` -> `".jini-code-viewer__line-content"` (1).
   Leave `development/ui-fixes-backlog.md` (history).
5. `git rm -q -- apps/admin/src/components/CodeView/CodeView.tsx apps/admin/src/components/CodeView/use-code-wrap.hooks.ts`.
6. Re-census: `rg -n "code-viewer--wrap|\.line-number|\.line-content" apps/admin/src development/e2e` -> every hit must carry `jini-`. eslint the 6 .ts/.tsx files.
7. Commit `E04-tovu.msg`: `refactor(admin): code viewers use @jini-ai/ui CodeWithLines wrap mode` + body `CodeView, CodeWrapToggle and useCodeWrap moved to Jini; wrap-mode classes now carry the jini- prefix (CSS, unit tests and the e2e pin follow).` Paths: 3 components, styles.css, 2 unit tests, journey, 2 deleted files.

## After (not here)
UI change: one Claude-in-Chrome look at the three viewers (plugin package files, template source, theme explore) in wrap on/off — owner rule "UI fix = look at it".

## Common rules (part of this recipe; read before editing)
- HARD RULE: stop before 300k tokens of context; if near it, report what is done and what is left.
- Clones: Tovu `/Users/la/Programming/tovu-codex-trial-terra`, Jini `/Users/la/Programming/jini-terra-base`. Both must report `refactor/terra` from `git branch --show-current`; else STOP.
- Bootstrap files (AI-Dev-Shop/AGENTS.md, CLAUDE.md startup) do not apply; expected. Proceed.
- Run NO tests, tsc, builds, installs, lockfile commands, formatters, `--fix`/`--write`. Leave no process running.
- Edit only the files this recipe names. Never touch node_modules, ADS-memory, *.sql, lockfiles.
- STOP-on-mismatch: a deleted/moved file must match its listed blob (`git hash-object`); every old->new edit's OLD text must occur exactly once (or the stated count) at the time you apply it. Any mismatch, or an importer census hit not listed: restore only the files you changed in this recipe (`git show HEAD:<path> > <path>`; `rm` files you created), report SKIPPED with the reason. Never improvise a fix. A skip is a good outcome.
- No Tovu text in Jini: after the Jini edits, `rg -n -i "tovu|site-chat|apps/(admin|website)" <every Jini file you created or edited>` must print nothing.
- Why-comments move, never deleted (the recipe says where each goes).
- Checks, only these: `node_modules/.bin/eslint <touched .ts/.tsx files>` run from each clone root; `node --check` for touched .js/.mjs. In Tovu, an unresolved-import error for a NEW Jini specifier is expected (Tovu's node_modules hold npm 0.7.x until the D1 link): record it, do not fix. Any other eslint error caused by your edit: fix only if it is a literal consequence of the edit (unused import, import order); otherwise STOP.
- Git: Jini commit FIRST, then Tovu. New file: `git add -- <path>`. Deleted file: `git rm -q -- <path>`. Commit: `git commit -F <msgfile> -- <every path>`. Never `add -A`/`add .`, stash, checkout, reset, rebase, push, amend. Message files go in `/Users/la/.claude/harness-tmp/claude-501/-Users-la-Programming-Tovu/73a40820-b1fa-4c88-a55c-409efcaf4ee6/scratchpad/`; each message ends with a blank line then `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Report: DONE or SKIPPED (+reason), Jini SHA, Tovu SHA, every path changed, eslint result, anything that differed from the recipe, tokens used.
