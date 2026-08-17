# Session 7 handoff — 2026-08-16

**Working tree: CLEAN in both repos.** Nothing uncommitted, nothing at risk.
**Unpushed: Tovu 60 commits, Jini 2.** Never pushed this session — the owner has not asked.

---

## Do this first

1. **Run `tsc --noEmit` on the whole repo.** Two commits at the tail (`account_label`, the
   test-coverage follow-up) were preserved by the Coordinator mid-flight, not signed off by their
   author. Their scoped tests are green (104/104, 22/22, 12/12) but a whole-repo typecheck was
   never run over the final state. **This is the single most likely thing to be broken.**
2. **Read the "Not verified" section below before claiming any of this works end to end.**
3. Decide on pushing. 60 local commits is a lot of unbacked work.

---

## What shipped

Started from one live bug: the in-app assistant published to `leonaburime/tovu-demo1` and got a
bare 404. The real account is `leonaburime-ucla`; the assistant had invented the owner from the
owner's email address.

| # | Fix | Commits |
|---|---|---|
| 1 | Assistant no longer guesses the GitHub owner — capabilities reports the verified account login | `8e71ff8e` |
| 2 | Deployment tab row wraps instead of clipping | in `8e71ff8e` (swept, see below) |
| 3 | Publish history — real append-only DB table, migration 0043 | `bc49834f`, `91ad2228` |
| 4 | "Done." replaced with the real publish outcome | `0f9bef4b`, Jini `d640fd47` + `2ea33e62` |
| 5 | Security page → Access Tokens, one list, all 8 credential stores + category filter | `838f1472`, `b440a007` |
| 6 | Tab-row icons: Deployment, Security, Source Control Providers | `c03c2033` |
| 7 | `account_label` persisted on credential rows, migration 0044 | `f6f5e2xx` (tail) |

Plus: design spec (`519c44e4`, `584127e3`, `c7be065c`, `cc8a31ab`), the live-publish verification
report (`00334dc6` → `ab9feb82`), and a Verify-gap regression test (`02a43326`).

### The through-line

The assistant could not learn **who** its token belonged to. Everything needed already existed —
`verify.ts:97` has always called `GET https://api.github.com/user`, which answers exactly that.
The answer just never reached the code that needed it:

1. First it was never read at all — a deliberate privacy rule that made the whole response body
   structurally unreachable. Correct instinct (login + email + plan + orgs), one field too wide.
   Narrowed in `8e71ff8e` to read `login` (GitHub) / `user.username` (Vercel) and nothing else.
2. Then it was read but stored in `InMemoryPublishCredentialVerificationCache` — process-memory,
   fillable only by a route with **no UI**, wiped on every restart. So it was usually empty, and
   when empty the assistant offered *"Type it, e.g. `leonaburime`"* — the original wrong username,
   handed back as an example. **The fix did not fail closed; it re-taught the bug.**
3. Fixed properly by `account_label`: a plaintext column beside the sealed token, following the
   `composio_connector_credentials` precedent already in `schema.ts` and its stated reasoning
   ("decrypting the roster just to paint labels would put an AEAD open on the page-load path").
   The account name is not a secret — it is the exact string in `https://<login>.github.io/<repo>/`.

The in-memory cache was deliberately **left alone**. It is correct for "is this token still valid
right now", a genuinely ephemeral question. Identity no longer depends on it.

---

## Not verified — do not claim these work

- **The publish outcome surface (`0f9bef4b`) is unproven end to end.** Unit-tested only. Nobody has
  clicked Publish and seen the real outcome render.
- **No publish has succeeded through the assistant this session.** The one attempt reached a correct
  confirmation dialog, then the click was blocked by the harness's safety classifier. The owner
  authorized it; by the time that resolved the dialog had expired, and the click was deferred
  because it would only have re-confirmed a path broken until `account_label` landed. It has landed
  now. **Run the test.**
- **`account_label` has never been exercised against real GitHub.** Scoped tests pass; no live token
  has been saved through the new save-time path.
- **Whole-repo typecheck not run** over the final two commits.

