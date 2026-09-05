# Session task list — 2026-09-02 (Wed)

## SEV-1 — verified, Jini-side, BLOCKED BY PUBLISH PAUSE
- [x] DONE `b627a884` (24/24 verified) — **System-prompt overlay reached 7 of 24 runtimes, not 24** (Jini `2268bd5c` claims all 24).
      Overlaid prompt goes ONLY to `def.buildArgs` (`Jini/packages/daemon/src/agent-executor.ts:3035`).
      stdin `:3784` sends `imageDelivery.prompt`, ACP `:3730` and pi-rpc `:3761` send `input.prompt`,
      promptViaFile `:3492` sends pre-overlay — all RAW. 14 of 26 defs name the param `_prompt` and
      discard it. DELIVERED 7: claude, pi, reasonix, opencode, aider, antigravity, deepseek.
      DROPPED 17. Tovu's tool protocol AND the Bash guidance ride this path
      (`agent-daemon-server.ts:476`), so 17 of 24 runtimes get NEITHER.
      Invariant test `agent-executor.test.ts:5213` is VACUOUS — would pass if `writePromptToStdin`
      were deleted. Fix is 4 call sites + `buildRunArgs` return shape. **Jini-only; no Tovu change.**

## SEV-2 — security, tamper-evidence regression (Tovu-side, shippable)
- [ ] **`96801386` moved username OUT of the sealed blob and did NOT add it to the AAD.**
      `features/custom-credentials/aad.ts` builds `custom-credential-set:v1:${workspaceId}:${id}` —
      verified zero `username` occurrences. Before the commit username was inside authenticated
      ciphertext; now someone with DB write can swap a username leaving the sealed token intact and
      openable. No `aad_version` column on that table. Undocumented in commit msg, schema doc, or test.
      Practical impact modest (a swapped username usually 401s) but it is real lost tamper-evidence.
      Fix needs an AAD version bump + backfill — see [[reference_aad_sealing_call_site_map]].

## IN FLIGHT
- [x] CLOSED `tab-merge` (Opus 5) — merge Interactive+Preview. Restore point: tag `pre-tab-merge-2026-09-02` @ c891e62a
- [x] CLOSED `oauth-cleartoken-finish` (Opus 5) — finishing the preserved partial cada14df fix + tests
- [x] CLOSED `audit-fix-sept-02` (Opus 5) — theme comment, missing unit tests, sitemap disabled fetch
- [x] CLOSED `byok-key-field-fix` (Opus 5) — owes truncated remainder + blank-key deliverable

## AUDIT RESULTS — CLEARED, no action
- Sept 1 `a4ffb5bb` tripwires: SOUND, pure additions, still `deepEqual` on full sorted set
- Sept 1 `f8950e23` custom_credential_set_token: SOUND, 3 real layers, fail-closed (no model-echo path)
- Sept 1 `19b1c9b4` five screens: SOUND, all five genuinely subscribe + behavioral suites on the real bus
- Sept 1 `e38da66d` Bash: SOUND. **Bash is ALLOWED by default**; prohibition is opt-in via
  `TOVU_AGENT_FORBID_BASH === "1"` (exact sentinel). NOTE: that guidance rides the SEV-1 overlay,
  so even when opted in it reaches only 7 of 24 runtimes.
- Sitemap CORS: NON-ISSUE in prod (`import.meta.env.DEV === false` -> relative path -> same origin)

## OPEN — not dispatched
- [ ] 3 pre-existing `overridesThemePage` failures (theme page loses slug collision + 2 admin round-trips). Deterministic, predate today.
- [ ] `work-auditor` remainder never received (truncated twice): ranked fix list + full test-integrity section. Agent idle.
- [ ] **NOTHING HAS BEEN PUBLISHED. Owner lifted the pause; no publish has run.** 6 Jini commits are
      local-only via the `node_modules/@jini-ai/*` symlinks, so PRODUCTION STILL RUNS THE OLD PACKAGES:
      `b627a884` overlay 7->24 (the highest-value fix tonight), `dbbc3f01` autofill, `4e496636` key-format
      warning, `fac94efc` provider honesty, plus version bumps `9449b6c5`/`4aeb2118`/`<daemon>`.
      **Publish with `pnpm publish`, NEVER `npm publish`** — npm ships literal `workspace:*` and the
      package cannot be installed. Then bump Tovu's dep ranges. Nobody owns this.
