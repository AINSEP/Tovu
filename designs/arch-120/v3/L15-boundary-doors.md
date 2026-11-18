# L15 — boundary doors (9 `check:boundaries` errors that are not feature edges) — OWNER DECISION

Judge 2 #5 requires both native commands green. After L06 and L08 the tip's 14 errors drop to 9,
none of them a `features → features` edge, so they are outside the owner's arch-120 rule as
worded. If kept in scope, the same moves apply (no rule edits, no door-list additions):

| error | fix |
|---|---|
| `server/runtime/lifecycle/local-site-process.ts → platform/site-dir/local-admin-bundle.ts`, `platform/dev-host/warm-site-agent.ts → platform/site-dir/local-site-supervisor.ts`, `features/site-backup/archive-manifest.ts → platform/site-dir/schema-guard.ts` | I: the caller receives the function from composition (site-backup), or import via `platform/site-dir`'s declared entry |
| 4 × `assistant/site/* , server/.../published-webmcp.ts → features/theme/visitor-publication.ts` | I: visitor-publication reader passed in the visitor route ports (same pattern as combine-3 fix `f71fd9c1` `hookInput`) |
| `server/.../extra-head.ts → features/seo/page-head-contributor.ts` | I: page-head contributor passed in the page render deps |
| `server/.../members/deps.ts → features/members/tool-registrations.ts` | H: the deps builder moves to `server/runtime/composition/modules/members.ts` |

**Gates:** shared gate, `LANE=L15` with an empty `v3/edges/L15.txt`; acceptance = `npm run check:boundaries` exit 0.

Base: Tovu `2d82735a` (integ/merge-3 tip). Edge list for G2: `designs/arch-120/v3/edges/L15.txt`. Every source line/kind/symbol origin: `facts/edges.v3.tsv` rows with lane `L15`.

