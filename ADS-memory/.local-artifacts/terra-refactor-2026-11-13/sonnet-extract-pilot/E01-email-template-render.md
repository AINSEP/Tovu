# E01 MOVE: email-template renders -> `@jini-ai/platform/mail/email-template`

Feature `website/features/email-templates` (render.ts = MOVE; operations.ts stays, MIXED, later). Pure code, no ports. Separate subpath so `parse5` (optional peer) never loads through the `./mail` barrel.

## Guards
- Tovu `apps/website/src/features/email-templates/render.ts` blob `54b035e6f66ebbed586c2b851f9a1e3ce916594b`; `__tests__/render.test.ts` blob `19ed570adc8a87e55561b6d0f98885a461370027`.
- Jini `packages/platform/package.json` blob `fca01d11c82f05174804a59186d86998a2d9b212`; `README.md` blob `f933a2260ab76fb3439202089bf6003e891ec514`.
- Jini `packages/platform/src/mail/email-template.ts` must not exist.

## Jini (commit 1)
1. NEW `packages/platform/src/mail/email-template.ts` = Tovu render.ts copied byte for byte, then:
   a. Delete line 1 exactly: `// Generic, Jini candidate: tracked in .cloud-coord/round2-progress.md#jini-extraction-backlog.` (a tracking pointer this move closes, not a why-comment).
   b. `import { htmlToText, stripActiveHtml } from "@jini-ai/platform/web";` -> `import { htmlToText, stripActiveHtml } from "../web/html-document.js";` (leaf import, never the package's own barrel).
   c. Replace the whole `@file` block (from `/**` before ` * @file The pure half of email templates:` through its closing ` */`, 14 lines) with:
```
/**
 * @file Email templates as plain HTML documents: `{{field}}` fill-ins, the template's own
 * declarations (subject and fields, read out of its HTML), and the two renders — the PREVIEW, which
 * keeps the template's scripts because a host shows it inside a sandboxed preview iframe, and the
 * SEND render, which is static HTML because mail clients strip script anyway and a message that
 * relied on it would arrive broken.
 *
 * Everything a template declares lives in its HTML, not in extra storage fields: the host keeps one
 * HTML body per template, and that body is the single source of truth an editor changes with
 * full-document writes.
 *
 * - Subject: the document's `<title>` (it may itself contain `{{field}}`s).
 * - Fields: `<meta name="email-fields" content="name=Ada, orderId">` — comma-separated names, each
 *   optionally `=sample` (the value a preview shows when the caller gives none).
 *
 * Pure, no I/O. Importing this entry needs the optional `parse5` peer (README.md).
 */
```
   d. The two lines
` * The admin preview. Scripts are KEPT — the preview is the Pages preview iframe, sandboxed without`
` * \`allow-same-origin\`, so they run in an opaque origin — and \`scriptsStripped: false\` says so.`
      -> ` * The preview render. Scripts are KEPT: show the result only in an iframe sandboxed without`
         ` * \`allow-same-origin\`, so they run in an opaque origin.`
   Nothing else changes (names, args, statement order).
2. NEW `packages/platform/src/mail/__tests__/email-template.test.ts` = Tovu render.test.ts byte for byte, then: `import test from "node:test";` -> `import { test } from "vitest";` and `} from "../render.js";` -> `} from "../email-template.js";` (Jini vitest runs `node:assert` assertions as-is; platform tests already do).
3. `packages/platform/package.json`:
   - in `jini.entries`, after the line `      "./mail/senders": "universal",` insert `      "./mail/email-template": "node",`
   - in `exports`, after the `"./mail/senders": { ... },` block (4 lines) insert:
```
    "./mail/email-template": {
      "types": "./dist/mail/email-template.d.ts",
      "import": "./dist/mail/email-template.js",
      "default": "./dist/mail/email-template.js"
    },
```
   - in `jini.optionalPeers.parse5`: `import @jini-ai/platform/web —` -> `import @jini-ai/platform/web or @jini-ai/platform/mail/email-template —` (exactly once).
   Then `node -e 'JSON.parse(require("fs").readFileSync("packages/platform/package.json","utf8"))'` must succeed.
4. `packages/platform/README.md`: `` `@jini-ai/platform/web` loads these optional peers at import time: `parse5@7.3.0`, `` -> `` `@jini-ai/platform/web` loads these optional peers at import time: `parse5@7.3.0`, `` (unchanged) and append after the paragraph ending `must add them before upgrading.` a new paragraph: `` `@jini-ai/platform/mail/email-template` (pure email-template renders: `{{field}}` fill-ins, preview and send) loads only `parse5@7.3.0`. ``
5. NEW `.changeset/platform-mail-email-template.md`:
```
---
"@jini-ai/platform": minor
---

Add `@jini-ai/platform/mail/email-template`: pure HTML email-template renders (`{{field}}` fill-ins, field declarations, preview and sanitized send with a text alternative). Needs the optional `parse5` peer.
```
6. eslint the 2 new .ts files. Commit message `E01-jini.msg`: `feat(platform): add mail/email-template, pure HTML email-template renders` + body `Moved from a host app unchanged; the Tovu copy is deleted in the paired Tovu commit.`
   Paths: the 2 new .ts, package.json, README.md, the changeset.

## Tovu (commit 2)
1. Census (refreshed 11-15: the old single command matched ~40 unrelated `./render.js` imports of a different render.ts under public-http/http/site), run both: (a) `rg -n --no-heading -e "email-templates/render" apps content development --glob '!**/node_modules/**'` and (b) `rg -n --no-heading -e "[\"']\.\.?/render(\.js|\.ts)?[\"']" apps/website/src/features/email-templates`. Allowed hits only: `features/email-templates/index.ts:27`, `features/email-templates/operations.ts` (the `} from "./render.js";` line), `features/email-templates/__tests__/render.test.ts`. Anything else: STOP.
2. `apps/website/src/features/email-templates/index.ts`: `type EmailFieldValues } from "./render.js";` -> `type EmailFieldValues } from "@jini-ai/platform/mail/email-template";`
3. `apps/website/src/features/email-templates/operations.ts`:
   - `} from "./render.js";` -> `} from "@jini-ai/platform/mail/email-template";`
   - after the header line ` * plain row, then \`ensureHtmlFormat(seed)\` — so that store stays the only writer of html bodies.` insert (moved why-comment):
```
 *
 * A template's subject and fields live in that one html body, not in extra columns, so an agent
 * edits a template with the same full-document writes it uses for a Page. The pure renders live in
 * `@jini-ai/platform/mail/email-template`.
```
   - directly above `  return { ...renderEmailPreview({ html, values }), undeclaredFields, mode, scriptsStripped: false };` insert:
```
  // Scripts are kept: the admin shows this preview in the Pages preview iframe, sandboxed without
  // `allow-same-origin`, so they run in an opaque origin; `scriptsStripped: false` says so.
```
4. `git rm -q -- apps/website/src/features/email-templates/render.ts apps/website/src/features/email-templates/__tests__/render.test.ts` (the test moved to Jini).
5. Re-run the census: only `index.ts`/`operations.ts` may mention the Jini specifier; no hit may name `./render`. eslint `index.ts operations.ts`.
6. Commit `E01-tovu.msg`: `refactor(email-templates): use @jini-ai/platform/mail/email-template` + body `render.ts and its test moved to Jini unchanged; the Pages-specific why-comments moved into operations.ts.` Paths: index.ts, operations.ts, the 2 deleted files.

## Expected afterwards (not run here)
Cloud batch: Jini `vitest run packages/platform/src/mail/__tests__/email-template.test.ts` + platform typecheck; Tovu typecheck after linking the Jini clone.

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
