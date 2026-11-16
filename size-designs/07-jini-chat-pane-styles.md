# 07 — Jini `packages/chat/src/react/features/chat-pane/styles.ts`

Measured at Jini `origin/integ/wave-b-fixed`: 2,035 lines; one export, `CHAT_PANE_STYLES`, a single template literal (line 1 opens it, line 2035 closes it). 188 top-level rules, 0 `${}` interpolations, 3 escaped backticks (inside comments). Jini hotspot #1 by size × churn (52 commits / 90 days).

**Status:** this file is an *accepted* exception (`size-exceptions.json`: "Stylesheet: CSS in one template string, no logic"). It is not size debt. This design exists because the owner listed it; my recommendation is at the end of §6.

## 1. Current shape

Consumers: `ChatPane.tsx:875` injects it as `<style data-jini-chat-pane-styles="true">`; 11 test files import the constant and regex it (`styles-spinner`, `styles-composer-footer-wrap`, `styles-user-bubbles`, …); `Composer.test.tsx` and `Markdown.test.tsx` import it too. It must stay **one string, injected once** — the embed widget has no stylesheet pipeline for this (the package's real `.css` exports are `react/styles/reference.css` and `chat-settings.css`, a different mechanism).

Rule families in source order (script-derived, contiguous ranges):

| lines | content | dominant selectors |
|---|---|---|
| 2-92 | pane root, layout, header, clip/scroll containers | `.jini-chat-pane` |
| 93-352 | transcript: message list, bubbles, mid-run user bubble, sent-attachment thumbnails, live region | `.jini-message-*` |
| 353-449 | pane status rows, notices, suggestions | `.jini-chat-pane …` |
| 450-556 | composer box and input | `.jini-composer-*` |
| 557-733 | composer attachment tray, chips, chip-in keyframes, phone tap areas | `.jini-attachment-*`, `.jini-composer-attachments` |
| 734-1010 | composer footer: leading slot, wrap rules, send/stop, spinner | `.jini-composer-*` |
| 1011-1182 | working-directory trigger, folder chips, popover | `.jini-folder-chips`, working-dir |
| 1183-1485 | agent/runtime picker, drop-up, access mode, select menu | `.jini-runtime-*`, `.jini-select-menu` |
| 1486-1686 | run summary line, tool rows, thinking block | `.jini-message-*`, tool, thinking |
| 1687-1832 | markdown table + expand pill | `.jini-md-table*` |
| 1833-2034 | attachment preview modal, pager, phone targets | `.jini-attachment-preview*` |

Families interleave slightly (one `composer` rule at 580 inside the attachment block, one `runtime` rule at 49, one `message` rule at 1486). **Cascade order is behaviour**: equal-specificity rules resolve by source order, so the parts below are contiguous slices, not regroupings.

## 2. Target shape

```
packages/chat/src/react/features/chat-pane/
  styles.ts                           root: imports the 11 parts, exports CHAT_PANE_STYLES = parts.join('')   ~35
  styles/
    pane-shell.styles.ts              2-92                                                                    ~95
    messages.styles.ts                93-352                                                                  ~265
    pane-status.styles.ts             353-449                                                                 ~100
    composer-input.styles.ts          450-556                                                                 ~110
    composer-attachments.styles.ts    557-733                                                                 ~180
    composer-footer.styles.ts         734-1010                                                                ~280
    working-directory.styles.ts       1011-1182                                                               ~175
    runtime-picker.styles.ts          1183-1485                                                               ~305
    message-activity.styles.ts        1486-1686                                                               ~205
    markdown-table.styles.ts          1687-1832                                                               ~150
    attachment-preview.styles.ts      1833-2034                                                               ~205
```

Each part: `export const <NAME>_STYLES = \`…\`;` — one template literal, no logic, no imports. `styles.ts` keeps its path and its export name, so `ChatPane.tsx`, the 13 test importers and the two doc-comment references (`types.ts:375`, `slots.ts:176`) do not change. It is a composition root, not a re-export shell: it is the only place the order is stated.

```ts
// styles.ts
const PARTS = [PANE_SHELL_STYLES, MESSAGES_STYLES, PANE_STATUS_STYLES, COMPOSER_INPUT_STYLES, COMPOSER_ATTACHMENTS_STYLES,
  COMPOSER_FOOTER_STYLES, WORKING_DIRECTORY_STYLES, RUNTIME_PICKER_STYLES, MESSAGE_ACTIVITY_STYLES,
  MARKDOWN_TABLE_STYLES, ATTACHMENT_PREVIEW_STYLES] as const;   // ORDER IS THE CASCADE. Do not sort.
export const CHAT_PANE_STYLES = PARTS.join('');
```

Cutting rules: a cut falls on the line **before** the comment block that introduces the next rule (a rule never loses its "why" comment to the previous part); each part keeps its own leading/trailing newline characters exactly so `join('')` reproduces the original bytes; escaped backticks stay escaped. Line numbers in the table are targets — move a cut up or down to the nearest such boundary.

## 3. Step order

1. **Pin (no source change):** `__tests__/styles-bytes.characterization.test.ts` — `sha256(CHAT_PANE_STYLES)` and `.length` equal to literals captured from the unmodified file.
2. One commit: create the 11 parts and the new `styles.ts`. (Eleven separate commits add nothing: the hash only matches when all parts exist. If the executor prefers increments, peel parts off the **end** of the literal one at a time — `CHAT_PANE_STYLES = [REST, ATTACHMENT_PREVIEW_STYLES].join('')` — the hash holds at each step.)
3. Run the 13 importing test files + the hash test. Remove the `styles.ts` entry from `scripts/size-debt.json` if present and tell the Tovu coordinator the `size-exceptions.json` Jini entry is now stale.
4. Keep the hash test: it turns into a tripwire — any later CSS edit must update the literal, which is the intended review prompt for a file that changes weekly. (If the owner finds that noisy, delete it after the split; say so in the report.)

## 4. Tests

The hash is a complete behaviour pin for a constant. The 11 `styles-*.test` files keep asserting individual rules through the unchanged export. No new fakes needed. Test count +1.

## 5. Risks

| risk | de-risk |
|---|---|
| a lost or doubled newline at a cut changes nothing visually but breaks the hash — or worse, a cut inside a rule | hash + length; cuts only before a comment/rule start at brace depth 0 (verify with a 10-line depth counter) |
| someone later sorts `PARTS` or regroups stray rules "to tidy" | the comment on `PARTS`; the hash test |
| escaped backtick un-escaped while cutting | 3 occurrences, all in comments (952 region and two others); grep count must stay 3 across the parts |

Risk: **low**.

## 6. Interaction, and whether to do it

- Untangle lane R4 (chat, wave E) and kit lane C9b touch `chat/src/react/kit.tsx` and the pane's TS, not this file. No conflict. No move-backlog row (already in Jini; imports nothing).
- Not in this pass (would change cascade order, needs a browser look): regrouping the interleaved rules; co-locating each part beside the component it styles (`react/components/Composer.tsx` etc.).
- **Recommendation:** worth doing only because it is nearly free and the file is the most-edited in the package — eleven named parts make a CSS diff reviewable and cut merge conflicts between concurrent UI lanes. It buys no reduction in logic debt. If executor budget is tight, this is the first of the ten to drop; the exception stays valid.

## 7. Estimate

2-3 commits. Sonnet executor **≈60k tokens** (mostly emitting the 2,035 lines once). Do the cut with a script (`split -l`-style by line ranges, then wrap each chunk) rather than by retyping — that drops it to ≈25k and removes transcription risk.
