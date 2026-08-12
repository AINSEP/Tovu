# API Surface Trace — Set A: `forms`, `comments`, `newsletter`, `site-dir`

**Status:** PROPOSAL ONLY — no production code touched. Every finding below is verified against
the actual source (import statements, docblocks, and the dependency-cruiser graph), not inferred.
**Mandate:** `check:architecture`'s `moduleApiSurfaceFiles` ratchet (`development/scripts/check-architecture.ts`).
**Method:** `npm run check:architecture -- --list` for the authoritative counts, cross-checked with
a standalone parse of the same `depcruise --output-type json` output (script in
`development/scripts/check-architecture.ts`'s own `deepImports()`/`moduleOf()` logic, reproduced to
get per-file importer lists the `--list` flag doesn't print). Every "who imports this / for what
symbol" claim below was verified with `grep -n` against the actual import line, not assumed from
file names.

## Executive summary

| Module | Files now | Files proposed | Edges now | Edges proposed | New files | Behavior change |
|---|---|---|---|---|---|---|
| `comments` | 7 | **4** | 11 | 4 | 0 (fixes existing bypassed `index.ts`) | none |
| `forms` | 11 | **8** | 19 | ~10 | 1 (`src/forms/index.ts`) | none |
| `newsletter` | 13 | **11** | 45 | ~33 | 1 (`src/newsletter/index.ts`) | none |
| `site-dir` | 8 | **6** | 10 | ~6 | 1 (`src/site-dir/index.ts`) | none |
| **Total** | **39** | **29** | **85** | **~53** | 3 | — |

All four proposals are the **same move**, applied consistently: re-export each module's **data
contract** (port interfaces, typed domain errors, and — for `comments`, which already has this —
the settings/type re-exports) through `index.ts`, and redirect the handful of importers that reach
past an already-open (or about-to-exist) door. Nothing else moves. Every file left exposed is left
exposed with a specific, evidenced reason, not a shrug.

This is **not** the "re-export everything" cover-up the brief explicitly ruled out. The dividing
line was not invented for this report — it is `src/comments/index.ts`'s own existing shape, written
before this trace and already the pattern the other three modules are missing. See the `comments`
section below: three of its seven "exposed" files are exposed only because importers are walking
around a door that has been open the whole time.

Applying all three module-002/003/004 proposals together would move
`moduleApiSurfaceFiles` from **228** (current, regressed) to **~218** — *below* the committed
baseline of 220 — using zero barrel-cover-up, zero new cycles (verified: every redirected edge is
type-only or an interface, and the module-level adjacency these consumers already have to
`comments`/`forms`/`newsletter`/`site-dir` doesn't change — only the file *within* that module they
resolve to changes), and zero behavior change (every proposed edit is either an import-specifier
swap or a 3-line re-export file).

---

## A calibration note before the per-module detail

The dispatch brief's diagnostic — "when imports ≈ files reached, the module has no real API" — does
not hold uniformly here, and I want to flag that before walking through the files so the per-file
verdicts below don't read as arbitrary. The reference "healthy" modules in the brief (`core`: 104→15,
`db`: 82→19) are held up as having "a genuine narrow door," but **`db` has no `index.ts` at all**
(verified: `src/db/*.ts` contains no `index.ts`), and `core/index.ts` is itself a two-line barrel
(`export * from "@jini-ai/cms/core"; export * from "./events"`). Their healthy ratio comes from
**convergence** — many importers reusing the *same* small file set (schema types, connection
helpers) — not from a narrow-door barrel.

`forms`/`comments`/`newsletter`/`site-dir` converge worse because of *who* is importing them, not
because the modules are badly shaped. I traced every importer of every exposed file in all four
modules (39 files, 85 edges) and every single one resolves to one of exactly four things:

