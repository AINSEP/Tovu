# L14 — Tovu website remaining features + cli (Stryker measure-only) — INTERIM 18:19Z
Runner: tap-runner (node:test via tsx), per-file scoped testFiles (≤4 test files importing the mutated file), concurrency 4, Node 24.22, no source/test edits. Queue risk-first by feature dir, small files first within a dir.
## Headline
- 74 files scored, 9689 mutants (killed+timeout 6299, survived 1091, no-coverage 466); score **80.2%** (StringLiteral excluded, type checks off, tap-runner file-granular, coverageAnalysis off).
- Files with no unit test importing them (NOTESTS): 13. Files whose scoped test run failed in the dry run (not scored): 15. Files never reached (NOT RUN): 513.

## Per-file table (worst first)
| file | mutants | killed | timeout | survived | no-cov | score |
|---|---|---|---|---|---|---|
| features/custom-credentials/plugin-credential-card.ts | 173 | 3 | 0 | 2 | 133 | 2.2 |
| features/publish-content/precheck-reasons.ts | 16 | 1 | 0 | 4 | 3 | 12.5 |
| features/post/repo.memory.ts | 242 | 66 | 0 | 47 | 122 | 28.1 |
| features/pages/agent-tools.ts | 222 | 15 | 0 | 29 | 0 | 34.1 |
| features/custom-credentials/custom-credential-create-ui.ts | 106 | 27 | 0 | 23 | 11 | 44.3 |
| features/post/repo.ts | 214 | 35 | 1 | 8 | 35 | 45.6 |
| features/pages/html-document-store.memory.ts | 132 | 60 | 0 | 43 | 8 | 54.1 |
| features/publish-content/export-bundle.ts | 110 | 57 | 1 | 17 | 31 | 54.7 |
| features/deployments/deploy-ops/typed-secret-card.ts | 128 | 60 | 2 | 28 | 8 | 63.3 |
| features/post/search.ts | 100 | 54 | 2 | 29 | 3 | 63.6 |
| features/publish-content/raw-row-contributor.ts | 462 | 267 | 0 | 126 | 13 | 65.8 |
| features/publish-content/content-hash.ts | 35 | 16 | 0 | 8 | 0 | 66.7 |
| features/post/slug.ts | 39 | 24 | 0 | 11 | 0 | 68.6 |
| features/pages/hidden-until-script.ts | 169 | 99 | 0 | 43 | 0 | 69.7 |
| features/post/search-index.postgres.ts | 51 | 19 | 0 | 6 | 2 | 70.4 |
| features/deployments/deploy-config-registry.ts | 330 | 208 | 0 | 53 | 30 | 71.5 |
| features/post/reverters.ts | 104 | 70 | 0 | 16 | 10 | 72.9 |
| features/post/expected-version.ts | 22 | 14 | 0 | 2 | 3 | 73.7 |
| features/publish-content/repo-handler.ts | 213 | 152 | 0 | 25 | 19 | 77.6 |
| features/deployments/deploy-config.ts | 99 | 53 | 0 | 12 | 3 | 77.9 |
| features/publish-content/gated-hooks.ts | 49 | 34 | 0 | 8 | 1 | 79.1 |
| features/publish-content/connect-destination.ts | 37 | 28 | 0 | 7 | 0 | 80 |
| features/publish-content/raw-file-contributor.ts | 369 | 256 | 0 | 62 | 0 | 80.5 |
| features/publish-content/push-plan.ts | 64 | 48 | 0 | 11 | 0 | 81.4 |
| features/publish-content/media-references.ts | 224 | 160 | 1 | 36 | 0 | 81.7 |
| features/custom-credentials/credential-copy-tool.ts | 390 | 218 | 16 | 35 | 13 | 83 |
| features/post/html-plain-text.ts | 145 | 87 | 4 | 18 | 0 | 83.5 |
| features/publish-content/bundle-staging.ts | 45 | 36 | 0 | 7 | 0 | 83.7 |
| features/deployments/deploy-ops/run-ops.ts | 478 | 335 | 11 | 55 | 9 | 84.4 |
| features/publish-content/backstop-preview.ts | 111 | 79 | 0 | 14 | 0 | 84.9 |
| features/publish-content/backstop-policy.ts | 176 | 124 | 0 | 21 | 0 | 85.5 |
| features/post/search-index.ts | 121 | 58 | 12 | 9 | 2 | 86.4 |
| features/deployments/deploy-ops/registry.ts | 316 | 231 | 0 | 34 | 0 | 87.2 |
| features/publish-content/file-blob-index.ts | 25 | 20 | 1 | 3 | 0 | 87.5 |
| features/deployments/deploy-ops/secrets.ts | 368 | 270 | 0 | 36 | 0 | 88.2 |
| features/publish-content/disconnect-tool.ts | 48 | 30 | 0 | 3 | 1 | 88.2 |
| features/deployments/deploy-targets/host-kit.ts | 107 | 84 | 7 | 12 | 0 | 88.3 |
| features/publish-content/content-references.ts | 80 | 53 | 0 | 7 | 0 | 88.3 |
| features/post/publish-content.ts | 338 | 244 | 0 | 30 | 0 | 89.1 |
| features/custom-credentials/vault-repo.ts | 199 | 162 | 0 | 14 | 4 | 90 |
| features/post/search-index.memory.ts | 14 | 9 | 0 | 1 | 0 | 90 |
| features/publish-content/file-tree-policy.ts | 419 | 262 | 0 | 28 | 0 | 90.3 |
| features/site-backup/import-verifier.ts | 22 | 19 | 0 | 2 | 0 | 90.5 |
| features/publish-content/composite-blob-source.ts | 40 | 31 | 0 | 3 | 0 | 91.2 |
| features/post/cover-image.ts | 270 | 224 | 4 | 21 | 0 | 91.6 |
| features/post/go-live.ts | 75 | 64 | 0 | 5 | 0 | 92.8 |
| features/post/template-options.ts | 15 | 14 | 0 | 1 | 0 | 93.3 |
| features/publish-content/peer-url.ts | 83 | 56 | 0 | 4 | 0 | 93.3 |
| features/deployments/static-publish/inspection.ts | 52 | 43 | 0 | 3 | 0 | 93.5 |
| features/publish-content/backstop-service.ts | 324 | 265 | 0 | 18 | 0 | 93.6 |
| features/post/featured-image.ts | 59 | 46 | 0 | 3 | 0 | 93.9 |
| features/publish-content/seed-hash.ts | 17 | 16 | 0 | 1 | 0 | 94.1 |
| features/post/content-stats-tool.ts | 207 | 161 | 0 | 10 | 0 | 94.2 |
| features/deployments/export-run.ts | 62 | 47 | 3 | 3 | 0 | 94.3 |
| features/post/repo.rows.ts | 74 | 66 | 0 | 2 | 2 | 94.3 |
| features/publish-content/destination-credential.ts | 21 | 17 | 0 | 1 | 0 | 94.4 |
| features/deployments/deploy-targets/registry.ts | 550 | 449 | 0 | 21 | 0 | 95.5 |
| features/custom-credentials/credential-recovery.ts | 28 | 22 | 0 | 1 | 0 | 95.7 |
| features/publish-content/report-labels.ts | 146 | 127 | 0 | 4 | 0 | 96.9 |
| features/custom-credentials/write-files-validation.ts | 193 | 148 | 0 | 4 | 0 | 97.4 |
| features/post/duplicate-embeds.ts | 59 | 45 | 10 | 1 | 0 | 98.2 |
| features/custom-credentials/auth-schemes.ts | 46 | 41 | 0 | 0 | 0 | 100 |
| features/deployments/publish-credentials/account-label-heal-scheduler.ts | 27 | 25 | 0 | 0 | 0 | 100 |
| features/deployments/publish-credentials/execution-mode.ts | 8 | 4 | 0 | 0 | 0 | 100 |
| features/deployments/static-publish/domain-publish-rows.ts | 86 | 64 | 0 | 0 | 0 | 100 |
| features/post/repo.sqlite.ts | 1 | 1 | 0 | 0 | 0 | 100 |
| features/post/search-index.sqlite.ts | 35 | 17 | 0 | 0 | 0 | 100 |
| features/publish-content/apply-errors.ts | 2 | 1 | 0 | 0 | 0 | 100 |
| features/publish-content/baseline-repo.ts | 6 | 5 | 0 | 0 | 0 | 100 |
| features/publish-content/blob-staging.ts | 13 | 11 | 0 | 0 | 0 | 100 |
| features/publish-content/execute-import.ts | 10 | 6 | 0 | 0 | 0 | 100 |
| features/publish-content/run-repo.ts | 33 | 31 | 0 | 0 | 0 | 100 |
| features/site-backup/share-preparation.ts | 34 | 30 | 0 | 0 | 0 | 100 |
| features/pages/skeleton.ts | 1 | 0 | 0 | 0 | 0 | n/a |

## Dry-run failed (not scored — ENV/test-load failures; mostly @jini-ai export mismatch because the Jini clone was not permitted in this run)
- features/post/preview-tool.ts (rc=1)
- features/pages/html-document-store.sqlite.ts (rc=1)
- features/publish-content/publish-readiness.ts (rc=1)
- features/publish-content/agent-tools.ts (rc=1)
- features/deployments/static-publish/domain-publish-tool.ts (rc=1)
- features/deployments/dockerfile.ts (rc=1)
- features/deployments/tool-registrations.ts (rc=1)
- features/deployments/deploy-ops/tool-registrations.ts (rc=1)
- features/deployments/static-publish/publish-run.ts (rc=1)
- features/deployments/static-publish/publish-history.ts (rc=1)
- features/deployments/static-publish/credentials.ts (rc=1)
- features/deployments/static-publish/verify.ts (rc=1)
- features/custom-credentials/credential-save-tool.ts (rc=1)
- features/custom-credentials/agent-tools.ts (rc=1)
- features/custom-credentials/store.ts (rc=1)