---

## Open work, highest value first

**#12 is done; #11 is its missing other half.**

1. **#11 — build the Verify button.** `grep -rn "erify" apps/admin/src/features/deployment/StaticSiteTab.tsx`
   → zero matches. The assistant tells people to click a control that does not exist, and no admin
   code calls `POST .../credentials/:id/verify` at all. The route works — a live authenticated call
   confirmed the token is valid and belongs to `leonaburime-ucla`. Regression test already committed
   (`02a43326`) and currently red by design.
   *Note: the Coordinator repeated this hallucinated instruction to the owner, having taken it from
   the assistant's own output. It propagated.*
2. **#10 — the full click-through e2e.** Model on `development/e2e/destructive-path.spec.ts`: real
   browser, real spawned `claude` CLI, real MCP-UI iframe, real in-frame clicks, plus `readTranscript`
   / `waitForTerminalRun` and the before/after transcript snapshot — which is literally the
   "does the agent respond after I click?" assertion. Must prove: post-click UI shows the real
   outcome, the assistant reports it in chat, a `publish_history` row lands with
   `triggeredBy='agent_tool'` and a real `commitSha`, and the URL returns 200.
   **Now runnable unattended**, which was the owner's whole point.
3. **#13 — repo picker.** Owner's idea and it closes the other half. The ACCOUNT is a fact (store it,
   done). The REPO is a changing choice — fetch `GET /user/repos` live, never store a list. Settle
   first: pagination (do not silently truncate), and whether the model gets the list or only the
   human picker does — a repo list carries **private repo names**, a materially larger surface than
   a login.
4. **Remaining from security-tokens-2's brief, status unconfirmed:** the Static Site token dropdown,
   and `security-i18n.ts` (English-only; every other feature carries ~20 locales). Check before
   assuming either landed.
5. **Design Phase 2.** `ADS-memory/reports/design/2026-08-16-access-tokens-visual-spec.md` (932 lines,
   §17 is a self-addressed worklist). The page exists now, so there is finally something real to
   react to. §14's tab-bar sign-off was reached by reading CSS, never by looking at it rendered —
   it says so itself.
6. **The same "Done." bug lives in three other places** — `content_post_delete`,
   `deployment_propose_custom_provider_credential`, and the source-control tools. Deliberately out
   of scope. Because the fix was built as the shared `askThenReport` helper in
   `src/assistant/surface-exchanges.ts`, each is now a small change rather than a rewrite.

---

## Operational lessons — these cost real time today

- **`SendMessage` to running agents is effectively broken in this harness.** Four consecutive
  messages to one agent never arrived; it built the wrong page shape as a direct result and said so
  honestly. **Put everything in the spawn prompt. To change course, stop and respawn.**
- **Stopping an agent destroys uncommitted work.** The Coordinator hand-rescued four separate
  batches: 288 lines of tests, a Jini outcome surface, the `account_label` implementation *including
  an untracked migration*, and two test files. Always `git status` **both repos** before a stop —
  the Coordinator checked only Tovu once and nearly lost committed-quality Jini work.
- **The git index is shared across agents.** A bare `git commit` swept another agent's files into
  `8e71ff8e` (which is why the tab-row CSS lives in a `fix(deployments)` commit). Both agents hit
  the same time-of-check/time-of-use race and reported it independently. **Use `git add <paths>`
  then `git commit --only <the same paths>`** — `--only` ignores the rest of the index; a bare
  `-- <paths>` pathspec will not stage new untracked files.
- **Three agents editing one working tree restarts the dev server under live runs.** Caused two
  `agent run failed to start (500)` turns. Not a product bug. Its one useful side effect was
  exposing the in-memory cache problem.

## Worth keeping — what the agents did well

Two separate agents caught their **own** tests lying, unprompted. One had reused a viewport-based
helper that passed against broken CSS at desktop width; it built a container-relative helper and
confirmed RED first. Another found that a naive substring check false-passes because the shared
stylesheet emits CSS for every state, not just the active one. Both were caught in a real browser,
not by reading code.