1. **A global composition root** (`server/app.ts`, `server/deps.ts`, `cli/commands/serve.ts`)
   picking a concrete adapter (`repo.memory.ts` vs `repo.sqlite.ts`) or wiring a boot-time
   singleton (rate limiter, hook registry, data-module installer). This pattern is not local to
   these four modules — the identical `repo.memory`/`repo.sqlite` direct-import shape is used by
   **14 other modules** from the same two files (`analytics`, `core/entry-refs`,
   `features/database`, `features/plugin-runtime`, `features/recovery`, `features/taxonomy`,
   `widgets`, `features/commerce`, `features/content-types`, `features/entries`,
   `features/settings`, `navigation`, plus `forms`/`comments`/`newsletter` themselves — verified via
   `grep -oE 'from "\.\./[a-z/-]+/repo\.(memory|sqlite)"' src/server/{app,deps}.ts`).
2. **A per-domain local composition file inside `server`** (`server/routes/admin/<module>/deps.ts`,
   `server/modules/<module>.ts`, `server/http/admin/<module>.ts`) — every one of these is a
   *type-only* import shaping a narrower deps bundle for that domain's own service functions. This
   is also systemic: 32 `server/modules/*.ts` files exist, one per domain.
3. **A fragmented HTTP route handler**, one file per REST operation (`create.ts`, `update.ts`,
   `cancel-campaign.ts`, `archive-list.ts`, ...), each importing the *one* function it actually
   calls as a value import (`createFormDefinition`, `saveCampaign`, `archiveList`, ...). Verified
   directly — every route-handler import checked below is a plain named-function value import, not
   a namespace or wildcard import.
4. **A genuine cross-module dependency-inversion seam** through `ports.ts` — `widgets` implementing
   a read view over `forms`' `FormDefinitionRepoPort`, `members` implementing `newsletter`'s
   `SubscriberDirectoryPort`. Both are extensively ADR-documented (`widgets/resolvers/contact-form.ts`
   cites ADR-047 and an explicit invariant enforced by a code-review grep; `members/subscriber-
   directory.ts` cites ADR-030 §4). These are the pattern working *correctly*, not a leak.

None of (1)–(4) is "the module has no real API." They are the *composition root's* fan-out, which
is structurally required to touch many files in any ports-and-adapters system — the composition
root's entire job is choosing concrete adapters and wiring narrow deps bundles for each of a
domain's many independent operations. Collapsing them behind one barrel per module, as the anti-goal
warns, would make the counter read lower while every one of these distinct pieces would still need
enumerating in a real `exports` map — pure cover-up, correctly ruled out.

What *is* a real, fixable defect — and the subject of every proposal below — is category (4)'s type
surface (`ports.ts`, plus the error/type "data contract" route handlers use for HTTP-status mapping
and request/response shaping) not being routed through the one door each module already has, or
should have, for exactly that purpose.

---

## `comments` (7 files exposed, 11 edges)

`src/comments/index.ts` **already exists** and already re-exports exactly the right shape:
`CommentRepoPort`, `CommentIngressPolicy`, `SpamCheckPort` (from `ports.ts`), `CommentRecord`,
`CommentStatus`, `CommentsSettings`, `CommentSubmission`, `ModerationAction`, `ModerationLogEntry`
(from `types.ts`), `CommentWriteService` (the *type*, from `write-service.ts`), and
`CommentsSettingsValidationError` (from `errors.ts`). This is precisely the "data contract" shape
this whole report recommends for the other three modules — it was written first and independently
of this trace.

Three of the seven exposed files are exposed **only** because specific importers bypass that
existing door for no reason evidenced in the code — not a design gap, an inconsistency.