## No direct unit test found (never mutated)
- features/post/capability-card.ts
- features/pages/permissions.ts
- features/publish-content/live-site-policy.ts
- features/publish-content/pull.ts
- features/publish-content/report-contract.ts
- features/publish-content/permissions.ts
- features/publish-content/publish-tool.ts
- features/deployments/ports.ts
- features/deployments/agent-tools.ts
- features/deployments/deploy-ops/agent-tools.ts
- features/custom-credentials/card-token.ts
- features/custom-credentials/delete-request-confirmation-ui.ts
- features/custom-credentials/custom-credential-set-token-ui.ts

## NOT RUN (queue not reached)
- features/post/slug.ts
- features/site-backup/import-restore.ts
- features/site-backup/share-policy.ts
- features/site-backup/import-archive-reader.ts
- features/site-backup/push-jobs.ts
- features/site-backup/import-verifier-projection.ts
- features/site-backup/plan-store.ts
- features/site-backup/share-backend.ts
- features/site-backup/share-zip.ts
- features/site-backup/share-file-policy.ts
- features/site-backup/import-restore-placement.ts
- features/site-backup/import-registry.ts
- features/site-backup/share-registry.ts
- features/site-backup/share-hosting.ts
- features/site-backup/push-engine.ts
- features/site-backup/share-service.ts
- features/site-backup/share-preparation-steps.ts
- features/site-backup/import-backend-steps.ts
- features/site-backup/import-backend.ts
- features/site-backup/import-verifier-inventory.ts
- features/site-backup/tool-registrations.ts
- features/trash/widget-removal.ts
- features/trash/scheduler.node.ts
- features/trash/db-port.ts
- features/trash/db-port.sqlite.ts
- features/trash/repo.sqlite.ts
- features/trash/remove-without-blocker.ts
- features/trash/adapters/member.ts
- features/trash/adapters/redirect.ts
- features/trash/ports.ts
- features/trash/adapters/comment.ts
- features/trash/adapters/post.ts
- features/trash/adapters/media.ts
- features/trash/entry-sql.ts
- features/trash/not-trashed.ts
- features/trash/adapters/marker-sql.ts
- features/trash/permissions.ts
- features/trash/agent-tools.ts
- features/trash/move-to-trash.ts
- features/trash/repo.ts
- features/trash/adapters/directory.ts
- features/trash/adapters/user.ts
- features/trash/tool-registrations.ts
- features/trash/registry.ts
- features/trash/table-adapter.ts
- features/trash/trash-item-tool.ts
- features/redirects/repo.sqlite.ts
- features/redirects/phase-handler.ts
- features/redirects/publish-content.ts
- features/redirects/agent-tools.ts
- features/redirects/tool-registrations.ts
- features/form-destinations/connection-port.ts
- features/form-destinations/rewrite-actions.ts
- features/form-destinations/select.ts
- features/form-destinations/key-store.ts
- features/form-destinations/deliver.ts
- features/form-destinations/port.ts
- features/form-destinations/pull.ts
- features/form-destinations/registry.ts
- features/forms/rate-limit-profile.ts
- features/forms/capability-card.ts
- features/forms/delivery-status.ts
- features/forms/repo.sqlite.ts
- features/forms/submission-ip-expiry-sweep.ts
- features/forms/form-destination-manifest.ts
- features/forms/form-file-storage.ts
- features/forms/publish-content.ts
- features/forms/import-remote-submissions.ts
- features/forms/agent-tools.ts
- features/consent/revisions.ts
- features/consent/privacy-page-template.ts
- features/consent/request.ts
- features/consent/host.ts
- features/consent/ensure-privacy-defaults.ts
- features/consent/revisions.repo.ts
- features/consent/config.ts
- features/consent/settings-link.ts
- features/consent/readiness.ts
- features/consent/validation.ts
- features/consent/settings.ts
- features/consent/tool-registrations.ts
- features/consent/service.ts
- features/plugins/data-modules.ts
- features/plugins/store/manifest.ts
- features/plugins/plugin-store.ts
- features/plugins/disk-headroom.ts
- features/plugins/store/store-plugin.ts
- features/plugins/restore.ts
- features/plugins/migration-recovery.ts
- features/plugins/lipay/manifest.ts
- features/plugins/lipay/lipay-plugin.ts
- features/plugins/plugin-identity.ts
- features/plugins/snapshot.ts
- features/plugins/migration-journal.ts
- features/plugins/store/store-runtime.ts
- features/plugin-runtime/capability-card.ts
- features/plugin-runtime/repo.sqlite.ts
- features/plugin-runtime/plugin-export.ts
- features/plugin-runtime/widget-partials.ts
- features/plugin-runtime/install-consent.ts
- features/plugin-runtime/install.ts
- features/plugin-runtime/declarative-enable.ts
- features/plugin-runtime/uninstall-confirmation-ui.ts
- features/plugin-runtime/built-ins/content-analyzer/plugin.ts
- features/plugin-runtime/built-ins/content-analyzer/summary.ts
- features/plugin-runtime/invocation-core-deps.ts
- features/plugin-runtime/admin-response.ts
- features/plugin-runtime/built-ins/content-analyzer/tiptap-blocks.ts
- features/plugin-runtime/set-enabled-confirmation-ui.ts
- features/plugin-runtime/install-archive.ts
- features/plugin-runtime/host-binding.ts
- features/plugin-runtime/install-tool.ts
- features/plugin-runtime/built-ins/content-analyzer/analyze-content.ts
- features/plugin-runtime/source-tools.ts
- features/plugin-runtime/agent-tools.ts
- features/plugin-runtime/declarative-content-types.ts
- features/vendor-credentials/abort-guarded-repo.ts
- features/vendor-credentials/vault-adapter.ts
- features/permanent-delete/agent-tools.ts
- features/permanent-delete/tool-registrations.ts
- features/publish-trust/provisioning.node-io.ts
- features/publish-trust/session.ts
- features/publish-trust/keys.ts
- features/publish-trust/connect.ts
- features/publish-trust/challenge.ts
- features/publish-trust/handshake-client.ts
- features/publish-trust/revocations.ts
- features/publish-trust/grant.ts
- features/publish-trust/provisioning.ts
- features/webhooks/signing.keyring.ts
- features/webhooks/keyring.memory.ts
- features/webhooks/signing.ts
- features/webhooks/ports.ts
- features/webhooks/http.memory.ts
- features/webhooks/delivery.ts
- features/webhooks/subscriptions.ts
- features/webhooks/secret-sealer.aesgcm.ts
- features/webhooks/agent-tools.ts
- features/webhooks/repo.memory.ts
- features/webhooks/seal-aad-invariant.ts
- features/webhooks/site-key-sources.ts
- features/webhooks/secret-scan-guard.ts
- features/webhooks/tool-registrations.ts
- features/webhooks/keyring.env.ts
- features/api-connections/hook-http.ts
- features/api-connections/byo-client.ts
- features/api-connections/browser-binding.ts
- features/api-connections/budgets.ts
- features/api-connections/form-delivery-connection.ts
- features/api-connections/plugin-state.ts
- features/api-connections/vault-stores.ts
- features/api-connections/surface-connections.ts
- features/api-connections/connect.ts
- features/api-connections/contribution.ts
- features/api-connections/host.ts
- features/change-sets/agent-tools.ts
- features/change-sets/tool-registrations.ts
- features/recovery/gated-hooks.ts
- features/recovery/agent-tools.ts
- features/recovery/tool-registrations.ts
- features/entries/repo.sqlite.ts
- features/entries/repo.rows.ts
- features/entries/tool-registrations.ts
- features/entries/publish-content.ts
- features/entries/unreadable-owner-entries-repair.ts
- features/entries/trash-aware-memory-repo.ts
- features/entries/repo.ts
- features/entries/public-list.ts
- features/content-types/repo.sqlite.ts
- features/content-types/repo.memory.ts
- features/content-types/declared-owners.ts
- features/content-types/write-service.ts
- features/content-types/repo.ts
- features/content-types/repo.rows.ts
- features/content-types/publish-content.ts
- features/content-types/tool-registrations.ts
- features/content-duplication/derive-available-name.ts
- features/content-duplication/agent-tools.ts
- features/content-duplication/tool-registrations.ts
- features/media/purge-media.ts
- features/media/provider-credential-store.memory.ts
- features/media/guard-rendition-repo.ts
- features/media/document-archive.ts
- features/media/upload-content-type.ts
- features/media/where-used.ts
- features/media/public-path.ts
- features/media/library-save-attachment.ts
- features/media/content-type-store.ts
- features/media/verify-published-media.ts
- features/media/bootstrap.ts
- features/media/list-pending-chat-attachments.ts
- features/media/provider-credential-vault.ts
- features/media/versioned-media-repo.ts
- features/media/view-image-tool.ts
- features/media/hydrate-blob-store-from-seed.ts
- features/media/promote-chat-attachment.ts
- features/media/publish-content.ts
- features/media/duplicate-asset.ts
- features/media/tool-registrations.ts
- features/media/view-video-tool.ts
- features/media/import-media-entity.ts
- features/media/read-chat-attachment.ts
- features/media/provider-credential-store.ts
- features/media-import/agent-tools.ts
- features/media-import/fetch-image.ts
- features/media-import/tool-registrations.ts
- features/media-generation/provider-credential-save.ts
- features/media-generation/media-provider-registry.ts
- features/media-generation/agent-tools.ts
- features/media-generation/providers-tools.ts
- features/media-generation/tool-registrations.ts
- features/navigation/menu-version-conflict-error.ts
- features/navigation/repo.sqlite.ts
- features/navigation/page-target-resolver.ts
- features/navigation/trash-menu.ts
- features/navigation/tool-registrations.ts
- features/navigation/html-render.ts
- features/navigation/menu-trash-follow-ups.ts
- features/navigation/reverters.ts
- features/navigation/repoint-menu-refs.ts
- features/navigation/migrate-footer-page-links.ts
- features/navigation/trash-aware-memory-menu-repo.ts
- features/navigation/import-menu.ts
- features/navigation/repo.ts
- features/navigation/publish-content.ts
- features/taxonomy/repo.sqlite.ts
- features/taxonomy/html-render.ts
- features/taxonomy/repo.rows.ts
- features/taxonomy/agent-tools.ts
- features/taxonomy/collection-term-policy.ts
- features/taxonomy/publish-content.ts
- features/taxonomy/gated-hooks.ts
- features/taxonomy/publish-term-ids.ts
- features/taxonomy/trash-term.ts
- features/taxonomy/taxonomy-trash-follow-ups.ts
- features/taxonomy/tool-registrations.ts
- features/taxonomy/repo.ts
- features/comments/data-module-install.ts
- features/comments/repo.sqlite.ts
- features/comments/comment-targets.ts
- features/comments/public-markers.ts
- features/comments/ip-hash-salt.ts
- features/comments/provider-selection.ts
- features/comments/builtin-provider.ts
- features/comments/agent-tools.ts
- features/comments/settings.ts
- features/comments/tool-registrations.ts
- features/newsletter/repo.sqlite.ts
- features/newsletter/hooks.ts
- features/newsletter/errors.ts
- features/newsletter/launch-gate.ts
- features/newsletter/lists.ts
- features/newsletter/unsubscribe.ts
- features/newsletter/campaign.ts
- features/newsletter/data-module-manifest.ts
- features/newsletter/subscriptions.ts
- features/newsletter/confirmation.ts
- features/newsletter/campaign-write-service.ts
- features/newsletter/repo.rows.ts
- features/newsletter/agent-tools.ts
- features/newsletter/ports.ts
- features/newsletter/repo.memory.ts
- features/newsletter/delivery/tool-registrations.ts
- features/newsletter/repo.ts
- features/newsletter/tool-registrations.ts
- features/site-export/theme-preview-manifest.ts
- features/site-export/theme-preview-report.ts
- features/site-export/static-security-headers.ts
- features/site-export/export-failure-summary.ts
- features/site-export/ports.ts
- features/site-export/route-manifest.ts
- features/source-control/repo.memory.ts
- features/source-control/repository-target.ts
- features/source-control/provider-kit.ts
- features/source-control/credential-form.ts
- features/source-control/provider-module.ts
- features/source-control/credential-setup.ts
- features/source-control/provider-registry.ts
- features/source-control/store.ts
- features/source-control/commit-site.ts
- features/source-control/tool-registrations.ts
- features/sites/site-preview/site-preview-store.ts
- features/sites/site-preview/site-preview-service.ts
- features/sites/site-preview/playwright-site-preview-capture.ts
- features/sites/deps.ts
- features/sites/agent-tools.ts
- features/sites/site-admin.ts
- features/sites/tool-registrations.ts
- features/site-search/access.ts
- features/site-search/settings.ts
- features/site-search/cms-document-source.ts
- features/site-search/index-state-store.ts
- features/seo/capability-card.ts
- features/seo/page-head-contributor.ts
- features/seo/cover-image.ts
- features/seo/agent-tools.ts
- features/seo/tool-registrations.ts
- features/seo/settings.ts
- features/origin/configured-origin.ts
- features/domain-dns/mail-dns-tools.ts
- features/domain-dns/binding.repo.ts
- features/domain-dns/mail-requirements.ts
- features/domain-dns/tools.ts
- features/domain-dns/mail-dns-status.ts
- features/domain-dns/dns-tools.ts
- features/domain-dns/dns-changes.ts
- features/object-storage/artifact-provider.ts
- features/object-storage/setting.ts
- features/object-storage/registry.ts
- features/object-storage/media-store.ts
- features/fs-files/site-file-request.ts
- features/fs-files/custom-root-permission.ts
- features/fs-files/tool-registrations.ts
- features/fs-files/agent-tools.ts
- features/fs-files/layout.ts
- features/fs-files/fs-files.ts
- features/fs-files/custom-root-store.ts
- features/database/gated-hooks.ts
- features/database/db-messages.ts
- features/database/adapter.sqlite.ts
- features/database/repo.memory.ts
- features/database/tool-registrations.ts
- features/email-templates/agent-tools.ts
- features/email-templates/tool-registrations.ts
- features/email-templates/render.ts
- features/email-templates/operations.ts
- features/external-mcp/built-in-connections.ts
- features/external-mcp/auth-mode.ts
- features/external-mcp/deps.ts
- features/external-mcp/operations-tools.ts
- features/external-mcp/save-form.ts
- features/external-mcp/agent-tools.ts
- features/agent-plugins/bundled-contribution-sources.ts
- features/agent-plugins/admin-surfaces/same-origin.ts
- features/agent-plugins/admin-surfaces/public-config.ts
- features/agent-plugins/admin-surfaces/forms.ts
- features/agent-plugins/deploy-split-activation.ts
- features/agent-plugins/admin-surfaces/issued-sign-ins.ts
- features/agent-plugins/operator-locale.ts
- features/agent-plugins/admin-surfaces/capabilities.ts
- features/agent-plugins/retired-plugin-tool-aliases.ts
- features/agent-plugins/identity.ts
- features/agent-plugins/search-provider-registry.ts
- features/agent-plugins/uninstall-confirmation-ui.ts
- features/agent-plugins/token-sign-in.ts
- features/agent-plugins/descriptor-i18n.ts
- features/agent-plugins/write-note-tool.ts
- features/agent-plugins/exports/diagnostics.ts
- features/agent-plugins/memory.ts
- features/agent-plugins/exports/source.ts
- features/agent-plugins/admin-surfaces/handlers.ts
- features/agent-plugins/executable-tools/approval.ts
- features/agent-plugins/set-enabled.ts
- features/agent-plugins/memory-tools.ts
- features/agent-plugins/mcp-metadata.ts
- features/agent-plugins/apply-connect-defaults.ts
- features/agent-plugins/update-effects.ts
- features/agent-plugins/connect-card-ui.ts
- features/agent-plugins/layout.ts
- features/agent-plugins/admin-surfaces/surfaces.ts
- features/agent-plugins/host-signals.ts
- features/agent-plugins/capability-projection.ts
- features/agent-plugins/analytics-provider-registry.ts
- features/agent-plugins/memory-i18n.ts
- features/agent-plugins/switch-on-saved-token.ts
- features/agent-plugins/apply-tool-renames.ts
- features/agent-plugins/new-site-agent-plugin-tokens.ts
- features/agent-plugins/mail-provider-setup.ts
- features/agent-plugins/supersession.ts
- features/agent-plugins/bundled-catalog.ts
- features/agent-plugins/executable-tools/host-capabilities.ts
- features/agent-plugins/import-access-token.ts
- features/agent-plugins/exports/runtime.ts
- features/agent-plugins/admin-surfaces/delivery-bindings.ts
- features/agent-plugins/executable-tools/register.ts
- features/agent-plugins/credential-cards.ts
- features/agent-plugins/uninstall-tool.ts
- features/agent-plugins/install-tool.ts
- features/agent-plugins/access-token-tool.ts
- features/agent-plugins/lifecycle.ts
- features/agent-plugins/mail-adapter-registry.ts
- features/agent-plugins/install-upload.ts
- features/agent-plugins/connect-tool.ts
- features/skills/live-registration.ts
- features/skills/install-service.ts
- features/skills/layout.ts
- features/skills/install-tool.ts
- features/skills/tool-registrations.ts
- features/widgets/capability-card.ts
- features/widgets/repo.sqlite.ts
- features/widgets/deps.ts
- features/widgets/media-html.ts
- features/widgets/publish-content.ts
- features/widgets/agent-tools.ts
- features/theme/capability-card.ts
- features/theme/asset-path-rewrites.ts
- features/theme/theme-id-aliases.ts
- features/theme/public-page-security-headers.ts
- features/theme/template-applicability.ts
- features/theme/font-links.ts
- features/theme/token-aliases.ts
- features/theme/save-theme-original.ts
- features/theme/preview-refresh.ts
- features/theme/verify-active-theme.ts
- features/theme/page-publication.ts
- features/theme/render-contract.ts
- features/theme/theme-watcher.ts
- features/theme/page-publish-tool.ts
- features/theme/hardcoded-link-lists.ts
- features/theme/theme-roster-sync.ts
- features/theme/preview-switcher-tools.ts
- features/theme/validation/references.ts
- features/theme/theme-preview-image.ts
- features/theme/validation/profiles.ts
- features/theme/active-theme-publish-content.ts
- features/theme/validation/markup.ts
- features/theme/theme-layout.ts
- features/theme/static-asset-contract.ts
- features/theme/preview-switcher.ts
- features/theme/duplicate-theme-tool.ts
- features/theme/set-active-theme-tool.ts
- features/theme/preview-switcher-html.ts
- features/theme/theme-file-import.ts
- features/theme/trash-theme-tool.ts
- features/theme/import-theme-file-tool.ts
- features/theme/theme-trash.ts
- features/theme/validation/webmcp-markup.ts
- features/theme/sync-originals.ts
- features/theme/liquid-allowlist.ts
- features/theme/validation/validate-theme-package.ts
- features/theme/active-theme.ts
- features/theme/migration/theme-migration-plan.ts
- features/theme/static-portability-index.ts
- features/theme/validation/structure.ts
- features/theme/file-identity-lock.ts
- features/theme/duplicate-theme.ts
- features/theme/migration/migrate-theme.ts
- features/theme/handlebars-allowlist.ts
- features/theme/entry-list-render.ts
- features/theme/code-tier-asset-normalizer.ts
- features/theme/validation/manifest-v2.ts
- features/theme/agent-tools.ts
- features/tool-audit/repo.sqlite.ts
- features/tool-audit/tool-gaps.repo.ts
- features/tool-audit/repo.memory.ts
- features/tool-audit/repo.ts
- features/web/web-page.ts
- features/web/tool-registrations.ts
- features/web/agent-tools.ts
- features/webmcp/settings.ts
- features/webmcp/webmcp-i18n.ts
- features/webmcp/published-html.ts
- features/webmcp/generated/annotated-actions-script.ts
- features/web-screenshot/screenshot-image.ts
- features/web-screenshot/request-guard.ts
- features/web-screenshot/capture-files.ts
- features/web-screenshot/own-site-opener.ts
- features/web-screenshot/desktop-page-capture.ts
- features/web-screenshot/agent-tools.ts
- features/web-screenshot/tool-registrations.ts
- features/web-screenshot/playwright-page-capture.ts
- features/web-screenshot/web-screenshot.ts
- features/workspace/repo.sqlite.ts
- features/workspace/agent-tools.ts
- features/workspace/repo.ts
- features/workspace/tool-registrations.ts
- features/site-glue/attachment-points/events.ts
- features/site-glue/ports.ts
- features/site-glue/attachment-points/tool-registration.ts
- features/site-glue/manifest.ts
- features/site-evidence/agent-tools.ts
- features/site-evidence/collect-page-evidence.ts
- features/site-evidence/tool-registrations.ts
- features/site-inspection/admin-screens.generated.ts
- features/site-inspection/page-body.ts
- features/site-inspection/section-collector.ts
- features/site-inspection/deps.ts
- features/site-inspection/live-url.ts
- features/site-inspection/tool-registrations.ts
- features/site-inspection/agent-tools.ts
- features/site-inspection/site-capabilities.ts
- features/site-inspection/published-page.ts
- features/site-guide/capability-card.ts
- features/site-guide/plugin-contributions.ts
- features/site-guide/contracts.ts
- features/site-guide/facts.ts
- features/server-logs/agent-tools.ts
- features/server-logs/tool-registrations.ts
- features/server-logs/read-server-logs.ts
- features/mail-status/permissions.ts
- features/mail-status/provider-agent-tools.ts
- features/mail-status/agent-tools.ts
- features/mail-status/feedback-setup.ts
- features/mail-status/delivery-agent-tools.ts
- features/mail-status/delivery-tool-registrations.ts
- features/mail-status/provider-tool-registrations.ts
- features/mail-status/provider-operations.ts
- features/mail-status/tool-registrations.ts
- features/mail-status/suppressions.ts
- features/mail-status/activity.ts
- features/mail-status/use-readiness.ts
- features/mail-status/test-send.ts
- features/presentation/repo.sqlite.ts
- features/presentation/repo.rows.ts
- features/presentation/repo.ts
- features/presentation/active-theme-id.ts
- features/analytics/agent-tools.ts
- features/analytics/salt.ts
- features/analytics/tool-registrations.ts
- features/analytics/jini-adapters.ts
- features/analytics/forwarding.ts
- features/analytics/ports.ts
- features/analytics/config.settings.ts

