#!/usr/bin/env node
// Counts violations of the owner's structural/code rules that a script can check.
// Why a script: agents often skipped these rules (11-11 "find everything we did wrong");
// before one big refactor we need a repeatable number per rule, before and after.
// The (required{}, optional{}) argument rule has its own script: args-object-audit.mjs.
//
// Usage: node development/scripts/owner-rules-audit.mjs <repoDir> [--json out.json] [--label NAME]
// Read-only. Works on Tovu (apps/, packages/, content/) and Jini (packages/). Skips tests
// (except the one test rule; test setup and *.typecheck.ts count as tests), dist, build,
// release, *.app/*.framework, coverage, node_modules, vendor, fixtures, the local site folders
// apps/website/src/sites/ and apps/website/sites/, built plugin bundles plugins/*/<version>/,
// skill example/asset/template files, *.min.js and code files over 400 KB (bundles). Repo-level
// scripts/ is not scanned; package scripts/ and *.config.* are skipped by the dependency rules.
// Comment lines are skipped for hardcoded-model-id, site-name-in-core and CI workflow lines.
// Applied migrations are exempt from complexity and the four suppression-comment rules.
//
// Rules and their KNOWN BLIND SPOTS (every number is a raw count, not a verified finding):
//  jini-cross-package-import   Jini package imports another @jini-ai/* package (type-only too) or a
//                              relative path into packages/<other>/; core is the only allowed target.
//                              Blind: computed import() specifiers; imports inside .md/.json examples.
//  jini-core-not-leaf          @jini-ai/core imports any other Jini package. Same blind spots.
//  core-contracts-runtime-code Runtime statements (function/class/const/enum/expression) in
//                              core/src/contracts/**. Blind: re-exports of runtime code from elsewhere.
//  plugin-imports-plugin       A plugin dir imports another plugin dir (relative path or package
//                              subpath). Blind: runtime registry lookups by id are allowed and unseen.
//  vendor-import-outside-plugin Vendor SDK (stripe, @sentry/*, posthog, @vercel/*, @supabase/*,
//                              @octokit/*, recharts, echarts...) or a specific vendor plugin subpath
//                              imported outside plugin dirs. Blind: vendors called over raw fetch/URLs;
//                              AI-model vendors (openai/anthropic) are not in the list.
//  vendor-named-file-outside-plugin File/dir name carries a vendor token outside plugin dirs.
//                              Blind: vendor logic inside generically named files. "github" counts
//                              (owner: GitHub is a plugin, not core). "resend"/"render" are not tokens.
//  vendor-named-tool           A `name:`/`toolName:` snake_case string with a vendor token in a file
//                              whose path says "tool", outside plugin dirs. Blind: names built at runtime.
//  vendor-step-in-core-workflow flyctl / vercel / netlify / wrangler deploy lines in .github/workflows.
//  jini-plugin-package-name    package named @jini-ai/plugin-<id> (sdk/catalog allowed) or carrying a
//                              vendor token; also imports of such names. Blind: unpublished tarballs.
//  server-framework-in-jini    Jini imports express/fastify/koa/hono/nestjs/restify, or a package
//                              export subpath named *express*. Blind: framework types reached through
//                              a re-export, and hand-written (req,res,next) shapes.
//  react-outside-react-subfolder Jini non-UI package (jini.domain != "ui") imports react / react-dom /
//                              @jini-ai/ui(-kit/react) outside a react/ (or *-react) path segment.
//                              Blind: JSX in .tsx without a react import (automatic runtime).
//  jini-unprefixed-classname   Jini className string literal with a token not starting "jini-".
//                              Blind: classes built by cn()/template strings.
//  tovu-in-jini                "tovu" (any case) in Jini package code, .md or .json, or in a file path.
//  tovu-id-in-jini             Tovu-only IDs (SPEC-NN, ADR-NN, U-NNN, D-NN) in Jini files.
//                              Blind: other ID shapes; may hit a Jini-local ADR-NN (Jini uses DR-NNN).
//  base-type-redeclared        interface/type Clock|IdGenerator|UUID|ISODateTime|JsonValue|
//                              HttpClientPort|Logger declared outside @jini-ai/core. Blind: renamed copies.
//  lazy-bare-import            import("pkg") / ESM require("pkg") of a bare non-builtin package
//                              (owner: missing module = declare it, never lazy-load to dodge it).
//                              Blind: computed specifiers; legit code-splitting of big UI libs is counted.
//  undeclared-dependency       Bare runtime import whose package is in no dependency list of the
//                              nearest package.json (Tovu: nearest + root, npm hoisting). Type-only
//                              imports, node builtins and tsconfig path aliases are skipped.
//                              Blind: Vite/webpack aliases not in tsconfig paths read as undeclared.
//  runtime-import-of-devdep    Same, but declared only in devDependencies, in node-runtime code
//                              (Jini runtime!=browser; Tovu website server/desktop). Bundled browser
//                              code is excluded. Blind: build-time-only files not named *.config.*.
//  complexity-over-10          Cyclomatic complexity > 10 per function (if, ?:, case, for/while/do,
//                              catch, &&, ||; nested functions scored separately; like lizard, ?? and
//                              ?. not counted). Migrations exempt. Blind: may differ from lizard by ±1.
//  logic-in-component          Function declared in a .tsx component body (named inner function,
//                              const arrow, useCallback). Blind: inline JSX arrows; nested blocks.
//  component-second-param      React component (PascalCase fn in .tsx/.jsx) with 2+ params
//                              (owner: components take props only). Blind: memo()/forwardRef wrappers.
//  as-any                      `as any` / `<any>` assertions. Blind: `: any` annotations, `as unknown as T`.
//  ts-suppress                 @ts-ignore / @ts-expect-error / @ts-nocheck comments.
//  lint-disable                eslint-disable / biome-ignore / oxlint-disable comments.
//  coverage-ignore             c8 / istanbul / v8 ignore comments.
//                              (These four are text matches: a string that mentions them also counts.)
//  generic-error-catch         catch block that never reads the caught error yet contains a sentence
//                              string (the user gets a fixed message, no detail). Blind: catch that
//                              logs the error but still returns a generic message.
//  swallowed-error             Empty catch block with no comment, or .catch(() => {}) / undefined / null.
//  oauth-lib-outside-facade    openid-client / oauth4webapi imported outside packages/oauth (owner: both
//                              stay hidden behind the @jini-ai/oauth facade).
//  permanent-delete-tool       snake_case tool name with purge / hard_delete / delete_permanently /
//                              empty_trash in a tool file (owner: no permanent deletes from chat; deletes
//                              go to Trash). Blind: tools whose name hides a hard delete.
//  process-exit-in-runtime     process.exit(<non-zero literal>) in server/runtime code (owner: production
//                              warns, never refuses to boot). cli/bin/scripts excluded. Blind: throw-at-boot,
//                              exit(code) with a variable; legit fatal-error exits are counted too.
//  per-cli-code-in-shared-file A file mentions one agent CLI (codex, claude, gemini, antigravity/agy,
//                              aider, opencode, qwen) 8+ times while its path does not name that CLI
//                              ("cursor" left out: pagination; i18n/dictionary files skipped). Blind: threshold is arbitrary; model names inflate claude/gemini.
//  hardcoded-model-id          Literal model id strings (claude-*-N, gpt-N, gemini-N, oN-mini) in
//                              source (owner: model lists must be dynamic). Blind: fallback lists allowed
//                              by the owner are counted too.
//  site-name-in-core           A customer site's name (plannie, juulwin, a26-ventures, thetayway) in
//                              core code. Blind: sites not in that list.
//  ownership-gate-text         "right to copy" / "do you own" / "is this your site" style gates in
//                              code, skills or descriptions (owner: no ownership gates in import tools).
//  large-data-file             Data file (json/csv/mmdb/db/bin/...) over 1 MB in product source.
//  drizzle-frozen              Tovu Drizzle SQL migration numbered >= 0078 (chain frozen at 78; use
//                              ADR-066 TS migrations).
//  bare-toThrow                TEST files: .toThrow()/.toThrowError() with no expected text, or a
//                              one-line assert.throws/rejects without an expected error. Blind:
//                              multi-line assert calls.
import fs from "node:fs";
import path from "node:path";
import { builtinModules, createRequire } from "node:module";

