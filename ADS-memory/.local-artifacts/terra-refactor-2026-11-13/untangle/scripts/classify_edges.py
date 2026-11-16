"""Read-only: label every EDGES-sites.tsv row with the untangle fix and lane, then aggregate to EDGES.tsv.
Usage: python3 classify_edges.py <untangle-dir>"""
import csv, sys, collections, os
D = sys.argv[1]
rows = list(csv.DictReader(open(os.path.join(D, 'EDGES-sites.tsv')), delimiter='\t'))
HANDLE = {'agentHandleProps','agentHandle','buildAgentListHandles','agentSubHandle','agentHandleSegment','AgentHandleProps','AgentElementRole',
          'AGENT_ELEMENT_ATTRIBUTE','AGENT_LABEL_ATTRIBUTE','AGENT_PRIVATE_ATTRIBUTE','AGENT_ROLE_ATTRIBUTE'}
WIRE = lambda n: n.startswith(('JSON_RPC','MCP_UI','JINI_PAGE','JsonRpc','createJsonRpc','isJsonRpc','createPageActionRequest'))
TEXT = {'Translate','createDictionaryTranslator','interpolate','localeEntry','DictionaryTranslator','LocaleDictionary','formatTimestamp',
        'formatRelativeMinutesAgo','isAbortError','resolveActiveTabId','splitOnPlaceholders','pickPlural'}
STORAGE = {'StorageKernel','StorageTransport','StorageDialect','DbRow','JsonObject','SqliteDb','SqliteSyncOpener','SqliteClient','SqliteOpener',
           'MigrationStep','MigrationOptions','MigrationReport','DbOpsPort','RestoreCapability','RestoreCostClass','RestoreKind','RestorePoint',
           'WatermarkReader','rows','row','parseJsonOrUndef','toBool','listColumns','isUniqueViolation','restorePointFilename','sanitizeForFilename',
           'SqliteConnectionSource','DaemonDbStatusReport','DaemonDbTableInfo','DbIntegrityIssue','DbIntegrityIssueKind','DbIntegrityReport','VerifyDbOptions',
           'OpenSqliteConnectionOptions','SqliteBackupSource','SqliteRecoveryHook','SqliteDbOpsAdapterDeps','DEFAULT_PRAGMAS','SecretsVaultDatabase'}
PLATFORM_PURE = {'FETCH_TIMEOUT_MS','TextReadOptions','isLoopbackHostname','isLoopbackApiHost','isBlockedExternalApiHostname',
                 'VaultError','VaultMeta','VaultOptions','VaultKind','assertVaultReplacement','VaultBatchOp','VaultBatchResult','VaultDefaultQuery',
                 'VaultSingletonQuery','VaultQuery','VaultRecord','VaultRepoPort','VAULT_KINDS','VaultSummary','VaultContext','isCopyableKind',
                 'SmtpMailPayload','EmailSourceField','EmailSenderError','validateEmailSourceTemplate','EmailBinding','EmailReadiness','EmailSender',
                 'EmailSenderContext','EmailSourceRequest','EmailSourceSummary','EmailTemplatePort','BlobFileMeta','BlobStorage','StorageError',
                 'ProcessSnapshot','StopProcessesResult','FileLockTimeoutError','FileLockLostError','FileLockHolder','HeldFileLock','BootIdentity',
                 'FileLockOptions','PtySpawn','TerminalSseSink','TerminalSession','PtyProcess','PtySpawnOptions','DnsResolver','GuardedClock','PinnedHttpTransport'}
AI_TRACE = {'AiTraceSink','AiTraceModelTurn','AiCapturedText','AiTraceEvent'}
HTTP_PURE = {'Result','ok','err','validationError','statusForError','ClientFacingError','RouteInputContext','AdapterContext','SseEvent','RouteRegistration',
             'RouteInternalErrorSink','RateLimiter','OriginRegistryPort','VerifiedOrigin','RedirectTargetContext','SiteRelativeTargetCheck','SitePathCheck',
             'checkSiteRelativeTarget','hasForbiddenRawUrlCharacter','isSameOrigin','normalizeOriginCandidate','checkSitePathname','OriginNotVerifiedError',
             'timingSafeTokenMatch','bearerTokenFromHeader','requestedAfterCursor','isLoopbackPeerAddress'}
