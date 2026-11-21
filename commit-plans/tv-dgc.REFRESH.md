# Refresh items for combine

- V1: `apps/website/src/assistant/__tests__/automatic-agent-plugins.integration.test.ts:423` is an additional test-only caller of `buildAgentPluginSearchRegistrations`. Applied only the matching required-authorizer argument with an explicit allowed fixture callback; no fixture, preflight, loader, import or assertion changes.
- V1: DEPENDS: Jini jx-dgc J1. No installed `@jini-ai/agent-plugins` is present here, and Jini's `origin/codex/jx-dgc` object was unavailable. Link/publish the J1 contract in combine and verify the required `requirePermission` input; no local package or lockfile edit. Update the paired Jini API baseline/changeset there.
- V2: combine with `fix/cloud-bugs-1120`; its named builder policies and assembly append were inspected read-only and still match the sheet. Existing component-manifest test imports `ALL_MANIFESTS` from `@jini-ai/ui/interactive-ui/manifests`; the new table uses that exact entry.
- V3 STOP: `apps/website/src/server/inbound/admin-http/routes/media/import-url.ts:7` imports `fetchImage`, invoked at line 55. This production importer is absent from V3's allowed importer list. Add it to a reviewed sheet before redispatching V3; no V3 source or test edits made here. The linked `HttpRequest.signal` contract and held-download witnesses remain unverified.
- V4: no extra importers or migrations. The 50-row picker limit is retained; the ID path alone is narrowed.
- QV1–QV4: no stale, already-messaged or error-boundary anchors found in the named lines; existing imports and expressions preserved. Combine owns execution and the 20/9/8/8 message changes plus each named one-message removal/count mutation.
- Chrome after combine: V2 one allowed admin-assistant call; V4 saved-key adoption flow.
