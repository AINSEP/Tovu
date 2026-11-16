# Owner code rules: inventory (2026-11-11)

Sources: the memory notes in `~/.claude/projects/-Users-la-Programming-Tovu/memory/` (index plus linked files) and Tovu `AGENTS.md`. Script: `development/scripts/owner-rules-audit.mjs` (rule id in brackets). Argument rule: `development/scripts/args-object-audit.mjs`. Results: `owner-rules-{tovu,jini}.json` and `.txt` in this folder.

## Packages and boundaries
- No Jini package imports another Jini package; the host wires them. Type-only imports count · owner_decisions_2026_11_07.md · CHECKABLE [jini-cross-package-import]
- `@jini-ai/core` is the only shared import and must stay a leaf with no Jini dependencies · owner_decisions_2026_11_07.md · CHECKABLE [jini-core-not-leaf]
- Shared contract types live in `core/contracts/<area>`: types only, no runtime code · owner_decisions_2026_11_07.md · CHECKABLE [core-contracts-runtime-code]
- No new package above the domains, and no `@jini-ai/server` home for domain workflows · owner_decisions_2026_11_07.md · CHECKABLE through cross-package imports; deciding where code belongs is REVIEW-ONLY
- A package states its contract and a doc comment names what typically fulfills it (e.g. "typically from `@jini-ai/ui`"); port guarantees go in the doc comment · owner_decisions_2026_11_07.md · REVIEW-ONLY
- Card builders stay in `ui` and are passed in. A package may keep an opt-in `react/` subfolder; non-UI code gets no `ui` imports · owner_decisions_2026_11_07.md · CHECKABLE [react-outside-react-subfolder] plus cross-package imports
- UI kit is injected (React only via `@jini-ai/ui-kit/react`) · from the dispatch, not found in memory in these words · partly CHECKABLE [react-outside-react-subfolder]; the rest is REVIEW-ONLY
- No specific server framework: `{ app: Server }` behind an interface, never `<domain>/express` · no_specific_server_framework_in_jini.md · CHECKABLE [server-framework-in-jini]
- Shared base types (Clock, IdGenerator, UUID, ISODateTime, JsonValue, HttpClientPort, Logger) are declared once, in core · api_args_required_then_optional_objects.md · CHECKABLE [base-type-redeclared]
- Functions take `(required{}, optional{})`, deps as ports, app values required with no defaults; keep an empty `optional = {}` on plain functions · api_args_required_then_optional_objects.md · CHECKABLE (args-object-audit.mjs)
- Injection points stay open (a registry of slot kinds), never capped · api_args_required_then_optional_objects.md · REVIEW-ONLY
- Generic code goes in Jini; Tovu keeps CMS/site code and thin adapters · reusable_code_belongs_in_jini.md, AGENTS.md · REVIEW-ONLY
- Abstract first; site-only code goes in `sites/` · abstract_first_site_specific_in_sites.md · partly CHECKABLE [site-name-in-core]
- OAuth goes through openid-client/oauth4webapi, hidden behind the `@jini-ai/oauth` facade · owner_decisions_2026_10_20.md · CHECKABLE [oauth-lib-outside-facade]

## Plugins and vendors
- Plugins never import each other; they look each other up at runtime through the host · owner_decisions_2026_10_09.md · CHECKABLE [plugin-imports-plugin]
- Agent plugins are subpaths of `@jini-ai/agent-plugins`, never `@jini-ai/plugin-<id>`; a vendor is never its own Jini package · owner_decisions_2026_11_02.md, no_vendor_code_in_core.md · CHECKABLE [jini-plugin-package-name]
- No vendor code in core. Vendor code, tests, scripts and CI steps live in the plugin; GitHub is a plugin too · no_vendor_code_in_core.md, agent_plugins_self_contained.md, owner_decisions_2026_10_09.md · CHECKABLE [vendor-import-outside-plugin], [vendor-named-file-outside-plugin], [vendor-step-in-core-workflow]
- Vendor-neutral defaults with minimal downloads; no large data files · no_vendor_code_in_core.md · partly CHECKABLE [large-data-file]; defaults are REVIEW-ONLY
- Tools are generic by category, with vendors as adapters · tools_generic_by_category_not_vendor.md · CHECKABLE heuristic [vendor-named-tool]
- One plugin per vendor; new vendor know-how goes in as a skill inside that plugin · agent_plugins_self_contained.md · REVIEW-ONLY
- Modules are contracts plus swappable provider plugins, each with one default · owner_decisions_2026_10_21.md · REVIEW-ONLY
- Per-CLI code lives in its own folder (`agent-executor/codex/`) · per_cli_code_in_own_folder.md · CHECKABLE heuristic [per-cli-code-in-shared-file]
- Model lists are discovered at run time, never hard-coded · agent_models_must_be_dynamic.md · CHECKABLE [hardcoded-model-id]
- No ownership or rights gates in import tools, skills or descriptions · no_ownership_gates_in_import_tools.md · CHECKABLE heuristic [ownership-gate-text]

