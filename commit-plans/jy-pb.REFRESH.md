# jy-pb refresh notes

Base: merge-6 (`d3e78b387`).

- J12: all 28 audited anchors edited; no stopped anchors or importer repoints. Migration comments only; migration bodies and digest values remain unchanged.
- J14: the two compatibility-only anchors in `packages/plugins/CHANGELOG.md:132` and `:133` remain verbatim, as required by CULL rule 6. The surrounding prose has no product name to replace.
- J14: skipped `packages/commerce/source-map.md`, `packages/devops/source-map.md`, `packages/integrations/source-map.md` and `packages/plugins/source-map.md`; these belong to the parallel K9 job. No source-map file was edited.
- J-03, J-04, J-05: no outside-file exact-symbol hits, baseline hits, or importer repoints.
- J-06 STOPPED: `git grep -n -w 'defaultReadFile' -- packages/` found an outside-file hit at `packages/daemon/docs/call-shape-sweep.tsv:16753`. It is a captured comment naming the reader's `finish()` guard, associated with `agent-runtime/src/json-event-stream.ts:70`. This is documentation rather than a production importer, but the explicit struct-sheet STOP rule covers outside-file uses. The CLI file is unchanged; no static import was added and the dynamic import was not removed.
- No unlisted test importers required repointing. No tests were edited or run. No changesets were written. No out-of-scope edits were deleted during diff re-read.