- [ ] `features/external-mcp/agent-tools.ts` 5-tool catalog entirely unwired (no tool-registrations.ts for that domain).
- [ ] `DOMAIN_SLICES` derivation gap: 6 of 35 domains still hand-maintained; every MCP-UI surface domain is in that 6.
- [ ] GEMINI_API_KEY present in test env -> byok-google-live-smoke runs LIVE and BILLED; timed out at 90s.
- [ ] 33 pre-existing failures in Jini `sqlite-task-store.test.ts` (missing better-sqlite3 native binding).
- [ ] `site-assistant-highlight.spec.ts:212` asserts `.entry-meta` on a static-tier theme = 6th wrong-property test.
- [ ] 2 red byok e2e: `byok-key-handling.spec.ts:231`, `byok-model-discovery-self-heal.spec.ts:51`.


## DEFERRED BY OWNER — fix later, not now
- [ ] **One-character passwords are accepted.** `Jini/packages/cms/src/identity/password-policy.ts`
      now rejects only empty and >512 chars. `MIN_PASSWORD_LENGTH` deleted, not relocated (verified:
      zero grep hits in `packages/cms/src/identity` and `packages/admin/src`). `"a"` is a valid admin
      password on both write paths (`grant-service.ts:223`, `admin-crud-service.ts:214`). NO
      compensating control exists — no rate limit, lockout, or attempt counter anywhere in
      `packages/cms/src/identity`. Owner: "don't care right now, fix later." Jini `f8060c3a`.
- [ ] **Framer Marketplace-derived themes remain in git history** (258 objects, added `ec6ad31a`/
      `2ad47c8d`, deleted `8fb1f2fe`). Licensing exposure survives the tree delete. Owner: "not
      concerned at this time." Revisit before the repo goes public.

## CI IS NOT A GATE — found 2026-09-02 by tovu-fa, verified by me
- [ ] **19 `check:*` scripts defined; 19 `continue-on-error: true` in `.github/workflows/ci.yml`.**
      No `check:*` script can fail a build, independent of the billing block. 10 are invoked nowhere.
- [ ] **`development/scripts/list-server-test-files.ts:21` hardcodes `find src/server`, and
      `src/server` NO LONGER EXISTS** (the apps/website restructure moved it). CI's
      `test:cov:server:unit` / `:integration` steps therefore expand to an EMPTY file list and pass by
      running nothing. Its own header warns against exactly this drift. Left alone deliberately —
      fixing it changes what CI runs and what the route-coverage gates read. **Owner decision.**
- [ ] 3 tests left deliberately RED in `development/scripts/**` after wiring them into the glob
      (`921d705f`): 122 total, 119 pass. Need triage.

## SECURITY — still open, NOT deferred
- [ ] **Committed seed DB ships 4 argon2id password hashes incl. `admin`.**
      `sites/tovu-com/content.seed.db` is TRACKED; `identity_users` has 4 rows, all `$argon2`, 97 chars
      (verified). `identity_users` is NOT in `PRUNE_TABLES` (`development/scripts/seed-site.mjs:48`).
      `hydrateContentDbFromSeed()` copies it into live `content.db` on first boot; the Dockerfile ships
      it into the image. **origin is currently NOT public** (unauthenticated GET -> 404), so not yet
      exposed. UNKNOWN, decides severity: does first-boot owner seeding OVERWRITE the shipped `admin`
      row or SKIP it as already-present? Lives in `@jini-ai/cms`'s `seed.ts`, untraced.
- [ ] **Private fundraising material is in git history** — investor list + pitch deck, committed
      `1b3bee71`, moved `baa4ea1e`, both blobs still reachable from current refs. `c2f88a91` is honest
      that a history rewrite is required. Needs an explicit owner decision; destructive.


