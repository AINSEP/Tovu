# Terra 5.6 xhigh — adversarial review of the deployment/publish + slug work

Range reviewed: `94f2b2a..e9ffb57` (60 code files, ~11.9k insertions), on a frozen detached
worktree so concurrent in-flight credential work could not contaminate it.
Model: `gpt-5.6-terra`, `model_reasoning_effort=xhigh`. 3.42M input / 15.8k output tokens.
Generated 2026-08-15.

> Transport note: the FIRST dispatch returned exit 0, zero errors, and no review — it halted on
> the missing gitignored `AI-Dev-Shop/AGENTS.md` because tracked root `CLAUDE.md`/`AGENTS.md`
> tell it to stop. `<<PEER_DISPATCH>>` + `--ignore-rules` did NOT prevent this.

---

I’ll audit only the stated commit range, tracing the requested data and async paths directly from code and tests. I’ll return only defects that survive a counter-check.

I’ve found multiple concrete client-side race paths in the new deployment hooks. I’m now checking whether the server lifecycle and import wiring make those user-visible, and validating the backfill’s assumptions against the theme loader.

## CONFIRMED

### Backfill can erase legitimate theme-win choices after a theme page was removed
**Severity:** high  
**Confidence:** CONFIRMED  
**Where:** `development/scripts/backfill-slug-collision-defaults.ts:151`  
**Failure scenario:** An author explicitly chose `overrides_theme_page = 0` for post `contact` while its theme had a `contact` page. That page or theme is later removed before the live `--apply` backfill. The script no longer discovers `contact`, classifies the row as non-colliding, and changes it to `NULL`. Restoring the page later makes the post win by the new default, silently reversing the author’s prior explicit choice.  
**Why it is real:** Collision detection only scans themes currently present under `builtInThemesDir`; it has no durable history of pages that existed when the explicit `false` was chosen. Theme pages are removable (`development/scripts/theme-tool.ts:178`), so “not currently found” is not evidence that `false` was merely the old creation default.  
**Strongest counter-argument, and why it fails:** Current absence means there is no collision today. That does not make the historic explicit choice disposable: tri-state exists specifically to preserve explicit deviations from resolver policy when a collision becomes relevant again.  
**Fix:** Do not reclassify legacy `false` values without durable evidence that they were defaults. Preserve them, or use an audited historical page inventory and restore/correct rows affected by the already-run backfill.

### A delayed initial status request can overwrite a newly started run and stop polling it
**Severity:** high  
**Confidence:** CONFIRMED  
**Where:** `apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts:80`; `apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts:171`  
**Failure scenario:** Mount the tab while the initial status GET is delayed and reports `idle`. Click Build/Publish before it returns; the POST returns `running` and the hook stores that run. The delayed initial GET then passes `seededRef`, overwrites the run with `idle`, and makes `isRunning`/`isPublishing` false. Polling is cleaned up while the server-side job continues.  
**Why it is real:** Both hooks unconditionally seed `run` from the first query result, independently of locally triggered state. The UI does not disable the Build button while the initial query is pending.  
**Strongest counter-argument, and why it fails:** The initial GET is usually quick. Network timing is sufficient to make the ordering possible, and a slow GET is routine during precisely the deployment failures this UI must handle.  
**Fix:** Mark bootstrap state consumed before triggering, or associate status writes with a monotonically increasing request/run generation and reject bootstrap results after a local trigger.

### Polling retries permanent failures forever with a false “running” UI
**Severity:** medium  
**Confidence:** CONFIRMED  
**Where:** `apps/admin/src/features/deployment/hooks/use-static-export.hooks.ts:107`; `apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts:196`  
**Failure scenario:** A run starts, then its status endpoint permanently returns an error—for example after a server restart or an authorization failure. The hooks retain the prior `running` state, swallow every poll error, and schedule another poll indefinitely. The corresponding action remains disabled and no actionable error is shown.  
**Why it is real:** The catch blocks only reschedule; they neither clear/update `run` nor expose a poll error or retry limit.  
**Strongest counter-argument, and why it fails:** Retrying transient failures is appropriate, but an unbounded invisible retry does not recover a permanent failure and strands the operator in an incorrect state.  
**Fix:** Track polling failures, surface an unavailable-status state after bounded retries, and provide an explicit refresh/reconcile action.