const argv = process.argv.slice(2);
const ROOT = path.resolve(argv[0] ?? process.cwd());
const opt = ({ name }) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const ts = createRequire(path.join(process.cwd(), "package.json"))("typescript");

const IS_JINI = readJson({ file: path.join(ROOT, "packages/core/package.json") })?.name === "@jini-ai/core"
  && !fs.existsSync(path.join(ROOT, "apps/website"));
const SOURCE_ROOTS = IS_JINI ? ["packages"] : ["apps", "packages", "content"];
const SKIP_DIR = /(^|\/)(node_modules|dist|build|coverage|\.git|__fixtures__|fixtures|vendor|e2e|\.next|out|\.turbo|release|[^/]+\.(app|framework))(\/|$)/;
const TEST_DIR = /(^|\/)(__tests__|tests?|__mocks__)(\/|$)/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$|\.test-support\.|\.support\.ts$|\.typecheck\.ts$|\.test-d\.ts$|(^|[/.-])(vitest|jest|test)[.-]setup\.|setup-tests?\./;
const LOCAL_SITE = /apps\/website\/src\/sites\/|apps\/website\/sites\/|\/plugins\/[^/]+\/\d+\.\d+\.\d+\//;
// Example/template files shipped inside skills are content for the agent, not product code.
const SKILL_ASSET = /\/skills\/.+\/(examples?|assets|templates?)\//;
const TOOLING = /(^|\/)scripts\/|\.config\.[cm]?[jt]s$/; // build/dev tooling inside packages
const MIGRATION = /(^|\/)migrations?(\/|$)/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|\{\s*\/\*|#)/;
const CODE_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/;
const TEXT_EXT = /\.(md|json)$/;
const DATA_EXT = /\.(json|csv|tsv|mmdb|db|sqlite|bin|dat|xml|geojson|txt|ndjson|jsonl)$/;
const BUILTINS = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));

