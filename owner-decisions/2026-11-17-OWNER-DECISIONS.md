# Open owner decisions — Tovu → Jini refactor (one pass)
Collected 2026-11-17 from the plan branches, cloud reports and the c1 handoffs. Read-only collection; nothing was decided here.
How to answer: say "ID yes" to take the Rec, or "ID no" / your own answer. "Rec" = the plan's (or c1's) recommendation.
IDs carry a plan prefix because several plans reuse names like OD-3:
TC tool-call fixes · KT lanes K/T · NS notes second app · DX desktop extraction · AU admin UI extraction · LO left-out areas · DM daemon untangle (R7) · XP cross-package lanes · ER error system · RF run finalizer · AG AG-UI · LU lost updates · OLD older dropped questions.

## Answer these first (unblock the most work)
1. **BASE-RED** — every K/T sheet is stopped on a red base.
2. **DM-O12** — blocks all of R7 (daemon routes).
3. **DM-OPT** — blocks all of R7.
4. **DM-ETAG** — blocks all of R7.
5. **AU-D1** — blocks J4, 5 pre-runs, JM1–5 and the ready admin screens (~5M tokens).
6. **DX-OD10** — every packaged (P-level) desktop step waits on it.
7. **DX-OD1** — blocks desktop D0c1/D0c2 (the first desktop design step).
8. **LU-B1** — blocks lost-updates S1, S3, S5, S6, S9c, S9d.
9. **TC-OD1** — blocks tool-call S1.
10. **TC-OD8** — blocks tool-call S12a and S13.

---

## Gate blocker (cross-plan)
- **BASE-RED** — The base branch already fails 4 checks (size, complexity, architecture, errors), so every K/T run stops before doing anything. Fix the base first, or judge each run only on lines it adds? Rec: both — let the running ratchets-green run fix the base (a), and make "no new line beyond the base output" the standing rule (b) so this never blocks again. Blocks: all K/T sheets (wave 1 K-01, K-02b, T-PO-01 already stopped), reconcile 06-b (red admin baseline).

