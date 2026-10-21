Code Inspection(Peer Review): Personas used: code-inspection, security, TDD.

Locations refer to the reviewed branch tips. Review was read-only; tests, builds, and metrics were not run.

| Sev | repo:file:line | Problem | Concrete fix |
|---|---|---|---|
| HIGH | `tovu-int:apps/website/src/features/object-storage/media-store.ts:2` | Tovu imports newly added Jini exports, but its unchanged lockfile still pins the previous published packages (`package-lock.json:3025`, `3279`). A clean install cannot obtain these branch-only exports. | Publish updated core, platform, cms, and agent-plugins packages, then update Tovu’s dependencies and lockfile. |
| HIGH | `jini-int:packages/platform/src/object-store/local-fs.ts:28` | Containment is lexical only. If `<root>/link` points outside the root, `link/victim` passes validation; reads, writes, and deletion follow that directory symlink outside storage. | Enforce physical containment through existing ancestors and protect final file operations against symlink substitution. Add directory- and file-symlink cases. |
| HIGH | `tovu-int:apps/website/src/features/object-storage/media-store.ts:113` | `mediaBucket` need only be nonblank. Setting it equal to the connection’s public `bucket` writes private originals and documents into public storage, contradicting the stated separation guarantee. | Reject equal normalized publish/media bucket names before creating the provider; add an equality regression test. |
| HIGH | `tovu-int:apps/website/src/server/runtime/composition/deps.ts:775` | Setting-selected remote media leaves `mediaIsRemoteByEnv` false. Repository backups scan the unused local uploads folder and omit the remote-media exclusion warning (`sources.ts:379`), producing silently incomplete backups. | Derive backup behavior from the effective media provider, including setting-based selection. Test the resulting backup files and scope warning. |
| MEDIUM | `tovu-int:content/agent-plugins/s3-compatible/object-stores/s3-compatible.mjs:145` | Header overrides are case-sensitive JavaScript properties. Caller `if-none-match` plus generated `If-None-Match` become duplicate HTTP header values rather than the required `*`; `Content-Type` has the same problem. The test covers only identical casing. | Construct a native `Headers`, then use `.set()` for enforced headers. Test mixed-case inputs through HTTP header normalization. |

The deleted S3 tests retain corresponding meaningful byte, error, signature, rendition, and telemetry assertions in the replacement suites. Their reported execution and coverage remain unverified.

**Rules check**

- Plugins never import each other: **OK** — the import at `tovu-int:content/agent-plugins/s3-compatible/object-stores/s3-compatible.mjs:35` stays within its own plugin.
- Generic code in Jini, site wiring in Tovu: **OK** — contract at `jini-int:packages/core/src/object-store.ts:51`; Tovu wiring at `features/object-storage/registry.ts:62`.
- Two-object API signatures: **violated** — exported `parseObjectStoresFile(raw: string)` at `tovu-int:apps/website/src/features/object-storage/registry.ts:96`. Change to `({ raw }, optional = {})`.
- Dependencies injected as ports: **OK** — media ports at `tovu-int:apps/website/src/features/object-storage/media-store.ts:40`; S3 signer supplied at plugin line 262.
- React data through props: **OK / not applicable** — no React component changes.
- Cyclomatic complexity ≤10: **unverified** — metrics were prohibited; no measured pass claimed.
- Existing “why” comments preserved: **OK** — private-bucket rationale and conditional-write rationale moved into the S3 plugin at lines 13 and 174.
- ADR-066 TypeScript migrations only: **OK / not applicable** — no schema migrations added.
- No data loss: **violated for backup completeness** — `tovu-int:apps/website/src/server/runtime/composition/deps.ts:775`; existing local paths and S3 key derivation are preserved.
- Unflagged `// TEMP: replaced by shared helper`: **OK** — none added.

**Verdict: MERGEABLE AFTER FIXES** — fix the containment, private-media, backup, header, dependency-release, and API-contract issues before merging.