const RULES = {
  "jini-cross-package-import": ["Jini pkg imports another Jini pkg (only core allowed)", "owner_decisions_2026_11_07.md"],
  "jini-core-not-leaf": ["@jini-ai/core imports a Jini pkg", "owner_decisions_2026_11_07.md"],
  "core-contracts-runtime-code": ["runtime code in core/contracts", "owner_decisions_2026_11_07.md"],
  "plugin-imports-plugin": ["plugin imports another plugin", "owner_decisions_2026_10_09.md"],
  "vendor-import-outside-plugin": ["vendor SDK/plugin imported outside plugins", "no_vendor_code_in_core.md"],
  "vendor-named-file-outside-plugin": ["vendor-named file outside plugins", "no_vendor_code_in_core.md"],
  "vendor-named-tool": ["vendor-named tool id outside plugins", "tools_generic_by_category_not_vendor.md"],
  "vendor-step-in-core-workflow": ["vendor deploy step in core CI", "no_vendor_code_in_core.md"],
  "jini-plugin-package-name": ["@jini-ai/plugin-<id> or vendor package", "owner_decisions_2026_11_02.md"],
  "server-framework-in-jini": ["Express/Fastify/... in Jini", "no_specific_server_framework_in_jini.md"],
  "react-outside-react-subfolder": ["React in non-UI Jini pkg outside react/", "owner_decisions_2026_11_07.md"],
  "jini-unprefixed-classname": ["Jini className not jini- prefixed", "jini_styling_prefixed_classes_host_css.md"],
  "tovu-in-jini": ["\"Tovu\" in Jini", "preserve_why_comments_on_refactor.md"],
  "tovu-id-in-jini": ["Tovu IDs (SPEC/ADR/U/D) in Jini", "preserve_why_comments_on_refactor.md"],
  "base-type-redeclared": ["core base type redeclared", "api_args_required_then_optional_objects.md"],
  "lazy-bare-import": ["lazy import()/require of a package", "missing_module_means_declare_never_lazy.md"],
  "undeclared-dependency": ["import of undeclared package", "missing_module_means_declare_never_lazy.md"],
  "runtime-import-of-devdep": ["node-runtime import of a devDependency", "missing_module_means_declare_never_lazy.md"],
  "complexity-over-10": ["function CCN > 10", "complexity_must_be_under_11.md"],
  "logic-in-component": ["function inside a .tsx component", "component_logic_belongs_hooks.md"],
  "component-second-param": ["React component with 2+ params", "api_args_required_then_optional_objects.md"],
  "as-any": ["as any", "lint_jobs_check_added_disables.md"],
  "ts-suppress": ["@ts-ignore/expect-error/nocheck", "lint_jobs_check_added_disables.md"],
  "lint-disable": ["eslint-disable / biome-ignore", "lint_jobs_check_added_disables.md"],
  "coverage-ignore": ["c8/istanbul/v8 ignore", "coverage_floor_99_all_metrics.md"],
  "generic-error-catch": ["catch drops the error, fixed message", "no_generic_error_messages.md"],
  "swallowed-error": ["empty catch / .catch(() => {})", "no_generic_error_messages.md"],
  "oauth-lib-outside-facade": ["openid-client/oauth4webapi outside @jini-ai/oauth", "owner_decisions_2026_10_20.md"],
  "permanent-delete-tool": ["chat tool that purges / hard-deletes", "owner_decisions_2026_10_09.md"],
  "process-exit-in-runtime": ["process.exit in runtime code", "no_boot_refusals_no_auto_password_change.md"],
  "per-cli-code-in-shared-file": ["per-CLI code in a shared file", "per_cli_code_in_own_folder.md"],
  "hardcoded-model-id": ["hard-coded model id", "agent_models_must_be_dynamic.md"],
  "site-name-in-core": ["customer site name in core", "abstract_first_site_specific_in_sites.md"],
  "ownership-gate-text": ["ownership/rights gate text", "no_ownership_gates_in_import_tools.md"],
  "large-data-file": ["data file > 1 MB", "no_vendor_code_in_core.md"],
  "drizzle-frozen": ["Drizzle SQL migration >= 0078", "schema_changes_use_adr066_ts_migrations.md"],
  "bare-toThrow": ["test asserts a throw without its text", "assert_exact_error_text.md"],
};
const JINI_ONLY = new Set(["jini-cross-package-import", "jini-core-not-leaf", "core-contracts-runtime-code",
  "server-framework-in-jini", "react-outside-react-subfolder", "jini-unprefixed-classname", "tovu-in-jini", "tovu-id-in-jini"]);
const TOVU_ONLY = new Set(["drizzle-frozen"]);

const VENDORS = ["fly", "flyio", "vercel", "netlify", "stripe", "paypal", "lipay", "supabase", "github", "posthog",
  "sentry", "shopify", "railway", "cloudflare", "wordpress", "calendly", "formspree", "composio",
  "langfuse", "meilisearch", "higgsfield", "recharts", "echarts", "nivo", "disqus", "giscus", "plausible",
  "mailgun", "sendgrid", "twilio", "airtable"]; // not "resend"/"render": common English words
const VENDOR_SET = new Set(VENDORS);
const VENDOR_SDK = /^(stripe|@stripe\/|posthog-(js|node)|@posthog\/|@sentry\/|@vercel\/|@supabase\/|@netlify\/|@octokit\/|@shopify\/|recharts|echarts|echarts-for-react|@nivo\/|resend$|@composio\/|composio-core|langfuse|@langfuse\/|meilisearch|@paypal\/|@cloudflare\/|wrangler|@aws-sdk\/|@google-cloud\/|googleapis|airtable|twilio|@sendgrid\/|mailgun)/;
const SERVER_FW = /^(express|express-[\w-]+|fastify|@fastify\/|koa|@koa\/|hono|@hono\/|restify|@nestjs\/)(\/|$)/;
const REACT_SPEC = /^(react|react-dom)(\/|$)|^@jini-ai\/ui(\/|$)|^@jini-ai\/ui-kit\/react/;
// "cursor" is left out: it is mostly pagination cursors. agy = antigravity.
const CLI_TOKENS = { codex: ["codex"], claude: ["claude"], gemini: ["gemini"], antigravity: ["antigravity", "agy"], aider: ["aider"], opencode: ["opencode"], qwen: ["qwen"] };
const BASE_TYPES = new Set(["Clock", "IdGenerator", "UUID", "ISODateTime", "JsonValue", "HttpClientPort", "Logger"]);
const SITE_NAMES = /\b(plannie|juulwin|a26-ventures|thetayway)\b/i;
const MODEL_ID = /['"`](claude-(?:opus|sonnet|haiku|fable)-\d[\w.-]*|gpt-\d[\w.-]*|gemini-\d[\w.-]*|o[134]-(?:mini|pro|preview)[\w.-]*)['"`]/i;
const OWNERSHIP = /\b(right to copy|rights? to (copy|reproduce)|own(s)? the rights|do you own|is this your (own )?(site|website|theme)|copyright holder|permission to copy|licensed to copy|commercial theme)\b/i;
const NON_PLUGIN_DIRS = new Set(["src", "__tests__", "tests", "test", "docs", "scripts", "dist", "node_modules", "coverage"]);

const violations = [];
function add({ rule, file, line = 0, snippet = "" }) {
  violations.push({ rule, file, line, snippet: String(snippet).replace(/\s+/g, " ").trim().slice(0, 120) });
}

function readJson({ file }) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

// ---------- file discovery ----------
function walk({ dir, out }) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name), rel = path.relative(ROOT, p);
    if (e.isDirectory()) {
      if (!SKIP_DIR.test(rel) && !LOCAL_SITE.test(rel + "/")) walk({ dir: p, out });
      continue;
    }
    if (LOCAL_SITE.test(rel) || SKILL_ASSET.test(rel) || /\.min\.js$|\.d\.[cm]?ts$/.test(e.name)) continue;
    const isTest = TEST_FILE.test(e.name) || TEST_DIR.test(rel);
    if (CODE_EXT.test(e.name)) (isTest ? out.tests : out.code).push(rel);
    else if (!isTest && TEXT_EXT.test(e.name)) out.text.push(rel);
    if (!isTest && DATA_EXT.test(e.name)) out.data.push(rel);
  }
  return out;
}

