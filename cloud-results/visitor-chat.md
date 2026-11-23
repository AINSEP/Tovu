PARTIAL: website server integration tests (visitor-assistant-safety) were written but could not be run here; browser checks are the owner's.

# Visitor assistant chat — cloud run 2026-11-23

Base `origin/integ/merge-13-2026-11-22`, branch `codex/visitor-chat-tovu`.
Commits: `758461edf` (items 1, 4 data path, 5 transport/server), `05a4a6209` (items 2, 3, 4 label, 5 bar), plus this report commit.
Note: the TODO "visitor assistant chat — show the model + UI pass" and VISITOR-CHAT bug entries do not exist on this base; the
dispatch text was the spec. Entries were added to `development/open-bugs.md`.

## Root cause of the cut-off (item 1)
- `apps/website/src/server/runtime/composition/modules/site-assistant.ts:124` (was `VISITOR_MAX_OUTPUT_TOKENS = 1024`), passed as
  `maxTokens` at the `runByokProviderTurn` call. Gemini counts hidden thinking tokens against `maxOutputTokens`
  (`@jini-ai/agent-runtime` `providers/connection-test.js` documents the same trap), so a thinking model can spend the budget and
  stop at `finishReason: MAX_TOKENS` right after the lead-in sentence.
- It looked like a clean finish because `@jini-ai/agent-runtime` `providers/google-messages.js:434` `googleLoopExitReason` returns
  `'stop'` for any response with no tool calls, and `tool-turn.js:171` lets that captured end reason override the raw finish reason.
  The route then sent `end: stop` and the client treated it as a complete answer.
- Fix: budget 4096; the route now reclassifies a `stop` whose last request reported `output_tokens >= budget` as `end: truncated`
  (`apps/website/src/assistant/site/visitor-turn-end.ts`, the one usable signal, the normalised `usage` event); the client keeps the
  partial text and shows "This answer was cut off because it got too long. Ask me to continue, or ask a narrower question."
- Not changed (outside this repo's scope): the upstream Jini adapter still hides `MAX_TOKENS`; a Jini-side fix would be cleaner.
- Decision for the owner: 1024 -> 4096 raises worst-case spend per visitor request ~4x (still bounded by the aggregate site budget).
  It is one constant.

## Per item
1. Cut-off — `758461edf`. Tests: `visitor-turn-end.unit.test.ts` (4, run, pass); `site-assistant-transport.visitor-chat.test.ts`
   "cut-off replies" (2, run, pass); `visitor-assistant-safety.integration.test.ts` +3 and one updated (**written, NOT run**: the
   published `@jini-ai/core@0.7.3-next.2` has no `./contracts/site/soft-delete` export, so every website server test fails to load in this
   environment, base included). Mutations (red then restored): `>=` -> `>` in `visitorTurnEnd`; `=== "truncated"` branch disabled.
2. Jump button covers newest bubble — `05a4a6209`. `widget.css` list bottom padding `+24px` -> `+56px` (the 40px arrow floats 8px above
   the composer). Test `visitor-chat-padding-css.test.ts` + `SiteAssistantStatus.test.ts`. Mutation: padding back to 24px -> red.
3. Send looks disabled — `05a4a6209`. Cause not provable without a browser (enabled = `--primary`, disabled = same `--primary` at 50%
   opacity). Now enabled solid primary + hover (`color-mix` with `--fg`) + `:focus-visible` outline; disabled = `--surface-2`/`--faint`/border,
   `not-allowed`, no opacity. Existing tokens only. Mutation: disabled background back to `--primary` -> red.
4. Answering model — server sends `event: meta {model}` before `end` (never on an error turn, so failures don't name the model);
   transport `onModel`; `SiteAssistantModelLabel` ("Answered by <model>", `--fg-2` 12px, not a live region, hidden when unknown or blank).
   Mutation: label guard removed -> red. Server meta test is in the unrun integration set.
5. First-prompt failure — transport retries once (600ms) on a network `TypeError` or 5xx, only before any reply byte; never on 4xx or after
   frames began. After that: one plain error and a "Try again" bar (`SiteAssistantRetryBar`) that puts the failed question back in the
   composer (`ChatPane` has no resend API). **Root cause of the intermittent failure was not found/reproduced**; this is a mitigation.
   Mutations: 5xx retry widened to all `<600`, hook retry insertion removed -> red.

## Verification (real output)
- Baseline on unmodified tree: site-chat 201 tests pass, typecheck clean.
- After: `apps/site-chat` `npm test` 214 pass / 0 fail (node:test, this repo's runner, not vitest); `npm run typecheck` clean;
  `npm run build` (incl. `check-bundle-mounts`) OK.
- Root `tsc --noEmit` has pre-existing errors from unresolved `@jini-ai/*` subpaths in this environment (e.g. `@jini-ai/cms/...`);
  none in files this run touched.
- Not done: `apps/website` has no tsconfig of its own, so "typecheck website" = the root `tsc` above. i18n: new strings ("Answered by",
  "Try again", the put-back tooltip) fall back to English in all 20 locales; the truncation/error sentences are English-only like the
  existing visitor errors. Vanilla widget gets truncation + auto-retry via the shared transport but not the label/retry bar.
- Function size / complexity rules: new functions are small; `performRun`/`createRunLifecycle` grew a few lines and were not re-measured with the linter.

## Owner browser checklist (6 widths: 320, 375, 768, 1024, 1280, 1440)
At each width, open the panel on a real site with a Gemini visitor key:
1. Ask "list all posts". Reply is complete, or ends with the "cut off" notice (never a bare lead-in sentence). Partial text stays visible.
2. After a long reply, scroll to the very bottom: the newest user bubble and reply are not covered by the round "Jump to latest" arrow; scroll up a little: the arrow appears and is not clipped at the panel edge (320 especially).
3. Send button: empty box = grey disabled look with not-allowed cursor; typed text = solid primary; hover darkens; Tab to it shows a 2px outline; touch target >= 40px on 320/375.
4. After a reply, "Answered by <model>" shows under the composer, wraps without horizontal scroll at 320, contrast readable; after "New thread" or reload it is gone.
5. Failure: block `/api/site-assistant/chat` (offline, or DevTools 503) and send as the FIRST prompt: one automatic retry (~0.6 s), then the plain error under the message and a "Try again" bar; the button restores the question into the box and focuses it. Unblock and Send works.
6. Screen reader: streaming reply is announced once; the model note is not announced separately; focus order panel -> composer -> send -> retry stays inside the dialog.
7. Dark/other theme: the retry bar (uses `--danger-bg`) and model note stay legible.