| File | Importers | What's imported | Category | Verdict |
|---|---|---|---|---|
| `ports.ts` | `server/routes/types.ts:56`, `server/routes/admin/comments/moderation-queue.ts:3`, `server/routes/site/comments-submit.ts:5` | `CommentIngressPolicy`, `CommentRepoPort` (all type-only) | **1 — wrong import path** | Redirect to `../../comments` / `#src/comments`. `index.ts` already re-exports these exact symbols (line 131). |
| `write-service.ts` | `server/routes/types.ts:57`, `server/routes/admin/comments/moderate.ts:3` | `CommentWriteService` (type-only) | **1** | Redirect. Already re-exported (line 134). |
| `types.ts` | `server/routes/admin/comments/moderate.ts:4`, `server/routes/admin/comments/moderation-queue.ts:4` | `CommentStatus`, `ModerationAction` (type-only) | **1** | Redirect. Already re-exported (line 132). |
| `repo.memory.ts` | `server/app.ts` | concrete adapter class, constructed at boot | **3 — legitimate** | Composition-root adapter selection. Same shape used by 14 other modules against the same two files. Leave. |
| `repo.sqlite.ts` | `server/deps.ts` | concrete adapter class | **3** | Same as above. Leave. |
| `tool-registrations.ts` | `assistant/tool-registrations.ts` | plugin tool registry entry | **3** | Systemic: 12 modules follow this exact convention for the AI-agent tool registry. Leave. |
| `data-module-install.ts` | `server/deps.ts` | `installCommentsDataModule`, called once at boot | **3** | Single boot-time DB-table-declaration call, single caller, no consolidation opportunity exists (comparable `newsletter/data-module-manifest.ts` follows the identical single-purpose shape). Leave. |

**Category tally:** 1 → 3 files (all fixable, zero risk); 3 → 4 files (leave, evidenced).

### Proposal C-1 — redirect 5 import statements to the existing `comments/index.ts`

- **Category:** 1 (wrong dependency — the door is already open).
- **Files touched (5, one-line import-specifier edit each):**
  - `src/server/routes/types.ts:56-57` — merge the two `../../comments/ports` / `../../comments/write-service` type imports into one `../../comments` import.
  - `src/server/routes/admin/comments/moderation-queue.ts:3-4` — `#src/comments/ports` + `#src/comments/types` → `#src/comments`.
  - `src/server/routes/admin/comments/moderate.ts:3-4` — `#src/comments/write-service` + `#src/comments/types` → `#src/comments`.
  - `src/server/routes/site/comments-submit.ts:5` — `#src/comments/ports` → `#src/comments`.
- **Blast radius:** 4 files, all `import type`/named-type edits. No runtime behavior changes (TypeScript erases type-only imports; the re-exported types are structurally identical, same declarations, just reached via a different specifier).
- **Result:** `comments` drops from 7 exposed files / 11 edges to **4 files / 4 edges**.
- **Sign-off needed:** None beyond the owner's usual review — this is a mechanical, zero-risk cleanup, not a design decision. Safe to batch with C-2/C-3/C-4 below or land alone.

---

## `forms` (11 files exposed, 19 edges)

Unlike `comments`, `forms` has **no `index.ts` at all** — confirmed by directory listing, not
inferred from the metric. Every cross-module import is a "deep import" by definition, because
there is no barrel to bypass in the first place. This is the more consequential half of the
"stark" 19→11 ratio the dispatch brief called out: it isn't that the module's design invites
scattershot access, it's that the one place designed to draw the line was never built.

