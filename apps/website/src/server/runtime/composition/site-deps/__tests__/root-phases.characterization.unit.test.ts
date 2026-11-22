import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import ts from "typescript";

// Pins what this sheet must not change: the root's statement sequence (fixed points + phase calls), the
// statements each phase took in their root order, and that getter inputs are only read lazily.
const DEPS = new URL("../../deps.ts", import.meta.url);
const BOOT = new URL("../boot-phases.ts", import.meta.url);
const ASSEMBLY = new URL("../assembly-phases.ts", import.meta.url);
const parse = (url: URL): ts.SourceFile => ts.createSourceFile(url.pathname, fs.readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true);
const firstLine = (node: ts.Node): string => node.getText().split("\n")[0].trim();
function bodyOf(file: ts.SourceFile, name: string): readonly ts.Statement[] {
  const found = file.statements.find((s): s is ts.FunctionDeclaration => ts.isFunctionDeclaration(s) && s.name?.text === name);
  assert.ok(found?.body, `${name} not found`);
  return found.body.statements;
}
function eagerReads(statements: readonly ts.Node[], getters: readonly string[]): string[] {
  const eager: string[] = [];
  const visit = (node: ts.Node, nested: boolean): void => {
    const parent = node.parent;
    if (ts.isIdentifier(node) && getters.includes(node.text) && !nested && !(ts.isPropertyAccessExpression(parent) && parent.name === node) && !ts.isBindingElement(parent) && !ts.isPropertyAssignment(parent)) eager.push(node.text);
    ts.forEachChild(node, (child) => visit(child, nested || ts.isFunctionLike(child)));
  };
  for (const statement of statements) visit(statement, false);
  return eager;
}
const fileOf = (name: string): URL => (["assembleRouteDepsPhase","finishRouteDepsPhase"].includes(name) ? ASSEMBLY : BOOT);

test("R: the root is its fixed points and the phase calls, in order", () => {
  const expected: readonly string[] = [
    "const { store, onStoreClose } = opened;",
    "const pendingLifecycleEvents: Array<Parameters<RouteDeps['tracker']['capture']>> = [];",
    "let lifecycleTracker: Pick<RouteDeps['tracker'], 'capture'> = { capture: (input, options =",
    "let routeDepsBuiltForPluginHost: { readonly pluginHost?: RouteDeps[\"pluginHost\"] } | undef",
    "let formCollectionProviders = () => createFormCollectionRegistry({});",
    "let bindSharedApiOAuth: ((input: { keyId: string; use: boolean }) => Promise<void>) | unde",
    "const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecy",
    "const workspaceId = await resolveWorkspaceIdOverride(kernel, overrides);",
    "const publishTrustRevocations = await publishTrustRevocationStoreFor({ kernel });",
    "const chatDbPath = resolveChatDbPath({ dbPath }, { overrides });",
    "const chat = store.chat;",
    "await warnCompositionChatOrphans({ dbPath, store, kernel, chatDbPath });",
    "const mediaProviders = await loadMediaProviderRegistry({ workspaceId }, { loadContribution",
    "const { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo,",
    "await normalizeSiteVaultAtBoot({ kernel, workspaceId, siteDir: siteDirForKeyring, clock },",
    "const { siteAssistantCredentialRepo, externalMcpServerRepo, externalMcpOAuthDevices, siteR",
    "const { providerConfigSource: savedProviderConfig, projectId, projectVault, projectStore, ",
    "const { providerConfigSource, customCredentialSetRepo } = composeProviderConfigSource({ sa",
    "const providerPlugins = await providerPluginBoot({ overrides })({",
    "const { projectKeys, observability, tracker, aiTraceSink } = composeProviderLifecyclePhase",
    "formCollectionProviders = () => providerPlugins.formCollectionProviders?.() ?? createFormC",
    "setServerLogTraceReader({ traceIds: () => observability.activeTraceIds?.() });",
    "lifecycleTracker = tracker;",
    "const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHtt",
    "if ((overrides.storeRole ?? \"owner\") === \"owner\") await protectExistingFormFiles({ kernel,",
    "const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publi",
    "bindSharedApiOAuth = agentPluginConnections.apiConnections.host.sharedOAuth?.bind;",
    "const { adminSurfaceHandlersReady, siteAppBootWork, routeDeps, widgetAdoptionReady } = ass",
    "routeDepsBuiltForPluginHost = routeDeps;",
    "finishRouteDepsPhase({ dbPath, opened, agentPluginLayout, resolvedSiteBinding, resolvedThe",
    "await registerContentAnalytics({ deps: { bus, tracker, workspaceId } });",
    "return routeDeps;"
  ];
  const actual = bodyOf(parse(DEPS), "composeSiteRouteDeps").map((s) => firstLine(s));
  assert.equal(actual.length, expected.length);
  expected.forEach((prefix, i) => assert.ok(actual[i].startsWith(prefix), `statement ${i}: ${actual[i]}`));
});

