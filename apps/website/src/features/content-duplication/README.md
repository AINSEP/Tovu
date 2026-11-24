# features/content-duplication

## Wiring

- `content_duplicate`'s catalog lives in `@jini-ai/cms/content-duplication/agent-tools`; the naming policy (`deriveAvailableName`, `deriveDuplicateName`, `MAX_SUFFIX_ATTEMPTS`) lives in `@jini-ai/cms/content-duplication/derive-available-name`.
- `tool-registrations.ts` binds the per-resource duplicators (post, page, form, media) and `@jini-ai/core/tool-metadata`; `copy-naming-policy.ts` injects Tovu's suffix style (`"<base> <n>"`) and exhaustion wording into Jini's `deriveDuplicateName`, and the forms, media and post features import that bound function.