AGENT_TYPES = {'RuntimeAgentDef','NativeCapabilities','ModelCatalogSnapshot','AgentRuntimeState','AcpMcpServerInput','DetectedAgent','NativeToolPolicyInput',
               'AcpPermissionHandler','PromptAugmenter','DiscoveredModel','ModelIdentityKind'}

def names(r): return [n for n in r['names'].split(',') if n]
def fix(r):
    o, t, s, k, ns = r['owner'], r['target'], r['spec'], r['kind'], names(r)
    sub = s[len('@jini-ai/'):]
    if t in ('core', 'protocol'): return 'yes', '-', '-'
    if o in ('sqlite', 'infra'): return 'ask', 'HOST-deprecated-forwarder (Q2)', 'Q2'
    if o in ('server', 'cli'): return 'ask', 'HOST-composition-package (Q1)', 'Q1'
    if o == 'cms-forms' and t == 'cms': return 'no', 'CONTRACT -> core/contracts/events (generic command/event/outbox vocabulary)', 'L-STORAGE'
    if o == 'ui' and t == 'ui-kit': return 'ask', 'UI-FAMILY ui -> ui-kit facades (Q4)', 'Q4'
    if o == 'provider-plugins':
        if t == 'ui': return 'no', 'PROVIDER: chart contract types -> core/contracts/charts; applyChartTheme via render ctx', 'L-PROV'
        return 'no', 'PROVIDER: contract types -> core/contracts/<topic> or structural; helpers via the ctx the domain passes', 'L-PROV'
    if t in ('ui', 'ui-kit') or (o == 'user-management' and sub.startswith('admin/react')):
        if ns and all(n in TEXT for n in ns): return 'no', 'PURE -> core/text (KIT §2.6)', 'L-TEXT'
        return 'no', 'KIT slot (KIT-INJECTION)', {'admin': 'L-KIT-ADMIN', 'chat': 'L-KIT-CHAT', 'user-management': 'L-KIT-UM'}.get(o, 'L-KIT-MISC')
    if t == 'agentic':
        if ns and all(n in HANDLE for n in ns): return 'no', 'PURE -> core/agent-handles (repoint)', 'L-HANDLES'
        if ns and all(WIRE(n) for n in ns): return 'no', 'WIRE -> protocol/mcp-ui (repoint)', 'L-HANDLES'
        if ns and all(n in HANDLE or WIRE(n) for n in ns): return 'no', 'PURE+WIRE -> core/agent-handles + protocol', 'L-HANDLES'
        return 'no', 'SURFACES port (a2ui/page driver injected; Opus design S)', 'L-SURF'
    if o == 'user-management' and sub.startswith('admin/core/module'): return 'no', 'REG -> core/contracts/admin-module', 'L-REG-ADMIN'
    if o == 'search' and t == 'agent-plugins': return 'no', 'REG contribution descriptor; host registers', 'L-REG-MISC'
    if o == 'admin' and t == 'agent-plugins': return 'no', 'CONTRACT -> local type (admin owns its plugin-list port)', 'L-ADMIN-PORTS'
    if o == 'admin' and t == 'cms':
        if k.startswith('type'): return 'no', 'CONTRACT -> core/contracts/forms (shared with provider-plugins)', 'L-ADMIN-PORTS'
        return 'no', 'PORT: cms forms catalog / comment repo / embed policy injected by host', 'L-ADMIN-PORTS'
    if t == 'db':
        if o == 'commerce' and 'runMigrations' in ns: return 'no', 'REG: commerce exports migrations; host runs them', 'L-STORAGE'
        if ns and all(n in STORAGE for n in ns): return 'no', 'CONTRACT/PURE -> core/contracts/storage', 'L-STORAGE'
        return 'no', 'PORT: opener/kernel/adapter injected by host', 'L-STORAGE'
    if t == 'platform':
        if ns and all(n in PLATFORM_PURE for n in ns): return 'no', 'CONTRACT/PURE -> core (net|contracts/vault|contracts/mail|contracts/blob|contracts/process)', 'L-PLATFORM'
        return 'no', 'PORT: consumer-owned port; host binds the platform implementation', 'L-PLATFORM'
    if t == 'http-kit':
        if o == 'daemon' and not all(n in HTTP_PURE for n in ns): return 'no', 'REG routes: daemon exports route descriptors; host mounts via http-kit', 'L-ROUTES'
        if all(n in HTTP_PURE for n in ns): return 'no', 'CONTRACT/PURE -> core/contracts/server (+ core origin checks)', 'L-ROUTES'
        return 'no', 'REG routes', 'L-ROUTES'
    if t == 'agent-runtime':
        if all(n in AI_TRACE for n in ns): return 'no', 'CONTRACT -> core/contracts/ai-trace', 'L-AGENTS'
        if all(n in AGENT_TYPES for n in ns): return 'no', 'CONTRACT -> core/contracts/agents', 'L-AGENTS'
        if o == 'chat': return 'no', 'PORT: agent-runtime policy helpers via chat agents port', 'L-AGENTS'
        return 'no', 'PORT: daemon agent-launch port; host binds agent-runtime (Opus design A)', 'L-AGENTS'
    if t == 'oauth': return 'no', 'PORT: oauth client port injected', 'L-AGENTS'
    if t == 'integrations': return 'no', 'PORT: vendor base-URL catalog injected', 'L-AGENTS'
    if t == 'diagnostics': return 'no', 'DEDUPE -> core redact (pure)', 'L-PLATFORM'
    if t == 'sidecar': return 'no', 'PORT', 'L-PLATFORM'
    if o == 'admin' and t == 'agentic': return 'no', 'SURFACES', 'L-SURF'
    return 'no', 'UNCLASSIFIED', 'L-?'

