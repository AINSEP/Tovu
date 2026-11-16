#!/usr/bin/env python3
"""Builds ../VARS.tsv from the scanner output (env-reads.mjs) plus the hand classification below.
Usage: python3 build-vars.py <tovu-reads.tsv> <tovu-root> <jini-reads.tsv> <jini-root> <tovu .env.example>
Everything marked (auto) is derived from the scan; decision/step/kind come from the rules in this file."""
import csv, re, sys, collections
tovu_tsv, tovu_root, jini_tsv, jini_root, example = sys.argv[1:6]
READ = {'process.env', 'process.env[const]', 'import.meta.env', 'destructure', 'env-param', 'env-param[const]'}
NAMED = {'name-literal', 'object-key'}
WRITE = {'process.env-write', 'env-param-write', 'object-key'}
ex_text = open(example).read()
ex = set(re.findall(r'^#? ?([A-Z][A-Z0-9_]+)=', ex_text, re.M))
ex_default = {}  # default as DOCUMENTED in .env.example (comment block above the name), not code-verified
_block = []
for _line in ex_text.split('\n'):
    _m = re.match(r'^#? ?([A-Z][A-Z0-9_]+)=', _line)
    if _m:
        _d = re.search(r'[Dd]efault(?:s to|:)\s*([^;.]+(?:\.\d+)*[^;.]*)', ' '.join(_block))
        if _d: ex_default[_m.group(1)] = _d.group(1).strip()[:90]
    elif _line.startswith('#'): _block.append(_line.lstrip('# ').strip())
    if _m or not _line.strip(): _block = []

