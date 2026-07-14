# Pipeline State: FEAT-008 SEO (admin section)

| Field | Value |
|---|---|
| feat_id | FEAT-008-seo |
| spec_id | SPEC-008 |
| stage | architect (ADR-PIPE-008 + implementation-outline PRODUCED — awaiting human ADR approval before `/tasks`) |
| spec_provider | speckit |
| provider_version_ref | github/spec-kit @ 2c2fea8783f33085652b8c87e839bae84a6eb78d |
| provider_native_root | specs/ |
| provider_output_root | ADS-project-knowledge/specs/008-seo |
| spec_path | ADS-project-knowledge/specs/008-seo |
| spec_entrypoint_path | ADS-project-knowledge/specs/008-seo/feature.spec.md |
| spec_readiness_artifact | ADS-project-knowledge/specs/008-seo/spec-dod.md |
| spec_support_paths | api.spec.md, state.spec.md, ui.spec.md, behavior.spec.md, errors.spec.md, traceability.spec.md, spec-manifest.md |
| spec_naming | standard |
| spec_mode | brownfield |
| spec_hash | sha256:5647a1176b49a39923b174865ecebeec4115078ec0625c6a58087815c4e0e128 |
| spec_hash_verified_at | 2026-07-13 (provider-local validator, `--phase spec --update-hash`, PASS) |
| planning_preflight_status | PASS |
| planning_preflight_checked_at | 2026-07-13T00:00:00Z |
| validator_result | PASS (`--phase spec`, exit 0). Coordinator re-ran `--phase preflight` after filling the Coordinator Sign-Off row — **PASS (exit 0)**. |
| red_team_status | NOT YET RUN |
| red_team_spec_hash | |
| governing_adr | ADR-032 (SEO Subsystem — Dogfood Bundled Plugin, Per-Entry Meta on ext Fields, page.head Render Hook, Declarative Sitemap/robots), ACCEPTED 2026-07-10 (per Coordinator directive: ADR-032 is pre-accepted; this spec translates it, it does not re-debate it) |
| pipeline_adr | `ADS-project-knowledge/reports/pipeline/008-seo/adr.md` (ADR-PIPE-008, PROPOSED 2026-07-13 — owes the human walkthrough approval ADR-PIPE-007 received, per that precedent) |
| implementation_outline | `ADS-project-knowledge/reports/pipeline/008-seo/implementation-outline.md` (PRODUCED 2026-07-13; Trigger result: Boundary Cross, Contract Change, Data And Persistence, Brownfield Dependency, Critical Cross-Boundary Invariant, Parallelization Ambiguity — System Wiring also applies per the outline's own matrix) |
| governance_adr_promotion | Not promoted. ADR-PIPE-008 applies ADR-032/039/040/028/021/006/009/027 and introduces no new durable cross-cutting rule of its own scope: the `page.head` registry, the outbox-event extension to `post`, and the `{type:"json"}` settings-schema variant are all feature-scoped extensions of existing cross-cutting mechanisms (hooks, outbox, settings ledger) rather than new cross-cutting rules themselves. If a second real `page.head` contributor or `seo.sitemap.collect` registrant lands later, that may be the point a governance ADR is warranted for the registry's promotion contract — not this pass. |
| research_artifact | N/A — no new library/technology choice is open; every dependency (routing, settings, media, identity, outbox) is an already-implemented in-repo lib per `feature.spec.md` Dependencies |
| tasks_path | Not yet produced |
| implementation_progress | Not started — spec package only |

## Notes

- **Scope:** the full ADR-032 v1 surface minus the items ADR-032 §8 itself names as
  deferred (AEO/GEO backlog, sitemap index/split, IndexNow, hreflang, raw JSON-LD
  override editor, social-preview image generation, `analyze_seo` protocol exposure).
  See `feature.spec.md` Scope for the exact in/out lists.
- **Brownfield storage decision (load-bearing, not a re-architecture):** ADR-032 §2
  assumes the generic ADR-022 `entries.fields.ext.seo.*` model exists. It does not —
  only the bespoke `posts` table (`src/features/post/post.ts`,
  `src/infra/db/schema.ts`) is implemented. This spec adds one new nullable column,
  `posts.seo_ext_json`, storing the exact `SeoExtFields` JSON shape ADR-032 §2
  already defines, so a future ADR-022 migration is a column rename, not a reshape.
  Recorded in full in `state.spec.md` §0.
- **Stub vs. spec mismatches found against `src/seo/ports.ts`/`src/seo/types.ts`**
  (documented, not silently resolved — see `state.spec.md` §5 "Stub Mismatches"):
  1. Storage attachment point (generic entries model vs. real `posts` table), per above.
  2. `SeoPermission`'s flat `seo.read | seo.meta.write | seo.settings.manage | seo.sitemap.manage | seo.analyze` vocabulary (ADR-032 §6 original text) is superseded by ADR-032's own Round-2 fold + the project-wide permission-namespace convention (`sweep-crosscutting-decisions-20260710.md` line 71) + every sibling Wave-1 ADR (029/030/033/034/035/036). This spec uses the single permission `admin.seo.manage`. **Coordinator confirms 2026-07-13:** `admin.<section>.<action>` is the owner-frozen convention (breaking-migration rationale — ADR-021 stores grants as flat strings). Redirects' spec independently reached the same conclusion. The actual gap is that Menus (ADR-029) and Members (ADR-030) already shipped WITHOUT it (`navigation.manage`/`member.manage`) despite being Wave-1 — a retroactive fix item, not something either spec should hold open.
  3. `SeoSettings.baseUrl`/`"seo.base_url"` are still present in `types.ts` even though ADR-032's Round-3 audit fold explicitly retires `seo.base_url` (single-origin-authority fix). This spec's settings surface omits `baseUrl` entirely — every absolute URL comes from routing's `canonicalUrl`.
  4. `types.ts`'s `SeoSettings.robotsPolicy: RobotsPolicy` conflates the author-writable `rules` with the server-computed `sitemapUrls` in one persisted-looking shape. This spec stores only `robotsRules: RobotsRule[]` and computes the full `RobotsPolicy` at `buildRobots()` read time.
- **Cross-cutting dependency risk noted, not owned by this spec:** `src/routing/routing.ts`'s `composeCanonicalUrl` still reads a documented `originOverride` TODO stand-in rather than calling `src/origin`'s already-implemented `OriginRegistryPort.canonicalOrigin` (ADR-040). SEO's REQ-12/INV-07 require consuming routing's `canonicalUrl` and never inventing a local origin — this is correctly a routing-owned prerequisite, flagged in `feature.spec.md` Dependencies, not fixed by this spec.
- **Zero `[NEEDS CLARIFICATION]` markers** were left open. Two non-blocking Open Questions remain (`seo.sitemap.collect` live-wiring decision; migration/index naming), both owned by Software Architect, both dated 2026-07-20.
- Runs in parallel with the sibling Redirects spec (FEAT-009, ADR-033) — disjoint files, no coordination needed at this stage.
- **Software Architect pass (2026-07-13) found 5 further real-vs-assumed drift points beyond the spec's 4 documented deviations**, all resolved in ADR-PIPE-008 rather than left for TDD/Programmer to discover mid-build: (1) no `CachePort` exists anywhere in this codebase — resolved as an in-module Map, no new port; (2) no `entry.published`/`updated`/`unpublished` outbox events exist — resolved by extending `features/post/post.ts`'s `updatePost` to emit them off a status-transition table; (3) the settings ledger's `SettingValueSchema` is deliberately scalar-only — resolved by decomposing `defaultRobots` into 2 booleans and adding one new `{type:"json"}` variant for `robotsRules` only; (4) no `page.head` injection seam exists in the real renderer (`render.ts`'s `pageShell()` is a fixed `<head>`) — resolved by adding `src/server/http/site/page-head.ts`, closing ADR-032's own Open item 3; (5) no media-ref-to-URL helper exists for `ogImage`/`twitterImage` — resolved by a small read-only helper over `media`'s existing repos. See ADR-PIPE-008 Context/Decision for full detail.
- **Red-Team has still not run for this spec** (`red_team_status: NOT YET RUN` above) — ADR-PIPE-008 proceeded per Coordinator directive to dispatch straight to Software Architect; this is flagged explicitly in the ADR's Planning Preflight Evidence rather than silently assumed complete. Recommend Red-Team run before or alongside `/tasks`, not skipped.