## Survivors (files <80% or ≥10 survivors; ≤10 each, untriaged in interim)
### features/custom-credentials/credential-copy-tool.ts (83.0%, 35 surv, 13 nocov)
- L42 ObjectLiteral: `inputSchema: { type: 'object', additionalProperties: false, properties: {} } }];` → `{}`
- L42 BooleanLiteral: `inputSchema: { type: 'object', additionalProperties: false, properties: {} } }];` → `true`
- L60 ObjectLiteral: `if (instance && !(await instance({ principalId, permission: 'system.write' })).allowed) {` → `{}`
- L61 ObjectLiteral: `throw new ToolInputError({ message: 'Copy is not authorized for this installation.' });` → `{}`
- L73 ObjectLiteral: `toolName: CREDENTIAL_COPY_TOOL_ID, baseParams: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId }` → `{}`
- L75 ObjectLiteral: `params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true } },` → `{}`
- L75 BooleanLiteral: `params: { [SURFACE_EXCHANGE_ID_PARAM]: exchangeId, [SURFACE_DISMISSED_PARAM]: true } },` → `false`
- L77 ArrayDeclaration: `preferredFrameSize: ['100%', '1px'] });` → `[]`
- L85 ConditionalExpression: `if (aborted) return 'abandoned';` → `false`
- L99 ConditionalExpression: `!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || new Set(ids).size !== ids.len` → `false`
- no-cov lines: 18,19,20,21,22,114
### features/custom-credentials/custom-credential-create-ui.ts (44.3%, 23 surv, 11 nocov)
- L86 BooleanLiteral: `required: true,` → `false`
- L81 ObjectLiteral: `{` → `{}`
- L87 ConditionalExpression: `...(prefill.label !== undefined ? { value: prefill.label } : {}),` → `true`
- L87 ConditionalExpression: `...(prefill.label !== undefined ? { value: prefill.label } : {}),` → `false`
- L87 EqualityOperator: `...(prefill.label !== undefined ? { value: prefill.label } : {}),` → `prefill.label === undefined`
- L89 ObjectLiteral: `{` → `{}`
- L87 ObjectLiteral: `...(prefill.label !== undefined ? { value: prefill.label } : {}),` → `{}`
- L94 BooleanLiteral: `required: true,` → `false`
- L95 EqualityOperator: `...(prefill.baseUrl !== undefined ? { value: prefill.baseUrl } : {}),` → `prefill.baseUrl === undefined`
- L95 ConditionalExpression: `...(prefill.baseUrl !== undefined ? { value: prefill.baseUrl } : {}),` → `true`
- no-cov lines: 71,95,174,176,177,178,181,182
### features/custom-credentials/plugin-credential-card.ts (2.2%, 2 surv, 133 nocov)
- L147 OptionalChaining: `try { return await loadCards?.(workspaceId) ?? []; }` → `loadCards(workspaceId)`
- L147 ArrayDeclaration: `try { return await loadCards?.(workspaceId) ?? []; }` → `["Stryker was here"]`
- no-cov lines: 63,64,67,69,73,74,75,77,78,85,86,87,88,89,97,98,99,100,101,102,103,107,109,110,111,112,117,119,120,126,127,131,132,133,137,138,139,140,148
### features/custom-credentials/vault-repo.ts (90.0%, 14 surv, 4 nocov)
- L7 ConditionalExpression: `...(id === undefined ? {} : { id }) };` → `false`
- L7 ConditionalExpression: `...(id === undefined ? {} : { id }) };` → `true`
- L7 EqualityOperator: `...(id === undefined ? {} : { id }) };` → `id !== undefined`
- L7 ObjectLiteral: `...(id === undefined ? {} : { id }) };` → `{}`
- L28 ConditionalExpression: `if (expectedRevision !== undefined) Object.defineProperty(record, "vaultExpectedRevision",` → `true`
- L45 ObjectLiteral: `const legacy = await this.vault.list(customVaultScope({ ...input, kind: "custom" }));` → `{}`
- L46 MethodExpression: `return [...unified.filter(row => row.meta.credentialType === "custom"), ...legacy].sort(by` → `[...unified.filter(row => row.meta.credentialType === "custo`
- L46 MethodExpression: `return [...unified.filter(row => row.meta.credentialType === "custom"), ...legacy].sort(by` → `unified`
- L46 ConditionalExpression: `return [...unified.filter(row => row.meta.credentialType === "custom"), ...legacy].sort(by` → `true`
- L67 LogicalOperator: `if (error instanceof VaultError && error.code === "conflict" && (await this.listByWorkspac` → `error instanceof VaultError || error.code === "conflict"`
- no-cov lines: 73,75
### features/deployments/deploy-config-registry.ts (71.5%, 53 surv, 30 nocov)
- L32 Regex: `const GENERATOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[a-z0-9]+)*/`
- L32 Regex: `const GENERATOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[a-z0-9])*$/`
- L32 Regex: `const GENERATOR_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[^a-z0-9]+)*$/`
- L63 ConditionalExpression: `}, { onReadError: ({ error }) => (error as NodeJS.ErrnoException).code === "ENOENT" ? [] :` → `true`
- L87 BlockStatement: `try {` → `{}`
- L89 BlockStatement: `} catch {` → `{}`
- L156 ConditionalExpression: `if (typeof metadata === "string") return `${at}.${metadata}`;` → `false`
- L182 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L187 ConditionalExpression: `return typeof value === "string" && value.length <= 512 && /^[a-zA-Z0-9_./-]+$/.test(value` → `true`
- L187 LogicalOperator: `return typeof value === "string" && value.length <= 512 && /^[a-zA-Z0-9_./-]+$/.test(value` → `typeof value === "string" && value.length <= 512 && /^[a-zA-`
- no-cov lines: 93,208,213,221,222,223,224,225,229,230,231,247,255,256,259
### features/deployments/deploy-config.ts (77.9%, 12 surv, 3 nocov)
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/EXPOSE\s+(\d+)\s*$/m`
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/^EXPOSE\s+(\d+)\s*/m`
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/^EXPOSE\s(\d+)\s*$/m`
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/^EXPOSE\s+(\d+)\s$/m`
- L354 Regex: `const port = Number(extractOrThrow(dockerfile, /^EXPOSE\s+(\d+)\s*$/m, "the container port` → `/^EXPOSE\s+(\d+)\S*$/m`
- L356 Regex: `const appName = extractOrThrow(packageJson, /^\s*"name"\s*:\s*"([^"]+)"/m, "the default ap` → `/\s*"name"\s*:\s*"([^"]+)"/m`
- L356 Regex: `const appName = extractOrThrow(packageJson, /^\s*"name"\s*:\s*"([^"]+)"/m, "the default ap` → `/^\s*"name"\S*:\s*"([^"]+)"/m`
- L356 Regex: `const appName = extractOrThrow(packageJson, /^\s*"name"\s*:\s*"([^"]+)"/m, "the default ap` → `/^\s*"name"\s*:\s"([^"]+)"/m`
- L360 Regex: `/^VOLUME\s+\["([^"]+)"\]\s*$/m,` → `/VOLUME\s+\["([^"]+)"\]\s*$/m`
- L360 Regex: `/^VOLUME\s+\["([^"]+)"\]\s*$/m,` → `/^VOLUME\s+\["([^"]+)"\]\s*/m`
- no-cov lines: 118,119,121
### features/deployments/deploy-ops/registry.ts (87.2%, 34 surv, 0 nocov)
- L12 ConditionalExpression: `const object = (value: unknown): value is Record<string, unknown> => typeof value === "obj` → `true`
- L19 EqualityOperator: `if (!Array.isArray(value.platforms) || value.platforms.length > 32) return { ok: false, re` → `value.platforms.length >= 32`
- L35 ConditionalExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `true`
- L35 LogicalOperator: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `typeof module === "string" && module.endsWith(".mjs") && !mo`
- L35 ConditionalExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `true`
- L35 LogicalOperator: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `typeof module === "string" && module.endsWith(".mjs") || !mo`
- L35 ConditionalExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `true`
- L35 LogicalOperator: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `typeof module === "string" || module.endsWith(".mjs")`
- L35 ConditionalExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `true`
- L35 MethodExpression: `return typeof module === "string" && module.endsWith(".mjs") && !module.startsWith("/") &&` → `module.endsWith("/")`
### features/deployments/deploy-ops/run-ops.ts (84.4%, 55 surv, 9 nocov)
- L45 OptionalChaining: `if (signal?.aborted) { reject(aborted()); return; }` → `signal.aborted`
- L46 OptionalChaining: `const finish = () => { signal?.removeEventListener("abort", onAbort); resolve(); };` → `signal.removeEventListener`
- L48 OptionalChaining: `const onAbort = () => { clearTimeout(timer); signal?.removeEventListener("abort", onAbort)` → `signal.removeEventListener`
- L49 OptionalChaining: `signal?.addEventListener("abort", onAbort, { once: true });` → `signal.addEventListener`
- L49 ObjectLiteral: `signal?.addEventListener("abort", onAbort, { once: true });` → `{}`
- L49 BooleanLiteral: `signal?.addEventListener("abort", onAbort, { once: true });` → `false`
- L68 ObjectLiteral: `if (!credentials.some(c => c.label === explicit)) throw new DeployCredentialSetupRequired(` → `{}`
- L68 MethodExpression: `if (!credentials.some(c => c.label === explicit)) throw new DeployCredentialSetupRequired(` → `credentials.every(c => c.label === explicit)`
- L74 MethodExpression: `if (matches.length !== 1) throw new ToolInputError({ message: `Several saved custom creden` → `matches.map(c => c.label)`
- L90 ConditionalExpression: `if (error instanceof CredentialedRequestValidationError) throw new ToolInputError({ messag` → `true`
- no-cov lines: 80,91,159,206,316,328
### features/deployments/deploy-ops/secrets.ts (88.2%, 36 surv, 0 nocov)
- L47 MethodExpression: `const clip = (value: unknown, max: number) => String(value).slice(0, max);` → `String(value)`
- L64 ConditionalExpression: `if (!siteDir) return undefined;` → `false`
- L66 ObjectLiteral: `return revealSiteKeyMaterial({ sources: siteKeySourcesForSiteDir({ siteDir, mode: resolveR` → `{}`
- L78 ObjectLiteral: `const registry = await deps.loadDeployOps({ workspaceId: deps.workspaceId });` → `{}`
- L80 LogicalOperator: `if (!platform.module.setSecret || !platform.module.secretCapabilities) {` → `!platform.module.setSecret && !platform.module.secretCapabil`
- L95 ConditionalExpression: `if (!Array.isArray(result?.secrets) || result.secrets.some(s => !s || typeof s.name !== "s` → `false`
- L96 MethodExpression: `const secrets = result.secrets.slice(0, 500).map(s => ({ name: clip(s.name, 128), ...(type` → `result.secrets`
- L97 ConditionalExpression: `return { secrets, truncated: result.truncated === true || result.secrets.length > 500 };` → `false`
- L97 EqualityOperator: `return { secrets, truncated: result.truncated === true || result.secrets.length > 500 };` → `result.secrets.length >= 500`
- L104 ConditionalExpression: `const version = (write: DeployOpsSecretWrite | undefined): { version?: string } => (typeof` → `true`
### features/deployments/deploy-ops/typed-secret-card.ts (63.3%, 28 surv, 8 nocov)
- L24 ObjectLiteral: `const registry = await deps.loadDeployOps({ workspaceId: deps.workspaceId });` → `{}`
- L22 ConditionalExpression: `if (ctx.signal.aborted) return { locale };` → `false`
- L29 ObjectLiteral: `return { locale };` → `{}`
- L32 ObjectLiteral: `title, description: credentialText({ id: "secretForm", locale: prep.locale }),` → `{}`
- L34 ObjectLiteral: `text: { showSecret: credentialText({ id: "showSecret", locale: prep.locale }), hideSecret:` → `{}`
- L34 ObjectLiteral: `text: { showSecret: credentialText({ id: "showSecret", locale: prep.locale }), hideSecret:` → `{}`
- L34 ObjectLiteral: `text: { showSecret: credentialText({ id: "showSecret", locale: prep.locale }), hideSecret:` → `{}`
- L36 OptionalChaining: `...SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret?.secretField, multiline: true, r` → `SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret.secre`
- L36 BooleanLiteral: `...SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret?.secretField, multiline: true, r` → `false`
- L36 BooleanLiteral: `...SECRET_FORM_CARD_DEFINITIONS.deployment_ops_set_secret?.secretField, multiline: true, r` → `false`
- no-cov lines: 22,52,53,57
### features/deployments/deploy-targets/host-kit.ts (88.3%, 12 surv, 0 nocov)
- L57 ConditionalExpression: `if (!observability) return client;` → `false`
- L78 ConditionalExpression: `if (!response.ok || !response.body) return false;` → `false`
- L78 LogicalOperator: `if (!response.ok || !response.body) return false;` → `!response.ok && !response.body`
- L82 ConditionalExpression: `return body !== undefined && body.toString("utf8") === expected;` → `true`
- L83 BlockStatement: `} finally { await reader.cancel(); }` → `{}`
- L92 AssignmentOperator: `bytes += chunk.value.length;` → `bytes -= chunk.value.length`
- L93 ConditionalExpression: `if (bytes > 4096) return undefined;` → `false`
- L93 EqualityOperator: `if (bytes > 4096) return undefined;` → `bytes >= 4096`
- L102 ObjectLiteral: `const response = await ports.fetch({ url }, { init: { signal: AbortSignal.timeout(DEPLOY_F` → `{}`
- L102 ObjectLiteral: `const response = await ports.fetch({ url }, { init: { signal: AbortSignal.timeout(DEPLOY_F` → `{}`
### features/deployments/deploy-targets/registry.ts (95.5%, 21 surv, 0 nocov)
- L39 Regex: `const TARGET_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:-[a-z0-9]+)*/`
- L67 ObjectLiteral: `const load = await required.loadContributions({ ...ctx, definition: targetContribution }, ` → `{}`
- L67 BooleanLiteral: `const load = await required.loadContributions({ ...ctx, definition: targetContribution }, ` → `false`
- L176 EqualityOperator: `if (help !== undefined && (typeof help !== "string" || help.length > MAX_HELP_LENGTH)) ret` → `help.length >= MAX_HELP_LENGTH`
- L182 ConditionalExpression: `if (typeof value !== "string" || value.length > 500) return false;` → `false`
- L185 BlockStatement: `} catch {` → `{}`
- L182 EqualityOperator: `if (typeof value !== "string" || value.length > 500) return false;` → `value.length >= 500`
- L214 Regex: `const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;` → `/[A-Z][A-Z0-9_]{0,127}$/`
- L214 Regex: `const ENV_VAR_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;` → `/^[A-Z][A-Z0-9_]{0,127}/`
- L229 EqualityOperator: `if (!Array.isArray(value) || value.length > MAX_FIELDS) return `${at} must be an array of ` → `value.length >= MAX_FIELDS`
### features/pages/agent-tools.ts (34.1%, 29 surv, 0 nocov)
- L195 ObjectLiteral: `{` → `{}`
- L212 ObjectLiteral: `authorization: { permission: "content.read" },` → `{}`
- L213 ObjectLiteral: `inputSchema: {` → `{}`
- L215 BooleanLiteral: `additionalProperties: false,` → `true`
- L217 ObjectLiteral: `properties: {` → `{}`
- L219 ObjectLiteral: `slug: { type: "string", minLength: 1, description: "The page's slug, including '/' for the` → `{}`
- L220 ObjectLiteral: `regionId: { type: "string", minLength: 1, description: "Optional data-agent-element handle` → `{}`
- L245 ObjectLiteral: `authorization: { permission: PAGES_EDIT_HTML_PERMISSION },` → `{}`
- L249 ArrayDeclaration: `required: ["id", "html"],` → `[]`
- L246 ObjectLiteral: `inputSchema: {` → `{}`
### features/pages/hidden-until-script.ts (69.7%, 43 surv, 0 nocov)
- L21 Regex: `const START_TAG = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;` → `/<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']')*)>/gi`
- L21 Regex: `const START_TAG = /<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;` → `/<([a-z][a-z0-9-]*)\b((?:[^>"']|"[^"]*"|'[']*')*)>/gi`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\S*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^'])'|([^\s>"']+)))?`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([']*)'|([^\s>"']+)))?`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"'])))?`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([\s>"']+)))?`
- L22 Regex: `const ATTRIBUTE = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;` → `/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\S>"']+)))`
- L24 Regex: `const HIDING_DECLARATION = /(?:^|;)\s*(opacity\s*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidden)` → `/(?:^|;)\S*(opacity\s*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidd`
- L24 Regex: `const HIDING_DECLARATION = /(?:^|;)\s*(opacity\s*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidden)` → `/(?:^|;)\s*(opacity\S*:\s*0(?:\.0+)?%?|visibility\s*:\s*hidd`
### features/pages/html-document-store.memory.ts (54.1%, 43 surv, 8 nocov)
- L50 BlockStatement: `embedWarnings(): readonly PluginEmbedDiagnostic[] { return this.pluginWarnings; }` → `{}`
- L53 LogicalOperator: `this.pluginWarnings = await this.deps.validatePluginEmbeds?.({ workspaceId: this.scope.wor` → `(await this.deps.validatePluginEmbeds?.({   workspaceId: thi`
- L52 BlockStatement: `private async validatePluginEmbeds(input: { html: string }, _options = {}): Promise<void> ` → `{}`
- L48 ArrayDeclaration: `private pluginWarnings: readonly PluginEmbedDiagnostic[] = [];` → `["Stryker was here"]`
- L53 ArrayDeclaration: `this.pluginWarnings = await this.deps.validatePluginEmbeds?.({ workspaceId: this.scope.wor` → `["Stryker was here"]`
- L76 BlockStatement: `private async reindexEntryRefs(html: string): Promise<void> {` → `{}`
- L77 ConditionalExpression: `if (!this.deps.entryRefsRepo) return;` → `true`
- L93 BlockStatement: `private async appendRevision(seq: number, recordedAt: string): Promise<void> {` → `{}`
- L95 BooleanLiteral: `if (!row) return;` → `row`
- L95 ConditionalExpression: `if (!row) return;` → `true`
- no-cov lines: 53,78,79,124,185,195,196,213
### features/post/content-stats-tool.ts (94.2%, 10 surv, 0 nocov)
- L34 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, properties: {` → `{}`
- L34 BooleanLiteral: `inputSchema: { type: "object", additionalProperties: false, properties: {` → `true`
- L35 ObjectLiteral: `includeWordCounts: { type: "boolean", default: true },` → `{}`
- L34 ObjectLiteral: `inputSchema: { type: "object", additionalProperties: false, properties: {` → `{}`
- L35 BooleanLiteral: `includeWordCounts: { type: "boolean", default: true },` → `false`
- L36 ObjectLiteral: `longest: { type: "integer", minimum: 0, maximum: 20, default: 5 },` → `{}`
- L62 Regex: `return { id: post.id, title: post.title, slug: post.slug, words: text === "" ? 0 : text.sp` → `/\s/u`
- L102 ConditionalExpression: `if (typeof longest !== "number" || !Number.isInteger(longest) || longest < 0 || longest > ` → `false`
- L102 EqualityOperator: `if (typeof longest !== "number" || !Number.isInteger(longest) || longest < 0 || longest > ` → `longest >= 20`
- L150 ObjectLiteral: `await requireToolPermission({ authorize: adaptLegacyAuthorize({ authorize: deps.authorize ` → `{}`
### features/post/cover-image.ts (91.6%, 21 surv, 0 nocov)
- L40 ArrayDeclaration: `const INERT_ELEMENTS = new Set(["script", "style", "template", "noscript"]);` → `[]`
- L49 ConditionalExpression: `return (node.type === "image" || node.type === "media") && object(node.attrs);` → `true`
- L59 Regex: `const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);` → `/\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/`
- L59 Regex: `const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);` → `/^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?/`
- L59 Regex: `const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);` → `/^\/m\/([^/]+)\/[^/]+\.v\d\/[^/?#]+(?:[?#].*)?$/`
- L59 Regex: `const match = /^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[?#].*)?$/.exec(src);` → `/^\/m\/([^/]+)\/[^/]+\.v\d+\/[^/?#]+(?:[^?#].*)?$/`
- L62 BlockStatement: `try { return decodeURIComponent(encoded); } catch { return undefined; }` → `{}`
- L84 ConditionalExpression: `if (Array.isArray(node.content)) stack.push(node.content);` → `true`
- L91 ConditionalExpression: `return typeof ref === "string" ? candidate({ assetId: ref, alt: marker.config.alt ?? attrs` → `true`
- L105 UnaryOperator: `const marker = markers.get(node.sourceCodeLocation?.startOffset ?? -1);` → `+1`
### features/post/expected-version.ts (73.7%, 2 surv, 3 nocov)
- L51 ConditionalExpression: `if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {` → `false`
- L51 ConditionalExpression: `if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0) {` → `false`
- no-cov lines: 70,71,74
### features/post/html-plain-text.ts (83.5%, 18 surv, 0 nocov)
- L21 Regex: `return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {` → `/&(#[xX][0-9a-fA-F]+|#\D+|[a-zA-Z]+);/g`
- L21 Regex: `return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {` → `/&(#[xX][0-9a-fA-F]+|#\d|[a-zA-Z]+);/g`
- L26 MethodExpression: `const codePoint = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) :` → `entity`
- L29 LogicalOperator: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `!Number.isInteger(codePoint) && codePoint < 0`
- L29 ConditionalExpression: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `false`
- L29 ConditionalExpression: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `false`
- L29 EqualityOperator: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `codePoint <= 0`
- L29 ConditionalExpression: `return !Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff || (codePoint` → `true`
- L38 Regex: `const POST_DETAIL_HEADER_OPEN = /<([a-z][a-z0-9]*)\b[^>]*\sclass\s*=\s*(["'])((?:(?!\2)[\s` → `/<([a-z][a-z0-9]*)\b[^>]*\sclass\S*=\s*(["'])((?:(?!\2)[\s\S`
- L38 Regex: `const POST_DETAIL_HEADER_OPEN = /<([a-z][a-z0-9]*)\b[^>]*\sclass\s*=\s*(["'])((?:(?!\2)[\s` → `/<([a-z][a-z0-9]*)\b[^>]*\sclass\s*=\S*(["'])((?:(?!\2)[\s\S`
### features/post/publish-content.ts (89.1%, 30 surv, 0 nocov)
- L185 ConditionalExpression: `if ((field === "author" && post.author === null) || (field === "showAuthor" && post.showAu` → `true`
- L185 ConditionalExpression: `if ((field === "author" && post.author === null) || (field === "showAuthor" && post.showAu` → `true`
- L213 LogicalOperator: `version: existing?.version ?? 0,` → `existing?.version && 0`
- L214 LogicalOperator: `updatedAt: existing?.updatedAt ?? "",` → `existing?.updatedAt && ""`
- L227 BlockStatement: `) {` → `{}`
- L228 ObjectLiteral: `return {` → `{}`
- L268 ConditionalExpression: `if (refs.some((ref) => ref.entityType === "media" && ref.key === featured)) return refs;` → `true`
- L287 BooleanLiteral: `return termIds ? Object.defineProperty(publishRow, "termIds", { value: termIds, enumerable` → `true`
- L318 ArrayDeclaration: `coversTables: ["posts", "post_versions"],` → `[]`
- L323 ArrayDeclaration: `alsoAuthorizes: [TERM_SYNC_PERMISSION],` → `[]`
### features/post/repo.memory.ts (28.1%, 47 surv, 122 nocov)
- L31 ArrayDeclaration: `constructor(initialRows: PostRecord[] = []) {` → `["Stryker was here"]`
- L29 ArrayDeclaration: `private revisions: PostRevisionRecord[] = [];` → `["Stryker was here"]`
- L46 BlockStatement: `async findBySlug(required: { workspaceId: string; slug: string }): Promise<PostRecord | nu` → `{}`
- L49 ArrowFunction: `(row) => row.workspaceId === required.workspaceId && row.slug === required.slug` → `() => undefined`
- L48 LogicalOperator: `this.rows.find(` → `this.rows.find(row => row.workspaceId === required.workspace`
- L49 ConditionalExpression: `(row) => row.workspaceId === required.workspaceId && row.slug === required.slug` → `false`
- L49 ConditionalExpression: `(row) => row.workspaceId === required.workspaceId && row.slug === required.slug` → `true`
- L49 EqualityOperator: `(row) => row.workspaceId === required.workspaceId && row.slug === required.slug` → `row.workspaceId !== required.workspaceId`
- L55 MethodExpression: `return this.rows.filter((row) => row.workspaceId === required.workspaceId);` → `this.rows`
- L55 ConditionalExpression: `return this.rows.filter((row) => row.workspaceId === required.workspaceId);` → `true`
- no-cov lines: 59,60,61,62,63,70,71,72,73,75,76,77,81,85,87,88,90,136,138,141,143,160,161,162,164,165,230
### features/post/repo.ts (45.6%, 8 surv, 35 nocov)
- L187 ConditionalExpression: `if (updated.length === 0) return { applied: false };` → `false`
- L226 ArrowFunction: `await this.kernel.run((db) =>` → `() => undefined`
- L243 ConditionalExpression: `if (removed.length > 0) await this.search.remove(this.kernel, required.id);` → `true`
- L243 EqualityOperator: `if (removed.length > 0) await this.search.remove(this.kernel, required.id);` → `removed.length >= 0`
- L313 ArrowFunction: `const prior = await this.kernel.run((db) =>` → `() => undefined`
- L324 ArrowFunction: `await this.kernel.run((db) => db.insertInto("post_revisions").values(toRevisionRow(input, ` → `() => undefined`
- L325 ObjectLiteral: `return { id, previousId: prior?.id ?? null };` → `{}`
- L325 LogicalOperator: `return { id, previousId: prior?.id ?? null };` → `prior?.id && null`
- no-cov lines: 80,81,88,89,92,94,103,104,105,114,120,187,249,250,258,271,272,275,282,286,287,290,331,332
### features/post/reverters.ts (72.9%, 16 surv, 10 nocov)
- L66 ConditionalExpression: `if (!post) return null;` → `false`
- L86 ConditionalExpression: `publishAt: inverse.publishAt === undefined ? currentPublishAt : inverse.publishAt,` → `false`
- L87 ConditionalExpression: `featuredMediaId: inverse.featuredMediaId === undefined ? currentFeatured : inverse.feature` → `false`
- L87 ConditionalExpression: `featuredMediaId: inverse.featuredMediaId === undefined ? currentFeatured : inverse.feature` → `true`
- L87 EqualityOperator: `featuredMediaId: inverse.featuredMediaId === undefined ? currentFeatured : inverse.feature` → `inverse.featuredMediaId !== undefined`
- L92 ConditionalExpression: `...(inverse.templateChoice !== undefined ? { templateChoice: inverse.templateChoice } : {}` → `true`
- L135 ConditionalExpression: `if (!inverse) {` → `false`
- L140 ConditionalExpression: `if (!existing) {` → `false`
- L158 ConditionalExpression: `...(inverse.ext !== undefined && Object.keys(inverse.ext).length > 0` → `true`
- L158 ConditionalExpression: `...(inverse.ext !== undefined && Object.keys(inverse.ext).length > 0` → `false`
- no-cov lines: 135,140,158,159,226
### features/post/search-index.postgres.ts (70.4%, 6 surv, 2 nocov)
- L53 Regex: `.replace(/\p{M}+/gu, "")` → `/\p{M}/gu`
- L54 Regex: `.replace(/[^\p{L}\p{N}]+/gu, " ")` → `/[^\p{L}\p{N}]/gu`
- L86 MethodExpression: `const terms = query.terms.flatMap((term) => foldForIndex(term).split(" ")).filter(Boolean)` → `query.terms.flatMap(term => foldForIndex(term).split(" "))`
- L87 ConditionalExpression: `if (terms.length === 0) return [];` → `false`
- L90 ConditionalExpression: `if (query.kind !== undefined) filters.push(sql`p.kind = ${query.kind}`);` → `false`
- L91 ConditionalExpression: `if (query.status !== undefined) filters.push(sql`p.status = ${query.status}`);` → `false`
- no-cov lines: 74,87
### features/post/search.ts (63.6%, 29 surv, 3 nocov)
- L122 MethodExpression: `return query.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];` → `query.toUpperCase()`
- L127 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L127 LogicalOperator: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `typeof value === "object" && value !== null || !Array.isArra`
- L127 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L127 LogicalOperator: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `typeof value === "object" || value !== null`
- L127 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L127 ConditionalExpression: `return typeof value === "object" && value !== null && !Array.isArray(value);` → `true`
- L157 ConditionalExpression: `if (budget <= 0 || depth > MAX_BODY_DEPTH || !isNode(node)) return;` → `false`
- L157 LogicalOperator: `if (budget <= 0 || depth > MAX_BODY_DEPTH || !isNode(node)) return;` → `(budget <= 0 || depth > MAX_BODY_DEPTH) && !isNode(node)`
- L157 ConditionalExpression: `if (budget <= 0 || depth > MAX_BODY_DEPTH || !isNode(node)) return;` → `false`
- no-cov lines: 122,253,259
### features/post/slug.ts (68.6%, 11 surv, 0 nocov)
- L8 Regex: `return toSlug(title).slice(0, MAX_SLUG_LENGTH - DERIVED_SLUG_SUFFIX_ROOM).replace(/-+$/, "` → `/-$/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/untitled(-\d+)?$/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/^untitled(-\d+)?/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/^untitled(-\d)?$/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/\d+$/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/^\d+/`
- L14 Regex: `return /^untitled(-\d+)?$/.test(slug) || slug === base || (slug.startsWith(`${base}-`) && ` → `/^\d$/`
- L20 Regex: `export const SLUG_FORMAT_PATTERN = /^[a-z0-9-]+$/;` → `/[a-z0-9-]+$/`
- L20 Regex: `export const SLUG_FORMAT_PATTERN = /^[a-z0-9-]+$/;` → `/^[a-z0-9-]$/`
- L20 Regex: `export const SLUG_FORMAT_PATTERN = /^[a-z0-9-]+$/;` → `/^[^a-z0-9-]+$/`
### features/publish-content/backstop-policy.ts (85.5%, 21 surv, 0 nocov)
- L7 Regex: `/(?:^|_)(?:members?|identity|principals?|sessions?|roles?|polic(?:y|ies))(?:_|$)/i,` → `/(?:^|_)(?:members?|identity|principals|sessions?|roles?|pol`
- L7 Regex: `/(?:^|_)(?:members?|identity|principals?|sessions?|roles?|polic(?:y|ies))(?:_|$)/i,` → `/(?:^|_)(?:members?|identity|principals?|sessions?|roles|pol`
- L7 Regex: `/(?:^|_)(?:members?|identity|principals?|sessions?|roles?|polic(?:y|ies))(?:_|$)/i,` → `/(?:^|_)(?:members?|identity|principals?|sessions|roles?|pol`
- L8 Regex: `/^api_keys(?:_|$)/i, /credential/i, /^composio_/i,` → `/api_keys(?:_|$)/i`
- L8 Regex: `/^api_keys(?:_|$)/i, /credential/i, /^composio_/i,` → `/composio_/i`
- L9 Regex: `/^(?:origin_settings|deployment|publish_content|publish_trust|publish_backstop|webhook|for` → `/(?:origin_settings|deployment|publish_content|publish_trust`
- L10 Regex: `/^(?:sqlite_|__?drizzle|drizzle_|migration)/i,` → `/(?:sqlite_|__?drizzle|drizzle_|migration)/i`
- L11 Regex: `/^(?:tovu_(?:chat_)?migrations|schema_migrations)(?:_|$)/i,` → `/(?:tovu_(?:chat_)?migrations|schema_migrations)(?:_|$)/i`
- L10 Regex: `/^(?:sqlite_|__?drizzle|drizzle_|migration)/i,` → `/^(?:sqlite_|__drizzle|drizzle_|migration)/i`
- L13 Regex: `export const BACKSTOP_DENIED_COLUMN_PATTERN = /secret|token|password|_hash$|key/i;` → `/secret|token|password|_hash|key/i`
### features/publish-content/backstop-preview.ts (84.9%, 14 surv, 0 nocov)
- L15 ArrowFunction: `return checkRawTable({ table: row.table, columns: [...row.columns.map((column) => column.n` → `() => undefined`
- L16 ConditionalExpression: `(Object.hasOwn(row.values, "workspace_id") && row.values.workspace_id !== workspaceId ? "T` → `true`
- L19 ConditionalExpression: `typeof value === "object" && value !== null ? Buffer.from(value.blobBase64, "base64").toSt` → `true`
- L51 ConditionalExpression: `(backstop.coveredTables.some((table) => table.toLowerCase() === incoming.table.toLowerCase` → `true`
- L54 ObjectLiteral: `const live = await backstop.rows.read({ table: incoming.table, pk: incoming.pk });` → `{}`
- L64 ConditionalExpression: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `true`
- L64 ConditionalExpression: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `false`
- L64 EqualityOperator: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `entity.id.toLowerCase() !== root.toLowerCase().replace(/\/$/`
- L64 MethodExpression: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `entity.id.toUpperCase()`
- L64 MethodExpression: `(backstop.coveredRoots.some((root) => entity.id.toLowerCase() === root.toLowerCase().repla` → `root.toUpperCase()`
### features/publish-content/backstop-service.ts (93.6%, 18 surv, 0 nocov)
- L12 MethodExpression: `return actorId === ownerId || (await roles.list()).some((role) => role.isBuiltin && (role.` → `(await roles.list()).every(role => role.isBuiltin && (role.n`
- L39 ObjectLiteral: `await audit.save({ record: { ...record, result: "pending" } });` → `{}`
- L60 OptionalChaining: `const first = raw[0]?.backstop;` → `raw[0].backstop`
- L73 EqualityOperator: `return typeof reason === "string" && reason.trim().length >= 10 && reason.length <= 2000;` → `reason.trim().length > 10`
- L73 EqualityOperator: `return typeof reason === "string" && reason.trim().length >= 10 && reason.length <= 2000;` → `reason.length < 2000`
- L77 ConditionalExpression: `if (!row || typeof row !== "object") return false;` → `false`
- L79 ConditionalExpression: `return typeof candidate.table === "string" && !!candidate.pk && typeof candidate.pk === "o` → `true`
- L84 EqualityOperator: `if (!Array.isArray(rows) || !Array.isArray(files) || rows.length > BACKSTOP_LIMITS.rows ||` → `rows.length >= BACKSTOP_LIMITS.rows`
- L84 EqualityOperator: `if (!Array.isArray(rows) || !Array.isArray(files) || rows.length > BACKSTOP_LIMITS.rows ||` → `files.length >= BACKSTOP_LIMITS.files`
- L85 ArithmeticOperator: `if (rows.some((row) => !isBackstopRow({ row })) || files.some((file) => typeof file !== "s` → `rows.length - files.length`
### features/publish-content/content-hash.ts (66.7%, 8 surv, 0 nocov)
- L55 ArrayDeclaration: `const EXCLUDED_KEYS: ReadonlySet<string> = new Set([` → `[]`
- L92 ConditionalExpression: `if (value === undefined || value === null) return null;` → `false`
- L93 ConditionalExpression: `if (Array.isArray(value)) return value.map(normalize);` → `false`
- L94 EqualityOperator: `if (typeof value === "object") {` → `typeof value !== "object"`
- L94 ConditionalExpression: `if (typeof value === "object") {` → `false`
- L94 BlockStatement: `if (typeof value === "object") {` → `{}`
- L96 MethodExpression: `for (const key of Object.keys(value as Record<string, unknown>).sort()) {` → `Object.keys(value as Record<string, unknown>)`
- L109 ConditionalExpression: `if (EXCLUDED_KEYS.has(key)) continue;` → `false`
### features/publish-content/export-bundle.ts (54.7%, 17 surv, 31 nocov)
- L236 MethodExpression: `const candidates = source.entities.filter((entity) => !held.has(entityKey(entity.entityTyp` → `source.entities`
- L240 ConditionalExpression: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `true`
- L240 LogicalOperator: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `typeof slug === "string" || slug.length > 0`
- L240 ConditionalExpression: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `true`
- L240 ConditionalExpression: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `true`
- L240 EqualityOperator: `const address = typeof slug === "string" && slug.length > 0 ? entityKey(entity.entityType,` → `slug.length >= 0`
- L241 ConditionalExpression: `if (address !== null && !byAddress.has(address)) byAddress.set(address, entity);` → `true`
- L241 LogicalOperator: `if (address !== null && !byAddress.has(address)) byAddress.set(address, entity);` → `address !== null || !byAddress.has(address)`
- L241 ConditionalExpression: `if (address !== null && !byAddress.has(address)) byAddress.set(address, entity);` → `true`
- L275 OptionalChaining: `const referencesOf = (entity: PackedEntity) => handlers.get(entity.entityType)?.references` → `handlers.get(entity.entityType)?.references(entity)`
- no-cov lines: 61,62,178,179,182,204,206,207,208,209,212,215,217,275,302,319,320,322,330,336
### features/publish-content/file-tree-policy.ts (90.3%, 28 surv, 0 nocov)
- L76 Regex: `const ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:[-.][a-z0-9]+)*/`
- L76 Regex: `const ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:[^-.][a-z0-9]+)*$/`
- L76 Regex: `const ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:[-.][a-z0-9])*$/`
- L76 Regex: `const ID_SEGMENT_PATTERN = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/;` → `/^[a-z0-9]+(?:[-.][^a-z0-9]+)*$/`
- L96 ConditionalExpression: `if (segment.length === 0 || segment.length > MAX_ID_SEGMENT_LENGTH || !ID_SEGMENT_PATTERN.` → `false`
- L96 EqualityOperator: `if (segment.length === 0 || segment.length > MAX_ID_SEGMENT_LENGTH || !ID_SEGMENT_PATTERN.` → `segment.length >= MAX_ID_SEGMENT_LENGTH`
- L117 Regex: `const MCP_CONFIG_NAME_PATTERN = /^\.mcp\..*\.json$/;` → `/\.mcp\..*\.json$/`
- L117 Regex: `const MCP_CONFIG_NAME_PATTERN = /^\.mcp\..*\.json$/;` → `/^\.mcp\..*\.json/`
- L196 MethodExpression: `const base = relPath.slice(relPath.lastIndexOf("/") + 1);` → `relPath`
- L198 ConditionalExpression: `return dot <= 0 ? "" : base.slice(dot + 1).toLowerCase();` → `false`
### features/publish-content/gated-hooks.ts (79.1%, 8 surv, 1 nocov)
- L251 BlockStatement: `const getBaseline: PlanImportDeps["getBaseline"] = async ({ entityType, entityId }) => {` → `{}`
- L252 ObjectLiteral: `const record = await input.baselineRepo.findOne({` → `{}`
- L264 ArrowFunction: `const hasBlob = async (sha256: string): Promise<boolean> =>` → `() => undefined`
- L271 ConditionalExpression: `...(input.getSeedHash === undefined ? {} : { getSeedHash: input.getSeedHash }),` → `true`
- L271 ConditionalExpression: `...(input.getSeedHash === undefined ? {} : { getSeedHash: input.getSeedHash }),` → `false`
- L271 EqualityOperator: `...(input.getSeedHash === undefined ? {} : { getSeedHash: input.getSeedHash }),` → `input.getSeedHash !== undefined`
- L272 ConditionalExpression: `...(input.forcedEntityKeys === undefined ? {} : { forcedEntityKeys: input.forcedEntityKeys` → `false`
- L290 ObjectLiteral: `const captured = await input.dbOps.captureRestorePoint({ scopeId: input.workspaceId });` → `{}`
- no-cov lines: 271
### features/publish-content/media-references.ts (81.7%, 36 surv, 0 nocov)
- L108 ConditionalExpression: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `true`
- L108 LogicalOperator: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `node.type === 'widgetEmbed' && isPlainObject(node.attrs) || `
- L108 LogicalOperator: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `node.type === 'widgetEmbed' || isPlainObject(node.attrs)`
- L108 ConditionalExpression: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `true`
- L108 ConditionalExpression: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `true`
- L108 ConditionalExpression: `if (node.type === 'widgetEmbed' && isPlainObject(node.attrs) && typeof node.attrs.widgetEn` → `true`
- L112 ConditionalExpression: `if (marker.type.toLowerCase() !== 'widget') continue;` → `false`
- L114 ConditionalExpression: `if (target && target.key !== 'none') collect(target.value, marker.config.content);` → `true`
- L114 LogicalOperator: `if (target && target.key !== 'none') collect(target.value, marker.config.content);` → `target || target.key !== 'none'`
- L114 ConditionalExpression: `if (target && target.key !== 'none') collect(target.value, marker.config.content);` → `true`
### features/publish-content/precheck-reasons.ts (12.5%, 4 surv, 3 nocov)
- L33 BlockStatement: `export function addressHeldByOther(entityType: string, field: string, value: string, holde` → `{}`
- L40 BlockStatement: `export function addressHeldInTrash(entityType: string, field: string, value: string, holde` → `{}`
- L24 BlockStatement: `export function notWired(entityType: string, id: string, portName: string): string {` → `{}`
- L48 BlockStatement: `export function trashedAtDestination(entityType: string, id: string): string {` → `{}`
- no-cov lines: 65,73,81
### features/publish-content/push-plan.ts (81.4%, 11 surv, 0 nocov)
- L26 ObjectLiteral: `const workspace = await deps.workspaceRepo.findById({ id: deps.workspaceId });` → `{}`
- L51 ConditionalExpression: `input.scope == null` → `true`
- L51 ConditionalExpression: `input.scope == null` → `false`
- L51 EqualityOperator: `input.scope == null` → `input.scope != null`
- L64 ConditionalExpression: `{ bundle, ...(input.overwriteEntityKeys == null ? {} : { overwriteEntityKeys: input.overwr` → `false`
- L72 ArrowFunction: `const heldBackCount = result.notSupportedByLive.reduce((sum, entry) => sum + entry.count, ` → `() => undefined`
- L72 ArithmeticOperator: `const heldBackCount = result.notSupportedByLive.reduce((sum, entry) => sum + entry.count, ` → `sum - entry.count`
- L91 ConditionalExpression: `[entity.state.title, entity.state.slug, entity.displayLabel].filter((name): name is string` → `true`
- L91 EqualityOperator: `[entity.state.title, entity.state.slug, entity.displayLabel].filter((name): name is string` → `name.length >= 0`
- L95 ArithmeticOperator: `entityCount: bundle.entities.length - heldBackCount,` → `bundle.entities.length + heldBackCount`
### features/publish-content/raw-file-contributor.ts (80.5%, 62 surv, 0 nocov)
- L19 ArrayDeclaration: `return { entityType: "raw-file", dependsOn: [], build: (deps) => {` → `["Stryker was here"]`
- L21 ArrayDeclaration: `const skipped: SkippedPackEntity[] = [];` → `["Stryker was here"]`
- L24 ConditionalExpression: `if (policy) return policy;` → `false`
- L25 MethodExpression: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `deps.backstop?.coveredRoots.every(root => relPath.toLowerCas`
- L25 OptionalChaining: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `deps.backstop.coveredRoots`
- L25 ConditionalExpression: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `false`
- L25 MethodExpression: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `relPath.toUpperCase()`
- L25 MethodExpression: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `root.toUpperCase()`
- L25 Regex: `return deps.backstop?.coveredRoots.some((root) => relPath.toLowerCase() === root.toLowerCa` → `/\//`
- L26 Regex: `relPath.toLowerCase().startsWith(root.toLowerCase().replace(/\/$/, "") + "/"))` → `/\//`
### features/publish-content/raw-row-contributor.ts (65.8%, 126 surv, 13 nocov)
- L10 MethodExpression: `return `${table}:${JSON.stringify(Object.fromEntries(Object.entries(pk).sort(([a], [b]) =>` → `Object.entries(pk)`
- L10 ArrowFunction: `return `${table}:${JSON.stringify(Object.fromEntries(Object.entries(pk).sort(([a], [b]) =>` → `() => undefined`
- L16 EqualityOperator: `if (split < 1) return null;` → `split <= 1`
- L16 ConditionalExpression: `if (split < 1) return null;` → `false`
- L19 ConditionalExpression: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `false`
- L19 ConditionalExpression: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `false`
- L19 LogicalOperator: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `(!pk || typeof pk !== "object" || Array.isArray(pk)) && chec`
- L19 LogicalOperator: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `(!pk || typeof pk !== "object") && Array.isArray(pk)`
- L19 ConditionalExpression: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `false`
- L19 LogicalOperator: `if (!pk || typeof pk !== "object" || Array.isArray(pk) || checkRawTable({ table, columns: ` → `!pk && typeof pk !== "object"`
- no-cov lines: 36,77,86,112,124,158,215
### features/publish-content/repo-handler.ts (77.6%, 25 surv, 19 nocov)
- L156 LogicalOperator: `const schemaVersion = config.schemaVersion ?? 1;` → `config.schemaVersion && 1`
- L157 LogicalOperator: `const dependsOn = config.dependsOn ?? [];` → `config.dependsOn && []`
- L157 ArrayDeclaration: `const dependsOn = config.dependsOn ?? [];` → `["Stryker was here"]`
- L167 LogicalOperator: `const omittable = new Set(config.omitWhenAbsent ?? []);` → `config.omitWhenAbsent && []`
- L167 ArrayDeclaration: `const omittable = new Set(config.omitWhenAbsent ?? []);` → `["Stryker was here"]`
- L170 MethodExpression: `fields` → `fields`
- L171 ConditionalExpression: `.filter((field) => !(omittable.has(field) && (row as Record<string, unknown>)[field] === u` → `false`
- L171 LogicalOperator: `.filter((field) => !(omittable.has(field) && (row as Record<string, unknown>)[field] === u` → `omittable.has(field) || (row as Record<string, unknown>)[fie`
- L183 ConditionalExpression: `if (err instanceof PublishContentApplyRowError || !(err instanceof Error)) return err;` → `false`
- L183 LogicalOperator: `if (err instanceof PublishContentApplyRowError || !(err instanceof Error)) return err;` → `err instanceof PublishContentApplyRowError && !(err instance`
- no-cov lines: 138,140,143,147,148,171,198,209
