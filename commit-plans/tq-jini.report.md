Implemented **J7**: verbatim registry move, forms export, three ported test cases, and changeset.

Stopped the remaining sheets under the strict move rules:

- **J6a:** tests require host bindings and fixture changes.
- **J6b:** depends on stopped J6a.
- **J4:** suites depend on host sweep code and post fixtures.
- **J2:** suites assert the stylesheet explicitly retained in Tovu.
- **J1:** the 549-line validator exceeds the hard 500-line limit.

Recorded one entry per sheet in [COMMIT-PLAN.md](SCR/c-tq-jini/COMMIT-PLAN.md).

No tests, builds, installs, typechecks, linters, or mutations ran. Git metadata, Tovu, package metadata, and dropped sheets remain unchanged.
