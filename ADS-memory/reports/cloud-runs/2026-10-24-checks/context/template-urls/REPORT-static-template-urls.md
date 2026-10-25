Programmer(Execution) + Security(Review): scoped fix and URL-boundary review.

Changed only:

- [plugin-export.ts](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/cms/src/widgets/html/plugin-export.ts)
- [plugin-export.unit.test.ts](/Users/la/Programming/tovu-integration-clones/jini-int2/packages/cms/src/widgets/__tests__/plugin-export.unit.test.ts)
- [.changeset/cms-plugin-export-static-urls.md](/Users/la/Programming/tovu-integration-clones/jini-int2/.changeset/cms-plugin-export-static-urls.md)

URL attributes now require whole slots: `{{host.signIn}}` or `{{host.assets.mark}}`. Added refusal, acceptance, and fallback regressions. Measured maximum CCN: **10**. No tests run; no commits.

**Unresolved:** this checkout swallows refusal errors during resolution. I need J2’s referenced refusal-reason contract to expose diagnostics without inventing a conflicting shape.

```bash
cd packages/cms && npx vitest run src/widgets/__tests__/plugin-export.unit.test.ts --maxWorkers=2 --minWorkers=1
```