## Daemon untangle / R7 (= XP OD-9)
- **DM-O12** — Express matches paths ignoring case and an extra trailing slash; the new route table is exact. Accept the stricter answers, or match Express first? Rec: match Express first (opt-in case-insensitive + one trailing slash in core, bad-escape 400 via the bridge, ~25k); the census could not rule out callers, since the admin proxy lets any session client send them. Blocks: all of R7 (G1 onward).
- **DM-OPT** — Who answers OPTIONS on a converted path (Express says 200 + Allow today)? Rec: the bridge answers it when no CORS layer is above it (keeps today's answer). Blocks: all of R7.
- **DM-ETAG** — Converted answers lose Content-Length, ETag and 304. Accept, or rebuild them in the bridge? Rec: the bridge sets Content-Length for non-stream bodies; drop ETag/304 (browser fetch sends no-cache, so clients get 200 today anyway). Blocks: all of R7.
- **DM-R3-1** — A failing run store on the tool-executions route answers 400 "request body must be valid JSON". Keep 400, or make it a 500? Rec: 500 with plain words + error ID (it is a server failure; 400 misleads the caller). Blocks: the G2/G3 file for that route.
- **DM-R3-2** — The design passes a Tovu API-key redaction pattern that does not exist. Does Tovu have its own key shape to redact? Rec: add one only if Tovu's tokens have a fixed prefix; otherwise none (built-in patterns still apply). Blocks: G2/G3 mount options.
- **DM-R3-3** — The model proxy streams the upstream error's own text to the client and reports nothing. Rec: plain words + error ID to the client, full text to the error sink. Blocks: G2/G3 model-proxy file.
- **DM-MEM** — 3 memory routes put a dependency's error text in a 400 answer. Rec: same fix as DM-R3-3 (fixed sentence + ID; text to the log). Blocks: G2 memory.ts.
- **DM-R3-4** — The proxy token is refused on the delegated path, but the design says it passes. Rec: keep today's refusal and fix the design row (safer, already pinned). Blocks: nothing until G2.

## Tool-call fixes (all 11 OPEN)
- **TC-OD1** — Add a new error code UNKNOWN_TOOL (404) instead of reusing NOT_FOUND? Rec: yes; NOT_FOUND here already means "run not found", so the model can't tell them apart. Blocks: S1.
- **TC-OD2** — When a family call names exactly one member, may the MCP gateway retry once as that member (with a note)? Rec: yes; the server itself never reroutes. Blocks: S2b.
- **TC-OD3** — May errors show strings the caller itself sent in this call (like slugs), except secret-marked fields? Rec: yes; today slugs with digits get masked. Blocks: S6 runs a smaller version without it.
- **TC-OD4** — Chrome integration off by default (stored choices kept), together with one lease per daemon? Rec: yes. Blocks: S17 default part (lease part runs either way).
- **TC-OD5** — May the screenshot wait grow with the request, up to 45 s (cap is 20 s)? Rec: yes. Blocks: S14b full version.
- **TC-OD6** — Per-CLI tool-call timeout for measured CLIs: 600 s, progress every 25 s? Rec: yes. Blocks: S16b.
- **TC-OD7** — If guides name more tools than fit the direct list, write the overflow in gateway-call form and keep the 64-tool limit? Rec: yes (raising the limit adds schema to every run). Blocks: S4b only if no fit is found.
- **TC-OD8** — "clamp" (auto-fix an out-of-range number) is opt-in per property? Rec: yes; clamping every bound is unsafe for selectors. Blocks: S12a, S13.
- **TC-OD9** — Never default a missing themeId to the active theme, even on read tools? Rec: yes; the refusal now names theme_list. Blocks: S13 branch only.
- **TC-OD10** — Human-approval window stays 120 s and progress never extends it? Rec: yes; changing it is its own design. Blocks: nothing (S15 pins it).
- **TC-OD11** — Record Gemini as retired (Antigravity measured instead) and Aider as "no tool transport"; no code for either? Rec: yes. Blocks: S16a branch.

## Lanes K and T
- **KT-DK1** — Confirm the tool-builder contract: core keeps positional build(deps, surfaces); Jini builders take ({deps, surfaces}, optional); Tovu's adapter keeps today's name and signature. Rec: yes. Blocks: K tool-registration sheets.
- **KT-DK2** — Form leftovers + destinations (K-11): put them in cms/forms or in integrations? Rec: cms/forms (destinations are a forms extension point; avoids cms↔integrations coupling). Blocks: K-11a/b/c.
- **KT-DT1** — (newsletter item — parked)
- **KT-DT2** — Template engines handlebars/liquidjs: add them to Jini, or keep the theme linters in Tovu behind an injected validator? (Also the older "handlebars/liquidjs → cms" question.) Rec: keep in Tovu, injected. Blocks: T-TH-02, T-TH-04.
- **KT-DT3** — The listing markup (data attribute, style marker, class names) is what installed themes style. Keep it as values the host passes in, or migrate theme CSS? Rec: host-passed values; Tovu passes today's exact strings, Jini's own default is jini- prefixed. Blocks: T-TH-03 (and admin S-POSTS/S-THEMES).
- **KT-DT4** — TipTap goes in Jini (you decided 11-15); which package gets @tiptap/* as a dependency? Rec: @jini-ai/cms (posts admin react subpath), as peer deps. Blocks: admin post editor sheets, AU S-POSTS.
- **KT-DT5** — Posts, theme and static-render files need size splits first: split in Tovu, then move? Rec: yes. Blocks: those T sheets.
- **KT-DT6** — expectedVersion: use core's stricter parser (refuses integers above 2^53 as bad input) and adapt the error in Tovu? Rec: yes; one parser, tiny behaviour change. Blocks: T-PO-01v.

## Notes second app
- **NS-N8** — Split AdminKit into a required core + optional feature kits (media, editor, lightbox), with no packaged default binding? Rec: yes. Blocks: G4.
- **NS-N9** — Desktop notes server runs as a Node sidecar, not inside Electron main? Rec: yes. Blocks: D1.
- **NS-N10** — Should AdminEntityPort.update gain expectedVersion and object arguments now, before two new adapters freeze the old form? Rec: yes (matches the args rule and lost-updates). Blocks: G6.
- **NS-N11** — Which Node runs the packaged sidecar (same as desktop OD-6)? Rec: Electron's own Node (via node-toolchain shims; SQLite built for Electron). Blocks: D2.
- **NS-N13** — May the agent edit a note's body (bodyJson)? Also changes Tovu's assistant. Rec: no; keep the deliberate absence, v1 edits titles only. Blocks: G19 (held) only.

## Desktop extraction
- **DX-OD1** — 8 Node modules shared by Tovu website and desktop (telemetry boot, startup secrets, daemon schemas, host signals): where do they live? Rec: a new Tovu workspace package @tovu/host-shared (not Jini). Blocks: D0c1, D0c2.
- **DX-OD2** — After adoption, add sender checks to 21 site-management IPC handlers and narrow who may call runner/workspace channels? Rec: yes; it is the point of the kit. Blocks: the later hardening commits only.
- **DX-OD4** — createElectronDesktopHost loses its default launcher (caller must pass one), so there is one spawn/stop in sidecar? Rec: yes. Blocks: D3c1, D3c2.
- **DX-OD5b** — Should Windows clean up orphaned site processes (new Windows reader = behaviour change)? Rec: yes, as its own sheet with a Windows packaged proof. Blocks: nothing in this plan.
- **DX-OD8** — If Jini's tab strip behaves differently from the desktop's (overflow, keyboard, close), keep the desktop's as an option? Rec: yes, unless the difference is a fix. Blocks: D6d (if it stops).
- **DX-OD9** — UI runs: Sonnet executes + Opus reviews screenshots, Opus executes the two behaviour-comparison runs? Rec: yes. Blocks: scheduling only.
- **DX-OD10** — Packaged proofs need Jini installable without a link. Who publishes snapshot versions, and how often? Rec: the release owner publishes one snapshot per landed Jini lane a P-level sheet needs; the Tovu commit pins it. Blocks: every P level (D0b, D1c2, D3a, D3b2, D3c1, D4b, D5b, D6f).
- **DX-OD12** — Add stricter checks the code lacks: an allow-list for open-external, and keeping erase targets inside scan roots? Rec: yes, as a separate hardening sheet after D4a. Blocks: nothing.
- **DX-OD13** — May Jini's chat store carry Tovu's tool-gap audit section under the same lock (with file migration)? Rec: design first; store stays in Tovu behind a port. Blocks: store part of D5b.

## Admin UI extraction
- **AU-D1** — Module runtime home: createControllerStore, errors, querySuffix, hasPermission → @jini-ai/core; useController, bindReact → @jini-ai/ui-kit/react. Rec: yes; it is the only home the import rule allows. Blocks: J4, JM pre-runs, JM1–5, ready screens.
- **AU-D2** — Admin dictionaries (66k lines): stay in Tovu with a parity test, or ship in the owner package? Rec: stay in Tovu. Blocks: JM moves.
- **AU-D3** — Pages owner path: new cms/src/pages/admin, or under entries? Rec: new pages (matches posts). Blocks: S-PAGES.
- **AU-D4** — Settings: approve the tab → owner table. Rec: none yet (after its design). Blocks: S-SETTINGS.
- **AU-D6** — Which agent-failure scanners are generic (move to chat) vs Tovu-specific (stay)? Rec: decide per scanner from S-DOCK a's report. Blocks: S-DOCK.
- **AU-D7** — Admin theme CSS packs (classic, glass; --tovu-* tokens) stay in Tovu? Rec: stay; only mechanics move. Blocks: J3.
- **AU-D8** — 4 aliases into website source + 30 admin tests importing website files: separate cleanup after A1? Rec: yes. Blocks: nothing.
- **AU-D9** — Jini admin playground stays as a dev tool? Rec: yes. Blocks: nothing.
- **AU-D10** — Rename shell classes to jini-admin-* (touches Tovu's 6,799-line styles.css)? Rec: yes, in T1b step 3 with a full Chrome check. Blocks: T1b.
- **AU-D11** — Approve the shell's two behaviour changes (unknown permissions show all-of panels; a denied URL shows "no access")? Rec: yes; no host uses the Jini shell yet. Blocks: J1.
- **AU-D12** — The security hardening list S-SECURITY run a will produce. Rec: decide after run a. Blocks: S-SECURITY b–d.
- **AU-D13** — Multi-theme registry inside Jini? Rec: not now; only when a second host needs it. Blocks: nothing.
- **AU-D14** — Delete the credential-token re-export lines (40 importers) using a port instead of a test mock? Rec: yes (your no-shells rule already says so). Blocks: A2.

## Left-out areas
- **LO-DB0** — Is there a second host that will run domain table histories? Without one, the DB lane (~2.5M tokens) builds things Tovu never runs. Rec: HOLD every DB sheet; if you name the notes app as that host, re-plan around it. Blocks: DB-1a onward.
- **LO-DB1** — "Domain exports a table-history factory, the host runs it, Tovu never does"? Rec: yes, but only matters if DB0 releases the lane. Blocks: DB-2 onward.
- **LO-SC3** — Jini's object-style source-control plugin interface has no user. Retire it, or plan a v2 with migration? Rec: retire it (no implementing module, no external users). Blocks: SC cleanup.
- **LO-SC4** — The account-label probe makes a credentialed call outside the egress and redirect guards. Approve a hardening sheet? Rec: yes. Blocks: SC-H1.
- **LO-SI1** — Add parse5 to @jini-ai/diagnostics? Rec: yes. Blocks: SI-2.
- **LO-ML1** — Add kysely to @jini-ai/platform as an optional peer (like cms does)? Rec: yes (platform, not core). Blocks: ML-2p, ML-2.

## Cross-package lanes (xpkg)
- **XP-OD5** — A Cloudflare build script bundles a cms function into a payload. Move that pure reader to core/contracts/forms? Rec: yes. Blocks: one item of R12d.
- **XP-OD6** — Packages where over 40% of tests cross packages: move them all to integration-tests, or keep /testing devDependencies? Rec: decide per package from G-TESTS T0 numbers. Blocks: G-TESTS.
- **XP-OD8** — node-pty (native) stays in the server preset, not node-adapters? Rec: yes. Blocks: nothing.
- **XP-OD3c** — Confirm: node-adapters "bindings only" means it may import platform and domain port TYPES, never a domain value. Rec: yes. Blocks: nothing unless you narrow it.
- **XP-QG1** — Chat keeps @jini-ai/db as a devDependency only, for its /testing SQL suites? Rec: yes. Blocks: C-CHAT-DEPS.

## Error system (from the build runs; not covered by the design blanket)
- **ER-6** — The error tracker gets a redacted copy, so de-duplication stops working. Rec: add exactSecrets to the tracker port and pass the original (keeps both). Blocks: E4.
- **ER-8** — If the error-ID maker fails, show ERR-0000-0000-0000-0000 so words, wire and record agree? Rec: yes. Blocks: E4.
- **ER-E2a** — Accept as built: ErrorMatch fields (#1), "warn" on duplicates needs a logger (#2), lower-tier callers get fallback words (#3), a throwing params gives no match (#5), core's ServerApiError type (#10)? Rec: yes to all five. Blocks: E3 review.
- **ER-E2b** — Sentence-mode error classes stay hidden from the model (#4)? Rec: yes for now (safer); revisit with design D12. Blocks: nothing now.

## Lost updates
- **LU-B1** — May a lost-updates step edit a file already over 500 lines if it does not grow it (= design D11)? Rec: yes, no-growth rule; updatePost and resetUserPassword named exceptions. Blocks: S1, S3, S5, S6, S9c, S9d.

## Older dropped questions (c1 audit item 9)
- **OLD-CHARTS** — Re-review charts-recharts 0.7.1 and re-pin it (boot warns, tables fallback)? Rec: yes, one small run. Blocks: clean boot.
- **OLD-VENDOR** — Vendor-names policy: move vendor names out of core (2 vendor-policy tests fail)? Rec: yes, move out. Blocks: those tests.
- **OLD-FRAMEWORK** — May functions whose signature a framework fixes (Electron IPC, Express handlers; also project-ipc handler shapes) keep positional args? Rec: yes; Tovu-declared types still convert. Blocks: args batches.
- **OLD-NEWLIB** — Wording of the new-dependency policy. Rec: "add a library only with a stated reason, in the owning package, never in core contracts." Blocks: nothing.
- **OLD-CLONES** — Delete the 7 unique-work clones (tovu-terra-d1..d5, tovu-terra-w3-db, jini-terra-w3-db) after the main merge? Rec: yes, after merge (permanent delete, so you confirm). Blocks: disk.
- **OLD-OBS** — Observability: trace visitors (consent?), wrap 5 steps after M2 or after the moves, M4 budget. Rec: after the moves. Blocks: M lane.
- **OLD-KL** — Talk through K (ACP) + L (desktop chat) before planning. Rec: schedule the talk. Blocks: those lanes.
- **OLD-QM2** — Media capability: provider list → AI suggestion → user edit wins? Rec: yes. Blocks: B-media.
- **OLD-DEDUPE** — Dedupe questions O1–O9 (O9: remove 4 public predicates in a breaking release; O8 is newsletter — parked). Rec: re-check them on today's base, then re-ask in plain words. Blocks: dedupe batch 1 (05B, 07B, 10, 11).
- **OLD-SEARCH** — Visitor search order: A–Z or relevance? Rec: relevance. Blocks: nothing.
- **OLD-TRASH** — Trash keeps items 30 or 60 days? Rec: none recorded. Blocks: nothing.
- **OLD-L2LOG** — 2 skipped log calls (json-ipc:493, langfuse:75): keep skipped? Rec: none recorded. Blocks: nothing.
- **OLD-PAGETOOLS** — Visitor page-tools plan D1–D3 + P1–P6. Rec: none recorded here. Blocks: AG S5 wants page-tools P0 first.
- **OLD-RELEASE** — Desktop 0.1.33 release (last tag is 0.1.32) and Jini commit c75a52a5c (not on any remote branch). Rec: check they are still wanted. Blocks: nothing.

---

## Covered by the 10:40 AM blanket ("take Fable's recommendations for other ODs") — confirm?
- **RF-OD2..OD9** run finalizer: OD-2 shared instance via RouteDeps, OD-3 two timer ports, OD-4 runStatus stays a number, OD-5 fix logs/silent catches after, red-first, OD-6 pin F1–F4 now, OD-8 F4 fix in recover.ts separately, OD-9 zero-arg functions exempt. **OD-7 (breaking Jini export change in the next 0.x) is needed for B1 — worth an explicit yes.**
- **AG-OD6, OD7, OD8, OD10, OD11** AG-UI: activity snapshots instead of CUSTOM; old site routes kept one release behind a flag; no shared state now; card exchange stays the only admin approval through S5; two Jini-only routes (begin, stop). (OD-3 and OD-9 were already applied by agui-s2.)
- **ER-D1..D12** error-system design (D4 withdrawn). D12 (the model sees an incident's reason) is flagged "worth a second look".
- **LU-D1..D10, D12..D14** lost-updates design (D11 is LU-B1 above).
- **DM-O3, O5..O11, O13..O15** daemon untangle (O-12 is open above: its census condition failed).

## Already answered — skip
- B07 (rotate + copy-overwrite), hooks incl. useT/useAdminLocale, 03-a (safeHref), 03-b, 02-a, reconcile D-1..D-4, B2..B6, OD-3 node-adapters, NS-N1/N2/N3/N12, AU-D0, AU-D5, desktop --no-verify patches, DM O-1/O-2/O-4.
- packages/server route-host imports vs the 11-07 "no package above domains" rule: covered by your 11-15 answer Q1 (server + cli are wiring-only host presets, explicit exception).
- uuid/clock → platform, delete @tovu/sdk re-export, piGracefulShutdownMs out of core: decided by the coordinator in auto mode 11-15 and done; say no to reverse.

## Moot
- XP-QG2 (keep 2 sqlite {db} wrappers): your 11-15 "no forwarders, delete + repoint" rule answers it.
- Chat isLocalSameOrigin barrel-mock question: C-ORIGIN-PORT landed (origin is an injected port now).
- NS-N4..N7: defaults applied, no sheet waits (single local owner sign-in; text search on the list; wave A timing; whatever CLI the daemon finds).
- KT-DT1 newsletter: parked.