// ---------- package / plugin context ----------
const pkgCache = new Map();
function nearestPkg({ relDir }) {
  if (pkgCache.has(relDir)) return pkgCache.get(relDir);
  const json = readJson({ file: path.join(ROOT, relDir, "package.json") });
  const parent = relDir === "" || relDir === "." ? null : path.dirname(relDir);
  const found = json ? { dir: relDir, json } : parent === null ? null : nearestPkg({ relDir: parent === "." ? "" : parent });
  pkgCache.set(relDir, found);
  return found;
}
const ROOT_PKG = readJson({ file: path.join(ROOT, "package.json") }) ?? {};
// npm workspaces link every workspace package, so its name counts as declared in Tovu.
const WORKSPACE_NAMES = new Set(IS_JINI ? [] : (ROOT_PKG.workspaces ?? []).flatMap((w) => {
  const base = path.join(ROOT, w.replace(/\/\*$/, ""));
  try { return fs.readdirSync(base).map((d) => readJson({ file: path.join(base, d, "package.json") })?.name).filter(Boolean); } catch { return []; }
}));

function jiniPkgOf({ rel }) {
  const m = /^packages\/([^/]+)\//.exec(rel);
  if (!m) return null;
  const json = readJson({ file: path.join(ROOT, "packages", m[1], "package.json") }) ?? {};
  return { seg: m[1], name: json.name, domain: json.jini?.domain, runtime: json.jini?.runtime };
}

// A plugin's identity key ("agent:vercel", "provider:charts-echarts", "content:deploy"), or null.
function pluginIdOf({ rel }) {
  const m = /^packages\/agent-plugins\/([^/]+)\//.exec(rel);
  if (m && !NON_PLUGIN_DIRS.has(m[1]) && fs.existsSync(path.join(ROOT, "packages/agent-plugins", m[1], "plugin.json"))) return `agent:${m[1]}`;
  const p = /^packages\/provider-plugins\/plugins\/([^/]+)\//.exec(rel);
  if (p) return `provider:${p[1]}`;
  const c = /^content\/agent-plugins\/([^/]+)\//.exec(rel);
  return c ? `content:${c[1]}` : null;
}
const isPluginArea = ({ rel }) => Boolean(pluginIdOf({ rel })) || /^packages\/provider-plugins\/|^content\/agent-plugin-overlays\//.test(rel);

// Which @jini-ai/agent-plugins subpaths are vendor plugins (dirs that hold a plugin.json).
const AGENT_PLUGINS_DIR = [path.join(ROOT, "packages/agent-plugins"), path.join(ROOT, "node_modules/@jini-ai/agent-plugins")]
  .find((d) => fs.existsSync(path.join(d, "package.json")));
const isAgentPluginId = ({ id }) => Boolean(AGENT_PLUGINS_DIR && fs.existsSync(path.join(AGENT_PLUGINS_DIR, id, "plugin.json")));

function specPluginId({ spec }) {
  const a = /^@jini-ai\/agent-plugins\/([^/]+)/.exec(spec);
  if (a && isAgentPluginId({ id: a[1] })) return `agent:${a[1]}`;
  const p = /^@jini-ai\/provider-plugins\/(?:plugins\/)?([^/]+)/.exec(spec);
  return p && !/^(src|catalog|index)/.test(p[1]) ? `provider:${p[1]}` : null;
}

// tsconfig "paths" keys are aliases, not packages.
function collectAliases() {
  const aliases = new Set(["@/", "~/", "#", "virtual:", "/"]);
  const dirs = ["", ...SOURCE_ROOTS.flatMap((r) => {
    try { return fs.readdirSync(path.join(ROOT, r)).map((d) => path.join(r, d)); } catch { return []; }
  })];
  for (const d of dirs) {
    let files = [];
    try { files = fs.readdirSync(path.join(ROOT, d)).filter((f) => /^tsconfig.*\.json$/.test(f)); } catch { continue; }
    for (const f of files) {
      const text = fs.readFileSync(path.join(ROOT, d, f), "utf8");
      const block = /"paths"\s*:\s*\{([^}]*)\}/s.exec(text)?.[1] ?? "";
      for (const k of block.matchAll(/"([^"]+)"\s*:/g)) aliases.add(k[1].replace(/\*$/, ""));
    }
  }
  return [...aliases];
}
const ALIASES = collectAliases();

// ---------- AST helpers ----------
const lineOf = ({ sf, node }) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const lineText = ({ lines, line }) => lines[line - 1] ?? "";
const isFnLike = (n) => ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n) || ts.isArrowFunction(n)
  || ts.isFunctionExpression(n) || ts.isConstructorDeclaration(n) || ts.isGetAccessor(n) || ts.isSetAccessor(n);

function fnName({ node }) {
  if (node.name && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name))) return node.name.text;
  const p = node.parent;
  if (p && (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) && ts.isIdentifier(p.name)) return p.name.text;
  return ts.isConstructorDeclaration(node) ? "constructor" : "<anonymous>";
}

const DECISION = new Set([ts.SyntaxKind.IfStatement, ts.SyntaxKind.ConditionalExpression, ts.SyntaxKind.CaseClause,
  ts.SyntaxKind.ForStatement, ts.SyntaxKind.ForInStatement, ts.SyntaxKind.ForOfStatement, ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement, ts.SyntaxKind.CatchClause]);
const LOGICAL = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken, ts.SyntaxKind.BarBarEqualsToken]);

function ccn({ body }) {
  let n = 1;
  const visit = (node) => {
    if (node !== body && isFnLike(node)) return;
    if (DECISION.has(node.kind) || (ts.isBinaryExpression(node) && LOGICAL.has(node.operatorToken.kind))) n++;
    ts.forEachChild(node, visit);
  };
  visit(body);
  return n;
}

