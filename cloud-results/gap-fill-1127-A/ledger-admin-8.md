# ledger admin-8 (w62-cov-admin-8)
## Commit 1
- trash-api.ts: trash-api.unit.test.ts (5 tests) -> mutations: drop cursor/limit/entityTypes params, wrong path/method/body
- use-trash.hooks.ts: use-trash.unit.test.tsx (17) -> verified red: remove superseded-page guard in loadMore; others: drop loadingMoreRef lock, drop restore/purge reset, wrong fallback key, drop listUsers map
- taxonomy hooks (new-taxonomy-form, new-term-form, term-detail-panel, merge-term-section, html-embed): taxonomy-form-hooks.unit.test.tsx (19) -> verified red: remove term-switch guard in rename; others: hierarchical&&parentId, trim, fallback keys, generation arg
## Commit 2
- access-token-add/replace actions: access-token-add-replace-actions.unit.test.tsx (15) -> verified red: drop usedBy/usedByThisSite merge in replaceCustomCredential; compatibility for non-publish; same-scope filter for custom name check
## Commit 3
- taxonomy/rules.ts: taxonomy-rules.unit.test.ts (12) -> mutations: depth>32 cap, typeof count check, 404 alreadyGone, hierarchical split, dedupe
- AgentFailureCard(.hooks).tsx + agent-failure-hints: AgentFailureCard.unit.test.tsx (11) -> verified red: drop inventory generation guard; drop available===true check in switchAgent
## Left (budget): use-term-picker.hooks.ts, use-taxonomy.hooks.ts, use-term-list-reveal, Trash.tsx branches, voice-input, widgets/index.ts, security host components (AccessTokenRows/Fields/Groups/Tab), other-credential-store-operations, security-i18n, SeoIcons, Dock* small components, branch-only security files
