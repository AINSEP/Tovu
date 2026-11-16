# E03 DEDUPE: site-chat RemixIcon override -> Jini `installRemixIconStylesheet`

Tovu `apps/site-chat/src/remixicon-override.ts` hand-copies what `@jini-ai/ui`'s `installRemixIconStylesheet({ href })` does (marker check, marked `<link>`). Jini's version also starts its font recovery in real browsers (no-op in jsdom) and returns whether it inserted. Tovu keeps only its binding: the href of its separately served files and the why-comment (Tovu-specific: iife bundle, public/ copies).

Behaviour change: the override now returns `boolean` and, in browsers with `document.fonts`, starts Jini's font recovery. Failing test first (step T1).

## Guards
Tovu `remixicon-override.ts` blob `41088fea8036a5279c59b023f4ee28f9b1c9e5a3`; `__tests__/remixicon-override.test.ts` blob `c697088d7b12ecd4783b82a225df0810868326e0`. Jini `packages/ui/src/react/__tests__/components/RemixIcon.stylesheet.test.tsx` blob `bfaf551de4a6ca15553d6fb4e98ae096a2a2311e`. `rg -n "export function installRemixIconStylesheet" /Users/la/Programming/jini-terra-base/packages/ui/src/react/components/RemixIcon.stylesheet.ts` must hit once.

## Jini (commit 1, test text only)
`RemixIcon.stylesheet.test.tsx`: replace both occurrences of `'/site-chat/remixicon.css'` with `'/host/remixicon.css'` (expect exactly 2; a host app path in Jini). Commit `E03-jini.msg`: `test(ui): neutral href in the installRemixIconStylesheet test`. No changeset (test only). eslint that file.

## Tovu (commit 2)
T1 (failing test first): in `apps/site-chat/src/__tests__/remixicon-override.test.ts` add, inside `describe("with a document present", ...)` after the last `it(...)`:
```ts
    it("reports through Jini's installer whether it inserted the stylesheet", () => {
      assert.equal(installRemixIconOverride(), true);
      assert.equal(installRemixIconOverride(), false);
    });
```
Do not run it (single-runner rule); the cloud batch must see it RED on the parent commit and GREEN on this one. Record this in the report.
1. Replace `remixicon-override.ts` body: keep the whole `/** @file ... */` header verbatim (lines 1-56, the why), then replace lines 57-68 (from `const REMIXICON_STYLESHEET_MARKER` to the closing `}`) with:
```ts
import { installRemixIconStylesheet } from "@jini-ai/ui";

/** This bundle's separately served copy (see the header); Jini's installer does the rest. */
const REMIXICON_CSS_URL = "/site-chat/remixicon.css";

/** @returns `true` if this call inserted the stylesheet, `false` if a marked one was already there. */
export function installRemixIconOverride(): boolean {
  return installRemixIconStylesheet({ href: REMIXICON_CSS_URL });
}
```
   Move the import to the top of the file (above the header) if eslint's import-first rule asks; otherwise leave it. In the header, the paragraph starting ` * FIX: \`RemixIcon.tsx\` already ships a host-override escape hatch` stays; append one header line before ` */`: ` * Since 2026-11 the marker check and the <link> come from Jini's \`installRemixIconStylesheet\`, which also retries the font in real browsers.`
2. No other importer changes (`main.tsx` keeps `installRemixIconOverride();`; the test keeps its import).
3. eslint the 2 files. Commit `E03-tovu.msg`: `refactor(site-chat): install the RemixIcon override through @jini-ai/ui` + body `Behaviour: returns whether it inserted, and gains Jini's font recovery in browsers. New test pins the return.` Paths: the 2 files.

## Risk to verify in the cloud batch
`dist/site-assistant.js` size before/after (the public iife bundle now imports the `@jini-ai/ui` root; JS is side-effect free, so tree-shaking should keep the delta to the installer + recovery module). If it grows > 5 KB gzip, revert and ask Jini for a narrow subpath.

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