OS = set('HOME PATH PATHEXT APPDATA LOCALAPPDATA USERPROFILE TEMP TMP TMPDIR SystemRoot ComSpec WINDIR USER LOGNAME SHELL DISPLAY WAYLAND_DISPLAY XDG_CONFIG_HOME XDG_DATA_HOME XDG_CACHE_HOME XDG_STATE_HOME WSL_DISTRO_NAME LANG LC_ALL LC_CTYPE SSH_AUTH_SOCK OneDrive OneDriveCommercial OneDriveConsumer HTTP_PROXY HTTPS_PROXY ALL_PROXY NO_PROXY NODE_USE_ENV_PROXY FNM_DIR MISE_DATA_DIR NPM_CONFIG_PREFIX NPM_CONFIG_USERCONFIG VP_HOME'.split())
RUNTIME = set('NODE_ENV ELECTRON_RUN_AS_NODE KUBERNETES_SERVICE_HOST DEV MODE FLY_APP_NAME FLY_MACHINE_ID FLY_ALLOC_ID'.split())
TESTHOOK = set('VITEST NODE_TEST_CONTEXT NODE_V8_COVERAGE TOVU_DESKTOP_SELFTEST TEST_API_KEY OPENCODE_TEST_HOME TOVU_TELEMETRY_FORCE_ENABLE'.split())
DEV = re.compile(r'^(TOVU_DEV_|TOVU_ADMIN_DEV_|JINI_PLAYGROUND_|NLWEB_DEMO_)|^(TOVU_SITE_CHAT_DEV_PROXY_URL|TOVU_DISABLE_DEV_TLS|TOVU_LOCAL_SITE_WATCH|TOVU_START_AUTO_PORT|TOVU_DAEMON_LIFECYCLE_LOG|JINI_JSON_IPC_TRACE|JINI_LIVE_PACKAGES_DIR|TOVU_CAPABILITY_MANIFEST_ARM|TOVU_DISABLE_PARENT_WATCHDOG|TOVU_LOG_REQUESTS|TOVU_LOG_SLOW_REQUESTS|TOVU_PUBLISH_CONTENT_DEV_HOSTS|TOVU_DESKTOP_DISABLE_UPDATER|TOVU_SITE_KEY_NOTICE|TOVU_TARGET_ARCH|TOVU_TARGET_PLATFORM|NOTES_DB|CONSENT_INGRESS)$')
LAUNCH = set('''TOVU_SITE_PROCESS_CWD TOVU_WORKSPACE TOVU_PARENT_PID TOVU_DESKTOP_OWNER_PID TOVU_LOCAL_SITE_OWNER_PID TOVU_SITE_LISTENER_ORIGIN TOVU_SITE_CALLBACK_ORIGIN
TOVU_LOCAL_ADMIN_BUILD_ROOT TOVU_AGENT_DAEMON_TOKEN TOVU_AGENT_DAEMON_REGISTRY_PATH TOVU_AGENT_DAEMON_STANDALONE TOVU_TOOL_EXEC_TOKEN TOVU_DESKTOP_MCP_URL TOVU_DESKTOP_MCP_TOKEN
TOVU_DESKTOP_MCP_HANDOFF_TOKEN TOVU_DESKTOP_OWNER_SIGNIN TOVU_RUNNING_APP TOVU_SITE_SELECTION_PINNED TOVU_SITE_BINDING_NOT_SWITCHABLE TOVU_STOP_ON_STDIN_EOF JINI_STOP_ON_STDIN_EOF
TOVU_PACKAGED_DESKTOP TOVU_BUNDLED_AGENT_PLUGINS_DIR TOVU_BUNDLED_NPM_ROOT TOVU_NODE_TOOLCHAIN_DIR TOVU_BUILT_IN_MCP_SERVER_IDS TOVU_PRODUCT_RELEASE TOVU_DESKTOP_AGENT_SERVICE
JINI_DESKTOP_RENDER_URL JINI_DESKTOP_RENDER_TOKEN TOVU_API_URL TOVU_ADMIN_DIST TOVU_SITE_CHAT_DIST TOVU_REPO_ROOT TOVU_AGENT_CWD JINI_AGENT_DAEMON_URL JINI_RUN_ID JINI_DAEMON_URL
JINI_DAEMON_TOKEN JINI_MESSAGE_RELAY JINI_MESSAGE_RELAY_NONCE JINI_STARTUP_SECRETS_IPC JINI_STARTUP_TOOL_IDS JINI_DIAGNOSTIC_TOOL_IDS JINI_DELEGATED_RESULT_MARKERS JINI_ROUTE_MANIFEST
JINI_TOOL_EXEC_TOKEN JINI_REMOTE_TOOL_BRIDGE_TOKEN JINI_DELEGATED_TOOL_TIMEOUT_MS JINI_PROFILES TOVU_AGENT_PLUGIN_OVERLAYS_DIR TOVU_SITE_ID'''.split())
VENDOR = re.compile(r'^(ANTHROPIC_|OPENAI_|OPENROUTER_|GEMINI_|GOOGLE_API|CODEX_|CLAUDE_|AIDER_|QWEN_|VELA_|PI_|QODER_|REASONIX_|MIMOCODE_|OPENCODE_|CODEWHALE_|DEEPSEEK_|CURSOR_|AGY_|MMD_|AGENT_PLAYWRIGHT_PATH|FFMPEG_PATH|FFPROBE_PATH|TAVILY_|PG[A-Z]+$)|_API_KEY$|^(FAL_KEY|REPLICATE_API_TOKEN)$')
SECRET = re.compile(r'PASSWORD|TOKEN|SECRET|API_KEY|_KEY_SEED|IP_SALT|^TOVU_SITE_KEY$|PUBLISH_TRUST$|OWNER_SIGNIN$|^FAL_KEY$|NONCE|OTLP_HEADERS')
NOT_ENV = {  # scanner hits that are code constants, comments about retired names, or non-env objects (verified by reading the hit line)
 'TOVU_BROWSER_LAUNCH_OPTIONS': 'code constant', 'TOVU_BUNDLED_AGENT_PLUGINS': 'comment about a deleted catalog', 'TOVU_CAPABILITY_CARDS': 'code constant',
 'TOVU_COMPOSER_DISCOVERY_GROUPS': 'comment about a deleted import', 'TOVU_CONFIRMATION_SETTINGS': 'code constant', 'TOVU_CORE_EXTENSION_CLAIMS': 'code constant',
 'TOVU_CREDENTIAL_COPY_HOST': 'code constant', 'TOVU_CUSTOM_CREDENTIAL_HOST': 'code constant', 'TOVU_DATABASE_MESSAGES': 'code constant', 'TOVU_FRONTEND_CAPABILITIES': 'code constant',
 'TOVU_MAX_UPLOAD_BYTES': 'code constant', 'TOVU_MCP_FIELD_SPECS': 'comment about a removed export', 'TOVU_OBSERVATION_POLICY': 'code constant', 'TOVU_PLUGIN_RUNTIME_TEXT': 'code constant',
 'TOVU_SECRET_POLICY': 'code constant', 'TOVU_TRANSFER_MESSAGES': 'code constant', 'TOVU_SUPABASE_MCP_ACCESS_TOKEN': 'comment about a retired name', 'TOVU_S3_ACCESS_KEY_ID': 'comment example (name comes from a plugin declaration; see family F2)',
 'JINI_CORE_VERSION': 'r2: build constant __JINI_CORE_VERSION__ from the installed package manifest (apps/admin/vite.config.ts:129), not an env variable',
 'SafeString': 'Handlebars env object, not process env', 'ASSETS': 'Cloudflare Worker binding object, not process env', 'JINI_PROTOCOL_PROXY_FAILED': 'error code',
}
DECISION = {  # name -> (decision, new_name, step, note). Everything else is keep.
 # r2 (judge findings 1, 3): operator-settable names are an installation surface. No rename, no delete.
 'JINI_AGENT_DAEMON_PORT': ('keep', '', 'T4', 'r2: rename WITHDRAWN. Tovu-owned despite the JINI_ prefix (0 files in Jini packages/*/src read it), but operators set it: .env.example:26, Dockerfile:194, Admin deployment page (apps/admin/src/features/deployment/rules.ts:355)'),
 'JINI_AGENT_DAEMON_URL': ('keep', '', 'T4', 'r2: rename WITHDRAWN. Operator-settable (agent-daemon-port.ts:60) and also set by launchers'),
 'TOVU_STOP_ON_STDIN_EOF': ('keep', '', 'T4', 'r2: rename WITHDRAWN, and it is not a duplicate. Desktop sets it for the SERVER child (apps/desktop/src/tovu-server.ts:911 -> cli/commands/serve.ts:490); Jini sidecar sets JINI_STOP_ON_STDIN_EOF for the DAEMON child (supervisor-node.ts:107 -> agent-daemon-server.ts:67). One shared name would be inherited by the wrong child'),
 'TOVU_AGENT_NATIVE_FALLBACKS': ('keep', '', 'T5', 'r2: delete WITHDRAWN. Security deny switch: value 0/false denies CLI access (assistant-native-fallbacks.ts:52-53, 64-65). Documented in .env.example:217'),
 'TOVU_AGENT_FORBID_BASH': ('keep', '', 'T5', 'r2: delete WITHDRAWN. Security deny switch (assistant-native-fallbacks.ts:51) and prompt selector (assistant-system-overlay.ts:144-147). Documented in .env.example:38'),
 'TOVU_CONSENT_REGION_HEADER': ('keep', '', 'T5', 'r2: delete WITHDRAWN. Documented in .env.example:93; removal would drop a trusted region header on installs that set it (site-cookie-consent.ts:24, deps.ts:3093)'),
 'TOVU_ALLOWED_ORIGINS': ('delete', '', 'T9', 'inert: the name is handed to a Jini adapter together with env: {} (visitor-frontend-control.ts:67-68), so nothing can read it'),
 'JINI_ALLOWED_ORIGINS': ('keep', '', 'J3', 'Jini preset var. Tovu only passes the NAME to a Jini adapter; after J3 Tovu passes the value and stops naming it'),
 'JINI_WEB_PORT': ('keep', '', 'J3', 'same as JINI_ALLOWED_ORIGINS'),
 'JINI_BIND_HOST': ('keep', '', 'J3', 'same as JINI_ALLOWED_ORIGINS'),
 'TOVU_FORMS': ('not-env', '', '-', 'r2 (judge finding 8): Cloudflare D1 database binding, an object with prepare() (forms-receiver.mjs:80,298), not a string. Producer and reader ship in one worker upload (cloudflare/lib/forms.mjs:281). Outside the env schema'),
 'TOVU_FORMS_SECRET': ('not-env', '', '-', 'r2 (judge finding 8): Cloudflare secret_text binding set by the same upload (forms.mjs:281), read at forms-receiver.mjs:80,275. A worker binding, not OS env. Outside the env schema'),
 'TOVU_GOOGLE_PICKER_APP_ID': ('keep', '', 'T5', 'r2: rename WITHDRAWN. Sites already set it (picker-flow.mjs:29 says so). Host public-config family F4; the plugin reads it through the publicConfig port'),
 'TOVU_GOOGLE_PICKER_BROWSER_KEY': ('keep', '', 'T5', 'r2: rename WITHDRAWN, as TOVU_GOOGLE_PICKER_APP_ID'),
 'TEST_API_KEY': ('keep', '', '-', 'semgrep rule fixture, not product code; exempt path'),
 'OTEL_EXPORTER_OTLP_ENDPOINT': ('keep', '', 'T1', 'read by the OpenTelemetry SDK, not by our code (11-11 hand check, not re-verified); schema lists it as external'),
 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT': ('keep', '', 'T1', 'as OTEL_EXPORTER_OTLP_ENDPOINT'),
 'OTEL_EXPORTER_OTLP_HEADERS': ('keep', '', 'T1', 'as OTEL_EXPORTER_OTLP_ENDPOINT; may carry credentials'),
 'OTEL_SERVICE_NAME': ('keep', '', 'T1', 'as OTEL_EXPORTER_OTLP_ENDPOINT'),
 'TOVU_PORT': ('keep', '', 'T1', 'read only by docker-compose.yml interpolation; schema reader = compose'),
 'TOVU_INSTALL_BROWSER': ('keep', '', 'T1', 'Docker build ARG; no runtime read'),
 'TOVU_HOSTED': ('keep', '', 'T5', 'near-duplicate of TOVU_RUNTIME_MODE=production for the hosted check (assistant-native-fallbacks.ts:35). OWNER D3'),
 'TOVU_EXECUTION_MODE': ('keep', '', 'T5', 'third "hosted" switch (hosted-api-only). OWNER D3'),
}
J, T = 'jini', 'tovu'
DECLARED_SETS = [
 dict(repo=J, file='packages/integrations/src/media-providers/providers.ts', first=233, last=253, mode='literal', kind='vendor-passthrough', secret='yes', area='pkg:integrations (declared)', step='J4', phase='call (computed key)', how='PROVIDER_CREDENTIAL_ENV_VARS; read by resolveProviderCredentialsFromEnv (dispatch/credentials.ts:16-21)'),
 dict(repo=J, file='packages/daemon/src/agent-executor/agent-env.ts', first=7, last=18, mode='literal', kind='os-ambient', area='pkg:daemon (declared)', step='J2', phase='call (computed key)', how='BASELINE_AGENT_ENV_KEYS; copied from hostEnv into the agent child (agent-env.ts:30-32)'),
 dict(repo=J, file='packages/platform/src/child-environment.ts', first=21, last=22, mode='literal', kind='os-ambient', area='pkg:platform (declared)', step='J2', phase='call (computed key)', how='LOGIN_SHELL_BOOTSTRAP_KEYS; copied from baseEnv (child-environment.ts:84-86)'),
 dict(repo=J, file='packages/platform/src/proxy-env.ts', first=24, last=31, mode='literal', lower=True, kind='os-ambient', area='pkg:platform (declared)', step='J2', phase='call (computed key)', how='CANONICAL_PROXY_ENV_KEYS, both spellings; normalised from every source env (proxy-env.ts:102-110)'),
 dict(repo=J, file='packages/db/src/transfer/postgres-target.ts', first=71, last=74, mode='key', kind='vendor-passthrough', area='pkg:db (written for a child)', step='J2', phase='written into the pg tool child env, never read as host config', how='parseConnectionString builds the child env (postgres-target.ts:71-74)'),
 dict(repo=J, file='packages/agent-runtime/src/env.ts', first=84, last=90, mode='literal', kind='vendor-passthrough', area='pkg:agent-runtime (declared)', step='J4', phase='call (computed key)', skip=('OPENCODE', 'MIMOCODE'), how='agent identity keys cleared or set for the agent child (env.ts:84,90)'),
 dict(repo=T, file='apps/website/src/contracts/core/host-signals.ts', first=39, last=39, mode='literal', kind='runtime-ambient', area='web/contracts (declared)', step='T2', phase='boot+call (computed key)', skip=('Fly.io (FLY_APP_NAME)',), how='core host-signal fallback; read at host-signals.ts:84'),
 dict(repo=T, file='apps/website/src/server/runtime/lifecycle/local-site-process.ts', first=117, last=117, mode='literal', kind='os-ambient', area='web/server (declared)', step='T2', phase='call (computed key)', how='allow-list copied into a local-site child env'),
 dict(repo=T, file='apps/desktop/src/desktop-agent-service.ts', first=50, last=50, mode='literal', kind='os-ambient', area='desktop-main (declared)', step='T2', phase='call (computed key)', how='allow-list copied into the desktop agent service env'),
]
def area_short(a): return a.replace('website-', 'web/').replace('desktop-main', 'desktop-main').replace('admin-browser', 'admin(browser)').replace('site-chat', 'site-chat')
def load(tsv): return list(csv.DictReader(open(tsv), delimiter='\t', quoting=csv.QUOTE_NONE))
cache = {}
def src(root, f, n):
    if (root, f) not in cache:
        try: cache[(root, f)] = open(f'{root}/{f}', errors='replace').read().split('\n')
        except OSError: cache[(root, f)] = []
    L = cache[(root, f)]; n = int(n)
    return L[n - 1] if 0 < n <= len(L) else ''