test("R: each phase holds its root statements in root order", () => {
  const expected: Record<string, readonly string[]> = {
    "composeStoragePhase": [
      "const { assistantAgentInventory, resolvedSiteBinding, agentPluginLayout, agentPluginLifecycle, feder",
      "const kernel = store.content;",
      "const { resolvedUploadsDir, provideMediaCredentials, mediaStorePorts, blobStore, mediaIsRemoteByEnv,"
    ],
    "composeSiteServicesPhase": [
      "logMediaProviderRefusals({ refusals: mediaProviders.refusals });",
      "const { postSearchBackfillReady, clock, idGen, reportToolAuditError, pluginActivationRepo } = compos",
      "const { pluginRuntime } = composeSitePluginRuntime({ lifecycleTracker: () => lifecycleTracker, route",
      "const { identity, settingsPrincipals, adminPasswordResetReady, presentationRepo, settingsRepo, setti",
      "const { menuRepo, navLocationBindingRepo, menuBindingsReady, newsletterListRepo, newsletterReady, co",
      "const { outbox, bus, devCapabilityScheme, originReady, originRegistry, redirectRepo, redirectHitSink",
      "const { trashRegistry, sqliteTrashDb, trashRepo, taxonomyFollowUpTermRepo, taxonomyFollowUpRevisions",
      "const { trashFollowUpHooks } = composeTrashFollowUpHooks({ kernel, mediaRepo: () => mediaRepo, works",
      "const { pluginTrashAdapter, trashAdapters } = composeTrashAdapters({ pluginRuntime, pluginActivation",
      "const { trashTransaction, trash, removePlugin, removeUser, isInTrash } = composeTrashService({ kerne",
      "const { redirectsWriteDeps } = composeRedirects({ redirectRepo, trash, trashRepo, originRegistry, cl",
      "const { databaseLedgerRepo, migrationRunsRepo, publishContentRunRepo, restorePointsRepo, dbOps, data",
      "const { entryRepo, sqliteEntryTermRepo, taxonomyRepo, termRepo, taxonomyRevisionRepo, stampWatermark",
      "const { formSubmissionRepo, contentTypeRepo, contentTypeIndexProvisioner, commentsModule, commentsCa",
      "const { runtimeMode, siteDirForKeyring, memberRepo, newsletterKeyring, newsletterSubscriberDirectory"
    ],
    "composeProviderLifecyclePhase": [
      "onStoreClose({ registration: async () => {",
      "const projectKeys = compositionProjectKeys({ resolvedSiteBinding, kernel, clock, projectKeyReference",
      "onStoreClose({ registration: watchProviderRevisions({ read: () => projectStore?.providerRevisions({ ",
      "const { observability, tracker, aiTraceSink } = providerPlugins;"
    ],
    "composeInstrumentedContentPhase": [
      "flushLifecycleEvents({ pending: pendingLifecycleEvents, tracker });",
      "instrumentStorageKernel({ kernel, observability });",
      "instrumentStorageKernel({ kernel: chat, observability });",
      "const { resolvedMailer, mailDurableOutboxReady, customCredentialsHttpClient, siteBackupHttpClient, o",
      "const { postRepo, changeSets, mediaRepo, assetBlobRepo } = composeContentStores({ kernel });"
    ],
    "composePublishingPhase": [
      "const { mediaContentTypeStore, publishContentBundleRepo, publishContentBaselineRepo, publishContentF",
      "const { publishContentApplyPort } = composePublishContentApplyPort({ workspaceId, publishContentBund",
      "const { guardedOutboundHttpClient, externalMcpOAuthHttpPorts, derivedPublicOrigin, agentPluginConnec"
    ],
    "assembleRouteDepsPhase": [
      "const { adminSurfaceHandlersReady, siteAppBootWork, seoDeps, sitemapService, resolveRouteDeps, siteC",
      "const routeDeps: NewsletterRouteDeps & ByokToolSurfaceDeps = {",
      "resolveRouteDeps(routeDeps);",
      "const { widgetAdoptionReady } = wireFormsAndSearch({ siteTitleReady, menuBindingsReady, mediaTransfo",
      "const commerceBinding = compositionCommerce({ dbPath, overrides, resolvedSiteBinding, agentPluginLay",
      "routeDeps.commerce = commerceBinding.commerce;",
      "routeDeps.commerceCatalog = commerceBinding.commerceCatalog;",
      "onStoreClose({ registration: () => commerceBinding.close() });",
      "siteAppBootWorkByDeps.set(routeDeps, siteAppBootWork);",
      "routeDeps.pluginHost = createTovuPluginHost({ deps: routeDeps });"
    ],
    "finishRouteDepsPhase": [
      "routeDeps.pluginRuntimeReady = pluginRuntime.attachEnabledPluginsAtBoot();",
      "opened.beforeStoreClose({ drain: async () => {",
      "provideMediaCredentials(composePublishCredentialSource({ workspaceId, executionMode: routeDeps.publi",
      "const savedKeys = composeSiteSavedKeys({ workspaceId, sealer: siteAssistantSecretSealer });",
      "configureSiteSharing({ dbPath, resolvedSiteBinding, agentPluginLayout, skillLayout, resolvedThemesDi",
      "configureSiteImports({ resolvedSiteBinding, workspaceId, observability, tracker, routeDeps, savedKey",
      "routeDeps.siteConsent = bindSiteConsentService({ deps: routeDeps });",
      "configureVisitorConsentAnalytics({ routeDeps, workspaceId });"
    ]
  };
  for (const [name, statements] of Object.entries(expected)) {
    const body = bodyOf(parse(fileOf(name)), name).slice(1).map((s) => firstLine(s)).filter((t) => !t.startsWith("return {"));
    assert.equal(body.length, statements.length, name);
    statements.forEach((prefix, i) => assert.ok(body[i].replace(/\(\)/g, "").startsWith(prefix.replace(/\(\)/g, "")), `${name} statement ${i}: ${body[i]}`));
  }
});

test("R: getter inputs are only read lazily", () => {
  const getters: Record<string, readonly string[]> = {"composeStoragePhase":["lifecycleTracker","workspaceId","settingsRepo","observability","routeDeps"],"composeSiteServicesPhase":["lifecycleTracker","routeDepsBuiltForPluginHost","formCollectionProviders","assetBlobRepo","mediaRepo","postRepo","mediaContentTypeStore","routeDeps"],"composeProviderLifecyclePhase":["bindSharedApiOAuth"],"composeInstrumentedContentPhase":[],"composePublishingPhase":[],"assembleRouteDepsPhase":[],"finishRouteDepsPhase":[]};
  for (const [name, list] of Object.entries(getters)) assert.deepEqual(eagerReads(bodyOf(parse(fileOf(name)), name), list), [], name);
});
