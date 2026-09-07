# Decision record — 2026-09-07, fix-wave rulings

Leona delegated all six open decisions to the Coordinator ("what's best for the future / fixes
the bugs now — please do that"). These are the calls made and the reasoning, so a later session
can overturn any of them on evidence rather than re-deriving the argument.

Context that shapes every call below: **Tovu is not deployed** (deploy is blocked), so the
effective user base is Leona plus test installs. That makes "safe but mildly inconvenient" cheap
and "silently wrong record" expensive. Reverse this reasoning once there are real users.

---

## 1. SEC-01 / D-04 grandfathering — FAIL-CLOSED STAYS (no change to Agent B's work)

**Ruling:** keep fail-closed. Project rows created before the site-identity stamp existed have no
stamp, so deleting one removes the card and leaves the folder on disk. Do NOT add
stamp-on-first-read.

**Why:** stamp-on-first-read trusts exactly the rows the guard exists to distrust. The hole it
would re-open is the real one — a moved site plus a reused path erases a replacement site the app
never created, which is unrecoverable loss of a user's actual site directory. The cost of
fail-closed is an orphan folder Leona deletes by hand, which is trivially recoverable and, with
one user, rare.

**Also correct in B's implementation:** the card reports `deleteErasesFiles: false` for unstamped
rows, so the confirm overlay never promises an erase it will not perform. Honest UI, not a silent
partial delete.

**Future option, deliberately NOT built:** a stamp-on-explicit-confirmation path — the card offers
"this project predates the safety check; confirm this folder is yours" and stamps once. That is
safe because a human supplies the identity the guard cannot derive. It is UI work with no current
demand. Build it only if orphan folders become a real annoyance.

---

## 2. The three new 409s from the `expectedVersion` cluster — KEEP ALL, plus the 400

**Ruling:** keep every one. `PUT /pages/:id` stale basis → 409, malformed basis → 400;
`PUT /posts/:id` with `expectedVersion` → can now 409; `PUT /seo/entries/:id` → can 409 after
3 retry attempts.

**Why this is not really a behaviour-change decision:** a `PUT` carrying `expectedVersion: 7` that
returns 200 while the row sits at 9 is lying to the client. The client asked for a *conditional*
write; 200 tells it the precondition held. There is no reading under which the old behaviour was
correct — the doc comment at `post.ts:907` already called it compare-and-set. The 409 IS the fix.

The 400 on a malformed basis matters just as much: Agent A's RED showed a string `"1"` was
silently accepted. Ignoring a malformed precondition is the worst available option, because the
client believes it got concurrency protection it never had.

**Blast radius today: ~zero.** Reach is external API clients only; the admin saves via
`/posts/:id` and has no client for `/pages/:id`.

---

## 3. `setEntrySeoOverrides` bumping `posts.version` — DEFERRED, not a patch

**Symptom:** an SEO-only edit bumps `posts.version`, which pauses an open editor's autosave and
409s its next Save, even though no content changed.

**Ruling:** do not fix now. Record as a contract question.

**Why:** `posts.version` is being used for two different meanings at once — (a) "the content
changed", an optimistic-concurrency token for the editor, and (b) "this row changed at all", a
revision counter the posts-gateway revert guard also reads. Separating them is the correct
long-term shape, but it touches a rollback/compensation path — and Agent A just demonstrated how
easy those are to break silently (predicating `save()` itself would have turned every unit-of-work
compensation into a no-op).

**The deciding factor:** the current symptom fails *safe*. A spurious 409 refuses a write; it does
not lose data. Trading a safe false positive for a risky change to compensation logic is a bad
trade at this stage. The cheap-looking alternative — make the editor tolerant of a version bump
that did not change content — requires content hashing, so it is not actually cheap.

**Wants:** a decision on what the column means, with the gateway revert guard's read included in
the analysis. Not a patch.

---

## 4. Persist `run_status='failed'` — DO IT (Agent D dispatched)

**Ruling:** yes. Dispatched to Agent D with mandatory consumer verification first.

**Why this was the highest-value item on the board:** the durable record currently says
`succeeded` for runs that died with empty content. That lie is precisely why diagnosing chat
deaths burned multiple sessions and produced a wrong premise (the daemon-child lifecycle) that
survived two handoffs before being refuted against live pids. Fixing the transport causes
(`f682eff2`) stopped new lies from being *caused*; this stops them being *recorded*. The goal is
that a failed run is recoverable from the database alone, without a live transcript.

**Guard placed on the work:** `failed` must already be terminal in `isTerminalRunStatus`
(`AssistantDock.hooks.tsx:1090`, `assistant-chats.ts:137`) or the dock hangs forever waiting to
settle — trading a wrong record for a stuck UI. D must report the full consumer table before
changing the writer.

**No backfill.** Existing `succeeded`-with-empty-content rows stay as they are; guessing which
historical rows were really failures would manufacture evidence. D reports the count and leaves
them.

---

## 5. `103f7ae1` redirect-follows-filename — KEEP

**Ruling:** the change stays. On a redirect the stored default filename follows the final hop, not
the requested URL.

**Why:** the contract already claimed this behaviour; the code just did not do it, so this closes
a divergence rather than opening one. It also produces strictly more useful names — a requested
URL like `example.com/download?id=5` often has no usable filename at all, while the final hop
gives `sunset-beach.jpg`. Risk is low because it sets only the *default* name, which the user can
change.

---

## 6. Scope wording for Agent B — corrected by the Coordinator, no user input needed

The dispatch said "`apps/desktop/*.cjs` only. Nothing outside that directory," but D-02 and D-03
have no `.cjs` surface at all and were explicitly assigned. That was a Coordinator error in the
prompt. Scope confirmed as `apps/desktop/` as a whole; B was given the two repo rules it needs in
renderer code (no logic in `.tsx` — behaviour belongs in hooks; complexity ceiling 9).

Agreed with B's rejection of the `.cjs`-only alternative for D-02: making `handleCreate` reject
Supabase/Custom moves the failure away from the form the operator is looking at.

---

## Carried forward, unclaimed

- `pages-update-html-auth.test.ts:52-54` claims `createApp()` boots the real composition root
  against the real `content.db`. It does not — `app.ts:263` is hermetic in-memory. False comment,
  found by Agent A, not yet corrected.
- The structural debt list from the architecture lens (nine `escapeHtml` copies, the 1,047-line
  `main.cjs` composition root, two boot paths, two "adopt" vocabularies,
  `CONTENT_DB_FILENAME` vs `CONTENT_DB_FILE_NAME`, four SSE-head copies, three accepted-image-type
  lists, `useSettlementGeneration` at 8 of 11) — real debt, nothing breaks tomorrow, no owner.
- `ADS-memory/reports/codex-audit/` is still uncommitted and stopped on a usage limit, not
  completion. The Fable lenses refuted none of its 15 findings.

---

## Addendum — Agent B's four user-visible changes, ruled 2026-09-07

Leona's delegation stands; these were decided by the Coordinator on the same basis.

1. **Pre-existing `created` project's delete no longer erases its folder** — KEEP. Already ruled
   in §1 above. Fail-closed, and honest (`deleteErasesFiles: false`, so the overlay promises only
   the card removal it actually performs). Self-corrects for new projects.
2. **A crashed site shows as stopped with a reason; Start spawns fresh instead of returning the
   corpse** — KEEP. The old behaviour handed back a dead handle and reported "running". There is
   no reading under which that was better.
3. **Supabase and Custom DB visibly disabled in the create form** — KEEP. The form previously
   accepted a hosted-DB choice and silently discarded it, reporting sqlite success. Disabled and
   visible beats accepted and dropped.
4. **Own-server mode leaves a crashed site's window open** — KEEP. Closing it fires
   `window-all-closed`, which quits the whole app when the only open site dies. A stale window the
   user can close is strictly better than the app vanishing under them. Fleet mode unaffected.

**D-02 product call — do NOT drop `database` from the desktop contract.** The audit prefers
deleting it outright; B made the form honest instead and left the capability signposted. That is
the right call: removing a roadmap affordance is a product decision, and it is not reversible by
the person who next wants hosted DB support. Revisit only if the capability is formally dropped.

**Method note worth keeping:** B did not restructure `main.cjs` into boot modules despite §4.5
recommending it. Reasoning accepted — `tsc` cannot check `.cjs`, so a large blind move there has
no guard, and that exact change gutted the file once already (`15548bef`). It extracted only the
seam the findings needed (`src/site-supervisor.cjs`, 143 lines) and left the other ~1,000 alone.
The 1,047-line composition root remains open structural debt with no owner.

Two signals that the RED-first discipline is doing real work: B's first D-01 guard added a real
`statSync` and six existing tests caught that it had violated `seedDevFallbackProject`'s injected-
classifier contract; and the new `"unreadable"` verdict created an unwired call site
(`describeRejectedDefault` would have thrown on `undefined.join` while building the dialog meant
to explain the problem). Both found before landing.
