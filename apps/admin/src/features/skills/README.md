# features/skills

The Skills screen (list, rows, dialogs, data hooks over `api.ts`). Copy, the row chevron, the upload
encoder and the failure formatter live in `@jini-ai/admin/screens/skills/*`.

## Wiring

- `skill-failure-host.ts` binds what `@jini-ai/admin`'s `skillFailure` needs from this app: the
  transport `ApiError` and `describeApiError` (`lib/admin-http/request.ts`) and the product redaction
  options (`@tovu/contracts/secret-redaction`). Every caller spreads `SKILL_FAILURE_HOST`.
- `SkillInstallPayload` comes from `@jini-ai/core/contracts/site/skill-install` (read by `api.ts`).
- `skills.css` styles the moved chevron by `.jini-agent-plugin-chevron-glyph`.