KIND_OVERRIDE = {'TOVU_FORMS': 'native-binding', 'TOVU_FORMS_SECRET': 'native-binding'}
def surface_of(kind, name, in_example, deploy):
    # r2: who can have this name stored in an installation. 'operator' names are frozen (DESIGN 4.3).
    if kind == 'native-binding': return 'worker-binding'
    if kind == 'launch-binding': return 'operator+launcher' if in_example or deploy else 'launcher'
    if kind in ('os-ambient', 'runtime-ambient'): return 'platform'
    if kind == 'vendor-passthrough': return 'operator(vendor)'
    if kind in ('test-hook', 'dev-flag'): return 'operator' if in_example else 'developer'
    return 'operator'
def kind_of(name, writes):
    if name in KIND_OVERRIDE: return KIND_OVERRIDE[name]
    if name in OS: return 'os-ambient'
    if name in TESTHOOK: return 'test-hook'
    if name in RUNTIME: return 'runtime-ambient'
    if name in LAUNCH: return 'launch-binding'
    if DEV.search(name): return 'dev-flag'
    if VENDOR.search(name): return 'vendor-passthrough'
    if name.startswith('VITE_') or name == 'TOVU_INSTALL_BROWSER': return 'build'
    return 'config'
def phase_of(root, reads, kind):
    if not reads: return 'n/a (named, not read here)'
    ph = set()
    for r in reads:
        f, line = r['file'], src(root, r['file'], r['line'])
        if re.search(r'=>|async \(', line.split('env')[0]) and r['scope'] != 'build' and r['kind'] != 'import.meta.env': ph.add('call')
        elif r['kind'] == 'import.meta.env' or r['scope'] == 'build': ph.add('build')
        elif line[:1].strip() and not line.startswith(('export function', 'export async function', 'function', 'export const', 'export class')) : ph.add('import')
        elif re.search(r'/inbound/(admin-http|public-http|shared)/|/routes/', f): ph.add('request')
        elif re.search(r'/boot/|/composition/|/cli/|/lifecycle/|apps/website/src/index\.ts|/main/|bootstrap|/bin/|tovu-server|startup-env', f): ph.add('boot')
        else: ph.add('call')
    return '+'.join(p for p in ['build', 'import', 'boot', 'request', 'call'] if p in ph)