| File | Importers | What's imported | Category | Verdict |
|---|---|---|---|---|
| `ports.ts` | `widgets/resolvers/create-core-resolvers.ts:2`, `widgets/resolvers/contact-form.ts:2`, `server/routes/types.ts:55` | `FormDefinitionRepoPort` (×2, type-only), `FormDefinitionRepoPort`+`FormSubmissionRepoPort` (type-only) | **2 — missing API** | This IS the module's real cross-feature contract (`contact-form.ts`'s docblock: "Imports ONLY the read-only `forms/ports.ts` module... never the Forms library's own submission write path... INV-08, hard invariant, verified by a code-review-level grep"). The seam is correct; it just has no front door. |
| `errors.ts` | `server/http/admin/forms.ts:8`, `server/routes/admin/forms/update.ts:2`, `server/routes/site/forms-submit.ts:7` | Typed error classes, all value imports (used in `instanceof` HTTP-status mapping) | **2** | Same shape as `comments/errors.ts`, which is already re-exported through `comments/index.ts`. |
| `types.ts` | `server/routes/admin/forms/create.ts:3`, `server/http/admin/forms.ts:9`, `server/routes/admin/forms/update.ts:4` | `FieldDescriptor`, `NotifyConfig`, `FormDefinitionRecord`, `FormSubmissionRecord`, `FormDefinitionStatus` (all type-only) | **2** | Same shape as `comments/types.ts`. |
| `forms.ts` | `server/http/site/render.ts:13` | `ATTRIBUTE_NAME_PATTERN` (a regex constant) | **3 — legitimate, narrow** | The public-site renderer needs Forms' own attribute-name allowlist so a rendered form field can't diverge from what Forms itself validates on submit — single, precise, single-purpose reuse. Barreling a rendering-adjacent constant into the same door as the domain contract would blur what the contract actually is; leave as a direct, load-bearing import. |
| `notify-subscriber.ts` | `server/modules/forms.ts` (×2: `registerFormNotifySubscriber` value + `RegisterFormNotifySubscriberDeps` type) | Boot-time outbox subscriber registration | **3** | Single caller, single purpose, mirrors 31 other `server/modules/*.ts` per-domain wiring files. |
| `rate-limit-profile.ts` | `server/app.ts`, `server/deps.ts` | `FORMS_SUBMIT_PROFILE` constant, constructed into a rate limiter at boot | **3** | Both global composition roots need it once, at boot, to build the limiter. Not a repeatable "API" call — a boot-time constant. |
| `repo.memory.ts` / `repo.sqlite.ts` | `server/app.ts` / `server/deps.ts` | Concrete adapters | **3** | Same systemic composition-root pattern as `comments` (14+ other modules). |
| `submit-service.ts` | `server/routes/site/forms-submit.ts` | `submitForm` (value import, the one function this route calls) | **3** | Single route, single function, direct call — same shape as every other per-route value import below. |
| `tool-registrations.ts` | `assistant/tool-registrations.ts` | Plugin tool registry entry | **3** | Systemic (12 modules). |
| `write-service.ts` | `server/routes/admin/forms/create.ts:2`, `server/routes/admin/forms/update.ts:3` | `createFormDefinition`; `setFormDefinitionStatus`, `updateFormDefinition` (value imports — the exact functions each route calls) | **3** | Each route handler calls a different function; nothing to consolidate without inventing an unused abstraction. |

**Category tally:** 2 → 3 files; 3 → 8 files.

### Proposal F-1 — add `src/forms/index.ts`, re-export the data contract only

