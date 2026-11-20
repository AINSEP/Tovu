Implemented B06-J and B26-J1 per the cull.

- B06-J: exact Unix classifier change and one new unit test; patch changeset.
- B26-J1: copied importer verbatim except the two `nativeFs.realpath` replacements; appended four tests; minor changeset.
- Added one entry per sheet in [COMMIT-PLAN.md](SCR/c-ub-jini/COMMIT-PLAN.md), including combine checks and the owed `./host/node` API baseline row.

Tests were edited first. Final diff reviewed; no incidental changes or deletions. No package.json, baseline, db/transfer, or Tovu edits.

Tests, builds, installs, typechecks, linters, and mutations were not run, as instructed. No commits made.
