# Admin coverage gap fill

Test-only handoff. The source mutations below were identified by inspection, not applied or run. No production or coverage settings changed.

## Email status and view

- `use-email.unit.test.ts` → `use-email.hooks.ts`
  - Classifies mail status (each matrix row, in order) → move local-only before unconfigured, check only the first lane, ignore legacy true, ignore legacy false, drop the degraded check, ignore warnings, return needs-attention for an empty warning array, dereference absent warnings.
  - Reports transport outcomes and retries (403, 503, foreign 403 respectively) → remove the 403 case, treat every transport error as 403, remove the error-class check. Removing the retry attempt from the effect dependencies also fails all three.
  - Ignores old reads (resolve/reject) → remove the live guard from the corresponding handler.
- `use-email-template-view.unit.test.ts` → `use-email-template-view.hooks.ts`
  - Starts on Preview unless requested otherwise → hard-code the initial tab or omit forwarding the device setter.
  - Measures and disconnects the pane → omit forwarding the measurement ref or return a fixed pane width.

## Email template editor

- `use-email-template-editor.unit.test.ts` → `use-email-template-editor.hooks.ts`
  - Seeds and debounces edited HTML → remove timer cancellation, reset values on each field edit, or ignore preview's undeclared keys.
  - Keeps newest preview (stale success/failure) → remove the relevant live check.
  - Keeps last preview on failure then clears on blank → set data to null on failure or send blank HTML to the port.
  - Does not send queued preview after unmount → omit clearTimeout.
  - Saves only dirty, one in-flight request, adopts normalization → omit the saving guard or ignore the normalized HTML.
  - Preserves mid-flight edits and uses returned revision → overwrite HTML unconditionally with saved HTML or omit the detail update.
  - Preserves the draft on conflict and clears failure on retry → remove the 409 message or the pre-save error reset.
  - Ignores blank/unchanged names and preserves draft across rename → remove the name guard, trim, or returned-version update.
  - Restores name after refused rename → remove the failure-path name reset or clear the error only when first loaded.

## Email templates list

- `use-email-templates.unit.test.ts` → `use-email-templates.hooks.ts`
  - Loads the list and opens a localized draft → drop route ID escaping, navigate before create resolves, or use the default name unconditionally.
  - Reports create failure and retries → swallow the safe error or retain it after retry.
  - Ignores absent/cancelled selection and blank/unchanged names → remove the selection guard or either name check.
  - Submits a single rename and replaces the correct row → remove the pending guard, send an untrimmed name or update a different row.
  - Reloads after conflict → omit reload; the renamed row remains at revision 4.
  - Preserves row after refused trash and removes only it on retry → filter before the port succeeds or invert the filter.
  - Writes from a retained selection during list failure → remove either loaded-view guard, or convert the failed list into an empty loaded list.

## Forms mounting

- `forms-panels.unit.test.tsx` → `forms/index.ts`
  - Mounts list and forwards the host content → change the list page ID or omit loadingContent.
  - Switches editor query without changing identity → send the tab as the page ID or omit tab/formId from the route.

## Import/export and Integrations API

- `import-export-api.unit.test.ts` → `import-export-api.ts`
  - Starts and polls a scoped export → send both requests as POST, drop false or the base path, or lose workspace scoping.
  - Sends empty JSON and propagates conflict → serialize undefined instead of an empty object or swallow the 409.
- `integrations-api.unit.test.ts` → `integrations-api.ts`
  - Reads roster → use the wrong workspace or roster path.
  - Saves with credentials preserved/cleared → always send empty env / drop explicitly empty env, respectively.
  - Deletes selected server → omit the encoded ID, use a different verb, or suppress restartRequired.
  - Probes selected server → drop /probe or change POST to GET.
  - Lists and selects shared connection → lose /shared, switch verb, or send serverId in the credential body.
  - Polls sign-in → use the connect route or discard retryAfterSeconds.
  - Lists approvals → omit /tool-approvals.
  - Reads agent plugin files → fail to encode the plugin ID or omit /files.
- `IntegrationsRedirect.unit.test.tsx` → `use-integrations-redirect.hooks.ts`
  - No redirect destination → silently fall back to root instead of throwing the configuration error.

## Integrations translations