def default_of(root, reads, name):
    for r in reads:
        line = src(root, r['file'], r['line'])
        m = re.search(re.escape(name) + r"\]?\s*(?:\?\?|\|\|)\s*(\"[^\"]*\"|'[^']*'|`[^`]*`|-?\d[\d_]*|true|false|[A-Z][A-Z0-9_]{3,})", line)
        if m: return m.group(1).strip('"\'`'), f"{r['file']}:{r['line']}"
    return '', ''
out = [['name', 'repo', 'readers', 'phase', 'secret', 'default', 'decision', 'step', 'kind', 'new_name', 'prod_read_sites', 'prod_files', 'in_env_example', 'also_in', 'evidence', 'note', 'surface']]
counts = collections.Counter()
for repo, tsv, root in (('tovu', tovu_tsv, tovu_root), ('jini', jini_tsv, jini_root)):
    rows = [r for r in load(tsv) if not r['name'].startswith('<')]
    by = collections.defaultdict(list)
    for r in rows: by[r['name']].append(r)
    if repo == 'tovu':
        for n in ex:
            if n not in by: by[n] = []
    for name in sorted(by):
        rs = by[name]
        prod = [r for r in rs if r['scope'] in ('prod', 'build')]
        real = [r for r in prod if r['kind'] in READ | NAMED | WRITE]
        deploy = sorted({r['file'].split('/')[-1] for r in rs if r['kind'] == 'deploy-mention' and not r['file'].endswith(('.sh', '.json'))})
        if not real and not (name in ex and repo == 'tovu'): continue
        if name in NOT_ENV: counts[(repo, 'not-env')] += 1; continue
        reads = [r for r in prod if r['kind'] in READ]
        writes = [r for r in prod if r['kind'] in WRITE]
        k = kind_of(name, writes)
        areas = collections.Counter(area_short(r['area']) for r in (reads or real))
        readers = ', '.join(f'{a}×{n}' for a, n in sorted(areas.items())) or ('compose/Docker' if deploy else 'none in our code (external reader)')
        also = []
        if any(r['scope'] == 'script' for r in rs): also.append('scripts')
        if any(r['scope'] == 'test' for r in rs): also.append('tests')
        if deploy: also.append('deploy:' + '|'.join(deploy))
        if writes: also.append(f'set-for-child×{len(writes)}')
        ncomm = sum(1 for r in rs if r['kind'].startswith('comment:') and r['scope'] in ('prod', 'build'))
        if ncomm: also.append(f'comments×{ncomm}')
        d, dsite = default_of(root, reads, name)
        dec, new, step, note = DECISION.get(name, ('keep', '', '', ''))
        if not step:
            a = ' '.join(areas)
            if repo == 'jini':
                step = {'os-ambient': 'J2', 'runtime-ambient': 'J2', 'vendor-passthrough': 'J4', 'test-hook': 'J5', 'dev-flag': 'J5'}.get(k, 'J5' if 'example:' in a and 'pkg:' not in a else 'J3')
            else:
                step = {'os-ambient': 'T2', 'runtime-ambient': 'T2', 'launch-binding': 'T4', 'test-hook': 'T8', 'dev-flag': 'T8', 'build': 'T7'}.get(k)
                if not step:
                    step = 'T7' if 'admin' in a or 'site-chat' in a else 'T6' if 'desktop' in a and 'web/' not in a else 'T5' if 'web/' in a and not re.search(r'web/(server|cli|other)', a) else 'T3'
        ev = f"{reads[0]['file']}:{reads[0]['line']}" if reads else (f"{real[0]['file']}:{real[0]['line']}" if real else '')
        secret = 'yes' if SECRET.search(name) and not re.search(r'BROWSER_KEY|PUBLIC_KEY|KEY_NOTICE|TOKENS_DIR', name) else 'no'
        if d and secret == 'yes': d = '(has a development default in code; value not copied here)'
        default = f'{d} [code {dsite}]' if d else (f'{ex_default[name]} [.env.example text, not code-verified]' if name in ex_default and repo == 'tovu' else ('NOT VERIFIED (not on the read line)' if reads else ''))
        out.append([name, repo, readers, phase_of(root, reads, k), secret, default, dec, step, k, new, str(len(reads)), str(len({r['file'] for r in reads})), ('yes' if name in ex else 'no') if repo == 'tovu' else 'n/a (no file)', '; '.join(also), ev, note, surface_of(k, name, name in ex and repo == 'tovu', bool(deploy))])
        counts[(repo, dec)] += 1; counts[(repo, 'kind:' + k)] += 1; counts[(repo, 'secret:' + secret)] += 1
    # r2 (judge finding 4): names that exist only inside a declaration (array, map, object keys) and are read or written
    # through a computed key. Each set was read by hand at the cited lines; nothing here is inferred from a name shape.
    index = {row[0]: row for row in out if row[1] == repo}
    for d in [x for x in DECLARED_SETS if x['repo'] == repo]:
        lines = open(f"{root}/{d['file']}", errors='replace').read().split('\n')[d['first'] - 1:d['last']]
        text = '\n'.join(l for l in lines if not re.match(r'\s*(//|\*|/\*)', l))
        names = re.findall(r"['\"]([A-Za-z][A-Za-z0-9_]{2,})['\"]", text) if d['mode'] == 'literal' else re.findall(r'\b([A-Z][A-Z0-9_]{2,})\s*:', text) + re.findall(r'\benv\.([A-Z][A-Z0-9_]{2,})\s*=', text)
        for name in sorted(set(names)):
            if name in NOT_ENV or name in d.get('skip', ()) or (name.islower() and d['mode'] == 'literal' and not d.get('lower')): continue
            where = f"{d['file']}:{d['first']}-{d['last']}"
            if name in index:
                index[name][15] = (index[name][15] + '; ' if index[name][15] else '') + f"also in the declared set at {where}"
                continue
            secret = d.get('secret') or ('yes' if SECRET.search(name) else 'no')
            row = [name, repo, d['area'], d['phase'], secret, '', 'keep', d['step'], d['kind'], '', '0', '0', ('yes' if name in ex else 'no') if repo == 'tovu' else 'n/a (no file)', 'declared-set', where, f"r2: declared set, {d['how']}", surface_of(d['kind'], name, False, False)]
            out.append(row); index[name] = row
            counts[(repo, 'keep')] += 1; counts[(repo, 'kind:' + d['kind'])] += 1; counts[(repo, 'secret:' + secret)] += 1; counts[(repo, 'declared-set-added')] += 1
    # names never read in product code: script/build-only and test-only (one row each, so the schema's dev/ci slice and the test advisory have an inventory)
    prodnames = {row[0] for row in out if row[1] == repo}
    RW = READ | {'process.env-write', 'env-param-write'}
    for scope_set, kind, step in ((('script', 'build'), 'script-only', 'T8' if repo == 'tovu' else 'J5'), (('test',), 'test-only', 'T8' if repo == 'tovu' else 'J5')):
        seen = collections.defaultdict(list)
        for r in rows:
            if r['scope'] in scope_set and r['kind'] in RW and r['name'] not in prodnames and r['name'] not in NOT_ENV: seen[r['name']].append(r)
        for name in sorted(seen):
            rs = seen[name]; prodnames.add(name)
            secret = 'yes' if SECRET.search(name) else 'no'
            out.append([name, repo, f"{kind.split('-')[0]}s×{len(rs)}", 'script run' if kind == 'script-only' else 'test run', secret, '', 'keep', step, kind, '', '0', '0', ('yes' if name in ex else 'no') if repo == 'tovu' else 'n/a (no file)', '', f"{rs[0]['file']}:{rs[0]['line']}", 'outside the product schema; listed in the dev/ci slice' if kind == 'script-only' else 'outside the product schema; test advisory only', 'developer'])
            counts[(repo, 'kind:' + kind)] += 1; counts[(repo, 'keep')] += 1
with open('../VARS.tsv', 'w') as fh:
    for row in out: fh.write('\t'.join(c.replace('\t', ' ') for c in row) + '\n')
for key in sorted(counts): print(key, counts[key])
print('rows', len(out) - 1)
