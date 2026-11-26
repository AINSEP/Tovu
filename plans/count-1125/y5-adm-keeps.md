# Y5 adm G3 bindings

## Keep rules

```text
^apps/admin/src/components/WidgetConfigFields/MediaContentEditor\.tsx$
^apps/admin/src/features/deployment/hooks/use-static-export\.hooks\.ts$
^apps/admin/src/features/email/email-panel\.tsx$
^apps/admin/src/features/pages/rules\.ts$
^apps/admin/src/features/posts/hooks/use-posts\.hooks\.ts$
^apps/admin/src/features/storage/Storage\.tsx$
^apps/admin/src/hooks/use-admin-appearance\.hooks\.ts$
^apps/admin/src/features/security/hooks/use-other-credentials\.hooks\.ts$
^apps/admin/src/features/media/hooks/use-edit-media-panel\.hooks\.ts$
^apps/admin/src/features/media/hooks/use-media\.hooks\.ts$
^apps/admin/src/features/settings/hooks/use-external-mcp\.hooks\.ts$
^apps/admin/src/features/settings/hooks/use-external-mcp-admissions\.hooks\.ts$
^apps/admin/src/features/deployment/hooks/use-publish-credentials\.hooks\.ts$
^apps/admin/src/features/deployment/hooks/use-static-publish\.hooks\.ts$
^apps/admin/src/features/posts/Posts\.tsx$
^apps/admin/src/features/publish-content/PublishContentDialog\.tsx$
^apps/admin/src/lib/settings-tabs\.ts$
^apps/admin/src/features/settings/ExternalMcpSettingsPanel\.tsx$
^apps/admin/src/features/settings/SettingsUi\.tsx$
```

## Round 2 status

No additional keep rules: the required Jini `codex/y5-adm-2j` ref and supplied report were unavailable. The seven existing binding entries above are retained. Direct lazy-route preparation does not add a counted binding; per-target blockers and named mutations are recorded in the uncommitted root `COMMIT-PLAN.md`.

## Round 3 status

Nine additional G3 bindings: other-credentials, both media controllers, both MCP hooks,
both deployment controllers, Posts and the publish dialog. PageEditorPreview is deleted.
Remaining contract gaps and ordered file lists are in the uncommitted root COMMIT-PLAN.md.
