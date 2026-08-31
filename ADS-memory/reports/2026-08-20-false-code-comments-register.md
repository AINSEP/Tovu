# Register — false / stale code comments in Tovu

**Created:** 2026-08-20 · **Verified at:** `f4cc0aa6` + `99494a66` (branch `general-work`)

Every entry below was checked against the source at the time of writing, not copied from a report.
Where an entry says FIXED, the fixing commit is named. Where it says OPEN, the false text is still on
disk right now.

**Why this file exists:** in the 24 hours to 2026-08-20, seven confidently-worded, evidence-shaped
comments in this repo were proven false. One of them rationalized a CRITICAL data-loss bug by citing
a document that does not exist. Long, authoritative-sounding comments here sometimes encode
*inference* rather than *observation*, and they read identically. Treat a comment as a hypothesis
with a citation, not as evidence.

**Standing rule for anyone working in this repo:** if a comment cites a source — a file, a spec, an
ADR, a type, a commit — open that source before relying on the claim. If it asserts a guarantee
("this will fail to compile", "there is no import here", "no narrower type exists"), reproduce the
guarantee empirically before trusting it.

---

## OPEN — still false on disk, need fixing

### O1. `src/features/deployments/publish-agent-tools.ts` (~line 400)

The doc block above `VendorCredentialSummaryLike` says the hand-written mirror exists because it
"buys the zero-import property below", and points the reader at "the module-level comment above this
file's **now-absent** `vendor-credentials` import."

**Why it is false:** the import is not absent. Line 105 is
`import type { VendorCredentialSetRepoPort } from "../vendor-credentials/index.js"`, added
2026-08-20 during the RouteDeps narrowing. The file no longer has a "zero-import property" to buy.

**Fix:** rewrite the block to say the mirror is retained to avoid a *value* import and to keep the
loosened `string` vendor id, and drop the "now-absent import" reference. The sibling comment at line
114 was already corrected to "Deliberately NO **VALUE** import" — this one was missed.

**Verify:** `grep -n "vendor-credentials" src/features/deployments/publish-agent-tools.ts`

---

### O2. `src/seo/types.ts` (lines ~125-129)

```
 * Compile-time guard: `PageHeadEntryRef`'s identity fields must remain a
 * subset of the live `PostRecord`. If `PostRecord` renames/removes one of
 * these, this alias fails to typecheck — pinned to the real content record.
 */
export type EntrySnapshotIdentity = Pick<PostRecord, "id" | "workspaceId" | "slug" | "title" | "status">;
```

**Why it is false — two separate problems:**

1. **It does not guard what it claims.** The alias never references `PageHeadEntryRef` at all. It
   pins five *field names* on `PostRecord` and nothing more. Any drift between `PageHeadEntryRef`
   and `PostRecord` — the stated purpose — passes silently.
2. **It is dead.** `grep -rn "EntrySnapshotIdentity" src/` returns exactly one hit: its own
   declaration.

The narrow claim it *does* satisfy is real: a `Pick` naming a key `PostRecord` lacks is a compile
error. So this is an overstated guarantee, not a wholly imaginary one — which is precisely what makes
it dangerous to skim.

**Fix:** either make the guard real (assert the relationship it describes, and reference it from
somewhere so it cannot be deleted as dead code), or delete the alias and its comment. Do not simply
soften the wording and leave dead code behind.

**Found by:** `arch-final-backedges`, 2026-08-20, while planning Job 3. Deliberately not fixed then —
out of scope for that dispatch.

---

### O5. Twelve admin `*-i18n.*` files all claim "@file Spanish translation"

`grep -rln "@file Spanish translation" apps/admin/src` returns **12** files: database, plugins,
workspace, recovery, roles, integrations, redirects, users, members, seo, themes, and
`lib/admin-nav-i18n.ts`.

