Completed IDs **01–16**; stopped: **none**.

- Same-file extractions preserve original statements and comments.
- All inspected functions satisfy **≤50 code lines and complexity ≤10**.
- Removed **3 size-debt rows and 1 complexity-debt row**; added none.
- Repointed local handler, route, and composition calls. External imports/exports remain unchanged.
- Tests added: none; mutation: N/A. No tests, builds, installs, type-checks, or linters ran.

Files over 500 physical lines, relative to `apps/website/src/`:

| File | Lines |
| --- | ---: |
| `features/post/tool-registrations.ts` | 507 — newly over |
| `features/source-control/tool-registrations.ts` | 517 |
| `features/source-control/store.ts` | 580 |
| `features/external-mcp/tool-registrations.ts` | 793 |
| `server/inbound/admin-http/routes/system/site-key.ts` | 621 |
| `server/runtime/composition/peer-site-reads.ts` | 514 — newly over |

Created only [COMMIT-PLAN.md](SCR/c-tv-fn50-2/COMMIT-PLAN.md), containing all 16 entries, messages, exact paths, and scope-review deletions.

Whitespace review passed. `.git` remains untouched; the coordinator commits.
