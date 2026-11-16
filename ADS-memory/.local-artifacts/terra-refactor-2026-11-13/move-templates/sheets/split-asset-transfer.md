id: SP-asset-transfer-1   (template T-SPLIT; written 2026-11-16 from Tovu b28d38c6 / Jini b7666092, refactor/terra; skeleton by make-sheet.py)
feature: website/features/asset-transfer   (W1 #39, level 5)
status: BLOCKED (owner question Q-AT + precondition). No executable slice.
tovu_files:
  - apps/website/src/features/asset-transfer/copy-tool.ts | blob 15fb0e88f2f8c97ac89dc398a123225de54df4b2 | 168 loc (only backlog file; asset-sources.ts / asset-destinations.ts are not in the backlog)
kind: SPLIT (label MIXED, survey: "glob expand + byte-cap staging + url/local source -> @jini-ai/cms/media (CORE-CONTRACT-NEEDED: core + cms + daemon). Ports: AssetSourcePort, AssetDestinationPort, approval surface"). Confirmed SPLIT, but not Sonnet+review tier: it needs a new contract (Opus).
split (every top-level declaration, as it would go once Q-AT is answered):
  - FILES_COPY_LIMITS | STAY-PRODUCT (caps tied to Tovu theme import max and Tovu writer caps)
  - catalog, filesCopyAgentToolCatalog, filesCopyDerivedRisk, byId | STAY-PRODUCT (tool text names Tovu roots picked/site/theme/media/library and Tovu tools fs_write_files, library_save_attachment)
  - callerError | STAY-WIRING (Tovu error classes from fs-files, theme, media-import)
  - readUrl | STAY-WIRING (Tovu fetchImage + SSRF egress policy + theme font sniffer)
  - requireGlob, readLocal (glob expansion over a bounded listing with a truncation refusal and byte caps) | MOVE candidate -> Jini, needs ports: listFiles({rootPath, relativePath}) -> {files, truncated}, readFile({rootPath, relativePath, maxBytes}) -> bytes, resolveSource(source) -> {rootPath, relativePath}
  - prepare, requireCopyDestination, readGroup | STAY-WIRING (Tovu destination kinds and the picked-folder rule)
  - prepareLibraryFiles | STAY-WIRING (already one call to Jini validateDocumentIngress)
  - appendFiles (aggregate count/byte caps) | MOVE candidate (pure)
  - buildFilesCopyRegistrations, contributeFilesCopyTools | STAY-WIRING (approval exchange, registry)
why blocked:
  1. The moved half needs `node:path` `matchesGlob` + Buffer: target `@jini-ai/cms/media` is tagged for which runtime? A `universal` entry may not reach `node:` (COMMON rule 17), so it needs a new node-only subpath (e.g. `@jini-ai/cms/media/staging`, runtime `node`).
  2. The survey's contract spans core + cms + daemon (`AssistantSurfaceDeps` is `@jini-ai/daemon`): COMMON rule 5 forbids cms code importing daemon; the approval surface must become a port. That is the CORE-CONTRACT-NEEDED design the survey flagged, not a fill-in.
  3. depends_on: website/features/theme and website/features/media-import, both in the 24-feature cycle-cut SCC (PLAN.md W3). Their error predicates and fetchImage are imported here; the STAY side keeps them, but the sheet's census on those files will churn when W3 lands.
owner question Q-AT: is the files_copy staging core (glob over a bounded listing, truncation refusal, per-file/aggregate byte caps) a Jini capability worth a new node-only subpath with three file ports, or Tovu product? Recommendation: YES but after W3 (theme/media-import cuts): one Opus sheet then, with `stageAssetFiles({ sources, listFiles, readFile, resolveSource }, { maxFiles, maxFileBytes, maxTotalBytes })` in `@jini-ai/cms/media/staging` (runtime node) and Tovu keeping prepare/readUrl/registrations. Until then: STAY.
untangle_overlap: none (no *.repoint.tsv row names copy-tool.ts)
est. tokens: sheet after Q-AT ~45k Opus; execution ~50k Sonnet.