## Jini neutrality and styling
- No "Tovu" anywhere in Jini: no names, IDs or paths · preserve_why_comments_on_refactor.md · CHECKABLE [tovu-in-jini]
- Jini comments cite Jini `DR-NNN` records, never Tovu SPEC/ADR/U/D IDs · preserve_why_comments_on_refactor.md · CHECKABLE [tovu-id-in-jini]
- Jini UI uses `jini-`-prefixed classes styled by the host, and never references host classes · jini_styling_prefixed_classes_host_css.md · CHECKABLE [jini-unprefixed-classname]
- Chat cards follow the host's live theme, never per-card colour literals · owner_decisions_2026_10_13.md · REVIEW-ONLY

## Code shape
- Complexity ≤ 10 per function; applied migrations are exempt · complexity_must_be_under_11.md · CHECKABLE [complexity-over-10]
- No functions inside `.tsx` components; logic lives in hooks or rules files · component_logic_belongs_hooks.md · CHECKABLE [logic-in-component] (the memory itself notes the existing code disagrees in part)
- React components take props only, with no options parameter · api_args_required_then_optional_objects.md (10-20) · CHECKABLE [component-second-param]
- Hooks stay small, separate and injectable; file count doesn't matter · hooks_files_modular_not_split_for_split.md · REVIEW-ONLY
- Why-comments move with the code and are never deleted · preserve_why_comments_on_refactor.md · REVIEW-ONLY (needs a diff: compare deleted and added comment lines)
- No `as any`, `@ts-ignore` or eslint-disable added to make checks pass · lint_jobs_check_added_disables.md · CHECKABLE totals [as-any] [ts-suppress] [lint-disable]; telling what was *added* needs a diff
- Registration-time filters run only once, so gate capabilities where they are used · append_only_module_registries.md · REVIEW-ONLY

## Errors, boot and safety
- No generic error messages: plain words plus a "Copy details" block, through one shared mechanism · no_generic_error_messages.md · CHECKABLE heuristic [generic-error-catch] [swallowed-error]
- Production warns and never refuses to boot · no_boot_refusals_no_auto_password_change.md · CHECKABLE heuristic [process-exit-in-runtime]
- Never change passwords or credentials automatically · no_boot_refusals_no_auto_password_change.md · REVIEW-ONLY
- No permanent deletes from chat; deletes go through Trash adapters · owner_decisions_2026_10_09.md · CHECKABLE heuristic [permanent-delete-tool] (a later owner setting may supersede this)
- A missing module means declaring the dependency, never lazy `import()` and never "invert via optional peer"; fix the whole class · missing_module_means_declare_never_lazy.md · CHECKABLE [lazy-bare-import] [undeclared-dependency] [runtime-import-of-devdep]
- Schema changes use ADR-066 TS migrations; the Drizzle chain is frozen at 78 · schema_changes_use_adr066_ts_migrations.md · CHECKABLE [drizzle-frozen]; never editing applied migrations is REVIEW-ONLY (diff)
- Admin copy goes through `t("full sentence")`, and a copy change touches all 21 locale blocks · admin_copy_string_i18n_key.md · REVIEW-ONLY

## Tests
- Tests assert the exact error text and type · assert_exact_error_text.md · CHECKABLE [bare-toThrow] (the one rule that scans test files)
- Coverage floor of 99% per file on all four metrics, every file in the denominator · coverage_floor_99_all_metrics.md · needs a coverage run, so not this script; [coverage-ignore] counts the suppressions
- Bug fix: failing test first, shown red, mutated, then fixed · bugfix_requires_regression_test.md · REVIEW-ONLY
- N-1 fixtures for anything persisted or exchanged · missing_module_means_declare_never_lazy.md · REVIEW-ONLY
- jsdom: never assert native `<details>` toggling; assert `defaultPrevented`, not `stopPropagation` · tests_hub.md · REVIEW-ONLY
- "jsdom tests compare strings, not DOM nodes" · from the dispatch, not found in memory · REVIEW-ONLY (ambiguous)

**Counts: 48 rules: 32 fully or partly checkable (36 script checks + args-object-audit.mjs), 16 review-only.**