## SPEC NEEDED BEFORE ANY CODE — single editable page canvas
- [ ] **ONE screen that looks like Preview and is directly editable.** NOT a tab with an
      Edit/Preview toggle — that is the two tabs behind an extra click and the owner rejected it.
      Attempted and REVERTED tonight (`90e4985f` -> `d52856b6`); restore tag
      `pre-tab-merge-2026-09-02` @ `c891e62a`. Interactive + Preview are back exactly as they were.
      **THE REAL CONSTRAINT, which no attempt has addressed:**
        * Preview = an IFRAME of the real published route. Full chrome (nav, footer). Not editable.
        * Interactive = a GrapesJS canvas of the CONTENT REGION ONLY. Editable.
        * The canvas excludes chrome BY CONSTRUCTION: `deriveContentWrapperChain` walks the
          ANCESTOR chain of the `{"type":"content"}` marker in `page-shell.html`, and nav/footer are
          SIBLINGS of that marker, not ancestors.
      **So the real work is:** feed the canvas the FULL rendered page and mark everything except the
      content region non-editable (GrapesJS supports non-editable components). Nobody has built
      this; `90e4985f` did not attempt it.
      **Do not dispatch until the owner approves a written spec.** The coordinator designed this
      wrong twice in one night (added an Edit/Preview toggle, then a Dark/Light control) — both were
      coordinator scope creep, not agent error.
      Known open sub-issue: Preview renders LIGHT while the published page is DARK
      (`data-theme="dark"`, `basic` declares `defaultMode: "dark"`). Interactive is correct.
      Record it; do NOT build a mode control to fix it.

## QUEUED — dispatch as soon as key-format-warning-fix lands (file collision)
- [ ] **Split the BYOK saves into two buttons, BOTH panels** (owner-approved 2026-09-02).
      TODAY: one button labelled "Save key" actually sends protocol/providerId/baseUrl/model AND the
      key only if typed. That overload is the root of the whole confusion — it is why a blank-field
      press said "Saved to the server, encrypted" when no key was sent (`b83735e8` patched the
      message, not the cause), and why disabling it on blank was unsafe (it would block saving a
      model change).
      TARGET:
        * "Save key" — directly under the API key field. Writes ONLY the key. **Disabled when blank.**
        * "Save settings" — at the bottom under Base URL / Max tokens / Model. Writes those, never
          touches the key.
      Each button then does one thing, so its confirmation can be literally true and the `keyWritten`
      flag threaded through `AdminByokSaveState` becomes unnecessary — delete it. Also removes the
      empty-string-`apiKey` bug class at the root instead of guarding it.
      COVERS BOTH PANELS: admin (`AdminByokKeyPanel.tsx` + `use-admin-execution-credential.hooks.ts`)
      AND visitor (`AiAssistant.tsx:515` `visitorCredentialSaveStatusMessage` has the identical
      dishonesty; its copy spans ~20 locales in `ai-assistant-i18n.ts` — the bigger half).
      NEEDS A JINI CHANGE: `ByokProviderForm.tsx` has an `apiKeyFooter` slot but no bottom slot;
      "Save settings" needs one. **That file is inside `key-format-warning-fix`'s scope — wait for it.**
- [ ] Warning copy: keep the cross-vendor case SPECIFIC ("that looks like an Anthropic key, not a
      Google one" — actionable); make every other retained warning GENERIC ("this doesn't look like
      an API key"). Owner asked for a generic message.

## DECISIONS PENDING OWNER
- [x] DECIDED — reverted (`d52856b6`); real spec written, awaiting owner approval
- [ ] Media adapters fal/leonardo/hyperframes — debate the seam before building any
- [ ] Four render paths share the untemplated-Page assumption -> shared resolver + ADR?

## SHIPPED + VERIFIED TODAY
ed1dd2e9 theme page-shell | cada14df OAuth secret (DEFECTIVE, see above) | ae893f48 live-401 needs_reauth
41c2c2ad sitemap modal | 7d56cd33 + fac94efc provider honesty | af025bb6 catalog drift
f840a24c + dbbc3f01 BYOK autofill/model discovery | a1f8abd4 re-auth surface | 7c75f9b7 blank-key e2e (unverified)
