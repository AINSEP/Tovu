# open-fixes — in progress

Branch: `cloud/open-fixes`. Base: `origin/cloud/combine` (`74fedc1320d31431ab4a13d1e38af03a402ca28b`).

Checking all requested items against the rebuilt and relinked base. Changes and focused verification are in progress; no completed test result is claimed yet.

Initial checks identify case-sensitive return-route dispatch, literal replacement-string handling in desktop prompts, and starter template drift. The previous cache correction is present; existing client caches require a separate invalidation mechanism, which is outside this small-fix job.

## Bugs found

- Return-route dispatch treats capitalized paths differently from the mounted handler.
- Desktop prompt replacement interprets special replacement sequences in site names.
- Starter Reset copies lack the consent-loader additions present in the shipped pages.
- The same template drift also affects the other bundled theme; listed for follow-up outside the named starter correction.
- Existing client caches cannot be retroactively purged by changing future response headers.

## Validation

Jini clean rebuild is running before relinking Tovu and recording focused baseline results. Final report will include exact commands, results, item dispositions and pushed commits.