function mentionsIdent({ node, name }) {
  let hit = false;
  const visit = (n) => { if (hit) return; if (ts.isIdentifier(n) && n.text === name) hit = true; else ts.forEachChild(n, visit); };
  visit(node);
  return hit;
}

function firstSentenceString({ node }) {
  let found = null;
  const visit = (n) => {
    if (found) return;
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text.length >= 12 && /([A-Za-z]{2,}\s+){2,}[A-Za-z]{2,}/.test(n.text)) found = n.text;
    else ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function isTypeOnlyImport({ node }) {
  if (ts.isExportDeclaration(node)) return node.isTypeOnly;
  const c = node.importClause;
  if (!c) return false;
  if (c.isTypeOnly) return true;
  const nb = c.namedBindings;
  return !c.name && Boolean(nb) && ts.isNamedImports(nb) && nb.elements.length > 0 && nb.elements.every((e) => e.isTypeOnly);
}

function collectImports({ sf, rel }) {
  const out = [];
  const esm = /\.(ts|tsx|mts|mjs)$/.test(rel);
  // In ESM a bare `require` is only Node's when the file builds one with createRequire;
  // otherwise it is a local function (e.g. a capability lookup) and not a module load.
  const realRequire = !esm || sf.text.includes("createRequire");
  const visit = (node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      out.push({ spec: node.moduleSpecifier.text, node, typeOnly: isTypeOnlyImport({ node }), dynamic: false });
    } else if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) {
      const isImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isImport || (isRequire && realRequire)) out.push({ spec: node.arguments[0].text, node, typeOnly: false, dynamic: isImport || esm });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      out.push({ spec: node.argument.literal.text, node, typeOnly: true, dynamic: false });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const cleanSpec = ({ spec }) => spec.replace(/[?!].*$/, "");
const isBare = ({ spec }) => !/^[./]/.test(spec) && !ALIASES.some((a) => spec === a.replace(/\/$/, "") || spec.startsWith(a));
const pkgNameOf = ({ spec }) => spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

// ---------- import rules ----------
function depLists({ json }) {
  const pick = (k) => Object.keys(json?.[k] ?? {});
  return { runtime: new Set([...pick("dependencies"), ...pick("peerDependencies"), ...pick("optionalDependencies")]), dev: new Set(pick("devDependencies")) };
}

function isNodeRuntime({ rel }) {
  // Bundled code (browser packages, provider-plugin bundles, desktop renderer) inlines its devDeps.
  if (IS_JINI) return jiniPkgOf({ rel })?.runtime !== "browser" && !/\.tsx$/.test(rel) && !rel.startsWith("packages/provider-plugins/");
  return /^apps\/website\/src\/(server|platform|cli|assistant)\/|^apps\/desktop\/(?!src\/renderer\/)/.test(rel) && !/(verify|check)[\w-]*\.[cm]?[jt]s$/.test(rel);
}

function checkDeclared({ rel, imp, ctx }) {
  const spec = cleanSpec({ spec: imp.spec });
  if (imp.typeOnly || !isBare({ spec }) || BUILTINS.has(spec) || BUILTINS.has(spec.split("/")[0]) || TOOLING.test(rel)) return;
  const name = pkgNameOf({ spec });
  if (name === ctx.pkg?.json?.name || name === "electron" || WORKSPACE_NAMES.has(name)) return;
  const near = depLists({ json: ctx.pkg?.json });
  const root = IS_JINI ? { runtime: new Set(), dev: new Set() } : depLists({ json: ROOT_PKG });
  if (near.runtime.has(name) || root.runtime.has(name)) return;
  const line = ctx.line;
  if (near.dev.has(name) || root.dev.has(name)) {
    if (isNodeRuntime({ rel })) add({ rule: "runtime-import-of-devdep", file: rel, line, snippet: `${name} (devDependencies only) — ${ctx.text}` });
    return;
  }
  add({ rule: "undeclared-dependency", file: rel, line, snippet: `${name} not in ${ctx.pkg?.dir || "."}/package.json — ${ctx.text}` });
}

function checkJiniImport({ rel, imp, ctx }) {
  const own = jiniPkgOf({ rel });
  if (!own) return;
  const spec = imp.spec;
  let other = null;
  if (spec.startsWith("@jini-ai/")) other = pkgNameOf({ spec });
  else if (spec.startsWith(".")) {
    const target = path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, rel)), spec));
    const seg = /^packages\/([^/]+)/.exec(target)?.[1];
    if (seg && seg !== own.seg) other = readJson({ file: path.join(ROOT, "packages", seg, "package.json") })?.name ?? `packages/${seg}`;
  }
  if (!other || other === own.name) return;
  const tag = imp.typeOnly ? "[type-only] " : "";
  if (own.name === "@jini-ai/core") add({ rule: "jini-core-not-leaf", file: rel, line: ctx.line, snippet: tag + ctx.text });
  else if (other !== "@jini-ai/core") add({ rule: "jini-cross-package-import", file: rel, line: ctx.line, snippet: `${tag}${own.name} -> ${other}: ${ctx.text}` });
}

function checkPluginImport({ rel, imp, ctx }) {
  const mine = pluginIdOf({ rel });
  const spec = imp.spec;
  let target = specPluginId({ spec });
  if (!target && spec.startsWith(".")) target = pluginIdOf({ rel: path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, rel)), spec)) + "/" });
  if (mine && target && target !== mine) add({ rule: "plugin-imports-plugin", file: rel, line: ctx.line, snippet: `${mine} -> ${target}: ${ctx.text}` });
  if (!mine && !isPluginArea({ rel }) && (target || VENDOR_SDK.test(cleanSpec({ spec })))) {
    add({ rule: "vendor-import-outside-plugin", file: rel, line: ctx.line, snippet: (imp.typeOnly ? "[type-only] " : "") + ctx.text });
  }
}

