PART A COMPLETE

Bases: Tovu origin/integ/merge-11-2026-11-21 (311d26dfa6) = "T"; Jini origin/integ/merge-12-2026-11-22 (6b8e0d48a) = "J". Every commit sha cited in lines 264-973 was bulk-checked with `merge-base --is-ancestor`: 289 of 306 hex tokens are in a base; the rest are CI run ids, release-branch-only commits (whose landed twins e288e1bfc, 91333e8a8, 32dd50b44, 8cee04e97 ARE in T), or 440894028 (a Jini deletion on another line). So "FIXED <sha>" below means the fix commit is an ancestor of the base; most were spot-checked by source lookup only where noted with file:line. NOT-CHECKED rows carry a best guess. Site-theme bugs (leon-editorial, xander-estin, orvellea, jared-floyd, mingjie/open-heart, Zoran) and kUInetic library bugs are not in either repo (T only ships a minified kuinetic.all.min.js under content/themes/*/assets/vendor/kuinetic) -> UNVERIFIABLE.

id | short title | status | evidence (commit or file:line) | severity | fix direction | source line(s)
---|---|---|---|---|---|---
A001 | Chat first message 503 AGENT_DAEMON_UNAVAILABLE under load; error card shows App/Jini version/Error ID "Unavailable" | UNVERIFIABLE | load-only; readiness recovery 760b05dd6 in J; "Unavailable" fields re-seen 11-06 | — | — | 282, 409, 933, 953
A002 | kUInetic tilt-parallax: no warning when no data-depth children | UNVERIFIABLE | kUInetic source not in T/J | — | — | 283
A003 | leon-editorial Selected work timeline:view overrides data-kui-timeline | UNVERIFIABLE | owner site theme, not in repo | — | — | 284
A004 | leon-editorial no skip link | UNVERIFIABLE | owner site theme | — | — | 285
A005 | leon-editorial nav buttons 4px apart at 360-375px | UNVERIFIABLE | owner site theme | — | — | 286
A006 | kUInetic lightbox close button 40x40 (<44px) | UNVERIFIABLE | kUInetic default, library not in repo | — | — | 287
A007 | composio plugin "interrupted update could not be recovered / exclusive file lock timed out 15s" at boot, plugin kept off | OPEN | J packages/agent-plugins/src/lifecycle/update.ts:310 (message still the outcome); seen 11-02..11-06 under load | MED | lock wait at boot should not disable plugin; retry recovery in background, name the holder | 288, 339, 853, 931, 933, 969
A008 | Shared Keys picker returns only {cancelled}; can't name source site | FIXED | 0b05623ba (in T) | — | — | 289
A009 | No way to reuse/copy a key from one site to another; Shared Keys only | FIXED | 0b05623ba (in T); also covers 11-04 card never offering Shared Keys | — | — | 290, 872
A010 | /m/<slug>/original returns 404 "video rendition not found" for raster images | OPEN | T apps/website/src/server/inbound/public-http/routes/site/media-rendition.ts:652 (raster stays on re-encode path by design) | LOW | serve raster original bytes or document the public URL forms | 291
A011 | Static export drops files referenced only by scripts/data-* (hero videos, manifests) | OPEN | J packages/devops/src/static-export/transforms.ts:147-159 (script contents inert; no data-*/script crawl) | MED | crawl data-* / JSON manifests or let themes declare extra export files; warn on unresolved | 292
A012 | Theme file listing stops at 2,000 files silently | FIXED | T features/theme/__tests__/build-conformance.test.ts:384-391 ("2000-file inventory cap" issue reported) | — | — | 293
A013 | Media page Extra large same as Large at some widths | FIXED | (log) fixed in code before 11-09; not re-verified | — | — | 294
A014 | kUInetic lightbox caption overlaps counter | UNVERIFIABLE | kUInetic library | — | — | 295
A015 | kUInetic staggered groups ~100ms per chunk first-scroll stutter | UNVERIFIABLE | kUInetic library | — | — | 296
A016 | kUInetic cursor-trail builds layer under reduced motion | UNVERIFIABLE | kUInetic library | — | — | 297
A017 | ui-ux-design kuinetic-reference.md documents v0.2.4 | NOT-CHECKED | plugin moved to J packages/agent-plugins; guess still stale | — | — | 298
A018 | kUInetic lightbox overwrites authored data-kui-lightbox-src | UNVERIFIABLE | kUInetic library | — | — | 299
A019 | kUInetic wipe-up/mask-reveal with threshold never fires (clipped ratio 0) | UNVERIFIABLE | kUInetic library | — | — | 300, 303
A020 | orvellea live site shows "Calendar goes here" | UNVERIFIABLE | client site content; check live | — | — | 301
A021 | jared-floyd Bold About shows placeholder image | UNVERIFIABLE | client site content | — | — | 302
A022 | Old cookie banner Accept doesn't release YouTube; preview sandbox blocks YouTube | FIXED-PENDING | banner e54566312+9a873fd97 (J) and preview 5b7db91e9 (T) in base; "Watch on YouTube in Preview" e73e946464 on codex/tv-bugs3b | — | — | 304, 434, 592
A023 | Importing a 0.1.24 export refused | OBSOLETE | owner 10-31 won't fix old-zip compat | — | — | 305
A024 | Older zips refused with wrong advice | FIXED | 9081f631e (advice); compat won't-fix | — | — | 306
A025 | Codex chat "Cannot find module smol-toml" (packaged) | FIXED | c19aede4d (T) + 93f7ff888 (J) | — | — | 277, 590
A026 | Word/PDF reading fails (mammoth, unpdf missing) | FIXED | c19aede4d + 93f7ff888 | — | — | 278
A027 | Import refuses "credential-shaped content" on own plugin files | FIXED | bd2f0f99f + 2933fbb3f | — | — | 279, 591
A028 | Aider/Qwen model list fails @jini-ai/integrations | FIXED | 2a819ef06 + 93f7ff888 | — | — | 307
A029 | Copilot model list fails; saved "copilot" AGENT_NOT_FOUND | FIXED | 5e48b4fb5 (J), 2db8332cb, b385c64a2 + 84a87bcd1 | — | — | 308, 454
A030 | Edited built-in plugin blocks sharing | FIXED | 2933fbb3f | — | — | 309
A031 | Post with "Authorization: Bearer" refuses whole share | FIXED | 2933fbb3f (blank + notice) | — | — | 310
A032 | Plugin on/off choices dropped on import | FIXED | 9081f631e | — | — | 311
A033 | Export omission notices thrown away (use-site-transfer.hooks.ts:81) | FIXED | 2933fbb3f | — | — | 313
A034 | Import with theme "none" gets starter | FIXED | 2933fbb3f | — | — | 314
A035 | Import warnings vanish after refresh | FIXED | 2933fbb3f | — | — | 315
A036 | kUInetic on:hover binds to moved target, flicker | UNVERIFIABLE | kUInetic library | — | — | 318
A037 | kUInetic marquee timeline:view silently runs on time | UNVERIFIABLE | kUInetic library | — | — | 319
A038 | kUInetic highlight-sweep color:var() ignored | UNVERIFIABLE | kUInetic library | — | — | 320
A039 | leon-editorial theme.css :has footer selector fragile | UNVERIFIABLE | owner site theme | — | — | 321
A040 | kUInetic formatted counters slow (Intl.NumberFormat per tick?) | UNVERIFIABLE | kUInetic library | — | — | 322
A041 | kUInetic masked-label-swap shows both labels on padded buttons | UNVERIFIABLE | kUInetic library | — | — | 323
A042 | kUInetic pin-section stuck without own parent | UNVERIFIABLE | kUInetic library (docs) | — | — | 324
A043 | leon-editorial reduced motion grid fallback never applies | UNVERIFIABLE | owner site theme | — | — | 325
A044 | leon-editorial --card-w dead variable | UNVERIFIABLE | owner site theme | — | — | 326
A045 | leon-editorial dark .btn:hover unreadable | UNVERIFIABLE | owner site theme | — | — | 327
A046 | tovu-starter theme-toggle uses shared key tovu-starter:mode, copied themes share light/dark | OPEN | T content/themes/static/tovu-starter/scripts/theme-toggle.js:2 (+ __original-themes__ copy) | LOW | derive storage key from theme id/folder at render, or tell theme_duplicate to rewrite it | 328
A047 | kUInetic carousel-stack no per-breakpoint shift/rise | UNVERIFIABLE | kUInetic library | — | — | 329
A048 | leon-editorial stale screenshot/description | UNVERIFIABLE | owner site theme | — | — | 330
A049 | Every direct Jini MCP tool call renders twice (mcp__jini__X + X); ask-choice two rows | FIXED | da8a138b2 (J); Gemini bcca849ed (J) | — | — | 331, 356, 357, 573
A050 | search_tools "unknown argument max_results" wastes a turn | FIXED | 209434d6e (J) + 2f1fc8bde | — | — | 332, 496
A051 | Local test site cookie banner never closes (consent 403 loopback) | FIXED | da5ebc7c9 | — | — | 333, 435
A052 | Theme thumbnails include cookie banner | FIXED | 92247090c | — | — | 334
A053 | "Make my site look like this picture" layers override CSS on starter | FIXED | e958237f9 (guidance) | — | — | 335
A054 | "Done · 42s" timer understates (skips startup wait) | UNVERIFIABLE | J chat/core/turn-usage.ts:180 now prefers server durationMs; needs a timed live run | — | — | 336
A055 | Dashboard Appearance card stale after chat activates theme | FIXED | 3dc161838 | — | — | 337
A056 | Model picker shows raw ids under "Offline fallback"; Escape doesn't close | FIXED | J packages/chat/CHANGELOG.md:61; model-options.ts:44 | — | — | 338
A057 | Dev boot dies "More than one registered directory has this name", names no path/IDs | FIXED | J packages/platform/src/fs/workspace-directory.ts:47,51 (picks one, lists others with labels) | — | — | 340
A058 | Chat rebuilt existing theme in place and activated with no card/undo | OBSOLETE | owner rule "only perma-deletes confirm"; edits revisioned (T contracts/core/tool-metadata/theme.ts:8-9) | — | — | 341
A059 | Final summary misdescribes header menu | OBSOLETE | model wording, no code defect | — | — | 342
A060 | Publish disk-full surfaces as bare 500, errorId dropped; no warning before volume fills | FIXED | T features/publish-content/peer-transport.ts:159 keeps errorId; retention 87887c4fa + 2375af6b2 (J); pre-full warning not verified | — | — | 343, 645, 647
A061 | Just-published media shows "Skipped — Different version already on live" | UNVERIFIABLE | never investigated; needs live publish repro | — | — | 344
A062 | Static export "Duplicate file or file/directory collision" (f8) | FIXED | 315c5ab12 + d14a57ddb (J) | — | — | 345, 420
A063 | Tool-made images not shown inline; media_generate_asset/upload/replace no preview | FIXED | a3d40301a (J), 79b857d17, 96fa7bd39 | — | — | 346, 437, 463
A064 | Export picker shows folder names; button narrows | FIXED | T apps/admin/src/features/sites/StaticExportPicker.tsx:59-61 (keyed by themeId, shows name) | — | — | 347
A065 | Approval-card field titles untranslated | FIXED | 692206e72 | — | — | 348
A066 | Model name truncates "Son…" with folder attached (desktop only) | UNVERIFIABLE | not reproduced in browser; needs desktop check | — | — | 349, 504
A067 | Desktop CSP inline-style error; "Memory unavailable" 2 min | FIXED | 79b857d17 + 0c70a9eb2 | — | — | 350
A068 | Pre-existing test failures (archive progress; original.svg basePath) | FIXED | 2933fbb3f + 315c5ab12 | — | — | 351, 458
A069 | Post opens dirty when stored title differs from body title | FIXED | 129b55683 | — | — | 353
A070 | Integer bar chart gets fractional y ticks | FIXED | 6ca90820a | — | — | 354
A071 | Tool row target shows raw UUID; long names squeeze target | FIXED | 4274aa175 + 119b19480 (J) | — | — | 355
A072 | Folder-path button opens native dialog on server Mac with no note | FIXED | 74106f626 | — | — | 358
A073 | Trash tip contradicts theme-file trash wording | FIXED | 019b3f7da | — | — | 359
A074 | Trashed page shows Kind "Post" | FIXED | 8a19e3b48 + 019b3f7da | — | — | 360
A075 | Theme file restore leaves empty batch folder | FIXED | 019b3f7da | — | — | 361
A076 | Cleanup reply says seven items, moved six | OBSOLETE | model wording | — | — | 362
A077 | Tool row names cut to "Tool…" by prefix | FIXED | 984b71750 (J) | — | — | 364
A078 | Small whole-count charts pad axis to 4 | FIXED | 194095b1a | — | — | 365
A079 | Jump to latest button white in dark dock | FIXED | de24b8dae | — | — | 366
A080 | Folder-window note covers composer text | FIXED | 45a5a47ef | — | — | 367
A081 | Edit post header gear wraps at 375px | FIXED | 514685651 | — | — | 368
A082 | Slug input fixed 16rem | FIXED | dcc9d4a06 | — | — | 369
A083 | Appearance accent swatch names are hex codes (Tovu + Jini AppearanceTab) | FIXED | 7612cd1bc, d1247f318 (J) + 1e3237b8a | — | — | 370, 371
A084 | Jini swatch names untranslated in Jini dictionaries | FIXED | e044ce043 (J) | — | — | 372
A085 | ToolCard re-formats JSON every rerender | FIXED | 6ed2b12a0 (J) | — | — | 373
A086 | Page preview expand control misplaced at 375px (46px, then 4px) | FIXED | 7583cae01 + 1982c6acf | — | — | 374, 376
A087 | Charcoal swatch invisible on dark | FIXED | 39b95cefe | — | — | 375
A088 | Edit page header 6 rows at 375px | FIXED | 7b4d14afe | — | — | 377
A089 | Jump to latest covers tool-row chevron | FIXED | 91725a92d | — | — | 378
A090 | tmp admin builds never removed on :3000 restart | FIXED | 4766c3bde (legacy PID-less dirs not auto-reclaimed) | — | — | 379
A091 | Zoran site email button clipped / video preview blank / reduced-motion carousel | UNVERIFIABLE | client site; 79b857d17 may cover preview | — | — | 383
A092 | Site URL saved as https://localhost:3000 -> canonical/social point at localhost | FIXED | 315c5ab12 (request origin) + c6be8d214 | — | — | 384, 540
A093 | Media grid tiles cropped to landscape | FIXED | (log) verified in Chrome 10-31 | — | — | 385
A094 | Confirm card / tool rows show raw tool id + JSON (B3) | FIXED | 1ecd43ed9 + 613c6eaad (J); checked 11-01 s12 | — | — | 386, 495
A095 | Posts editor ignores assistant edits; old slug in URL | FIXED | (log) verified 10-31 | — | — | 387
A096 | Assistant says "deployment is running" while card waits (B1) | FIXED | (log) verified 10-31 | — | — | 388
A097 | Assistant re-asks for saved Vercel token (B2) | UNVERIFIABLE | related cross-site key fix bfdbf1be7 in T; needs a real chat | — | — | 389
A098 | Picked folder "outside allowed root" (B7) | FIXED | (log) verified 10-31 | — | — | 390
A099 | Bundled tovu-theme plugin edits fail EACCES (B12) | FIXED | 77a36d47b | — | — | 391
A100 | "Add my Calendly" fails; public CSP lacks Calendly | FIXED | 77a36d47b + 96fa7bd39 | — | — | 392, 445
A101 | Failed chat run saved as succeeded | FIXED | 096d76c89 + 054245afd (J) | — | — | 393
A102 | Desktop site with external DB shares data with copy | FIXED | 0c70a9eb2 | — | — | 394
A103 | Publish sync refused forever after content-hash bump | FIXED | 54cfd4566 | — | — | 395
A104 | Theme Explore misses agent add/remove | FIXED | (log) verified 10-31 | — | — | 397
A105 | Dock open flips Gemini key to "API key not valid" | UNVERIFIABLE | not reproduced; needs Chrome + Network tab | — | — | 398
A106 | Many admin screens show untranslated text | OPEN | broad; many screens since localized (e.g. 6e3fa94f2, Skills.tsx:1) | LOW | run hygiene-audit missing-keys report and fix per screen | 399
A107 | Sign-in password has no eye | FIXED | bc27fd73f + 31873ac5d | — | — | 400
A108 | ~35 Bash failures per session in Full CLI access (B9) | UNVERIFIABLE | needs Full-CLI chat that forces Bash | — | — | 401
A109 | check_messages via execute_delegated_tool "no tool registered" | FIXED | 054245afd (J) | — | — | 402
A110 | Antigravity can't apply per-tool limits | OBSOLETE | J agent-runtime/src/native-tool-policy.ts:74-84 refuses with a clear message; capability gap by design | — | — | 403
A111 | Desktop memory pill over-counts | UNVERIFIABLE | needs desktop | — | — | 404
A112 | node-pty not shipped; ABI-mismatch message; spawn-helper 0644 | FIXED | 66fae2eaf + 253682e3e, 8ff9f6a57 (J), 6269bc845, 99adab63f | — | — | 405, 425, 473, 711, 739
A113 | Stale "tovu-dev" desktop card; desktop sites no local sign-in | UNVERIFIABLE | needs live desktop | — | — | 406
A114 | e2e:desktop:app breaks on Node 24.2.0 | FIXED | 66fae2eaf | — | — | 407
A115 | Duplicate fake-test-site registry row | FIXED | cf793a766 + 9baaba3e8 (J); owner row cleanup is env | — | — | 408, 464
A116 | r24 leftover tests never ran | OBSOLETE | "unclear", no defect named | — | — | 410
A117 | template-render canary missing platform/net export | FIXED | dead68f76 (J) | — | — | 412
A118 | tiptap vocabulary test ajv import | FIXED | 1238a70f6 | — | — | 413
A119 | tovu-theme theme.json no templateFor | FIXED | 315c5ab12 | — | — | 414
A120 | Windows local-site env case allowlist; preload rm; dev-desktop spawns npm | FIXED | 2a819ef06 | — | — | 416, 419, 427
A121 | Desktop .js imports of .ts-only files; @jini-ai/db undeclared | FIXED | 66fae2eaf | — | — | 417, 462
A122 | smoke-native swallows load errors -> false PASS | FIXED | 2a819ef06 | — | — | 418
A123 | Staged dependency version collisions; nested gaps | FIXED | fc4f0e45e + d14a57ddb (J) | — | — | 421
A124 | AGENTS.md links missing in clone | OBSOLETE | won't fix | — | — | 422
A125 | "Retried" matches by tool name only | FIXED | b8aee6e79 (J) | — | — | 424
A126 | Test fixtures hold private keys before public push | FIXED | 9a7451e1b (J) | — | — | 426
A127 | Transfer-history keys omit user; AdminIdentityUser canRename | FIXED | 2933fbb3f | — | — | 429, 430
A128 | SEO contributor shared state; GH Pages prefix; sitemap URLs | FIXED | 315c5ab12 + b8aee6e79 (J) | — | — | 432
A129 | No deep link to a media item | FIXED | c93565260 | — | — | 436
A130 | jsdom scrollIntoView missing in agent-drive tests | FIXED | 664d06fd8 (J) | — | — | 439
A131 | Member sign-in no eye; Posts editor no external-change banner | FIXED | (log) verified 10-31 | — | — | 440, 441
A132 | tool-metadata baseline fails on new tools | FIXED | a04706e1b | — | — | 443
A133 | Undeclared hoisted ajv | OBSOLETE | tests only; guard 66fae2eaf | — | — | 444
A134 | Jini guard:drift violations; assemble test ENOENT; undici dead branch | FIXED | 5e48b4fb5, cf793a766 (J) | — | — | 447, 448, 449
A135 | Plugin BLOB column not scanned for keys | FIXED | 9081f631e | — | — | 451
A136 | Consent client over gzip budget (38 B, then 4609 B) | FIXED | 9a873fd97, 101ba56b2 (J) | — | — | 453, 545
A137 | Forced-sounding approval translations (de/it/id) | UNVERIFIABLE | needs native-speaker review | — | — | 455
A138 | wip(visitor) red tests; AC5 timeout hang | FIXED | 0690c8c07, a04706e1b, 9e75e9e47 | — | — | 456, 475
A139 | Late chunk after end re-arms idle timer; late frames mutate reply | FIXED | 84da66298 | — | — | 459, 536
A140 | Guest-token signature length compare can throw | FIXED | eee7be7c9 (J) | — | — | 460
A141 | patch-canary / guard-drift entrypoint compare no-op via /var | FIXED | da96ce4da (J) | — | — | 461
A142 | Malformed Host header broke live renders | FIXED | 315c5ab12 | — | — | 466
A143 | Theme catalog order dependent tests; ~45 publish tests broke | FIXED | 315c5ab12 | — | — | 467, 469, 478
A144 | tovu export can't pass public URL | FIXED | 8e9940e65 | — | — | 468
A145 | Import warning says plugin kept off when on | FIXED | 8e9940e65 | — | — | 471
A146 | Admin imports undeclared deps (tiptap, plugins, devtools) | FIXED | 306acf285 | — | — | 472
A147 | Message-less assert.ok can pin CPU | FIXED | c37ddbf8d | — | — | 477
A148 | exportSite silently ignores base path; CLI wording in notice | FIXED | 5c15ff7e6 + f634c9aea | — | — | 479, 571
A149 | DeployTarget doc wording | FIXED | 4a1c9bac2 (J) | — | — | 480
A150 | Throwing after hook skips later hooks (teardown) | FIXED | c7b9393c7 | — | — | 482
A151 | Mac Maintenance Sleep freezes runs | OBSOLETE | environment, mitigated with caffeinate | — | — | 483
A152 | Picked absolute path redacted as "[token removed]" | FIXED | 9d2396ee1 (J) | — | — | 485
A153 | Export "Include saved keys" fails generic; WAL CANTOPEN | FIXED | 59eb25cb0 + 3d0fbb60c (J) | — | — | 486, 506
A154 | Site theme copies never get pages-blank.html | FIXED | a4810760e | — | — | 487
A155 | Journey admin build 120s timeout under load | FIXED | d27c6c9c3 + db1de2ae5 (J) | — | — | 488
A156 | :3000 restart kills a site mid-start; site stops after restart | FIXED | cdbddddae (resume) | — | — | 489, 512, 520
A157 | Two stacked banners after assistant edit; status "version 2" stale | FIXED | f7ad44fd1, 42384d9c5 | — | — | 490, 491
A158 | Assistant says "reload it" after editor followed | FIXED | 2f1fc8bde | — | — | 492
A159 | Theme Explore Copy URL stale; Delete wording vs trash | FIXED | c1f1d2f14, 683e759e2 | — | — | 493, 494
A160 | Redaction notice stays pinned unstyled | FIXED | bc8e256af (J) | — | — | 497
A161 | Chart x-axis labels truncated; stray "·" line | FIXED | bd018de69, 47b4199e0 | — | — | 498, 519
A162 | mingjie open-heart skip link always visible; CTA unstyled | UNVERIFIABLE | client theme not in repo | — | — | 499
A163 | server.log "[consent] read failed" every second | FIXED | 209434d6e (J) | — | — | 500
A164 | New Post routes to /posts/untitled before save | FIXED | d1fd7e1eb | — | — | 501
A165 | Preview note unpadded; SOON badges on Import/Export | FIXED | 5c7d5c4b5, 329d1e157 | — | — | 502, 503
A166 | site-imports / recovery raw errors swallowed or leaked | FIXED | 88f429c25 | — | — | 507, 508
A167 | Folder formatter space-joins unquoted paths; secret after path not redacted | FIXED | b2c3f637e (J) | — | — | 509, 514
A168 | View Template 404 for inherited template | FIXED | 83d03bb8d | — | — | 510
A169 | Jini tool catalog advertises "98% retrieval" | FIXED | 11e787849 (J) | — | — | 511
A170 | shipped-theme drift canary; build.lock probe | FIXED | 83d03bb8d | — | — | 515, 516
A171 | Jini real-catalog test duplicate "Revenue" | FIXED | b2ea75b9d (J) | — | — | 518
A172 | detect-agents test finds host Claude | FIXED | 9c3945119 | — | — | 522
A173 | Duplicate skill name ~150s | OBSOLETE | test-only cost; typed refusal 88f429c25 | — | — | 523
A174 | Secrets glued to paths / hand-typed spaced path redaction gaps | FIXED | cf5571045 (J) | — | — | 525, 544, 552
A175 | Accepted residual ~0.5% glued keys escape | OBSOLETE | accepted residual | — | — | 641
A176 | Backstop send/undo raw messages, raw-row errors, case-sensitive undo, generic 500 | FIXED | 3f96988fe | — | — | 526, 532, 533, 537, 539
A177 | Sites settings raw 400 messages | FIXED | d491262b7 + eee7be7c9 (J) | — | — | 527
A178 | plugin-hook-error logs unredacted | FIXED | d491262b7 | — | — | 528
A179 | Newsletter create-campaign test flaky (wildcard listen) | FIXED | 9c3945119 | — | — | 529
A180 | Static-asset middleware reads themes once | FIXED | ae9fe327c | — | — | 530
A181 | Newsletter campaign bodyJson validated then dropped | FIXED | T features/newsletter/repo.rows.ts:102-116 (editorial_state_json) + campaign-write-service.ts:118 | — | — | 534
A182 | ~107-120 bare listen(0) test call sites | OPEN | guard c7b9477c3 baselines existing calls; migration not done | LOW | migrate baselined calls to startTestServer | 541
A183 | optional-peer-contract message drift | FIXED | c6fc0b90d (J) | — | — | 546
A184 | Specific import refusals masked by generic version advice | FIXED | 0c41ef0e5 | — | — | 547
A185 | commit-site relocation test drift | FIXED | c6be8d214 | — | — | 548
A186 | pages-blank loads kUInetic itself; chromeless canary | OBSOLETE | coordinator decision; 24ee23c39 | — | — | 549, 550
A187 | Theme test loader reads all partials vs manifest | FIXED | c7b9477c3 | — | — | 553
A188 | cookie-consent isFlags accepts inherited booleans | FIXED | 3785cb992 (J) | — | — | 555
A189 | /llms.txt used stored origin | FIXED | fbd28d4d1 | — | — | 556
A190 | Import refusals echo hostile names / raw kernel errors / whole schema; worker stderr lost then unredacted | FIXED | fbd28d4d1, 85afed951 | — | — | 557, 558, 559, 560, 563
A191 | Stale share/robots/feed tests | FIXED | fbd28d4d1, 9c7a0afdb | — | — | 561, 562
A192 | Website test helpers leak DBs / teardown races / wildcard stub | FIXED | 8b314843a | — | — | 564, 565, 566, 567
A193 | Tool row target shows nested error name; JSON reparsed per render | FIXED | 7ff16cd1f + f5373f58a (J) | — | — | 569, 570
A194 | Gemini CLI reads show "Read · (unnamed)" | FIXED | bcca849ed (J) | — | — | 575
A195 | Batched calls show no target | FIXED | bcca849ed (J) | — | — | 576
A196 | Two reads of one file at different offsets look identical | OPEN | residual noted after bcca849ed | LOW | show offset/line range in row target | 576
A197 | First call to a found tool goes out with {} args (batch wrapper drops required) | FIXED | 6cead3c98, 22cd93a7a, 7a2b4f7f9 (J) | — | — | 577, 580, 585, 586
A198 | Accessible name repeats "Tool call" | FIXED | 6ccffc6dd (J) | — | — | 578
A199 | fs_list_files root returns 144k chars | FIXED | 6f82b37de (J) + 5d264abf3 | — | — | 579
A200 | Order-free pairing can hide refused receipt | FIXED | ab7c3b92e + 1148c3bfc (J) | — | — | 581
A201 | describe_tool NOT_FOUND for renamed card ids | FIXED | 1f6312d12 | — | — | 583
A202 | BYOK search_tools description omits signature | FIXED | 1f6312d12 | — | — | 584
A203 | Read-only describe hides guidance entries | FIXED | c0f133709 (J) + 7ab029266 | — | — | 587
A204 | f2/f3/f4/f5/f6/f7 fixes "not checked in UI" list | FIXED | (log, not re-verified) e1c151a88, 471943363+dead68f76, c5b4d94f6, ef1ae2ea7, 83f78f457, f9aaf8698 all in base | — | — | 593, 594, 595, 596, 597, 598
A205 | untranslated-copy test red on real words; use-posts tests broke | FIXED | (log, spot-checked ancestry) 575210942, 86068b89d | — | — | 622, 623
A206 | Jini release build order luck (plugin-* undeclared deps) | FIXED | d61ebc363 (J) | — | — | 624
A207 | publish.yml npm@latest pack-JSON crashes; npm 12 helpers | FIXED | 2cda47532, 88e8f9fcb, 5701267ae (J) | — | — | 625, 632
A208 | Demo reel desktop clip shows other sites' names | UNVERIFIABLE | video asset; owner must check reel before public use | — | — | 626
A209 | Demo reel nimbus/higgsfield clip content issues | UNVERIFIABLE | video asset | — | — | 627
A210 | :3000 API restarts every 2 min under Codex edits | OBSOLETE | dev by design | — | — | 628
A211 | In-app Claude CLI drove Claude in Chrome, closed another tab group | UNVERIFIABLE | environment/tooling; needs owner policy | — | — | 629
A212 | No agent upload route for video >10 MB | OPEN | Chrome upload tool cap; local import 50 MiB only | LOW | accept agent upload via local file import path or chunked upload | 630
A213 | Media Upload/Import icon buttons no tooltip | NOT-CHECKED | "fixing" 11-01; guess fixed | — | — | 631
A214 | Main CI red: 6 TS errors; secrets false positives | FIXED | 46293346b + d441070a5 | — | — | 633
A215 | Site import ReferenceError savedKeys | FIXED | 46293346b | — | — | 634
A216 | local-site-supervisor TS18048 stored | FIXED | cdbddddae | — | — | 635
A217 | PROD down: boot refusal on default owner password | FIXED | b0bd02480 (refusal removed) | — | — | 636, 643
A218 | SECURITY tovu.dev owner password still the DEFAULT (owner to change manually) | UNVERIFIABLE | live-site state; owner check owed | — | — | 643
A219 | Owner's npm run dev died after reviewer rebuilt Jini | OBSOLETE | one-off environment | — | — | 637
A220 | AssistantDock "Stop during wake" test stale | FIXED | 348f83130 | — | — | 638
A221 | Symbol metadata lost on structuredClone; plan-mode overwrites description; stale eslint-disable | FIXED | ab7c3b92e (J) | — | — | 639, 640, 642
A222 | Stale running-lease lock: "Timed out waiting for file lock (holder undefined)" | UNVERIFIABLE | J platform/src/fs/directory-workspace.ts:36 same message; needs stale-lock repro | — | — | 644
A223 | Codex migration jobs in tree :3000 serves | OBSOLETE | process lesson | — | — | 646
A224 | Jini chat loads-without-driver string_decoder skip; plugin package.test devDeps | OBSOLETE | test file no longer in J base (only listed in dbpkg-chat json) | — | — | 648
A225 | Jini scripts typecheck possibly-undefined entryPath | FIXED | tsc -p scripts exit 0 after 88e8f9fcb (J) per 632 | — | — | 649
A226 | Seed-hash temp DB copy; restore-point name collisions; reset password every boot | FIXED | ae9fe327c + 1ee8b8074 (J) | — | — | 650
A227 | Folder chips: no inset, no copy tooltip, single folder repeated | FIXED | J packages/chat/src/react/components/FolderChips.tsx:23,36 | — | — | 651
A228 | Skill-drop error fills half the dock | FIXED | 47b4199e0 | — | — | 652
A229 | Folder drop notice names only last folder | FIXED | 47b4199e0 + acfe358b7 | — | — | 653
A230 | npm trusted publishing (OIDC) rejected | UNVERIFIABLE | owner's npm settings | — | — | 654
A231 | Visitor proposal strip activates navigation (fixture drift) | FIXED | a7b98c63c | — | — | 656
A232 | Site-assistant confirm refused from preview/desktop hosts; frontend-control ignores Fetch Metadata (SECURITY) | FIXED | (log, not re-verified) tovu-7b 11-01 shared origin policy allowsVisitorRequestOrigin | — | — | 657, 671
A233 | site-title AC-12 hang on title pin | FIXED | (log, not re-verified) tovu-7b | — | — | 658
A234 | Render workers load @jini-ai/agentic root barrel | FIXED | 71e70dbdc + ee923aa27 (J) | — | — | 659
A235 | Batched media_view_video returns no frames | FIXED | 771a35f48 | — | — | 660
A236 | analytics recent-hits 500 lost envelope | FIXED | cdb1e8fac | — | — | 661
A237 | Jini embed-widget globalThis.fetch; sqlite shim version; ENOENT statfs text | FIXED | c3af12b32, 33a173aec, c1b1b0594 (J) | — | — | 662, 663, 664
A238 | Visitor page.* tool translations missing | FIXED | (log) 168 strings tovu-7b | — | — | 665
A239 | Desktop main coverage 94% < 96%; observability forwarding untested | FIXED | c9dc2cb38, e288e1bfc | — | — | 666
A240 | 46 website failures untriaged; entries-routes raw boom | FIXED | (log) RT 11-01 | — | — | 667, 669
A241 | Raw exceptions logged unredacted (daemon, http-kit, core sinks) | FIXED | 7a2309dc7 + 2c40727b1 (J) | — | — | 668, 672
A242 | packed-fixture skips builtin-named deps; count-vs-identity test | FIXED | 324c837ad (J) + 8653ec06c | — | — | 670
A243 | Comments limiter not reconfigured; menu rel allowlist + _blank noopener | FIXED | ae9fe327c; ffd693690 (J) + 694a95d4e | — | — | 673, 704
A244 | auth/admin/assistant graphs load heavy roots | OPEN | perf debt per 673 | LOW | narrow imports to leaf modules | 673
A245 | redactSecrets misses x-api-key header style, quoted multi-word, JSON apiKey | FIXED | J packages/core/src/redaction-patterns.ts:133 | — | — | 674
A246 | worker-import-graph guard only sees CJS Module._load | FIXED | T .../http/site/__tests__/worker-import-graph.test.ts:49,174-205 (static source graph incl. dynamic import) | — | — | 675
A247 | HOME page legacy title pin ignored | FIXED | 4ea35f13d | — | — | 676
A248 | Visitor mode-help omits "click Allow" | FIXED | 708b06118 | — | — | 677
A249 | Jini identity reader hard-codes `tovu` namespace | FIXED | b6764eb77 (J): identityNamespace generic, legacy extensions.tovu read | — | — | 678, 763
A250 | ~20 generic agent plugins live only in Tovu | FIXED | T content/agent-plugins now only how-tovu-works, tovu-theme | — | — | 679
A251 | Vendor plugin-* packages re-created in Jini | FIXED | J packages/ has only plugin-catalog, plugin-fixture-provider | — | — | 680
A252 | Tovu commits 629 KB minified Recharts bundle, no source | FIXED | T content/plugins/ gone; charts-recharts-source.ts resolves Jini provider package | — | — | 681
A253 | Desktop coverage excludes main.ts/renderer/preloads; misleading % | UNVERIFIABLE | needs a coverage run | — | — | 682
A254 | Other-copies dialog "N other copys" | FIXED | 3d1a6281d | — | — | 683
A255 | tsconfig.main.json misses src/main/** | FIXED | bb0946f2a | — | — | 684
A256 | Coverage blind spots (route-only floors, admin not in CI, etc.) | UNVERIFIABLE | needs coverage/CI run; admin floors exist per 957 | — | — | 685
A257 | Agent-plugins reseed prunes operator copies | FIXED | 73b0f79c8 (J) | — | — | 686
A258 | site-import references through refused `repo` root (also tovu-theme B2) | FIXED | f9e056177 (J) + 7314f809f, f831c54e6 | — | — | 687, 694
A259 | Render deploy ignores options.env; Railway notes unescaped / control chars | FIXED | fc1ff4ad7, f5f1d0780, 77bdd6ee9 (J) | — | — | 688, 705, 722, 740
A260 | plugin-catalog merges face + provider sharing id | FIXED | 144b65862 (J) | — | — | 689
A261 | check-idle-motion ROOTS names moved main.ts | FIXED | bb8250e8a | — | — | 690
A262 | Desktop coverage double image (NODE_V8_COVERAGE child, tsx register) | FIXED | e288e1bfc, d8a35e0a6 | — | — | 691, 692, 700
A263 | Desktop coverage merge keeps better copy, not union | FIXED | dc9991acf | — | — | 693
A264 | Vendor-scan loadVendorRules reads only content/agent-plugins | FIXED | T features/deployments/deploy-targets/__tests__/vendor-scan.ts:96-108 reads SELECTED_AGENT_PLUGIN_PACKAGES | — | — | 695
A265 | bundled-upgrade digest supersession test | FIXED | 62faf0036 | — | — | 696
A266 | Root pinned @jini-ai/infra ^0.5.4 | FIXED | 91333e8a8 (landed twin of 6eb05b2e6) | — | — | 697
A267 | verify-package-cli redirects to linked-only Jini path | FIXED | 32dd50b44 | — | — | 698
A268 | check-gates bounded failure tail reverted; still wanted | NOT-CHECKED | f15aba574 reverted on release branch only | — | — | 699
A269 | Skill confirmation dialog hard-coded English | FIXED | 6e3fa94f2 | — | — | 701
A270 | Folder-drop success timer wipes newer error | FIXED | 5f1c6fbb0 | — | — | 702
A271 | Theme Explore copyFile skips confirmLeave (dirty buffer lost) | FIXED | 3f4bef989 | — | — | 703
A272 | Stage-payload flattens nested express/debug of non-root packages | FIXED | 785e39cdb (J) + 0ef92c015 | — | — | 706, 724
A273 | vitest-compat after hook skips cleanup | FIXED | 6d7659b0b | — | — | 707
A274 | Permanent-delete gate judges guidance by own id | FIXED | 1b4ed4f40 | — | — | 708
A275 | Root asks unpublished @jini-ai/agentic ^0.6.18 | OBSOLETE | resolved at publish | — | — | 709
A276 | Jini devops mergeCoverage keeps better copy | FIXED | J packages/devops/src/checks/coverage/lcov.ts:116-121 (union) | — | — | 710, 741
A277 | Recharts "·" glued to next word (Tovu bundle) | OBSOLETE | Tovu bundle removed; uses Jini provider (885c7adcf fix) | — | — | 712
A278 | Skills page hard-coded English | FIXED | T apps/admin/src/features/skills/Skills.tsx:1,22 (useSkillsTranslator) | — | — | 713
A279 | Menu schema text says only "rel (string)" | FIXED | 399343c1b (J) | — | — | 714
A280 | Six server callers ignore TOVU_BUNDLED_AGENT_PLUGINS_DIR | FIXED | aef024808 | — | — | 715
A281 | Desktop release dist-import guard flags tsx (daemon-supervisor, tovu-server) | FIXED | 8cee04e97, 2011e229c | — | — | 717, 730
A282 | Chart manifests lack provides capability | FIXED | f25b96633 (J) | — | — | 718, 726
A283 | plugin-host identity test scans only content/agent-plugins | FIXED | b0d9a85aa | — | — | 719
A284 | Fly host-signals Docker staging test | FIXED | (log, not re-verified) moved overlay copy | — | — | 720
A285 | No Jini test pins fly template safety settings | FIXED | J packages/agent-plugins/fly/__tests__/template-safety.test.mjs | — | — | 721
A286 | `tovu deploy config` outside root drops Chromium note | FIXED | be282de25 | — | — | 723
A287 | Staging conflict on caller-supplied root edge still refuses | NOT-CHECKED | full fix = pass each root's staged destination; Tovu sidesteps 0ef92c015 | — | — | 725
A288 | tool-catalog-query test fails on stale linked Jini dist | OBSOLETE | local stale build | — | — | 727
A289 | vitest-compat throwing afterEach skips later afterEach | NOT-CHECKED | low; guess open | — | — | 728
A290 | Shopify draft calls retired collections_entry_list | FIXED | (log) overlay uses content_read.collection_entry | — | — | 729
A291 | Staged-closure audit 41 false positives (db kernel requires, e2b CJS, shadcn tests, seal-aad, tsx) | FIXED | 93223b567, 6d2f352ed (J); 63fe0ab53, 865e4cd80, 2011e229c | — | — | 731, 732, 733, 734, 735, 736, 737
A292 | Build-time check scripts (seal-aad-invariant, secret-scan-guard) ship in payload | FIXED | 865e4cd80 (seal-aad out of dist + server-build dep guard); secret-scan-guard not re-verified | — | — | 738
A293 | pty-helpers Windows reject; new-post editor key collision; stale docs | FIXED | 28e0689db, 386631b14, 4787d55f5, 69cbea5ee | — | — | 742, 745
A294 | SECURITY same-build reseed trusts edited bundled copy; Sheets compound replay; chart provider; CI suites; as any | FIXED | 7385542c0, fefae364b, d3064f359, 3bb368176, 706790fef, 6ce15df5d (J) | — | — | 743, 746, 748
A295 | Post-publish: lockfile, fly-deploy.yml deleted path, recharts pins sha256-PENDING | FIXED | T charts-recharts-source.ts:20 (pins real); .github/workflows/fly-deploy.yml:3 uses @jini-ai/agent-plugins/fly | — | — | 744
A296 | agent-plugins node:test can't resolve @jini-ai/devops | OBSOLETE | devops is a root devDependency (J package.json:45, 16d19782d) | — | — | 747, 749
A297 | Integration clone dev server migrated owner's live DB; admin "Server restarting…" | OBSOLETE | process/environment incident | — | — | 750, 799
A298 | Theme-from-reference headlines overflow; dead hero gap | FIXED | 9063ea4f6d (ui-ux overlay fails on clipped text/overflow) | — | — | 751
A299 | Connect <plugin> sign-in card has no Skip/Cancel | FIXED | 9063ea4f6d + b6764eb77 (J) connect-card cancellation | — | — | 752
A300 | Stop/Send buttons covered by effort selector | FIXED | b6764eb77 (J) "effort selector no longer overlaps Send/Stop" | — | — | 753, 772
A301 | Agent Plugins page no signed-in status; mcp__jini__ connect red row | FIXED | 9063ea4f6d; b6764eb77 (mcp__jini__ names route) | — | — | 754
A302 | Plugin sign-in doesn't grant its own declared tools | FIXED | 09a36d561 (J) + 094813ae7 | — | — | 755, 871
A303 | external_mcp_save approval cards expire before owner answers | OPEN | 20871ad239 message: "Open: external_mcp_save card expiry (needs durable approval)" | MED | persist the pending approval so the card survives; re-issue on answer | 756
A304 | Second-tab New chat snaps back to running chat, attachment lost | UNVERIFIABLE | needs two-tab Chrome repro | — | — | 757
A305 | charts-recharts zero-value bar draws no rectangle (jsdom) | NOT-CHECKED | cloud test report | — | — | 758
A306 | Newsletter keyword ranking; supporting-files fixture overlay | FIXED | 9063ea4f6d | — | — | 759, 760
A307 | durable-json lock takeover times out; source-boundaries flag | NOT-CHECKED | cloud test report | — | — | 761
A308 | exclusive-file-lock U6 contradicts never-evict-live-owner | OPEN | owner decision pending (no record of decision) | LOW | owner picks rule; align test | 762
A309 | Theme edit/import tools replace with no card; .trash revisions no retention | OBSOLETE | owner rule: edits direct (T contracts/core/tool-metadata/theme.ts:8,225); retention not checked | — | — | 764
A310 | Consent off -> vendor analytics never forwarded (PostHog sends nothing) | OPEN | owner analytics decision still pending per 922 | LOW | owner decides; then forward anonymous events or document | 765, 910, 922
A311 | Gemini/OpenCode calls not folded; Codex special-cases server==='jini' | FIXED | no server==='jini' in J chat/agent-runtime; batch2 tests 7f36e818b (J) | — | — | 766
A312 | Tovu tests write consent receipts into real sites/tovu-dev | NOT-CHECKED | guess open | — | — | 767
A313 | npm test with TOVU_BUNDLED_AGENT_PLUGINS_DIR unset | NOT-CHECKED | — | — | — | 768
A314 | check-hardwiring 25 violations, tests tsc 37 errors, stale knownUnmeasured | NOT-CHECKED | later reports still cite hardwiring/tsc debt (897, 949) | — | — | 769, 897
A315 | Plugin row on at boot with empty lists needs restart; plugin turned on mid-session needs restart | NOT-CHECKED | 20871ad239 does not list it; guess open | — | — | 770
A316 | dev.mjs prints "API is up" after boot failure | NOT-CHECKED | — | — | — | 771
A317 | Auto chat title from mid-prompt | FIXED | 9063ea4f6d (title from subject) | — | — | 773
A318 | Wrong-arg first calls (theme_set_active, content_post_* kind, plugins_set_enabled id) | FIXED | 9063ea4f6d exact-keys errors + b6764eb77 declared aliases | — | — | 774, 778, 791
A319 | Folder chip squeezed to one letter at dock width | NOT-CHECKED | FolderChips reworked (A227); guess fixed | — | — | 775
A320 | Cookie banner still opens on fresh browser though owner chose OFF | UNVERIFIABLE | a428f27afc was WIP; needs fresh-browser check | — | — | 776
A321 | Assistant reads attachments / saved results / waits with Bash, sandbox red rows | FIXED | b6764eb77 (J) + 9063ea4f6d (tools-first) | — | — | 777, 780, 788
A322 | web_fetch_page refuses site's own localhost | FIXED | 9063ea4f6d + b6764eb77 (own origin only) | — | — | 779
A323 | {{media:slug}} unresolved in pages_write_html | FIXED | 9063ea4f6d | — | — | 781
A324 | Desktop ~3.2 GB with 2 sites (per-site daemon etc.) | UNVERIFIABLE | shared daemon + idle park landed (20871ad239); needs packaged measurement | — | — | 782
A325 | redact.ts quoted empty password= leak; nested cause leak | FIXED | b6764eb77 (J) | — | — | 783, 784
A326 | Federation connectFailureReason raw | FIXED | b6764eb77 (J) | — | — | 785
A327 | Desktop theme-preview IPC trusts window, webview passes | FIXED | 9063ea4f6d | — | — | 786
A328 | charts-recharts-source installRoot may be wrong packaged | UNVERIFIABLE | T composition/charts-recharts-source.ts:125-127 unchanged; packaged boot check owed | — | — | 787
A329 | Cover photo set as featured AND inserted in body | FIXED | 9063ea4f6d | — | — | 789
A330 | Cross-site Vercel key lookup misses disabled-host keys | FIXED | b901bc8a0 + bfdbf1be7 | — | — | 790, 792
A331 | Local site https readiness probe rejects mkcert leaf as ca -> killed at 2.5 min | FIXED | J packages/platform/src/net/local-http-probe.ts:24 (allowPartialTrustChain) | — | — | 793
A332 | Plain file path with dashes redacted as key; follow-up credential card | OPEN | no change to J chat/core/user-text-redaction.ts after cf5571045 (11-01); not re-run | MED | treat path-shaped tokens with extension as non-secret; add the 11-02 path as a table case | 794
A333 | media_replace_file keeps old provenance path | FIXED | J packages/cms/src/media/replace-media-file.ts:28 (provenance required on replace) | — | — | 795
A334 | /m/<slug>/original.mp4 404 locally | FIXED | T routes/site/media-rendition.ts:670 ("/m/:assetId/original.:ext") | — | — | 796
A335 | SECURITY /internal/tool-executions trusts wire principal | FIXED | 20871ad239 (run must be live, principal matches); env-token exposure part not verified | — | — | 797
A336 | shared-sites "repair its lease" manual instruction | FIXED | message gone from T apps/desktop/src/shared-sites.ts; shared-sites-stale-lease.test.ts | — | — | 798
A337 | No browser way to start another site with switcher off | NOT-CHECKED | maybe by design | — | — | 800
A338 | xander-estin theme screenshot generic; preview bar on public site; pinned cards cut; 320px overflow; film-strip counter | UNVERIFIABLE | client site themes not in repo | — | — | 801, 804, 806, 807, 811
A339 | Consent-gated publish refusal hides the two choices | UNVERIFIABLE | T contracts/core/consent-refusal.ts:6 carries blockingProblems; UI check owed | — | — | 802
A340 | Static publish project name blank though history has it | NOT-CHECKED | — | — | — | 803
A341 | Claude in Chrome resize_window doesn't resize | OBSOLETE | external tooling | — | — | 805
A342 | Boot refusal when site already runs on another port | FIXED | T apps/website/src/platform/site-dir/site-running.ts:24-29 (attaches instead of refusing) | — | — | 808
A343 | ui-ux-design plugin gates pinned effects above md; no 100svh/scrollWidth rules | NOT-CHECKED | 9063ea4f6d added overflow checks; mobile pin rule guess open | — | — | 809
A344 | kUInetic distance:var()/offset var() fallback rejected | UNVERIFIABLE | kUInetic library | — | — | 810, 869
A345 | Tooltip never shows on touch tap | FIXED | J packages/ui/src/react/components/TooltipLayer.tsx:218-222 | — | — | 812
A346 | Share create fails generic, nothing logged (site-shares fail()) | NOT-CHECKED | share failures now via sendSiteShareFailure (site-share-password.ts:53 per prior triage); logging not verified | — | — | 814, 815, 816
A347 | Fresh-content bootstrap behind 0036/0037 | FIXED | (log) reconcile landed with integration | — | — | 818
A348 | Export refuses/warns on first-party plugin docs (SECRET_IN_CONTENT); 60-file warning noise; plugin tests shipped | OPEN | prior triage C9-1: warned-file refusal vs acknowledgement still an owner decision | MED | owner decision: skip signed first-party plugin files from scan and stop shipping plugin __tests__ | 819, 820, 838
A349 | Static export front page is a bare "Open website" link | FIXED | T features/site-backup/static-download-landing.ts (landing with cards) | — | — | 823
A350 | Daemon toolRegistry contract wider than use; plugin isolation name collision; RAF teardown; stale pins; LICENSE | FIXED | 65aff68ca, c87d6dead, 3ab4a4070, 27aef5955, 21114234f (J) | — | — | 827, 828, 829, 830, 831
A351 | desktopMcpHttp stale VM fixture | OBSOLETE | test-only | — | — | 832
A352 | 28 more changed test files fail (Recharts INTEGRITY_FAILED etc.) | NOT-CHECKED | later reports: stale recharts pin fixed (936) | — | — | 833, 897
A353 | serve-command boot timeouts at load 29 | UNVERIFIABLE | load; rerun quiet | — | — | 834
A354 | Static export landing takes <title> from HTML comment | FIXED | T static-download-landing.ts:13 (comments stripped first) | — | — | 837
A355 | Export "Show files" crammed; Type column; Revoke/activate layout shift; same thumbnails; <44px targets | NOT-CHECKED | UI items, Chrome check owed | — | — | 839, 840, 841, 842, 844
A356 | Site start ~2.5 min at load 27; import/Quick Look not checked | UNVERIFIABLE | load / manual checks | — | — | 843, 845
A357 | POST /api/frontend-sessions/activate 503 ~9x per session, silent | UNVERIFIABLE | cause unknown; needs live chat network capture | — | — | 848
A358 | theme_list_files {} arrives as {"input":"{}"}; schema "the the" | NOT-CHECKED | arg-recovery b6764eb77 may cover | — | — | 849
A359 | Antigravity cards out of order, no progress 59s, repeated full-access notice | NOT-CHECKED | — | — | — | 850
A360 | OpenCode block message squeezed, wrong settings path | NOT-CHECKED | J 6f507852d mentions "OpenCode message"; guess fixed | — | — | 851
A361 | "Loading Tovu…" 8-20s per route; /admin/assistant shows Dashboard | NOT-CHECKED | load; route alias not found | — | — | 852, 969
A362 | site-plugin-directories.test.mjs explicit overrides fails at HEAD | NOT-CHECKED | — | — | — | 854
A363 | Packaged server reaches require('electron'); devDep tsx/cli in shipped graph | FIXED | 9c3425a37 (J) + c9e781260; 2cfddd85d | — | — | 855, 856
A364 | 2:56 demo reel never published to tovu.dev | UNVERIFIABLE | live site content | — | — | 857
A365 | Replaced media keeps old ?v= cache-buster | FIXED | inferred: T features/media/public-path.ts:62 (v = sha prefix) + replace updates sha256 | — | — | 858
A366 | Replaced media can't reach live (sha256 write-once); "Published 0 changes" | FIXED | T features/media/import-media-entity.ts:8-9,55-57 (replace-on-import path) | — | — | 859, 861
A367 | Gemini rejects site_guide schema, every visitor chat fails | FIXED | e86271780 | — | — | 860
A368 | Desktop second site's assistant can't start (workspace-local scope) | FIXED | (log, not re-verified) fixed in 0.1.28 | — | — | 862
A369 | 3 agent-daemon-server tests fail at HEAD | NOT-CHECKED | — | — | — | 863
A370 | Running site card "Memory unavailable" | UNVERIFIABLE | desktop | — | — | 864
A371 | Run ends with generic "could not start this execution attempt" | FIXED | T inbound/assistant/agent-daemon-run-start.ts:178 passes startup stage + error | — | — | 865
A372 | Built-in theme preview bar in page flow, left-aligned | FIXED | 2c0439a31 | — | — | 866
A373 | Higgsfield OFF: assistant offers API-key card for OAuth plugin | NOT-CHECKED | — | — | — | 867
A374 | kUInetic scroll-progress-ring timeline:scroll acts as clock | UNVERIFIABLE | kUInetic library | — | — | 868
A375 | Interrupted chat recovery after quit: generic failure | UNVERIFIABLE | needs desktop quit-mid-run repro | — | — | 870
A376 | theme_write_file overwrite opens approve card every call | FIXED | T contracts/core/tool-metadata/theme.ts:213-225 (confirmation 'direct') | — | — | 873
A377 | Message sent during a run shows twice; "Sending…" sticks | UNVERIFIABLE | needs live chat | — | — | 874
A378 | Restarted site refused: scope belongs to another server boot | FIXED | T apps/desktop/src/desktop-agent-service.ts:205 (register allows newer boot); :70 plain text | — | — | 875
A379 | Finalizer checkpoint retry CPU spin | FIXED | (log) Codex fix-4 | — | — | 876
A380 | Static publish (Vercel) tool timeout; no landed? status | NOT-CHECKED | guess open (MED) | — | — | 877
A381 | SiteStartPanel shows details only for 'error' | FIXED | T apps/desktop/src/renderer/app/SiteStartPanel.tsx:107 ('failed') | — | — | 878
A382 | Vite prebundled deps cache keeps old @jini-ai/chat after install | OPEN | no .vite/deps invalidation in T development/scripts | LOW | dev.mjs: force optimizeDeps when @jini-ai versions change | 879
A383 | Forms audit: 12 High findings (notify failures swallowed, export not disabling forms, import classification, Cloudflare receiver) | NOT-CHECKED | sample fixed: J cms/src/forms/notify-subscriber.ts:157-158 durable rethrow; other 11 not verified | — | — | 880
A384 | Item 25 phase 1 would remove site keys at boot | OBSOLETE | uncommitted plan, redesigned | — | — | 881
A385 | Antigravity fullCliAccessOnly silently turns on all capabilities | FIXED | J agent-runtime/src/native-tool-policy.ts:46-50 (policy returned unchanged), :74-84 refusal | — | — | 882
A386 | Agent config repaired before consent; no backup | FIXED | code moved to J (cb609baa0b); T .../ensure-json-agent-install.unit.test.ts:22-71 pins consent, backup, foreign entry | — | — | 883
A387 | SECURITY typed-answer path skips exchange id for secret cards | FIXED | T apps/website/src/assistant/mcp-ui-tool-calls.ts:70-82 (typed answers only for ask_choice) | — | — | 884, 888
A388 | SECURITY MCP OAuth sign-in has no browser binding | FIXED | 2480627b2d browser-binding regression test in T (sec job 11-05) | — | — | 885
A389 | Secret field named freeText shows as answer | FIXED | J packages/ui/src/features/mcp-ui/secret-card.ts:74 (reserved) | — | — | 886
A390 | Federated results don't scrub connection's own token | FIXED | J packages/mcp/src/federation/adapter.http.ts:368 | — | — | 887
A391 | SECURITY WebMCP agent can approve its own protected page actions | FIXED | 13984638e0 (protected page actions via human chat cards); respond_page_approval gone | — | — | 889
A392 | SECURITY region handle adopts first untagged control (Reveal) | FIXED | J packages/agentic/src/core/dom/dom-page-driver.ts:357-378 (label-associated fields only) | — | — | 890
A393 | OAuth refresher loads token before lease | FIXED | J packages/oauth/src/refresh.ts:135-146 (reload under lease) | — | — | 891
A394 | Release bumping catalog without provider-plugins mismatches digests | NOT-CHECKED | guess open (release guard) | — | — | 892
A395 | Cloudflare/Vercel manifest versions unchanged while payloads changed | NOT-CHECKED | — | — | — | 893, 943
A396 | Public GET posts/:slug drops bodyHtml | FIXED | T inbound/public-http/http/shared/post.ts:47 | — | — | 894
A397 | Direct {"type":"form"} markers may not be tracked by safe-delete | NOT-CHECKED | — | — | — | 894
A398 | Whole-posts read per uncached rendition; every image no-cache rehash | FIXED | T routes/site/media-rendition.ts:278,585 (media access evidence cache) | — | — | 894, 916
A399 | AssistantMessageRow complexity 15 | NOT-CHECKED | complexity gate 10 since 11-13; guess fixed | — | — | 895
A400 | Consent new banner path doesn't make authored optional scripts inert | NOT-CHECKED | — | — | — | 896
A401 | Restricted Codex chats refuse bridge tools (approval policy never) | NOT-CHECKED | — | — | — | 898
A402 | Client timestamps overwrite server durationMs | FIXED | J packages/chat/src/core/turn-usage.ts:180 | — | — | 899
A403 | Packaged chat refused "site catalog refused (403)" | OBSOLETE | not an app bug (release check), b9827ffb1 | — | — | 900
A404 | commerce_resolve_unknown has no approval card | FIXED | T contracts/core/tool-metadata/commerce.ts:12 (publish/plan) | — | — | 901
A405 | Clean-checkout builds fail (contracts prepare; commerce before ui) | NOT-CHECKED | — | — | — | 902
A406 | In-memory rendition 500s; secret-sentinel guard fails | NOT-CHECKED | — | — | — | 903, 940
A407 | provider-plugins catalog omits formspree; complexity | NOT-CHECKED | — | — | — | 904
A408 | agent_plugin_connect reruns grants w/o approval; HumanConfirmer kind 'user' from delegating ID | NOT-CHECKED | — | — | — | 905, 914
A409 | Forms delivery copies answers per destination; tokenless submissions collapse; duplicate DOM IDs | NOT-CHECKED | — | — | — | 906
A410 | commerce_get_status no approval class stops app boot | FIXED | (log) full-tests 936 | — | — | 907
A411 | tovu-theme skill says data-consent-category; trackers run before consent | FIXED | no data-consent-category in T content/agent-plugins; J cookie-consent client/dom.ts:51 gates text/plain | — | — | 908
A412 | One failed/slow policy read removes banner (boot, refresh, extra app builds) | FIXED | T inbound/public-http/middleware/site-cookie-consent.ts:248,259,378-413 (last good policy kept) | — | — | 909, 924, 927
A413 | Consent medium/low items (theme-override renders, ungated scripts, cookie link, reload loop, plugin embeds, publish reports failure) | NOT-CHECKED | combine-review items; not traced | — | — | 910, 911, 928
A414 | Declined access card undone at restart (boot grant) | FIXED | T features/agent-plugins/apply-connect-defaults.ts:16,76 (decline recorded) | — | — | 912, 925, 926
A415 | agent_plugin_connect operator row; external_mcp_save form path; re-enable refused | NOT-CHECKED | — | — | — | 913
A416 | Consent-capture / form-file-cleanup / recharts integrity test reds | NOT-CHECKED | — | — | — | 915
A417 | /products commerce scans; json-line large frame; custom model effort; forms_list full HTML; 50 MiB doc read | NOT-CHECKED | — | — | — | 917
A418 | Forms/commerce 10 Low (double submit, commerce routes shadow pages) | NOT-CHECKED | — | — | — | 918
A419 | Google Forms iframe 300x150 | FIXED | J packages/cms/src/forms/html-render.ts:229-232 | — | — | 919
A420 | Google Forms medium items (catalog test, invalid link saves, regex, restart, headers) | NOT-CHECKED | 922 says invalid provider link still saves as success | — | — | 920, 922
A421 | jared-floyd static export: llms.txt "# Tovu", stray date, "ADD YOUR CONTACT EMAIL" | NOT-CHECKED | client-facing; check llms.ts header source + privacy template | — | — | 921
A422 | Review-fixes leftovers (host provider pin, raster fixtures, admission budget, launch fixtures) | NOT-CHECKED | — | — | — | 923
A423 | Static themes get no cookie banner/loader; member pages lack loader | NOT-CHECKED | consent work later (361718ac0b etc.); guess fixed | — | — | 924, 951, 952
A424 | Secret scanner quadratic on long dashed text | FIXED | (log) full-tests 936 | — | — | 929, 936
A425 | Every CLI stops at prelaunch "Settings Set Value" consent card even with no tools | NOT-CHECKED | 3d19ca0322 discloses prelaunch access; card still expected by design? | — | — | 930
A426 | Dev boot generic composio error; 390px buttons cover row actions; stale "Include saved keys" copy | NOT-CHECKED | composio part = A007 | — | — | 931
A427 | UI batch a2/b/b2/b3/c items (expired card text, Pi raw JSON, cred counts differ, composio/shopify not recognised, posts.body_html flagged, import no cancel, <44px, jump button overlap, duplicate tab label, queued message vanishes, model auto-switch, consent card IDs, $& title) | NOT-CHECKED | many; some later fixed (fixes-small, 953) | — | — | 932, 933, 934, 937, 939
A428 | full-tests cap hit, not green | OBSOLETE | run status, superseded by later runs | — | — | 935
A429 | /commerce/return/ trailing slash; buyer after commerce off; settlement/site-exporter reds | NOT-CHECKED | — | — | — | 938, 939
A430 | Startup secrets (TOVU_ADMIN_PASSWORD, desktop MCP token) stay in server env | NOT-CHECKED | security-adjacent; STARTUP_SECRET_KEYS names three keys | — | — | 914, 941
A431 | Open Marketing public history holds security notes/client screenshots | UNVERIFIABLE | other repo; owner decision | — | — | 942
A432 | tovu-starter render/pages differ from __original-themes__ copy | NOT-CHECKED | — | — | — | 944, 947
A433 | SiteExportTab test fails; fake-test-site no config.json; stale ADR text | NOT-CHECKED | — | — | — | 945
A434 | Codex ui-review: renderer loader Node 24; tab lifecycle; payment-return fallback; tab-close race | NOT-CHECKED | — | — | — | 946, 967
A435 | open-fixes/one-card-rest/ci-errors/fix-round/older-fixes leftovers (cached media URLs, confirmation hashes, mail 500, __proto__, 320px width, Cloudflare forms resolve, batching strips previews) | NOT-CHECKED | — | — | — | 947, 948, 949, 950
A436 | Deployment Overview says admin password not set after secrets leave env | FIXED | T deployment-overview.ts:71,147 (reads stored hash) | — | — | 951
A437 | Final-review-2 items (loader 503 export ok:true, coverage floors, Stop/Keep running loses memory cap, stale plugin card, mailer lane) | NOT-CHECKED | — | — | — | 952
A438 | Old bundled plugin copies make every export refuse ("multiple installed digests") | FIXED | T features/site-backup/archive-extensions.ts:33 (superseded bundled revisions filtered first) | — | — | 953
A439 | Approval cards show person UUID/site id/Revision 0; cancel shows red error; second queued label unboxed; export columns jump | NOT-CHECKED | UI, Chrome check owed | — | — | 953, 934, 969
A440 | last-fixes leftovers (baseline drift, CLI export exit 0, v1 mail hyphen IDs) | FIXED | (log) 962 lists CLI export + v1 mail IDs fixed (64774ab69); baseline drift not verified | — | — | 954, 963
A441 | Desktop Import button opens random site's Import page | FIXED | c4c6c4d48, 015941acb, bf68d6758 (Import page) | — | — | 955
A442 | tests-jini / tests-tovu-apps / tests-tovu-site OPEN lists (coverage 97.78%, Gitleaks 347, worker graph, etc.) | NOT-CHECKED | run reports; individual items not traced | — | — | 956, 957, 962
A443 | Desktop Import: no share link/zip path; App.render hang; shared labels | NOT-CHECKED | — | — | — | 958
A444 | Open Marketing seed loop / restore digest order | UNVERIFIABLE | Open Marketing repo, out of scope | — | — | 959, 960
A445 | Imported site owner password random, never shown; sign-in path unproven | NOT-CHECKED | 964 FIXED Reset owner password 17f636a9f | — | — | 961, 964
A446 | Recovery code new-password autocomplete may save code as password | UNVERIFIABLE | needs real Chrome save-password check | — | — | 963
A447 | Reset owner password 403; import page hangs on bad child; quit mid-import orphan; imported site opens stopped | FIXED | 17f636a9f, 8cde227f1, bf68d6758 | — | — | 964, 965
A448 | Tampered zip message only "size or SHA-256 mismatch"; Import page centred; export-run.ts:149 tsc error | NOT-CHECKED | — | — | — | 964
A449 | SECURITY imported theme scripts run on admin origin with no review (F1) | FIXED | 77c28cfa2 + 73fa8a730 (non-identical themes stay off, script pages land as drafts) | — | — | 968, 970
A450 | Separate origin for themes (real F1 class fix) not built | OPEN | 970: "Real fix = separate origin for themes (not built)" | security | serve theme/page HTML from a separate origin from admin | 970
A451 | Import F2-F11 (auto-start migrates folders, Windows cleanup, SIGKILL, Cancel, tokens in history) | FIXED | 75231e82c + 73fa8a730 (F3-F11); Windows/packaged unproven | — | — | 968, 971, 972
A452 | .import-quarantine has no turn-on path; edited starter lands on no theme | OPEN | 970 open list; not re-checked | LOW | add an Activate/restore path for quarantined themes | 970
A453 | Starter theme and admin load Google Fonts (third-party request vs consent) | OPEN | T content/themes/static/tovu-starter/css/theme.css and apps/admin/src/admin-themes/classic/admin.css reference fonts.googleapis | LOW | self-host the fonts | 971, 972
A454 | ui-look-2 items (save banner says post, raw "boom", cancelled cards "Answered", plugin card noise, raw row names, dark swatch, 390px clipping) | NOT-CHECKED | UI, Chrome check owed | — | — | 969

## Possible duplicates of later sections
- composio "interrupted update / exclusive file lock" boot error (A007) — likely recurs in later dated sections.
- Error card "Error ID / App version Unavailable" (A001) — recurs in later UI batches.
- external_mcp_save card expiry (A303).
- Path-with-dashes redaction false positive / "[token removed]" (A332).
- Separate origin for themes / imported theme scripts F1 (A449, A450).
- Google Fonts third-party request (A453).
- Cookie banner off by default / static themes no banner / consent loader (A320, A423).
- Vite prebundled deps cache stale after Jini install (A382).
- tovu-starter `tovu-starter:mode` storage key (A046).
- Static export misses script/data-* referenced files (A011).
- Recharts integrity pin / charts-recharts (A252, A295, A328).
- Two-tab chat / queued message duplicates (A304, A377).
- jared-floyd static export llms.txt "# Tovu" (A421).
- Desktop memory ~3.2 GB / Memory unavailable (A324, A370).
- Antigravity full-CLI-only (A110, A385).
