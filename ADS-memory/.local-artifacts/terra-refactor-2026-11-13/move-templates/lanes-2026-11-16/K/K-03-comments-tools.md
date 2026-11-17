# K-03 SP-comments-tools-1: comments agent tools -> `@jini-ai/cms/comments`
kind: SPLIT (K-TOOLS-PATTERN). est: 170k Sonnet.
tovu_files: `K-03.files.tsv` (2 files, 594 lines). decls: `K-03.decls.tsv` (25 declarations, 13 handlers, longest 31). over the limit: `buildCommentsRegistrations` 157.
ports: `getCommentsSettings`/`setCommentsSettings` (`./settings.js`, 285 lines, STAY: settings bindings) -> `deps.commentsSettings: { get(...), set(...) }` with the same argument objects; `SettingsRepoPort` leaves `CommentsToolDeps` (it is only passed to those two); `SettingsForbiddenError` (`../settings/index.js`) -> `deps.isSettingsForbidden(error): boolean` (the handler maps it to a tool refusal; keep the mapping, inject the test). `PrincipalRepoPort` (`@jini-ai/user-management`, type) -> local structural port.
surfaces: 2 occurrences -> one handler reads it: `surfaces` is REQUIRED in the Jini signature; Tovu test helper `__tests__/helpers/test-surfaces.ts` rebuilds the old default for the 7 test files.
provenance (plan-v6 K2): comment provenance and provider selection stay host-owned: `builtin-provider.ts`, `provider-selection.ts`, `public-markers.ts`, `comment-targets.ts`, `ip-hash-salt.ts` (reads `process.env`) are STAY in this lane.
characterization (S0): pattern plus (f) a settings write refused by the host returns the same refusal text (fails if the injected predicate is wired wrong).
changeset: cms minor. census: `K-03.census.txt`.