- `integrations-i18n.unit.test.tsx` → both dictionary data packs and `integrations-i18n.tsx`
  - Keeps supported locales → remove or rename any locale's dictionary entry.
  - Source-key parity (each locale) → remove its Delivery log key, replace a value with whitespace, or introduce a spurious interpolation token.
  - Prefers feature, then host, then English → omit either spread or stop forwarding the host's common dictionary.
  - Interpolates webhook accessible name → remove the interpolation or alter a locale's `{label}` token.
  - Renders literal label in delete copy → omit the label node, fall back to English for French, or insert the label as markup.

## Git backup

- `GitBackupCard.unit.test.tsx` → `GitBackupCard.tsx`
  - No invented upload progress → display a fabricated 0-of-0 status while the first push is pending.
  - Inconsistent injected state (planned/done) → drop the corresponding descriptive guard and dereference an absent plan/result.
- `GitBackupCard.unit.test.tsx` → `use-git-backup.hooks.ts`
  - Failed push after unmount → remove the alive guard in push's catch.
  - Draft typed before connection read → omit the empty string fallback in setField; the field can no longer pick the eventual default.

## Library API adapter

- `library-api-port.unit.test.ts` → `library-api-port.hooks.ts`
  - Maps roster, text, URL, permissions and users → forward the wrong ID or substitute an empty result for any of those reads.
  - Maps upload, rename and trash with readback → drop the base64, send the full rename wrapper as the patch, or trash the wrong ID.
  - Fetches original and returns blob → drop same-origin credentials, use the wrong URL or skip the blob read.
  - Reports a refused original before body decode → remove the !ok check or drop the status from its error message.

## Library screen and view handlers

- `Library.unit.test.tsx` → `Library.tsx` and `Library.hooks.tsx`
  - Unknown tab falls back to Upload, counts Documents and replaces route → choose the wrong fallback, omit the count, push instead of replace, or render another row's details.
  - Loading, failure and empty list → render empty for an unresolved list or hide a failed read.
  - Opens actual picker and hides it on denial → remove the input click or ignore canUpload.
  - Ordinary drop goes through real dropzone → stop all drops in the parent capture handler.
  - iWork drop preserves loose files → remove stopPropagation, flatten the directory, or drop the duplicate filter.
  - Status per row and clearing → use a single status label for all rows, omit the callback, or navigate to a different tab.
  - Failed-only upload list → show View in Documents for failures or omit the clear action.
  - Read-only Office actions → show Preview or a write action for the Office row, or remove the attachment attribute.
  - Rename with Enter and observable list readback → route Enter to cancel, pass a different row ID or include the extension in the editable stem.
  - Escape, Cancel and button Save → remove escape's cancel, swap the Cancel event, or leave Save disconnected.
  - Moves selected row to Trash and restores via shortcut → remove the selected-row moving indicator, invoke the wrong row, or send Open Trash to the wrong route.
  - Markdown Preview, themed isolated frame, Escape and clicks → omit the menu callback, loosen sandbox/CSP, ignore CSS theme colors, or dismiss on an internal click.
  - Loading/error/escaped truncated text → substitute empty preview for a failure, insert text as HTML, or drop truncation guidance.
  - PDF object and Office fallback → render PDF in an iframe, use a wrong blob URL, omit the attachment link, or disconnect backdrop dismissal.

## Additional cases from static review

- `use-email-template-editor.unit.test.ts`: Does not show the previous template while rendering another → retain `current.data` on a changed loaded ID (already present, regression expected red). Reset preview data/error only when the loaded template identity changes.
- `integrations-api.unit.test.ts`: Clears shared selection vs. disconnecting OAuth → swap the two DELETE paths.
- `integrations-api.unit.test.ts`: Lists installed Agent Plugins → query the regular plugins path instead of /agent-plugins.
- `Library.unit.test.tsx`: Missing theme tokens → ignore inherited text color for links or emit an empty border color.
- `Library.unit.test.tsx`: Attachment fallback (Markdown/Text/PDF) → render the specialized view with an absent payload instead of the download guidance.
- `Library.unit.test.tsx`: Localized tabs and pending upload permission → label tabs without `t` or treat a pending permission read as a denial.

## Exception candidates

- `packages/admin/src/screens/library/Library.tsx:111` (null-ref arm) and `:294` (null-host throw) — React attaches these unconditional host elements before the reachable event/layout effect. No invalid React lifecycle is fabricated.

## Static handoff checks

Reviewed each new case against the Author Checklist, including the named break above, the real entry point, the public result or exact port arguments, and cleanup of fake clocks, history, and browser observers. No test, typecheck, build, mutation, coverage run or install was performed. The preview regression is expected red by inspection and is left for the cloud pass.
