VERDICT: REJECT

The 115 edges have assigned lanes, and v3 removes the earlier waivers. The dry run covered L01, L02’s locale move, and a cache move the coordinator has since ruled out. The remaining design has behavior changes, incomplete caller migrations, and false-green gates. This was a read-only review of both pinned checkouts. I ran no tests, builds, or type-checks.

Source paths below are relative to `apps/website/src` unless shown otherwise.

| ID | Severity | Sheet | Claim vs evidence | Fix |
|---|---|---|---|---|
| F1 | blocker | All, L00 | G2/G3 hide failed `comm` calls inside `test -z "$(…)"`. G2’s failed status test on the left of `&&` can continue. G3 accepts any producer status when old errors remain. `INDEX-v3.md:97–114`. | Check comparison statuses separately. Require terminal summaries, matching exit codes, and removal of each lane’s assigned diagnostics. L00 must assert the unchanged 115-edge set and exactly 124 deletions. |
| F2 | major | All | Setup expands `$LANE` under `set -u` before assigning it. G4 only invokes size and complexity checks. `INDEX-v3.md:68–75,89,116–118`, `package.json:65–66`. | Initialize inputs per isolated checkout. Check touched code for caps, two-object APIs, hook defaults, comment retention, and prohibited suppressions. |
| F3 | major | L01 | The rename is correct (`Jini packages/devops/src/deploy/target-contracts.ts:25`, `host-kit.ts:59`). L01:12 leaves forwarders with users, and :17–19 overstates dry-run suite coverage (`facts/dry-run.v3.md:14–16`). | List and repoint forwarding users. Use the recorded test inventory. |
| F4 | major | L04/L10 | L04 leaves the theme binding implicit and shares site-search wiring with L10. `features/site-search/settings.ts:75–83` returns a writer whose input, result, and rejection order must survive. `L04:3–10`, `L10:11–13`. | Pin both setters’ binding and fixture edits. Sequence the site-search changes. |
| F5 | major | L05 | L01 leaves `vendor-credentials/project-scope.ts:1` importing webhooks. Its moved APIs take positional arguments at :39,51. `run-ops.ts:42–56` has a hash fallback, a read override, and ordered sources rebuilt on every call. | Repoint the type import and enumerate signature migrations. Bind the existing key operations without changing precedence or evaluation time. |
| F6 | blocker | L06 | The validator move retains the error dependency on custom credentials (`write-files-validation.ts:5,95–100`), recreating the feature edge. Its direct unit test is missing from G5 (`write-files-validation.unit.test.ts:7,24–66`). | Bind the original validator through composition. Pin its legal import path, error identity, lazy binding, and test repointing. |
| F7 | blocker | L07 | The characterization expects a WebMCP script. `site-export/export-html-policy.ts:102–103` explicitly disables injection, and `site-exporter.ts:596` calls it. | Assert disabled injection and unchanged form/base rewrites. Pin transitive wiring or share the pure download transforms. |
| F8 | blocker | L08 | The proposed contracts move violates the decision. The cache has **two** WeakMaps (`media/access-evidence.ts:15–37`). Media generation currently always calls preview (`media-generation/tool-registrations.ts:465`); an absent callback can silently drop it. | Keep media ownership. Wire one shared cache through a small read/invalidate port in both roots. Preserve synchronous invalidation, pending scans, and generation preview binding. |
| F9 | major | L09/L10 | L09’s `find(themeId)` is positional and hides `findThemeOrThrow` (`facts/edges.v3.tsv:75`). Its constants destination disagrees with `INDEX-v3:56`. L10 leaves the registrar’s concrete `PostRecord` migration implicit (`plugin-runtime/capability-tool-registrations.ts:17,75`). | Specify exact signatures and destinations. Migrate the registrar and derive the push-plan input from `entryPublicPath` (`publish-content/push-plan.ts:103`). |
| F10 | major | L11/L12 | Restore creates its catalog from the staging layout and `sourceRoot` (`site-backup/import-plugin-state.ts:27–43`). Member login has a fifth call, `requestSignInLink`, whose failures are translated (`member-login/link-service.ts:166–173`). | Bind the lookup against the staging lifecycle. List all five member operations and preserve proof error mapping and notification order. |
| F11 | blocker | L14 | The negative case removes optional `post.forgetRemoved` (`publish-content/tovu-publish-ports.ts:61–67`). Entries consume nested `p.terms` (`entries/publish-content.ts:49–62`), while composition shares that slice at `content-publish-ports.ts:55–76`. | Keep the bag in composition. Specify the nested callback shapes and every generic caller and fixture. Test omission of a required member and pin the fallback’s hook behavior (`tool-registrations.ts:441–451`). |
| F12 | major | L15 | L15 names nine errors but leaves wiring alternatives and caller lists open. The report has ten non-feature errors overall, including rendition assigned to L08. `facts/check-boundaries.v3.2d82735a.txt:177–190`. | Make all nine L15 fixes mandatory. Name exact modules, bindings, callers, tests, and STOP conditions. |

**Dispatch**

- **READY-FOR-CODEX after shared gate repair:** L02 and L03 for declaration moves, L13 for type narrowing.
- **NEEDS-FIX:** L00, L01, L04–L12, L14, L15. Findings above identify the required edits. L14 needs a complete generic migration map before dispatch.
- **Parallel:** L02 + L13 are candidates after gate repair. Reject the published waves. L03/L10 share search files, L04/L10 share search wiring, L06/L14 touch tool registration wiring, and L12/L15 target `composition/modules/members.ts`. Require explicit edit manifests before dispatching more lanes together.

**Earlier findings**

CODEX-JUDGE-1

- Baseline refs — resolved by pinned heads.
- Inventory drift — resolved in the recorded tip inventory.
- Baseline provenance — resolved by removing provenance-dependent acceptance.
- Cycle comparison — resolved for the pinned base.
- Diff-based lane counts — replaced by edge lists. Collision claims remain open.
- API surface/runtime pair — resolved at base. Integrated result unverified.
- Blanket waiver — resolved in design.
- Failed producers — unresolved, F1.
- STOP enforcement — unresolved, F1–F2.
- Collisions and prerequisites — unresolved, F2 and parallel review.
- Extractor completeness — removed from gates, but `edges.v3.tsv:104` still has two `?missing` origins.
- Permanent CLI — removed.
- Native gates — adopted. Wrapper defects remain.

CODEX-JUDGE-2

- #1 Waivers and missing edges — waivers removed. Restore binding remains open.
- #2 False greens and TAP — final runner status fixed. Intermediate gates remain open.
- #3 Publish bag — composition destination fixed. Migration and negative case remain open.
- #4 Credential invalidation — resolved structurally. Existing invalidation port stays intact.
- #5 Green integration state — architecture base qualified. Boundary closure remains open.
- #6 Media access — unresolved under the required port design.
- #7 Type ownership — canonical imports and OAuth storage scope addressed. Preview migration remains open.
- #8 Dispatch — pins and S3b replay addressed. Setup and overlaps remain open.
