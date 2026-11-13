### tovu:apps/website/src/server/runtime/composition/tool-catalog-manifest.ts
- **Over:** `installFirstPartyToolContributors` 252 (file 384, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-09
- **Tests:** `apps/website/src/features/deployments/deploy-ops/__tests__/search-discoverability.test.ts`, `apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.trash-item.test.ts`, `apps/website/src/assistant/__tests__/byok-tool-surface.test.ts`, `apps/website/src/features/fs-files/__tests__/wiring.integration.test.ts`. No test mocks this module.
- **Responsibility map:** one function = the first-party tool manifest. Most statements are one-line `contributions.contributors.register(...)`; six blocks carry their own wiring and become helpers.

| unit | statements (anchors) | job |
|---|---|---|
| A (stays) | `toolSearchKeywords({}, …)` … `contributeDeployOpsTools(…)`; `const bundledPluginsRoot = bundledAgentPluginsDir();`; the one-line registers between the blocks | manifest order + plain one-line contributors |
| B | `const domainDnsHttpClient = createHttpClient(DOMAIN_DNS_EGRESS_POLICY, …)`, `const domainDnsDiagnostics`, `const publicDnsResolver`, `contributeDomainDnsAndChangeTools<…>` register | domain DNS/TLS tools + their egress client |
| C | `const plugins = contributePluginsTools();` through `contributions.contributors.register({ contribution: { ...agentPluginsInstall, build: …` | plugin + agent-plugin install tools (attachment reader) |
| D | `contributePostTools()` register through `installFirstPartyPublishContentTypes();` | post + publish-content tools |
| E | `const publicBrowserPool = createRenderBrowserPool({` through the `contributeWebScreenshotTools(` register | public web fetch / screenshot tools sharing one browser pool |
| F | `contributions.contributors.register({ contribution: { domain: "credential-copy"` through the `provider-status` register (incl. `candidatePaths`, `committedRoot`, `findPublishCandidate`) | credential copy/save, project keys, provider status |
| G | `contributeThemesTools()` register through the final `for (const contributor of [` loop | themes, change sets, permanent delete, trash, widgets, workspace, duplicate handlers |

- **Splits:** HELPERS in the same file, module level, directly above `installFirstPartyToolContributors`, each called at the exact spot its block was (registration ORDER must not change). Every comment inside a block moves with it.
  1. `registerDomainDnsTools({ contributions, createHttpClient, observability, bundledPluginsRoot }: RegisterDomainDnsToolsInput): void` ← block B (`bundledPluginsRoot` stays declared in the main function just before the call, since F also uses it).
  2. `registerPluginInstallTools({ contributions, readInstallAttachment }: RegisterPluginInstallToolsInput): void` ← block C.
  3. `registerPostAndPublishContentTools({ contributions }: RegisterPostAndPublishContentToolsInput): void` ← block D (keeps the two publishing-tools comments and the TYPE-registry comment).
  4. `registerWebReadTools({ contributions, createHttpClient, observability }: RegisterWebReadToolsInput): void` ← block E (`web_fetch_page` / `web_screenshot_page` comments move).
  5. `registerCredentialAndProviderTools({ contributions, bundledPluginsRoot }: RegisterCredentialAndProviderToolsInput): void` ← block F.
  6. `registerThemeTrashAndWorkspaceTools({ contributions }: RegisterThemeTrashAndWorkspaceToolsInput): void` ← block G (all F7a/F7b/Owner-Q1/theme_* comments move).
  Types: `contributions: AssistantToolContributions`; `createHttpClient: typeof createDefaultHttpClient`; `observability?: ObservabilityPort`; `readInstallAttachment: InstallAttachmentReader`; `bundledPluginsRoot: string` (use the return type of `bundledAgentPluginsDir` if not `string`).
- **Importers to update:** none (no export moves).
- **After:** file ~415; `installFirstPartyToolContributors` ~85; largest helper (F) ~58.
- **Risks / notes:** registration order is observable (catalog/search order, duplicate-domain checks) — call sites must sit exactly where the blocks were. `observability` is optional in the options; keep it optional in helper inputs.