function checkImports({ rel, sf, lines }) {
  const pkg = nearestPkg({ relDir: path.dirname(rel) });
  for (const imp of collectImports({ sf, rel })) {
    const line = lineOf({ sf, node: imp.node });
    const ctx = { line, text: lineText({ lines, line }), pkg };
    const spec = cleanSpec({ spec: imp.spec });
    checkDeclared({ rel, imp, ctx });
    checkPluginImport({ rel, imp, ctx });
    if (IS_JINI) checkJiniImport({ rel, imp, ctx });
    if (/^(openid-client|oauth4webapi)(\/|$)/.test(spec) && !rel.startsWith("packages/oauth/")) add({ rule: "oauth-lib-outside-facade", file: rel, line, snippet: ctx.text });
    if (IS_JINI && SERVER_FW.test(spec)) add({ rule: "server-framework-in-jini", file: rel, line, snippet: ctx.text });
    if (/^@jini-ai\/plugin-(?!sdk$|catalog$)/.test(pkgNameOf({ spec }))) add({ rule: "jini-plugin-package-name", file: rel, line, snippet: ctx.text });
    if (imp.dynamic && isBare({ spec }) && !BUILTINS.has(spec) && !BUILTINS.has(spec.split("/")[0]) && spec !== "electron" && !TOOLING.test(rel)) add({ rule: "lazy-bare-import", file: rel, line, snippet: ctx.text });
    checkReactPlacement({ rel, spec, ctx });
  }
}

function checkReactPlacement({ rel, spec, ctx }) {
  if (!IS_JINI || !REACT_SPEC.test(spec)) return;
  const own = jiniPkgOf({ rel });
  if (!own || own.domain === "ui" || isPluginArea({ rel })) return;
  const inner = rel.slice(`packages/${own.seg}/`.length);
  if (!inner.split("/").some((s) => /^react$|-react$|^react-/.test(s))) add({ rule: "react-outside-react-subfolder", file: rel, line: ctx.line, snippet: `${own.name}: ${ctx.text}` });
}

// ---------- per-node rules ----------
function checkFunctionComplexity({ rel, sf, node }) {
  if (MIGRATION.test(rel) || !node.body) return;
  const n = ccn({ body: node.body });
  if (n > 10) add({ rule: "complexity-over-10", file: rel, line: lineOf({ sf, node }), snippet: `${fnName({ node })} CCN=${n}` });
}

function checkCatch({ rel, sf, node, lines }) {
  const bind = node.variableDeclaration?.name;
  const name = bind && ts.isIdentifier(bind) ? bind.text : null;
  const line = lineOf({ sf, node });
  if (node.block.statements.length === 0) {
    if (!/\/\/|\/\*/.test(node.block.getText(sf))) add({ rule: "swallowed-error", file: rel, line, snippet: lineText({ lines, line }) });
    return;
  }
  if (name && mentionsIdent({ node: node.block, name })) return;
  const msg = firstSentenceString({ node: node.block });
  if (msg) add({ rule: "generic-error-catch", file: rel, line, snippet: `"${msg}"` });
}

function isEmptyHandler({ fn, sf }) {
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return false;
  const b = fn.body;
  if (ts.isBlock(b)) return b.statements.length === 0 && !/\/\/|\/\*/.test(b.getText(sf));
  return b.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(b) && b.text === "undefined") || ts.isVoidExpression(b);
}

function checkCall({ rel, sf, node, lines }) {
  const e = node.expression;
  if (ts.isPropertyAccessExpression(e) && e.name.text === "catch" && isEmptyHandler({ fn: node.arguments[0], sf })) {
    const line = lineOf({ sf, node: e.name });
    add({ rule: "swallowed-error", file: rel, line, snippet: lineText({ lines, line }) });
  }
  if (ts.isPropertyAccessExpression(e) && e.name.text === "exit" && ts.isIdentifier(e.expression) && e.expression.text === "process") checkExit({ rel, sf, node, lines });
}

function checkExit({ rel, sf, node, lines }) {
  if (/(^|\/)(cli|bin|scripts?|tools)(\/|$)|cli[\w-]*\.[cm]?[jt]s$/.test(rel)) return;
  if (IS_JINI && jiniPkgOf({ rel })?.name === "@jini-ai/cli") return;
  const code = node.arguments[0];
  if (!code || !ts.isNumericLiteral(code) || code.text === "0") return; // only explicit failure exits refuse a boot
  const line = lineOf({ sf, node });
  add({ rule: "process-exit-in-runtime", file: rel, line, snippet: lineText({ lines, line }) });
}

function checkVendorTool({ rel, sf, node }) {
  if (!/tool/i.test(rel) || !ts.isIdentifier(node.name) || !/^(name|toolName)$/.test(node.name.text)) return;
  const init = node.initializer;
  if (!ts.isStringLiteral(init) || !/^[a-z0-9]+(_[a-z0-9]+)+$/.test(init.text)) return;
  if (/(^|_)(purge|hard_delete|delete_permanently|permanent_delete|empty_trash)(_|$)/.test(init.text)) add({ rule: "permanent-delete-tool", file: rel, line: lineOf({ sf, node }), snippet: init.text });
  if (isPluginArea({ rel })) return;
  if (init.text.split("_").some((t) => VENDOR_SET.has(t))) add({ rule: "vendor-named-tool", file: rel, line: lineOf({ sf, node }), snippet: init.text });
}

function checkTypeDecl({ rel, sf, node }) {
  if (!BASE_TYPES.has(node.name.text) || (IS_JINI && rel.startsWith("packages/core/"))) return;
  add({ rule: "base-type-redeclared", file: rel, line: lineOf({ sf, node }), snippet: `${ts.SyntaxKind[node.kind]} ${node.name.text}` });
}

