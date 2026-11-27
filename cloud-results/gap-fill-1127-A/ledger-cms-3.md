# ledger cms-3
step a: running 63 Codex test files
## step a DONE -> commit bca5e4b2
- 63 Codex files run: 8 reds. Fixed 7 (tests: forms/site publish-content fixtures, static-collections key, html-recording-revert import specifier; typecheck: derived-media-link, provider-credential-store, view-image-tool; prod: submission-evidence provenance array, document-marks hasOwn).
- LEFT RED (pre-existing at baseline): provider-credential-vault.test.ts first test conflicts with provider-credential-store.test.ts:88 ("delegates ownership validation"). BUG/conflict report.
## step b -> commit c15c8911
- html-document-store.memory.test.ts +3 tests: widget lookup (mut: drop withWidgetIds) ; trashed after read (mut: drop isTrashed block) ; lost CAS (mut: drop `if (!applied) throw`). File now L100 B88.9.
- navigation/site publish-content.test.ts +3 tests: 2nd conflict not-updated (mut: attemptsLeft>0 / drop MenuConflict branch) ; Forbidden reported + other fault rethrown (mut: swallow all / drop Forbidden branch) ; wiring error (mut: drop port check). File L88.5->97.1 (left: rollback 333-337).
- LEFT: media/site/publish-content (L90.8), import-video-conversion staged uploader 157-169, view-image-tool br 158-159,214, library-save-attachment br, rendition-access, provider-credential-store/vault branches, duplicate-asset, import-media-entity, view-video-tool, blob-store.selection, fs-files/tool-registrations, etc. (not re-measured)
