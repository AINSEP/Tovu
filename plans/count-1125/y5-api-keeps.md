# Y5 API additive round 2 ledger

The requested ledger was absent at dispatch; this file records the final state without changing the existing G3 keep rules.

| path | state | residual |
| --- | --- | --- |
| features/agent-plugins/automatic-agent-plugins.ts | left | A1: resolver timing; Jini deps.resolve is fixed before the per-entry layout read. |
| features/agent-plugins/connect-tool.ts | deleted | Round 1: connect-bindings.ts. |
| features/agent-plugins/exports/source.ts | deleted | Round 1: exports/bindings.ts. |
| features/agent-plugins/install-tool.ts | left | A2: coupled to the unsupported upload lifecycle reader ABI. |
| features/agent-plugins/install-upload.ts | left | A2: Jini archive entries require openReadStream({}); the host lifecycle reader calls openReadStream(). |
| features/agent-plugins/memory.ts | left | A2: sheet requires upload/install/memory to cut over as one unit. |
| features/agent-plugins/set-enabled.ts | left | A3: activation-effects -> provider-plugin-link -> activation-effects eagerly reads agentPluginActivations. |
| features/webhooks/keyring.env.ts | left | W1: prescribed bindSiteKeyrings export is absent from pinned ordered-keyring.ts. |
| features/webhooks/seal-aad-invariant.ts | deleted | Round 1: development/scripts/check-seal-aad.ts. |
| features/webhooks/secret-scan-guard.ts | deleted | Round 1: development/scripts/check-secret-scan.ts. |
| features/webhooks/site-key-ensure.ts | deleted | Round 2: server/runtime/composition/site-key-write-bindings.ts; required per-call scan hook retained. |
| features/webhooks/site-key-sources.ts | deleted | Round 1: site-key-read-bindings.ts. |
| server/inbound/admin-http/owner-passkey-routes.ts | left | H1: prescribed dev-auth.ts destination already has 723 lines; no permitted split is named. |
| server/inbound/admin-http/routes/external-mcp/oauth.ts | left | H2: requestDeps needs callback/session request facts, while the host mount requires complete initial spec deps. |
| server/inbound/admin-http/routes/external-mcp/probe.ts | deleted | Round 1: composition/modules/external-mcp.ts. |
| server/inbound/admin-http/routes/plugins/install.ts | left | H2: ZIP requestDeps needs req/res, while mountAdminRawRoute requires initial readZipUpload; throwing placeholders are forbidden. |
| server/inbound/admin-http/routes/posts/template-preview-render.ts | left | H3: Jini requires Promise<NonNullable<pageHtmlEmbeds>>; host resolver returns undefined for doc posts. Attempted binding restored. |
| server/inbound/admin-http/routes/publish-content/peer-transport.ts | left | H2: overwrite-session requestDeps cannot satisfy initial mount deps without a forbidden placeholder. |
| server/inbound/admin-http/routes/publish-content/route-helpers.ts | left | H4: Jini requires method/route/discloseDetails; existing mapper and its tests allow these fields to be absent. |
| server/inbound/admin-http/routes/settings/events.ts | deleted | Round 1: composition/modules/settings.ts. |
| server/inbound/admin-http/routes/system/publish-credentials.ts | deleted | Round 1: composition/modules/system-credentials.ts. |
| server/inbound/admin-http/routes/system/publish-site.ts | left | H5: destinations registrar creates spec/deps per request; existing mount takes a registration-time spec. |
| server/inbound/admin-http/routes/system/site-imports.ts | deleted | Round 1: composition/http-app/mount-admin-system.ts. |
| server/inbound/admin-http/routes/system/site-share-password.ts | deleted | Round 1: composition/modules/system-site-shares.ts. |

Totals: 24 originals; 11 deleted, 0 original G3 bindings, 13 left. This round deletes one additional original.

Existing configured G3 files remain in y5-api-g3-keeps.md: features/agent-plugins/connect-bindings.ts, features/agent-plugins/exports/bindings.ts, features/webhooks/site-key-read-bindings.ts. No new G3 rule is claimed. The new writer binding is outside the counted folders.

Counter with available k0/x4/merge25/y5-api G3 keeps: planner=874 true=86 rules=799. Earlier round reported true=87; supplied initial baseline was 97. Full cross-slice command is unavailable because y5-pub-g3-keeps.md is absent. No tests, builds, installs, typechecks or linters ran.

## Y5M final host state

These rows supersede the earlier residual descriptions above. Validation is deferred to Opus; no suites, builds, installs, typechecks or linters ran.

| path | state | residual |
| --- | --- | --- |
| features/agent-plugins/automatic-agent-plugins.ts | G3 | Per-turn layout, host tool catalog, consent copy and logging. |
| features/agent-plugins/install-upload.ts | G3 | Host archive, lifecycle, identity, filesystem and warning ports. |
| features/agent-plugins/install-tool.ts | left | A2: Jini's seed function-valued port accepts AgentPluginLayoutPort, while the host seed requires AgentPluginLayout.workspacesDir. No unlisted adapter or cast added. Error/warning imports repointed only. |
| features/agent-plugins/memory.ts | G3 | Host migration filesystem, lock, identity and diagnostic bindings. |
| features/agent-plugins/set-enabled.ts | G3 | Lazy provider links, site lifecycle, readiness catalog and error identity. |
| features/webhooks/keyring.env.ts | G3 | Frozen salt, source order, filesystem and product copy. |
| server/inbound/admin-http/owner-passkey-routes.ts | G3 | Express request facts, site identity, session and incident bindings. |
| server/inbound/admin-http/routes/external-mcp/oauth.ts | G3 | Host rate, browser binding, session, callback origin and incident ports. |
| server/inbound/admin-http/routes/plugins/install.ts | G3 | Express ZIP reader, local installer, analytics and failure ports. |
| server/inbound/admin-http/routes/posts/template-preview-render.ts | G3 | Site theme, identity, content render and presentation ports. |
| server/inbound/admin-http/routes/publish-content/peer-transport.ts | G3 | Host peer credentials, runtime policy, overwrite session and reporter bindings. |
| server/inbound/admin-http/routes/publish-content/route-helpers.ts | deleted | Optional-facts mapper in Jini and test rewired. |
| server/inbound/admin-http/routes/system/publish-site.ts | G3 | Site credentials, publish run, registry, consent, telemetry and trust adapters. |

Y5M totals: 13 originals; 1 deleted, 11 G3 bindings, 1 left. No rule for the left tool or deleted helper. LEFT-DESKTOP: dependency versions and package-lock refresh remain explicitly dropped.

## Keep rules

```text
^apps/website/src/features/agent\-plugins/automatic\-agent\-plugins\.ts$
^apps/website/src/features/agent\-plugins/install\-upload\.ts$
^apps/website/src/features/agent\-plugins/memory\.ts$
^apps/website/src/features/agent\-plugins/set\-enabled\.ts$
^apps/website/src/features/webhooks/keyring\.env\.ts$
^apps/website/src/server/inbound/admin\-http/owner\-passkey\-routes\.ts$
^apps/website/src/server/inbound/admin\-http/routes/external\-mcp/oauth\.ts$
^apps/website/src/server/inbound/admin\-http/routes/plugins/install\.ts$
^apps/website/src/server/inbound/admin\-http/routes/posts/template\-preview\-render\.ts$
^apps/website/src/server/inbound/admin\-http/routes/publish\-content/peer\-transport\.ts$
^apps/website/src/server/inbound/admin\-http/routes/system/publish\-site\.ts$
```