### A stale publish preview can be displayed for a different target than will be published
**Severity:** medium  
**Confidence:** CONFIRMED  
**Where:** `apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts:153`  
**Failure scenario:** Request a preview for GitHub repository `acme/old`, then change the repository field to `acme/new` before the request resolves. The setter clears the preview, but the old request resolves later and repopulates it with `/old`. Publishing then uses `acme/new` while the UI shows preview information for `acme/old`.  
**Why it is real:** `checkPreview` unconditionally calls `setPreview(result)` after `await`; no request generation, configuration snapshot comparison, or cancellation protects the result. Inputs remain editable while preview loading.  
**Strongest counter-argument, and why it fails:** The preview button is disabled during its request, but the target inputs are not. Preventing another click does not prevent editing the configuration.  
**Fix:** Increment a preview generation on every target-field change and apply a response only when its generation/configuration still matches.

### Publish can be submitted twice before the first request reports its running state
**Severity:** medium  
**Confidence:** CONFIRMED  
**Where:** `apps/admin/src/features/deployment/hooks/use-static-publish.hooks.ts:216`; `apps/admin/src/features/deployment/StaticSiteTab.tsx:632`  
**Failure scenario:** Double-click Publish while its first POST is in flight. The hook sets its private `publishing` flag, but the component’s `busy` state only uses `isPublishing`, which stays false until the response supplies a running run. Both POSTs are sent; the second receives the expected server-side conflict, and its error remains visible even though the first publish is running.  
**Why it is real:** `publishing` is not returned by the controller or used to disable the button. The successful request does not clear an error produced by the concurrent request.  
**Strongest counter-argument, and why it fails:** The server prevents duplicate publishes, but that only protects the provider. The client still produces a misleading failure state for an operation it successfully started.  
**Fix:** Expose and use a trigger-pending flag in `busy`; optionally reconcile a 409 against current status instead of presenting it as an operation failure.

### Dockerfile edits silently lose concurrent changes
**Severity:** medium  
**Confidence:** CONFIRMED  
**Where:** `apps/admin/src/features/deployment/hooks/use-dockerfile-source.hooks.ts:137`  
**Failure scenario:** Two admins load the Dockerfile. Admin A saves a security fix; Admin B, still editing the older snapshot, saves another change. B’s stale contents overwrite A’s fix with no conflict or warning.  
**Why it is real:** The GET snapshot contains only contents, and the PUT sends only contents. No revision, hash, `If-Match`, or server-side compare-and-set is involved.  
**Strongest counter-argument, and why it fails:** Last-writer-wins is technically deterministic, but this is an operational build input presented as an editor with a loaded snapshot; silent loss of a concurrent change is materially unsafe.  
**Fix:** Return an ETag/content hash, require it on save, reject mismatches with 409, and preserve the local draft for conflict resolution.

### Static-publish tool documentation states the opposite of the shipped registration
**Severity:** low  
**Confidence:** CONFIRMED  
**Where:** `src/features/deployments/publish-agent-tools.ts:11`  
**Failure scenario:** A maintainer follows the file header’s statement that this module is “NOT imported” by the assistant registry and adds a second registration path or concludes the tool is unavailable. At this commit, `src/assistant/tool-registrations.ts:63` imports it and `:251` invokes it.  
**Why it is real:** The comment is present-tense and directly contradicted by the runtime registry wiring added in this range.  
**Strongest counter-argument, and why it fails:** It may describe the module’s original landing state, but it is framed as current behavior and is now false ground truth for future changes.  
**Fix:** Update the header and the later “follow-up” comments to describe the active registration and actual authorization boundary.

## SUSPECTED

### The SQLite-to-Postgres boolean verifier still rejects the newly valid `NULL`
**Severity:** low  
**Confidence:** SUSPECTED  
**Where:** `src/db/migration/verify.ts:198`  
**Failure scenario:** A migration/copy path uses `verifyClassifiedValue` for a post with `overridesThemePage = NULL` in SQLite and PostgreSQL. The boolean verifier accepts only `0` or `1`, so it reports a valid tri-state row as an invalid SQLite boolean source.  
**Why it is real:** The schema change makes `NULL` legitimate, while the verifier’s accepted source set and its documentation in `src/db/migration/manifest.ts:416` still exclude it.  
**Strongest counter-argument, and why it fails:** I found no current production caller of this verifier, so it is not a present runtime outage. But its advertised generic boolean-copy behavior is now incompatible with the schema it is meant to validate.  
**Fix:** Treat `NULL → NULL` as a valid verified transfer for nullable boolean columns, with an explicit nullable type/metadata distinction.

## Architecture

- Persist export/publish runs as durable, ID-addressable jobs rather than process-local slots. Cost: a migration plus worker/recovery semantics; benefit: polling can reconcile after reloads and restarts.
- Use one cancellable, generation-aware async controller for status, preview, and trigger flows. Cost: refactoring the hooks; benefit: removes the repeated stale-result and infinite-poll classes.
- Version editable deployment source with ETags/content hashes. Cost: API contract and conflict UI; benefit: prevents silent operational configuration loss.