function checkClassName({ rel, sf, node }) {
  if (!IS_JINI || isPluginArea({ rel }) || !ts.isIdentifier(node.name) || node.name.text !== "className" || !node.initializer) return;
  let lit = node.initializer;
  if (ts.isJsxExpression(lit)) lit = lit.expression;
  if (!lit || !ts.isStringLiteralLike(lit)) return;
  const bad = lit.text.split(/\s+/).filter((t) => t && !t.startsWith("jini-"));
  if (bad.length) add({ rule: "jini-unprefixed-classname", file: rel, line: lineOf({ sf, node }), snippet: bad.join(" ") });
}

function visitNodes({ rel, sf, lines }) {
  const visit = (node) => {
    if (isFnLike(node)) checkFunctionComplexity({ rel, sf, node });
    else if (ts.isCatchClause(node)) checkCatch({ rel, sf, node, lines });
    else if (ts.isCallExpression(node)) checkCall({ rel, sf, node, lines });
    else if (ts.isPropertyAssignment(node)) checkVendorTool({ rel, sf, node });
    else if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) checkTypeDecl({ rel, sf, node });
    else if (ts.isJsxAttribute(node)) checkClassName({ rel, sf, node });
    else if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
      const line = lineOf({ sf, node });
      add({ rule: "as-any", file: rel, line, snippet: lineText({ lines, line }) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

// ---------- React component rules ----------
function componentsOf({ sf }) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name && /^[A-Z]/.test(st.name.text) && st.body) out.push({ name: st.name.text, fn: st });
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const init = d.initializer;
      if (ts.isIdentifier(d.name) && /^[A-Z]/.test(d.name.text) && init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) out.push({ name: d.name.text, fn: init });
    }
  }
  return out;
}

function innerFunctions({ body }) {
  if (!body || !ts.isBlock(body)) return [];
  const out = [];
  for (const st of body.statements) {
    if (ts.isFunctionDeclaration(st)) out.push(st);
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      const i = d.initializer;
      const isCb = i && ts.isCallExpression(i) && /^(React\.)?useCallback$/.test(i.expression.getText());
      if (i && (ts.isArrowFunction(i) || ts.isFunctionExpression(i) || isCb)) out.push(d);
    }
  }
  return out;
}

function checkComponents({ rel, sf, lines }) {
  if (!/\.(tsx|jsx)$/.test(rel)) return;
  for (const { name, fn } of componentsOf({ sf })) {
    if (fn.parameters.length >= 2) add({ rule: "component-second-param", file: rel, line: lineOf({ sf, node: fn }), snippet: `${name}(${fn.parameters.map((p) => p.name.getText(sf)).join(", ")})` });
    for (const inner of innerFunctions({ body: fn.body })) {
      const line = lineOf({ sf, node: inner });
      add({ rule: "logic-in-component", file: rel, line, snippet: `${name}: ${lineText({ lines, line })}` });
    }
  }
}

function checkContractsRuntime({ rel, sf }) {
  if (!IS_JINI || !rel.startsWith("packages/core/src/contracts/")) return;
  for (const st of sf.statements) {
    const constEnum = ts.isEnumDeclaration(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ConstKeyword);
    const runtime = ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isVariableStatement(st) || ts.isExpressionStatement(st) || (ts.isEnumDeclaration(st) && !constEnum);
    if (runtime) add({ rule: "core-contracts-runtime-code", file: rel, line: lineOf({ sf, node: st }), snippet: st.getText(sf).split("\n")[0] });
  }
}

// ---------- text rules ----------
// [rule, regex, codeLinesOnly]: model ids and site names in comments are history notes, not behaviour.
const LINE_RULES = [
  ["ts-suppress", /(\/\/|\/\*)\s*@ts-(ignore|expect-error|nocheck)\b/, false],
  ["lint-disable", /(\/\/|\/\*)\s*(eslint-disable|biome-ignore|oxlint-disable)\b/, false],
  ["coverage-ignore", /\/\*\s*(c8|istanbul|v8)\s+ignore\b/, false],
  ["hardcoded-model-id", MODEL_ID, true],
  ["site-name-in-core", SITE_NAMES, true],
];

function checkLines({ rel, lines, code }) {
  lines.forEach((text, i) => {
    const comment = COMMENT_LINE.test(text);
    if (code && !MIGRATION.test(rel)) for (const [rule, re, codeOnly] of LINE_RULES) if (re.test(text) && !(codeOnly && comment)) add({ rule, file: rel, line: i + 1, snippet: text });
    if (OWNERSHIP.test(text)) add({ rule: "ownership-gate-text", file: rel, line: i + 1, snippet: text });
    if (IS_JINI && /tovu/i.test(text)) add({ rule: "tovu-in-jini", file: rel, line: i + 1, snippet: text });
    if (IS_JINI && /\b(SPEC-\d{2,}|ADR-\d{2,}|U-\d{3}|D-\d{2})\b/.test(text)) add({ rule: "tovu-id-in-jini", file: rel, line: i + 1, snippet: text });
  });
  if (IS_JINI && /tovu/i.test(rel)) add({ rule: "tovu-in-jini", file: rel, line: 0, snippet: `path: ${rel}` });
}

function checkCliMentions({ rel, text }) {
  const lower = text.toLowerCase(), relLower = rel.toLowerCase();
  for (const [cli, aliases] of Object.entries(CLI_TOKENS)) {
    const re = new RegExp(`\\b(${aliases.join("|")})\\b`, "g");
    const hits = lower.match(re)?.length ?? 0;
    if (hits < 8 || aliases.some((a) => relLower.includes(a)) || /i18n|dictionar|locale/.test(relLower)) continue;
    const line = lower.slice(0, lower.search(re)).split("\n").length;
    add({ rule: "per-cli-code-in-shared-file", file: rel, line, snippet: `${cli} x${hits}` });
  }
}

function checkVendorPath({ rel }) {
  if (isPluginArea({ rel })) return;
  const tokens = rel.replace(/\.[^./]+$/, "").split(/[/\-_.]/).map((t) => t.toLowerCase());
  const hit = tokens.find((t) => VENDOR_SET.has(t));
  if (hit) add({ rule: "vendor-named-file-outside-plugin", file: rel, line: 0, snippet: `${hit}: ${rel}` });
}