out = []
for r in rows:
    a, f, lane = fix(r); r.update(allowed=a, fix=f, lane=lane); out.append(r)
cols = ['owner','target','spec','kind','file','line','file_loc','names','allowed','fix','lane']
with open(os.path.join(D, 'EDGES-sites.tsv'), 'w') as fh:
    fh.write('\t'.join(cols) + '\n')
    for r in out: fh.write('\t'.join(str(r[c]) for c in cols) + '\n')
agg = collections.OrderedDict()
for r in sorted(out, key=lambda r: (r['owner'], r['target'], r['spec'], r['kind'], r['fix'])):
    kind = r['kind'].split('+')[0]
    key = (r['owner'], r['target'], r['spec'][9:], kind, r['allowed'], r['fix'], r['lane'])
    a = agg.setdefault(key, {'files': {}, 'lines': 0})
    a['files'][r['file']] = int(r['file_loc']); a['lines'] += 1
with open(os.path.join(D, 'EDGES.tsv'), 'w') as fh:
    fh.write('owner\ttarget\tsubpath\tkind\tfiles\timport_lines\tfile_loc\tallowed\tfix\tlane\n')
    for (o,t,s,k,al,f,l), a in agg.items():
        fh.write(f"{o}\t{t}\t{s}\t{k}\t{len(a['files'])}\t{a['lines']}\t{sum(a['files'].values())}\t{al}\t{f}\t{l}\n")
# summary per lane
lane = collections.defaultdict(lambda: [0, set(), collections.Counter()])
for r in out:
    if r['allowed'] == 'yes': continue
    L = lane[r['lane']]; L[0] += 1; L[1].add(r['file']); L[2][r['owner']] += 1
for l in sorted(lane): print(f"{l:14} lines={lane[l][0]:4} files={len(lane[l][1]):4} owners={dict(lane[l][2])}")
print('allowed', collections.Counter(r['allowed'] for r in out))