**Why it is false:** every one of them holds many locales, not one. `database-i18n.tsx` alone holds
43. F8 below fixed exactly this claim in `analytics-i18n.ts` and established the cause: the header
was accurate when each dictionary held a single locale, and the commit that added the rest never
touched it. This is that same falsehood, copy-pasted across the feature tree.

**Why it is worth fixing rather than shrugging at:** it is the leading indicator for the trap in F8.
A maintainer who believes one of these files is Spanish-only edits one block and ships, and the other
20-42 locales silently render the raw English key — `lib/dictionary-translator.ts` resolves a miss as
`?? key`, so there is no error and no failing test.

**Left open deliberately.** Found 2026-08-24 while fixing F7/F8; the session's approved scope was the
two analytics files only. It is a 12-file mechanical header fix with no behavior change.

## FIXED — recorded for the pattern, do not re-fix

### F10. `apps/website/src/platform/mail/ports.ts` (lines ~52-54) — "built now" / "named-next" for adapters that did not exist

The two marker-type doc comments read: `export type SmtpMailerAdapter = MailerPort; // built now (nodemailer/SMTP)` and `export type HttpApiMailerAdapter = MailerPort; // named-next (Resend/Postmark/SES over HttpClientPort)`.

**Why it was false:** neither adapter existed anywhere in the codebase. `grep -rln "implements MailerPort" apps/website/src` returned exactly one hit (`features/members/mailer.console.ts`'s `ConsoleMailerAdapter`) before this fix — not two, as "built now" implied for SMTP. `platform/mail/index.ts`'s own header already said the opposite, correctly: "adapters (Console/Smtp/HttpApi/InMemory) ... are the ADR-037 follow-up build" — the two files disagreed with each other, and `ports.ts`'s per-line comments were the wrong one. Practical effect: `ADR-037`'s own text records that it "cannot move to ACCEPTED until `SmtpMailerAdapter` and one production-plausible HTTP-API adapter pass the same contract tests" (rule-of-two) — a reader trusting `ports.ts`'s comment alone would have believed that gate was already half-cleared when zero of it was.

**Fix:** 2026-08-31, mail-adapters build session (uncommitted at time of writing — coordinator to commit). Both marker-type comments corrected to name the real files (`./adapters/http-api.resend.ts`, `./adapters/smtp.nodemailer.ts`); `ports.ts`'s file header and `index.ts`'s own header both annotated with the same correction, cross-referencing each other so a future reader hits the true state from either entry point.

**Pattern to carry forward:** a marker/placeholder type's trailing comment is exactly as capable of drifting from reality as a full doc block — do not weight a one-line `// built now` comment any less skeptically than a paragraph, especially when a SIBLING file in the same directory already states the opposite.

**Found by:** the mail-adapters build dispatch itself, while reading `ports.ts` before implementing against it (per this task's own brief: "Add it to the false-comment register").

---

### F9. `src/assistant/tool-registrations.ts` (lines 33-34, and the slice comment at ~475) — "three" demo domains, when there were four

The file header said: "The demo domains below (2026-08-22: three — `demo-choices`, `demo-a2ui`,
`demo-image`) wire nothing unless `TOVU_ENABLE_DEMO_TOOLS` is set, so they are outside every number
here." The slice comment lower down agreed, calling the group "development-only surfaces".

**Why it was false:** there were four. `render-ui` is a `DOMAIN_SLICES` entry sitting immediately
below the three named ones, gated on the very same env var. It was missed because the gate had
**two implementations**: the three named domains call the shared `demoToolsEnabled()` exported from
`demo-choices-tool.ts`, while `render-ui-tool.ts` carried its own private
`renderUiToolsEnabled()` reading `process.env["TOVU_ENABLE_DEMO_TOOLS"] === "1"` directly. A
`grep -rn "demoToolsEnabled"` — the natural way to inventory the gate — returns the three and not
the fourth.

**Why it mattered.** This was not a cosmetic miscount. The comment was used as an inventory: a
prior session read it, reported "three tools" to the owner, and the owner approved un-gating
against that three-item list. The fourth tool would have been un-gated without ever being named in
the decision. Caught only because a later pass ran
`grep -rn "TOVU_ENABLE_DEMO_TOOLS" src apps` — the env var, not the helper — and got a hit in a
file the helper-grep had never surfaced.

**Verify (against the pre-fix tree):**
`grep -rn "demoToolsEnabled" src` returns 3 registration sites;
`grep -rn "TOVU_ENABLE_DEMO_TOOLS" src` returns 4.

**Fix:** 2026-08-26, same commit that removed the gate. Both comments corrected to name four
domains; both gate implementations deleted; `render-ui-tool.ts`'s header now records the
duplicate-implementation trap explicitly. The header's per-domain tool table was also annotated as
a stale 2026-08-05 snapshot after a live measurement returned **154** wired tools against the 131 it
still claims — see the pattern note below.

**Patterns to carry forward:**
1. **Grepping for a helper's NAME inventories callers of that helper, not instances of the
   condition.** Grep the underlying thing — the env var, the literal, the config key — because a
   second, private copy of the same check answers to no shared symbol.
2. **A count in a comment is a claim about a list that has since changed.** Two numbers in this same
   header were stale in the same way for the same reason. When a comment states a count, re-derive
   it before quoting it to anyone — and prefer recording *how to measure* over recording the number.

---

### F7. `apps/admin/src/features/analytics/README.md` (line 12) — "no unit test"

The README states, in bold: "`Analytics.tsx` has **no unit test**. Treat a change here as unverified
until you have driven it in" the browser.

**Why it is false:** `apps/admin/src/features/analytics/__tests__/Analytics.unit.test.tsx` exists and
is a real suite — it ran green in this session (`cd apps/admin && npx vitest run
src/features/analytics/__tests__/Analytics.unit.test.tsx
src/features/analytics/__tests__/use-analytics.hooks.unit.test.ts` → 2 files, 14 tests passed, which
also covers `use-analytics.hooks.unit.test.ts` in the same directory).

**Why it matters more than a stale line:** this comment does not merely misdescribe the code, it
instructs the reader to *skip a verification path that exists*. Someone following it does manual
browser QA and never runs the suite that would have caught them.

**It was never true — a fourth failure shape.** This claim did not decay. The README and the test
file it denies were added in the **same commit**, `26b70a97` (2026-08-05, "feat(pages):
AI-authorable bespoke Pages…"), and the test file already carried its full set of `it()` blocks at
that commit:

```bash
git log --diff-filter=A --format="%h %ad %s" --date=short -- \
  apps/admin/src/features/analytics/README.md \
  apps/admin/src/features/analytics/__tests__/Analytics.unit.test.tsx   # same SHA, both paths
git show 26b70a97:apps/admin/src/features/analytics/__tests__/Analytics.unit.test.tsx | grep -c "  it("
```

The three shapes named elsewhere in this register are all about a claim *losing* its truth — stale
citation (**F1**), correct facts licensing a wrong inference (**F2**), true premise with a conclusion
never revisited after a migration (**7**). This one was false at the instant it was typed, by an
author concurrently writing the thing it denies. That matters practically: the usual staleness
heuristic — "check whether the comment predates the code it describes" — would **not** have caught
it. It predates nothing. Only reading the sibling directory does.

**Fix:** 2026-08-24. README now names both suites with their real counts (7 + 7) and the command to
run them, and carries the 21-locale copy-change warning that the old text's "drive it in a browser"
advice actively worked against.

**Found:** `fix-analytics-copy` dispatch, 2026-08-24; both the false claim and the test file's
existence re-verified independently by the coordinator before this entry was written.

### F8. `apps/admin/src/features/analytics/analytics-i18n.ts` (line 2) — "Spanish translation"

The `@file` block reads: "Spanish translation for the Analytics screen (`/admin/analytics`)".

**Why it is false:** the file holds 21 locale blocks, not one — es, id, de, zh-CN, zh-TW, pt-BR, ru,
fa, ar, ja, ko, pl, hu, fr, uk, tr, th, it, hi, ur, bn. Confirmed by counting locale keys in the file
(21) and by the fact that a single key rewrite in this session had to be applied 21 times.

**Why it is worth an entry at all** (it looks cosmetic): a reader who believes this file is
Spanish-only will edit one block and ship, leaving 20 locales silently falling back to the English
key — which is exactly the failure mode `dictionary-translator.ts` produces, since a missing key
resolves to the raw key text rather than erroring.

**Unlike O3, this one was true when written** — a clean instance of the "true premise, stale
conclusion" shape named in entry **7**. Traced commit by commit:

```bash
for c in $(git log --reverse --format=%h -- apps/admin/src/features/analytics/analytics-i18n.ts); do
  echo "$c locales=$(git show $c:apps/admin/src/features/analytics/analytics-i18n.ts \
    | grep -cE '^  ("?[a-zA-Z-]+"?): \{')"
done
```

`300406e7` (2026-08-08) created the file with **exactly 1** locale — the header was accurate that day.
`8d800679` (2026-08-08, "wip(i18n): add 17 languages to analytics-i18n.ts") took it to 18 and left the
header untouched; `62b32204` (2026-08-10) took it to 21, likewise. The header has been false since
`8d800679` — and note that the commit which falsified it *announces the falsification in its own
subject line*.

**Fix:** 2026-08-24. Header now names all 21 locales, records that it was accurate at `300406e7`
(one locale) and falsified by `8d800679` (added 17 more, header untouched), and states the `?? key`
silent-fallback trap inline.

**Found:** same dispatch and same date as F7, re-verified by the coordinator.



### F1. `src/features/source-control/commit-site.ts` — the data-loss rationalization

A comment justified the GitHub publishing behaviour that deleted every unrelated file on the target
branch, by citing a design document that **does not exist**. The bug had already run against a real
repository.

Fixed 2026-08-19. This is the single most expensive false comment found so far and the reason the
standing rule above exists.

*Note:* the 2026-08-19 handoff states THREE comments were proven false that session but individually
identifies only this one. The other two are not named in that document and are not reconstructed here
rather than guessed at.

---

### F2. `src/features/deployments/tool-registrations.ts` (was ~46-58) and `publish-agent-tools.ts` (was ~74) — "no honest narrower type exists"

Both files argued in prose that they must name the full `RouteDeps` god type, because
`RouteDeps.runExportSite` is `ExportEngine<RouteDeps>` and contravariance defeats any narrower
stand-in.

**The premise was true; the conclusion was false.** `types.ts:1156` really is
`runExportSite: ExportEngine<RouteDeps>`, verified independently three times. But narrowing was never
blocked — it just could not be done *with types alone*. A composition-root-bound closure
(`RouteDeps.exportSiteBound`) removed the need to name `RouteDeps` anywhere in the domain.

Two independent agents, without communicating, derived that same fix.

Fixed in `a699c833` / `04429a54`; comments rewritten.

**Pattern to note:** a comment can be factually correct in every particular and still license a wrong
conclusion. Check the inference, not only the facts.

---

### F3. `src/features/deployments/publish-agent-tools.ts` (line ~114) — the over-broad zero-import claim

Formerly: "Deliberately **NO import of any kind (type or value)** from `../vendor-credentials/**`
here — an earlier revision imported directly, which closed a real
`features/deployments <-> features/vendor-credentials` module cycle."

**Why it was false:** the historical cycle was real, but it was a *runtime* cycle. A type-only edge
cannot close one. `check-architecture` confirmed 0 module cycles / SCC 0 before and after adding the
type-only import.

Corrected to "NO **VALUE** import" in `a699c833`. See **O1** — a related comment in the same file
still carries the old assumption.

---

### F4. `.dependency-cruiser.cjs` — described a design that never shipped

A comment block described a `runSiteExport` field and `features/deployments/export-run.ts`'s
`BoundExportEngine` doc. Neither name existed anywhere in `src/` — the field had been renamed to
`exportSiteBound` and `export-run.ts` needed zero changes. Written from a superseded draft design.

Fixed in `1a483312`.

---

### F5. `src/assistant/byok-tool-surface.ts` (line ~235) — wrong owner attribution

Attributed `magicLinkPerEmailLimiter` to `IdentityToolDeps`. It is declared by `MembersToolDeps`
(`src/members/tool-registrations.ts:71`).

Fixed in `99494a66`; the comment now names `members/tool-registrations.ts` explicitly and states that
`IdentityToolDeps` declares no such field.

---

### F6. `apps/admin/src/features/analytics/Analytics.tsx` (notice copy + JSDoc header) — "sitting in memory"

The on-screen notice told users their pageview data was "the most recent hits currently sitting in
memory", and the file's own JSDoc header repeated it ("read straight off the in-memory ingest buffer
(`LocalBufferSink`)").

**Why it was false:** `src/server/deps.ts:766` binds `SqliteBufferSink`, whose adjacent comment
already said "durable — survives a restart, closing the `LocalBufferSink.capabilities().durable`
misreport". `LocalBufferSink` (`src/server/app.ts:520`) is reached only when `TOVU_DB=memory`
(`src/index.ts:28`) — the in-memory dev path, not a real install.
`src/db/sqlite/analytics-sink.sqlite.ts:91-118` confirms it: `accept()` inserts into a real
`analyticsEvents` table with no eviction and no cap-and-drop.

**Why this one is unusual:** it is a false comment that was *user-facing*. It did not mislead a
maintainer into a bad edit — it told site owners their own analytics were more fragile than they are.
The blast radius of a false claim rendered in the product is the userbase, not the next reader.

**Fix:** `fix-analytics-copy` dispatch, 2026-08-24, commit `e3a9cb9d`. Notice rewritten to drop the
storage claim entirely while keeping the genuine "no aggregation layer yet" limitation; JSDoc header
rewritten with a note recording why the old claim was wrong, so it is not reintroduced.

**Trap worth carrying forward:** the notice string doubles as its own i18n dictionary key, and
`apps/admin/src/lib/dictionary-translator.ts` resolves a miss as `?? key` — silently rendering English
rather than erroring. Renaming the key in `Analytics.tsx` alone would have quietly reverted all 21
locales. The fix rewrote every locale block. **Any user-facing copy change in this app is a 21-file
change, and the failure mode is silent.**

## 7 — `classify-coverage-gaps.ts:23-28` — invented citation, and a false ceiling

**Claim:** "The 2026-08-18 coverage audit found the esbuild CJS-interop shim injects exactly 2
permanently-zero-hit branches into every file — on a small file that alone can cost 5-10 points,
making literal 100% unreachable regardless of test quality," citing `route-coverage-lib.ts`'s header
and "this repo's own coverage audit."

**Why it is false — three independent checks, 2026-08-20:**

1. `route-coverage-lib.ts`'s header says nothing of the kind. It documents an unrelated trap: node
   silently excluding `test-*`-named application files from its coverage report.
2. No 2026-08-18 coverage audit exists. `ls ADS-memory/reports/ | grep 2026-08-18` returns only
   `connection-pool-architecture-recommendation.md` and `mcpui-client-recheck-and-a2ui-investigation.md`.
3. Measured against `development/coverage/lcov.info`: of 1265 files with branch data, **567 have
   ZERO unhit branches**. A universal 2-branch tax would make that count 0. The distribution
   (0 -> 567, 1 -> 147, 2 -> 136, 3 -> 72) shows 2 is an ordinary point, not a floor.

   ```bash
   node -e 'const t=require("fs").readFileSync("development/coverage/lcov.info","utf8");
   let f=0,z=0;for(const r of t.split("end_of_record")){if(!/SF:/.test(r))continue;
   const b=[...r.matchAll(/BRDA:\d+,\d+,\d+,(\d+|-)/g)];if(!b.length)continue;f++;
   if(!b.filter(x=>x[1]==="0"||x[1]==="-").length)z++;}console.log(f,z)'
   ```

**Root cause:** the repo is ESM (`"type": "module"`, `module: "nodenext"`), so esbuild emits no
CJS-interop shim to inject those branches. The owner identified this directly — the claim may have
been true under a pre-ESM configuration and was never revisited after the migration.

**Why it mattered:** this was the single load-bearing argument that 100% branch coverage is
unreachable in this repo. It is reachable, and 45% of measured files already reach it.

**Fixed:** header block rewritten in place with the measurement and the ESM root cause; the
`phantomTaxPlausible` flag itself is kept but re-justified on the real, documented reason (a zero-hit
branch on a line with no visible conditional is usually a misattributed REAL branch — check `DA:`
hits). Found by the Coordinator, 2026-08-20, prompted by the owner questioning the ceiling.

**Third failure shape confirmed:** "true premise, stale conclusion" — a claim that may have been
correct before an architectural migration and was never re-checked afterward.

---

## 8 — `apps/admin/src/features/posts/PostEditor.tsx:65-74` (pre-refactor line numbers) — "there is nothing to extract"

**Claim (EXEMPTION comment above `Toolbar`'s `useEditorState` selector, dated 2026-08-06/2026-08-11):**
"ESLint scores this selector's cyclomatic complexity well past a 9 ceiling, but its cognitive
complexity is 0 ... this is a flat object literal of `editor?.isActive(...) ?? false` fallbacks with
no control flow between them ... **There is nothing to extract** — splitting the fields across
multiple selectors would still evaluate the same fallbacks, just spread across more functions, and
would break `useEditorState`'s single-selector re-render-batching contract for no complexity
benefit."

**Why it is half true and half false:**

1. **True:** splitting into multiple `useEditorState` calls would break batching for no benefit —
   correctly identified and correctly rejected as an approach.
2. **False:** "there is nothing to extract." The selector repeated `editor?.<probe>() ?? <default>`
   for ~30 fields — every one of those repetitions re-checks the SAME `editor === null` condition
   (before TipTap mounts). ESLint's cyclomatic rule counts each `?.`/`??` as its own decision point,
   so ~58 of the reported 62 branch points were that one condition counted 29-30 times over, not 29-30
   independent decisions. The comment noticed the operator-counting artifact but concluded there was
   no fix, when hoisting the shared condition to ONE early return — while keeping exactly one
   `useEditorState` call and one returned object, so batching is untouched — collapses nearly all of
   it. The second selector on `BubbleFormattingMenu` (line 470, cyclomatic 11) carried the identical
   pattern at 5 fields.

**Diagnostic:** counted probe-vs-null-check ratio directly against the pre-refactor source: 17 plain
`isActive(name)` fields + 3 `isActive(name, attrs)` + 4 `isActive(attrs)` + 2 `can().<cmd>()` fields
each had a `?.`/`??` pair that was *entirely* attributable to the null check (0 real branching once
`editor` is guaranteed non-null); the remaining 6 `getAttributes(...).field ?? default` fields and 1
`storage.characterCount?.characters() ?? 0` field each keep one REAL per-field fallback (an unset mark
attribute or an unregistered extension) even after the null check is hoisted out.

**Fix:** replaced both selectors with a `TOOLBAR_PROBES`/`BUBBLE_MENU_PROBES` lookup table (each entry
a `(editor: Editor) => value` probe assuming a non-null editor), a `TOOLBAR_DEFAULTS`/
`BUBBLE_MENU_DEFAULTS` object, and a `probeToolbar`/`probeBubbleMenu` function holding the ONE
`if (!editor) return DEFAULTS` check plus a loop over the table. Selectors are now one-line
passthroughs (`selector: ({ editor }) => probeToolbar(editor)`), cyclomatic complexity 1. Every
per-field probe and both `probe*` functions individually measure 1-3, all far under the 9 ceiling.
Types preserved exactly via `{ [K in keyof typeof TOOLBAR_PROBES]: ReturnType<(typeof
TOOLBAR_PROBES)[K]> }` — `tsc --noEmit` is clean, every `s.<field>` call site typechecks unchanged.
`development/scripts/admin-complexity-debt.json`'s `PostEditor.tsx` entry (which had memorialized this
same "deliberate, permanent exemption" claim) is deleted; `check:admin-complexity-drift` confirms the
file no longer needs grandfathering.

**Found and fixed by:** refactor-posteditor dispatch, 2026-08-20.

---

## 9 — `src/export/site-exporter.ts` (as shipped by `d4ef2941`) — "the crawl normalizes everything," used to justify calling a live security check unreachable

**Claim, quoted from the doc comment `d4ef2941` added to `resolveAssetPathWithinOutputDir`** (and
repeated in that commit's own message, and in the doc comments it added to `fetchOneAsset` and
`writeRedirectRoute`):

> the crawl (`extractAssetUrls`/`extractCssUrls`) only ever hands this function URLs already
> pre-filtered to `ASSET_URL_PREFIXES` and normalized via `URL.pathname`/`decodeURIComponent`, so no
> crawl-discovered value can trigger either refusal

**Why it is false.** It is true of `extractCssUrls` and false of `extractAssetUrls`. Read both:

```
sed -n '/^function extractAssetUrls/,/^}/p' src/export/site-exporter.ts
sed -n '/^function extractCssUrls/,/^}/p'   src/export/site-exporter.ts
```

`extractCssUrls` really does normalize — `new URL(ref, \`http://export-local${cssUrl}\`).pathname`.
`extractAssetUrls` does not normalize at all: it is a raw `/\b(?:href|src)="([^"]+)"/g` regex over the
HTML string followed by a bare `value.startsWith(prefix)` against `ASSET_URL_PREFIXES`, with no `URL`
parsing and no `decodeURIComponent`. So a rendered page containing
`href="/theme-assets/../../../../tmp/canary"` passes the prefix filter verbatim and is queued into
`fetchAssets`, where the containment check refuses it for real.

**Why this one mattered more than a stale comment usually does.** The false claim was the *entire
justification* for a design decision: it was used to argue the containment refusal was unreachable dead
code, which in turn was used to justify exporting two private functions purely so tests could reach
them. The branch was crawl-reachable the whole time. A comment asserting unreachability is load-bearing
in a way most comments are not — it invites someone to delete or weaken the guard.

**Fix:** `exporter-100` dispatch, 2026-08-21. `resolvePathWithin` extracted to
`src/core/path-containment.ts` and wired into both `site-exporter.ts` and
`server/middleware/theme-static-assets.ts` (`034f696e`); the refusal is now driven through the real
`exportSite()` pipeline with an injected traversal payload rather than by a direct call, and the
transport functions were un-exported (`8b705226`). Verified independently by the coordinator:
`site-exporter.ts` at `BRF:129 / BRH:129`, zero shim markers in its `SF:` block.

**Pattern to carry forward:** an "X is unreachable" comment is a claim about *every* caller. Check every
producer, not the one whose name appears first. Here the two extractors were named together in a single
breath and only one of them had been read.

---

## Related, not a code comment

`ADS-memory/reports/.../theme-authoring-guide.md` §6's "3-attribute markers" claim is recorded
elsewhere as wrong and should be verified against the parser before use. Listed here only so the
pattern is not mistaken for a code-comment-only problem.

---

## How to add to this register

One entry, with: exact file and line, the quoted claim, *why* it is false (with the command or
diagnostic that shows it), the fix or the reason it was left, and who found it and when. If it is
fixed, name the commit. An entry that cannot be reproduced from its own text does not belong here.