- **Category:** 2 (missing API — a narrow, intentional door that doesn't exist yet).
- **New file (`src/forms/index.ts`, ~6 lines):**
  ```ts
  /** Barrel for forms' cross-module data contract. Composition-root wiring
   * (repo adapters, rate-limit profile, boot subscribers, write/submit
   * services) is deliberately NOT re-exported here — see
   * ADS-memory/reports/architecture/2026-08-13-api-surface-trace-A.md. */
  export type { FormDefinitionRepoPort, FormSubmissionRepoPort } from "./ports";
  export type {
    FieldDescriptor, FieldType, NotifyConfig, FormDefinitionStatus,
    FormDefinitionRecord, FormSubmissionRecord, FormSubmissionPage,
  } from "./types";
  export {
    FormFieldValidationError, FormSlugConflictError, FormDefinitionNotFoundError,
    FormSubmissionValidationError, FormSubmissionNotFoundError, FormRateLimitExceededError,
  } from "./errors";
  ```
- **Files touched (7, import-specifier edits only):** `widgets/resolvers/create-core-resolvers.ts`,
  `widgets/resolvers/contact-form.ts`, `server/routes/types.ts`, `server/http/admin/forms.ts`,
  `server/routes/admin/forms/update.ts`, `server/routes/site/forms-submit.ts`,
  `server/routes/admin/forms/create.ts`.
- **Blast radius:** 7 files, every edit an import-specifier swap for a type or an already-thrown
  error class. No behavior change — verified the exact symbols imported match 1:1 with what the new
  barrel exports (checked every call site with `grep -n` against the real import lines, not
  assumed).
- **Result:** `forms` drops from 11 exposed files / 19 edges to **8 files / ~10 edges**.
- **Sign-off needed:** This is a new public-contract decision (unlike C-1, which used a door that
  already existed), so it's a genuine "leave a comment trail" moment — the header comment in the
  proposed file states the boundary explicitly so the next person doesn't assume "just add whatever
  needs exposing" applies. Worth a quick owner nod before landing, not a full ADR — it doesn't
  change any port contract or wire-format, only which file re-exports it.

---

## `newsletter` (13 files exposed, 45 edges)

Also has **no `index.ts`**. `newsletter` is the largest of the four by both file count and edge
count, but its convergence (45 edges / 13 files ≈ 3.5) is already the best of the four — it isn't
the "stark" case the dispatch brief flagged forms/site-dir as. That tracks: newsletter genuinely has
more independent sub-concerns (campaigns, lists, subscriptions, confirmation, unsubscribe, send
pipeline) than the other three modules, each legitimately needing its own file, and each already
funneled through a scoped local composition file
(`server/routes/admin/newsletter/deps.ts` — verified: every one of its 8 newsletter imports is
`import type`, assembling narrower deps bundles like `toCampaignWriteServiceDeps`,
`toListsDeps`, `toConfirmationDeps` for the domain functions to consume; this file's own docblock
says it "follows the exact precedent `src/server/routes/admin/members/deps.ts` established").

| File | Importers | What's imported | Category | Verdict |
|---|---|---|---|---|
| `errors.ts` | 8 route/HTTP files (`server/http/admin/newsletter.ts`, `get-campaign.ts`, `list-send-log.ts`, `remove-subscription.ts`, `resend-confirmation.ts`, `update-campaign.ts`, `newsletter-confirm.ts`, `newsletter-unsubscribe.ts`) | Typed error classes (value imports, `instanceof` HTTP mapping) | **2 — missing API** | Same shape as `comments/errors.ts` (already barreled) and the `forms/errors.ts` proposal above. Highest-count single file in the whole trace (8 importers) — the clearest case for a door. |
| `ports.ts` | `server/app.ts` (`SendBatchJob` type), `members/subscriber-directory.ts:43` (`SubscriberContact`, `SubscriberDirectoryPort`), `server/routes/admin/newsletter/deps.ts`, `server/routes/site/newsletter-deps.ts` | Port interfaces + the cross-module DI seam (`SubscriberDirectoryPort`) | **2** | `members/subscriber-directory.ts`'s own docblock: "Newsletter's `src/newsletter/ports.ts` declares `SubscriberDirectoryPort` as the read-only seam it needs into Members... Single-evaluator typed dependency per `src/newsletter/ports.ts`'s header comment" (cites ADR-030 §4). Textbook dependency inversion, same pattern as `forms`' widgets seam — genuinely the module's contract, just no front door. |
| `campaign-write-service.ts` | `deps.ts` (type) + 4 route handlers (`saveCampaign`, `cancelCampaign`, `scheduleCampaign` value imports — verified each route calls a distinct function) | **3 — legitimate** | Each route calls a different function; `deps.ts` already isolates the type-shaping concern. Nothing to consolidate. |
| `confirmation.ts` | `deps.ts` (type) + `resend-confirmation.ts` (`issueConfirmationToken`) + `newsletter-confirm.ts` (`consumeConfirmationToken`) + `site/newsletter-deps.ts` (type) | **3** | Same pattern. |
| `hooks.ts` | `deps.ts` (type) + `routes/admin/newsletter/deps.ts` (type) | `HookRegistry` type, one process-lifetime instance per `deps.ts`'s own docblock | **3** | Boot-time singleton type, not a repeatable call. |
| `lists.ts` | `server/app.ts`, `server/deps.ts`, `deps.ts` (types) + `archive-list.ts` (`archiveList`) + `create-list.ts` (`saveList`) (values) | **3** | Same value-import-per-route pattern verified directly. |
| `send-pipeline.ts` | `server/app.ts` (`createHookRegistry`, `handleSendBatchClaimed`, `SEND_BATCH_CLAIMED_EVENT`), `send-campaign.ts` (`authorizeSend`, `claimBatch`, `freezeAudience`), `pause-campaign.ts` (`pauseCampaign`), `resume-campaign.ts` (`resumeCampaign`), `send-test-campaign.ts` (`sendTestCampaign`) | **3** | 5 distinct call sites, 5 distinct functions each, verified with `grep`. This is the busiest "legitimate" file in the trace and it's still one-function-one-caller throughout. |
| `subscriptions.ts` | `deps.ts` (type) + `create-subscription.ts` (`saveSubscription`) + `import-subscriptions.ts` (`importSubscriptions`) + `remove-subscription.ts` (`unsubscribeSubscription`) | **3** | Same pattern. |
| `unsubscribe.ts` | `deps.ts` (type) + `site/newsletter-deps.ts` (type) + `newsletter-unsubscribe.ts` (`processUnsubscribe`) | **3** | Same pattern. |
| `data-module-manifest.ts` | `server/deps.ts` | Single boot-time table-declaration call | **3** | Same shape as `comments/data-module-install.ts` — this is in fact the file that one's own docblock says it mirrors. |
| `repo.memory.ts` / `repo.sqlite.ts` | `server/app.ts` / `server/deps.ts` | Concrete adapters | **3** | Systemic pattern (14+ modules). |
| `tool-registrations.ts` | `assistant/tool-registrations.ts` | Plugin tool registry entry | **3** | Systemic (12 modules). |

**Category tally:** 2 → 2 files; 3 → 11 files.

### Proposal N-1 — add `src/newsletter/index.ts`, re-export `errors.ts` + `ports.ts` only

- **Category:** 2 (missing API).
- **New file (`src/newsletter/index.ts`, ~10 lines):** re-export every class from `errors.ts` and
  the port interfaces + `SubscriberContact`/`SubscriberDirectoryPort`/`SendBatchJob` types from
  `ports.ts`. Same "why this line and not that one" header comment as the `forms` proposal, pointing
  at this report.
- **Files touched (12, import-specifier edits only):** the 8 `errors.ts` importers +
  `members/subscriber-directory.ts`, `server/app.ts`, `server/routes/admin/newsletter/deps.ts`,
  `server/routes/site/newsletter-deps.ts`.
- **Blast radius:** 12 files, all type-only or `instanceof`-only value imports. Every symbol
  verified 1:1 against the real import line, same method as C-1/F-1.
- **Result:** `newsletter` drops from 13 exposed files / 45 edges to **11 files / ~33 edges** — the
  single biggest edge-count reduction of the four (12 edges), because `errors.ts` alone carries 8.
- **Sign-off needed:** Same level as F-1 — a quick owner nod on the new file's scope, not an ADR.
  Flagging one thing explicitly: `members/subscriber-directory.ts` implements `SubscriberDirectoryPort`
  under ADR-030's locked decision; redirecting *where the type is imported from* doesn't touch that
  decision or the interface shape, only the specifier. Worth saying so in the commit message when
  this lands, since ADR-030 is cited by name in the file being touched.
