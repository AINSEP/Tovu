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
 'SafeString': 'Handlebars env object, not process env', 'ASSETS': 'Cloudflare Worker binding object, not process env', 'JINI_PROTOCOL_PROXY_FAILED': 'error code',
}
DECISION = {  # name -> (decision, new_name, step, note). Everything else is keep.
 'JINI_AGENT_DAEMON_PORT': ('rename', 'TOVU_AGENT_DAEMON_PORT', 'T4', 'Tovu-owned name with a JINI_ prefix; no Jini package reads it (grep packages/*/src = 0 files)'),
 'JINI_AGENT_DAEMON_URL': ('rename', 'TOVU_AGENT_DAEMON_URL', 'T4', 'same; pairs with TOVU_AGENT_DAEMON_TOKEN'),
 'TOVU_STOP_ON_STDIN_EOF': ('rename', 'JINI_STOP_ON_STDIN_EOF', 'T4', 'same meaning as the sidecar child contract name Jini already sets; UNVERIFIED which launcher sets the TOVU_ spelling'),
 'TOVU_AGENT_NATIVE_FALLBACKS': ('delete', '', 'T9', 'code calls it an alias of TOVU_AGENT_FULL_CLI_ACCESS (assistant-native-fallbacks.ts:45); .env.example recommends it. OWNER D3'),
 'TOVU_AGENT_FORBID_BASH': ('delete', '', 'T9', '.env.example calls it legacy; it also selects the strict prompt (assistant-system-overlay.ts:147) so removal changes behaviour. OWNER D3'),
 'TOVU_CONSENT_REGION_HEADER': ('delete', '', 'T9', '"older setting" next to TOVU_CONSENT_INGRESS (site-cookie-consent.ts:15); removal drops one trusted header. OWNER D3'),
 'TOVU_ALLOWED_ORIGINS': ('delete', '', 'T9', 'inert: the name is handed to a Jini adapter together with env: {} (visitor-frontend-control.ts:67-68), so nothing can read it'),
 'JINI_ALLOWED_ORIGINS': ('keep', '', 'J3', 'Jini preset var. Tovu only passes the NAME to a Jini adapter; after J3 Tovu passes the value and stops naming it'),
 'JINI_WEB_PORT': ('keep', '', 'J3', 'same as JINI_ALLOWED_ORIGINS'),
 'JINI_BIND_HOST': ('keep', '', 'J3', 'same as JINI_ALLOWED_ORIGINS'),
 'TOVU_FORMS': ('rename', 'FORMS (host-chosen binding name)', 'J6', 'Cloudflare Worker binding name inside a Jini plugin payload; "no Tovu in Jini" rule. OWNER D6'),
 'TOVU_FORMS_SECRET': ('rename', 'FORMS_SECRET (host-chosen binding name)', 'J6', 'same. OWNER D6'),
 'TOVU_GOOGLE_PICKER_APP_ID': ('rename', 'host passes the config name', 'J6', 'Tovu name hard-coded in a Jini plugin (picker-flow.mjs:31). OWNER D6'),
 'TOVU_GOOGLE_PICKER_BROWSER_KEY': ('rename', 'host passes the config name', 'J6', 'same. OWNER D6'),
 'TEST_API_KEY': ('keep', '', '-', 'semgrep rule fixture, not product code; exempt path'),
 'JINI_CORE_VERSION': ('keep', '', 'T7', 'declared in apps/admin/src/vite-env.d.ts; how Vite injects it was NOT VERIFIED'),
 'OTEL_EXPORTER_OTLP_ENDPOINT': ('keep', '', 'T1', 'read by the OpenTelemetry SDK, not by our code (11-11 hand check, not re-verified); schema lists it as external'),
 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT': ('keep', '', 'T1', 'as OTEL_EXPORTER_OTLP_ENDPOINT'),
 'OTEL_EXPORTER_OTLP_HEADERS': ('keep', '', 'T1', 'as OTEL_EXPORTER_OTLP_ENDPOINT; may carry credentials'),
 'OTEL_SERVICE_NAME': ('keep', '', 'T1', 'as OTEL_EXPORTER_OTLP_ENDPOINT'),
 'TOVU_PORT': ('keep', '', 'T1', 'read only by docker-compose.yml interpolation; schema reader = compose'),
 'TOVU_INSTALL_BROWSER': ('keep', '', 'T1', 'Docker build ARG; no runtime read'),
 'TOVU_HOSTED': ('keep', '', 'T5', 'near-duplicate of TOVU_RUNTIME_MODE=production for the hosted check (assistant-native-fallbacks.ts:35). OWNER D3'),
 'TOVU_EXECUTION_MODE': ('keep', '', 'T5', 'third "hosted" switch (hosted-api-only). OWNER D3'),
}
def area_short(a): return a.replace('website-', 'web/').replace('desktop-main', 'desktop-main').replace('admin-browser', 'admin(browser)').replace('site-chat', 'site-chat')
def load(tsv): return list(csv.DictReader(open(tsv), delimiter='\t', quoting=csv.QUOTE_NONE))
cache = {}
def src(root, f, n):
    if (root, f) not in cache:
        try: cache[(root, f)] = open(f'{root}/{f}', errors='replace').read().split('\n')
        except OSError: cache[(root, f)] = []
    L = cache[(root, f)]; n = int(n)
    return L[n - 1] if 0 < n <= len(L) else ''
def kind_of(name, writes):
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
out = [['name', 'repo', 'readers', 'phase', 'secret', 'default', 'decision', 'step', 'kind', 'new_name', 'prod_read_sites', 'prod_files', 'in_env_example', 'also_in', 'evidence', 'note']]
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
        out.append([name, repo, readers, phase_of(root, reads, k), secret, default, dec, step, k, new, str(len(reads)), str(len({r['file'] for r in reads})), ('yes' if name in ex else 'no') if repo == 'tovu' else 'n/a (no file)', '; '.join(also), ev, note])
        counts[(repo, dec)] += 1; counts[(repo, 'kind:' + k)] += 1; counts[(repo, 'secret:' + secret)] += 1
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
            out.append([name, repo, f"{kind.split('-')[0]}s×{len(rs)}", 'script run' if kind == 'script-only' else 'test run', secret, '', 'keep', step, kind, '', '0', '0', ('yes' if name in ex else 'no') if repo == 'tovu' else 'n/a (no file)', '', f"{rs[0]['file']}:{rs[0]['line']}", 'outside the product schema; listed in the dev/ci slice' if kind == 'script-only' else 'outside the product schema; test advisory only'])
            counts[(repo, 'kind:' + kind)] += 1; counts[(repo, 'keep')] += 1
with open('../VARS.tsv', 'w') as fh:
    for row in out: fh.write('\t'.join(c.replace('\t', ' ') for c in row) + '\n')
for key in sorted(counts): print(key, counts[key])
print('rows', len(out) - 1)
