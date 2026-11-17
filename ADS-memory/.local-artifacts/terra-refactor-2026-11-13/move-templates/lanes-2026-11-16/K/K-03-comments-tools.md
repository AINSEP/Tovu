# K-03 comments agent tools -> `@jini-ai/cms/comments` (one run, est 200k)
files: `K-03.files.tsv` (`comments/agent-tools.ts` 207, `comments/tool-registrations.ts` 387). tools: `K-03.tools.tsv` = 10 (round 1 said 13: it counted the `prepare/describe/run` callbacks of `comments_set_provider`), longest 26; one tool wrapped by `approvalToolHandler`. pkg: cms. THIRD_PARTY_ALLOWED: none. tests: `apps/website/src/features/comments/**/*.test.ts`.
over the limit: `buildCommentsRegistrations` 127.
BINDINGS (complete typed binding; the host deps type keeps today's fields):
| import | class | action |
|---|---|---|
| `toolMetadata` (`tool-metadata/comments.js`) | host | `withToolMetadata` |
| `getCommentsSettings(deps, input)`, `setCommentsSettings(deps, input)` (`./settings.js`, STAY) | port | `deps.commentsSettings: { get(input: { workspaceId: UUID }): Promise<CommentsSettings>; set(input: SetInput): Promise<CommentsSettings> }` where `SetInput` is declared in Jini with the fields the handler passes today. Tovu binding: `{ get: (input) => getCommentsSettings({ settingsRepo: deps.settingsRepo }, input), set: (input) => setCommentsSettings(<the same deps object the handler builds today>, input) }` |
| `SettingsRepoPort` | host | leaves the Jini deps type; stays on Tovu's `CommentsHostToolDeps` (exported from the binding; = today's `CommentsToolDeps`) |
| `ForbiddenError as SettingsForbiddenError` (`../settings`) | port | it is an error CLASS used in `forbiddenRule({ domainPrefix: "COMMENTS", error })`, not a predicate: `deps.settingsForbiddenError: abstract new (...args: never[]) => Error`; the Jini rule list is built by `commentsModelFacingRules({ settingsForbiddenError })` with the class in the SAME position (rule order is behaviour) |
| `approvalToolHandler`, `refuseUnexpectedKeys` (`#src/contracts/core/human-confirm`) | port | `deps.approvalHandler` (pattern, approval section); `refuseUnexpectedKeys` is 4 lines throwing `ToolInputError`: `deps.refuseUnexpectedKeys` (do not copy the wording into Jini) |
| `PrincipalRepoPort` (`@jini-ai/user-management`), `CommentsProviderRegistry` (`@jini-ai/capability-providers/comments`) | structural | local interfaces, members actually called only |
| `@jini-ai/cms/comments`, `@jini-ai/cms/core` | own | leaf files |
| daemon/platform default surfaces | delete | `surfaces` is REQUIRED in the Jini signature (the approval tool reads it); Tovu tests use `__tests__/helpers/test-surfaces.ts` (new, holds the old default expression) |
STAY in this lane (host-owned provenance/provider selection): `builtin-provider.ts`, `provider-selection.ts`, `comment-targets.ts`, `ip-hash-salt.ts`; `public-markers.ts` also holds marker rendering and a consent-script snippet (judge sample): it is NOT a pure binding; it is listed in the design queue, not moved here.
S0 extra: (f) a settings write refused by the host returns the same refusal code (`COMMENTS_...`) and message (V3: swap the rule position -> RED if a broader rule now matches first); (g) `comments_set_provider`: declined -> no `set` call on the settings fake.
changeset: cms minor.
