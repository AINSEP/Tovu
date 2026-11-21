All eight sheets are implemented; none STOPPED. Tests were written before source changes and inspected, but not run. Git state, manifests, and API baselines were left untouched.

| Sheet | Files and tests | Changeset |
|---|---|---|
| ACP-3 | Resume handling, daemon forwarding, harness, and resume tests | `jz2-acp-3.md` |
| ACP-4 | Model/effort selection, session types/state, daemon forwarding, and selection tests | `jz2-acp-4.md` |
| ACP-5 | Release hooks, descendant cleanup, contracts, harness, and cleanup tests | `jz2-acp-5.md` |
| E4-J-TRACKER | Reporter and reporter tests; original-error identity and call secrets asserted | `jz2-e4-tracker.md` |
| E6a-J-NOTICE | `ErrorNotice.tsx` and tests; two id-only cases added | `jz2-e6a-notice.md` |
| E9-J-FRAME | IPC parser, three test files, and API spec; fixed refusal asserted | `jz2-e9-frame.md` |
| E-C-J | CLI resolver/caller, four test files, docs, and registry comment; identity case added | None |
| E-O-J | Node selector and tests; existing calls repointed and identity case added | None |

BREAKS: `@jini-ai/cli resolveDaemonUrl(required: { env }, options = {})`

BREAKS: `@jini-ai/devops ./local-dev selectNodeRuntime` signature; the host dev script requires the later host fix.

[COMMIT-PLAN.md](SCR/c-jz2-a/COMMIT-PLAN.md) contains exact per-sheet file inventories, test names, red reasons, mutations owed, and size notes.

[REFRESH.md](SCR/c-jz2-a/REFRESH.md) records merge order and unchanged direct dispatch callers. No unlisted test importer needed repointing.

Diff reread found only required deletions: tracker/IPC helpers, IPC direct tests, obsolete bug expectations/comments, and env-option plumbing. Combine verification remains outstanding.