// ---------- repo-level rules ----------
function checkPackageNames() {
  for (const r of ["packages", "apps"]) {
    let dirs = [];
    try { dirs = fs.readdirSync(path.join(ROOT, r)); } catch { continue; }
    for (const d of dirs) {
      const name = readJson({ file: path.join(ROOT, r, d, "package.json") })?.name;
      if (!name) continue;
      const vendor = name.split(/[/\-_@.]/).find((t) => VENDOR_SET.has(t));
      if (/^@jini-ai\/plugin-(?!sdk$|catalog$)/.test(name) || (vendor && !/provider-plugins|agent-plugins/.test(name))) {
        add({ rule: "jini-plugin-package-name", file: path.join(r, d, "package.json"), line: 0, snippet: name });
      }
      if (IS_JINI) checkServerExports({ file: path.join(r, d, "package.json") });
    }
  }
}

function checkServerExports({ file }) {
  const exp = readJson({ file: path.join(ROOT, file) })?.exports;
  if (!exp || typeof exp !== "object") return;
  for (const k of Object.keys(exp)) if (/express|fastify|koa|hono/i.test(k)) add({ rule: "server-framework-in-jini", file, line: 0, snippet: `export subpath ${k}` });
}

function checkWorkflows() {
  const dir = path.join(ROOT, ".github/workflows");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => /\.ya?ml$/.test(x))) {
    fs.readFileSync(path.join(dir, f), "utf8").split("\n").forEach((text, i) => {
      if (!COMMENT_LINE.test(text) && /\b(flyctl|superfly|vercel (deploy|--prod)|netlify deploy|wrangler (deploy|publish))\b/.test(text)) {
        add({ rule: "vendor-step-in-core-workflow", file: `.github/workflows/${f}`, line: i + 1, snippet: text });
      }
    });
  }
}

function checkDataFiles({ files }) {
  for (const rel of files) {
    const size = fs.statSync(path.join(ROOT, rel)).size;
    if (size > 1024 * 1024) add({ rule: "large-data-file", file: rel, line: 0, snippet: `${(size / 1048576).toFixed(1)} MB` });
  }
}

function checkDrizzle() {
  const dir = path.join(ROOT, "apps/website/src/platform/db/drizzle");
  if (IS_JINI || !fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    const n = /^(\d{4})_.*\.sql$/.exec(f)?.[1];
    if (n && Number(n) >= 78) add({ rule: "drizzle-frozen", file: path.relative(ROOT, path.join(dir, f)), line: 0, snippet: f });
  }
}

function checkTestFile({ rel }) {
  fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n").forEach((text, i) => {
    const bare = /(?<!\.not)\.(toThrow|toThrowError)\(\s*\)/.test(text)
      || /\bassert\.(throws|rejects)\(\s*(async\s*)?(\(\)\s*=>\s*[^,]+|[\w.]+)\)\s*;?\s*$/.test(text);
    if (bare) add({ rule: "bare-toThrow", file: rel, line: i + 1, snippet: text });
  });
}

// ---------- main ----------
function scanCode({ rel }) {
  const abs = path.join(ROOT, rel);
  if (fs.statSync(abs).size > 400 * 1024) return;
  const text = fs.readFileSync(abs, "utf8");
  const lines = text.split("\n");
  const kind = /\.tsx$/.test(rel) ? ts.ScriptKind.TSX : /\.jsx$/.test(rel) ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(rel) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, kind);
  checkImports({ rel, sf, lines });
  visitNodes({ rel, sf, lines });
  checkComponents({ rel, sf, lines });
  checkContractsRuntime({ rel, sf });
  checkLines({ rel, lines, code: true });
  checkCliMentions({ rel, text });
  checkVendorPath({ rel });
}

function main() {
  const started = Date.now();
  const files = { code: [], tests: [], text: [], data: [] };
  for (const r of SOURCE_ROOTS) if (fs.existsSync(path.join(ROOT, r))) walk({ dir: path.join(ROOT, r), out: files });
  for (const rel of files.code) scanCode({ rel });
  for (const rel of files.text) checkLines({ rel, lines: fs.readFileSync(path.join(ROOT, rel), "utf8").split("\n"), code: false });
  for (const rel of files.tests) checkTestFile({ rel });
  checkPackageNames();
  checkWorkflows();
  checkDataFiles({ files: files.data });
  checkDrizzle();
  report({ files, ms: Date.now() - started });
}

function report({ files, ms }) {
  const label = opt({ name: "--label" }) ?? path.basename(ROOT);
  const totals = {};
  for (const id of Object.keys(RULES)) {
    if ((IS_JINI && TOVU_ONLY.has(id)) || (!IS_JINI && JINI_ONLY.has(id))) continue;
    totals[id] = 0;
  }
  for (const v of violations) totals[v.rule] = (totals[v.rule] ?? 0) + 1;
  console.log(`owner-rules-audit ${label} (${IS_JINI ? "jini" : "tovu"} mode): ${files.code.length} code, ${files.tests.length} test, ${files.text.length} md/json files in ${(ms / 1000).toFixed(1)}s`);
  console.log(`${"rule".padEnd(34)} ${"count".padStart(6)}  top area`);
  for (const [id, n] of Object.entries(totals).sort((a, b) => b[1] - a[1])) {
    const areas = {};
    for (const v of violations) if (v.rule === id) { const a = v.file.split("/").slice(0, 2).join("/"); areas[a] = (areas[a] ?? 0) + 1; }
    const top = Object.entries(areas).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([a, c]) => `${a} ${c}`).join(", ");
    console.log(`${id.padEnd(34)} ${String(n).padStart(6)}  ${top}`);
  }
  const out = opt({ name: "--json" });
  if (out) {
    fs.writeFileSync(out, JSON.stringify({ repo: ROOT, label, mode: IS_JINI ? "jini" : "tovu", generatedAt: new Date().toISOString(),
      rules: Object.fromEntries(Object.entries(RULES).map(([id, [title, source]]) => [id, { title, source }])), totals, violations }, null, 1));
    console.log(`wrote ${violations.length} violations to ${out}`);
  }
}

main();
