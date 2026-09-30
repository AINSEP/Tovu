#!/usr/bin/env node
/**
 * Test-rigor inventory (phase 0 of the test rigor program).
 *
 * Deterministic and re-runnable: every file is read from the HEAD commit (not the working tree),
 * every list is sorted, and the output carries no timestamps — so two runs on the same HEAD with the
 * same flags produce byte-identical output. Runs no tests.
 *
 * Outputs (default dir ADS-memory/.local-artifacts/test-rigor/inventory):
 *   test-files.json       every tracked test file: tree, runner, scoped command, test count, suspect tags
 *   changed-sources.json  non-test sources changed since --since, mapped to tests via the static import graph
 *   shards-audit.json     all test files, packed into folder-disjoint shards (≤ --audit-cap-kb of test source)
 *   shards-mutation.json  changed sources packed into folder-disjoint shards, with their mapped tests
 *   SUMMARY.md            counts per tree and tag, shard tables, unmapped changed files
 *
 * The suspect tags are heuristics for a human/Codex reviewer to triage, not verdicts. Matching runs on
 * comment-stripped source (a naive scan false-positives on comment prose).
 *
 * Usage: node development/scripts/test-rigor-inventory.mjs [--since 2026-09-23T00:00] [--out DIR]
 *          [--audit-cap-kb 350] [--mutation-cap-kb 200]
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const REPO = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

function parseArgs(argv) {
  const opts = {
    since: "2026-09-23T00:00",
    out: path.join(REPO, "ADS-memory/.local-artifacts/test-rigor/inventory"),
    auditCapKb: 350,
    mutationCapKb: 200,
  };
  for (let i = 2; i < argv.length; i++) {
    const [k, v] = [argv[i], argv[i + 1]];
    if (k === "--since") opts.since = v;
    else if (k === "--out") opts.out = path.resolve(v);
    else if (k === "--audit-cap-kb") opts.auditCapKb = Number(v);
    else if (k === "--mutation-cap-kb") opts.mutationCapKb = Number(v);
    else throw new Error(`unknown argument: ${k}`);
    i++;
  }
  return opts;
}

const CODE_EXT = /\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;
const TEST_FILE = /\.(test|spec)\.(ts|tsx|mts|cts|mjs|cjs|js|jsx)$/;
const IGNORED_PATH = /(^|\/)(node_modules|dist|dist-electron|build|coverage|\.vite)\//;

// ---------------------------------------------------------------------------------------------------
// Reading HEAD
// ---------------------------------------------------------------------------------------------------

function git(args, maxBuffer = 256 * 1024 * 1024) {
  return execFileSync("git", args, { cwd: REPO, encoding: "utf8", maxBuffer });
}

/** Reads many blobs at HEAD in one `git cat-file --batch` process. */
function readBlobs(paths) {
  const out = execFileSync("git", ["cat-file", "--batch"], {
    cwd: REPO,
    input: paths.map((p) => `HEAD:${p}`).join("\n") + "\n",
    maxBuffer: 2 * 1024 * 1024 * 1024,
  });
  const result = new Map();
  let pos = 0;
  for (const p of paths) {
    const nl = out.indexOf(10, pos);
    const header = out.subarray(pos, nl).toString("utf8");
    pos = nl + 1;
    const m = header.match(/^\S+ blob (\d+)$/);
    if (!m) continue;
    const size = Number(m[1]);
    result.set(p, out.subarray(pos, pos + size).toString("utf8"));
    pos += size + 1;
  }
  return result;
}

// ---------------------------------------------------------------------------------------------------
// Lexing: blank comments (→ `code`) and additionally string/template/regex contents (→ `skel`).
// Both keep every newline and every offset, so an index into either maps to the same source line.
// ---------------------------------------------------------------------------------------------------

const REGEX_PREV_CHARS = new Set("(,=:[!&|?{};+-*%<>~^".split(""));
const REGEX_PREV_WORDS = new Set(["return", "typeof", "case", "do", "else", "in", "of", "void", "yield", "await", "delete", "throw", "new"]);

function lex(src) {
  const n = src.length;
  const code = src.split("");
  const skel = src.split("");
  const blank = (arr, i) => {
    if (arr[i] !== "\n") arr[i] = " ";
  };
  const tplStack = []; // brace depth at which each open `${` returns to its template
  let braceDepth = 0;
  let lastSig = ""; // last significant code char
  let lastWord = "";
  let i = 0;

  const scanTemplate = () => {
    // at a position inside template text; runs until the closing backtick or a `${`
    while (i < n) {
      const c = src[i];
      if (c === "\\") {
        blank(skel, i);
        if (i + 1 < n) blank(skel, i + 1);
        i += 2;
        continue;
      }
      if (c === "`") {
        i++;
        lastSig = "`";
        return;
      }
      if (c === "$" && src[i + 1] === "{") {
        tplStack.push(braceDepth);
        braceDepth++;
        i += 2;
        lastSig = "{";
        return;
      }
      blank(skel, i);
      i++;
    }
  };

  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") {
        blank(code, i);
        blank(skel, i);
        i++;
      }
      continue;
    }
    if (c === "/" && d === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? n : end + 2;
      for (; i < stop; i++) {
        blank(code, i);
        blank(skel, i);
      }
      continue;
    }
    if (c === "'" || c === '"') {
      i++;
      while (i < n && src[i] !== c && src[i] !== "\n") {
        if (src[i] === "\\" && i + 1 < n && src[i + 1] !== "\n") {
          blank(skel, i);
          i++;
        }
        blank(skel, i);
        i++;
      }
      i++;
      lastSig = c;
      lastWord = "";
      continue;
    }
    if (c === "`") {
      i++;
      scanTemplate();
      lastWord = "";
      continue;
    }
    if (c === "/" && (lastSig === "" || REGEX_PREV_CHARS.has(lastSig) || REGEX_PREV_WORDS.has(lastWord))) {
      // regex literal
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < n && src[j] !== "\n") {
        const r = src[j];
        if (r === "\\") {
          j += 2;
          continue;
        }
        if (r === "[") inClass = true;
        else if (r === "]") inClass = false;
        else if (r === "/" && !inClass) {
          ok = true;
          break;
        }
        j++;
      }
      if (ok) {
        for (let k = i + 1; k < j; k++) blank(skel, k);
        i = j + 1;
        while (i < n && /[a-z]/i.test(src[i])) i++;
        lastSig = "/";
        lastWord = "";
        continue;
      }
    }
    if (c === "{") braceDepth++;
    else if (c === "}") {
      braceDepth--;
      if (tplStack.length && tplStack[tplStack.length - 1] === braceDepth) {
        tplStack.pop();
        i++;
        scanTemplate();
        continue;
      }
    }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      lastWord = src.slice(i, j);
      lastSig = src[j - 1];
      i = j;
      continue;
    }
    if (!/\s/.test(c)) {
      lastSig = c;
      lastWord = "";
    }
    i++;
  }
  return { code: code.join(""), skel: skel.join("") };
}

function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/** Index of the bracket matching the opener at `open` (in `skel`), or -1. */
function matchBracket(skel, open) {
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const stack = [pairs[skel[open]]];
  for (let i = open + 1; i < skel.length; i++) {
    const c = skel[i];
    if (c === "(" || c === "[" || c === "{") stack.push(pairs[c]);
    else if (c === ")" || c === "]" || c === "}") {
      if (stack.pop() !== c) return -1;
      if (!stack.length) return i;
    }
  }
  return -1;
}

/** End offset of a call expression `name(...)` plus any trailing `.member` / `(...)` chain. */
function chainEnd(skel, openParen) {
  let end = matchBracket(skel, openParen);
  if (end === -1) return skel.length;
  let i = end + 1;
  for (;;) {
    const m = /^\s*(\?\.|\.)\s*[A-Za-z_$][\w$]*/.exec(skel.slice(i, i + 200));
    if (m) {
      i += m[0].length;
      continue;
    }
    const p = /^\s*\(/.exec(skel.slice(i, i + 50));
    if (p) {
      const close = matchBracket(skel, i + p[0].length - 1);
      if (close === -1) return skel.length;
      i = close + 1;
      continue;
    }
    return i;
  }
}

// ---------------------------------------------------------------------------------------------------
// Module resolution (relative, `#src/*`, admin `@/*` and `@tovu/*` aliases)
// ---------------------------------------------------------------------------------------------------

const ADMIN_ALIASES = {
  "@tovu/headless": "apps/website/src/contracts/headless/index.ts",
  "@tovu/theme-layout": "apps/website/src/features/theme/theme-layout.ts",
  "@tovu/publish-content-ui": "apps/website/src/features/publish-content/ui/index.ts",
  "@tovu/embed-marker": "apps/website/src/contracts/core/embeds/marker.ts",
  "@tovu/assistant-run-events": "apps/website/src/contracts/core/assistant-run-events.ts",
  "@tovu/sdk": "packages/sdk/src/index.ts",
};

function makeResolver(tracked) {
  const tryFile = (base) => {
    const cands = [base];
    const ext = /\.(js|jsx|mjs|cjs)$/.exec(base);
    if (ext) {
      const stem = base.slice(0, -ext[0].length);
      const map = { ".js": [".ts", ".tsx"], ".jsx": [".tsx"], ".mjs": [".mts"], ".cjs": [".cts"] }[ext[0]];
      for (const e of map) cands.push(stem + e);
    }
    for (const e of [".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs", ".jsx"]) cands.push(base + e);
    for (const e of ["/index.ts", "/index.tsx", "/index.js", "/index.mjs"]) cands.push(base + e);
    return cands.find((c) => tracked.has(c)) ?? null;
  };
  return (fromFile, spec) => {
    if (spec.startsWith("./") || spec.startsWith("../")) {
      return tryFile(path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec)));
    }
    if (spec.startsWith("#src/")) return tryFile("apps/website/src/" + spec.slice(5));
    if (ADMIN_ALIASES[spec]) return tracked.has(ADMIN_ALIASES[spec]) ? ADMIN_ALIASES[spec] : null;
    if (spec.startsWith("@tovu/headless/")) return tryFile("apps/website/src/contracts/headless/" + spec.slice(15));
    if (spec.startsWith("@/") && fromFile.startsWith("apps/admin/")) return tryFile("apps/admin/src/" + spec.slice(2));
    return null;
  };
}

const IMPORT_PATTERNS = [
  /\bimport\s+(?!type\b)[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bexport\s+(?!type\b)[^'"`;]*?\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];
const MOCK_PATTERN = /\b(?:vi\.(?:mock|doMock)|jest\.mock|mock\.module|t\.mock\.module)\s*\(\s*["']([^"']+)["']/g;

function extractImports(code) {
  const specs = new Set();
  for (const re of IMPORT_PATTERNS) {
    re.lastIndex = 0;
    for (const m of code.matchAll(re)) specs.add(m[1]);
  }
  return [...specs];
}

// ---------------------------------------------------------------------------------------------------
// Test-file analysis
// ---------------------------------------------------------------------------------------------------

const TEST_CALL = /(?<![\w$.])(?:(it|test|xit|fit)|(t|ctx|context|st|tt)\.test)\b/g;
const TEST_MODIFIERS = new Set(["only", "skip", "todo", "concurrent", "fails", "each", "fixme", "sequential", "failing"]);
const SKIP_MODIFIERS = new Set(["skip", "todo", "fixme"]);

const ASSERT_CALL =
  /(?<![\w$.])(?:expect(?:\.(?:soft|poll))?|assert(?:\.[A-Za-z]+)*|t\.assert\.[A-Za-z]+|t\.plan|(?:assert|expect|verify|check|ensure|must)[A-Z][\w$]*)\s*\(/g;
const THROW_ASSERT = /\bthrow\s+new\s+(?:Error|AssertionError)\b/g;

// Matched against the assertion's skeleton (string contents blanked), so a message like "check the
// logs" or a call-count word inside a string literal cannot trigger it. Includes hand-rolled
// recorders (`calls`, `focusCalls`, `reportedCount`) — the find-bar incident's tests asserted on those.
const MOCK_CALL_RE =
  /toHaveBeenCalled|toBeCalled|toHaveBeenNthCalledWith|toHaveBeenLastCalledWith|toHaveReturned|\.mock\.calls|\.mock\.callCount|\.mock\.results|\bcallCount\b|\.calls\b|\.called\b|\bcalledWith|\bcalledOnce|\b(?:calls|callLog|invocations)\b|\b\w+(?:Calls|CallCount|Invocations)\b|\b(?:reported|focus|blur|invoke|invoked|call|hit)Count\b/;
// Anchored on the whole assertion text (code, comments stripped).
const WEAK_SOLE_RE =
  /^(?:expect\s*\([^]*\)\s*\.(?:not\s*\.\s*(?:toBeNull|toBeUndefined)|toBeDefined|toBeTruthy|toBeFalsy)\s*\(\s*\)$|expect\s*\(\s*true\s*\)|assert(?:\.ok)?\s*\(\s*!?[\w$.]+\s*(?:,[^]*)?\)$|assert\.(?:notEqual|notStrictEqual)\s*\(\s*[\w$.]+\s*,\s*(?:undefined|null)\s*\))/;
const ALWAYS_WEAK_RE = /^(?:assert(?:\.ok)?|expect)\s*\(\s*true\s*[,)]|^assert\.(?:equal|strictEqual)\s*\(\s*true\s*,\s*true\s*\)/;
const OUTPUT_WORD = "(?:stdout|stderr|output|Output|html|Html|HTML|text|Text|body|Body|markup|Markup|innerHTML|textContent)";
// A loose substring/regex check whose subject is rendered or printed output.
const LOOSE_OUTPUT_RE = new RegExp(
  `^(?:expect\\s*\\([^()]*${OUTPUT_WORD}\\b[^()]*\\)\\s*\\.(?:not\\s*\\.\\s*)?(?:toContain|toMatch)\\s*\\(|assert\\.(?:match|doesNotMatch)\\s*\\(\\s*[\\w$.]*${OUTPUT_WORD}\\b|assert(?:\\.ok)?\\s*\\(\\s*!?[\\w$.]*${OUTPUT_WORD}[\\w$.]*\\.includes\\s*\\()`,
);
// testing-library / Playwright queries that throw when nothing matches — they count against
// "no-assert" but are not treated as outcome assertions for the other tags.
const IMPLICIT_ASSERT = /(?<![\w$])(?:(?:screen|within\s*\([^()]*\)|\w+)\s*\.\s*)?(?:findBy|getBy|findAllBy|getAllBy)\w+\s*\(|\.waitFor\s*\(|\bwaitForSelector\s*\(/g;
const LOG_RE =
  /\bconsole\.|\b(?:logs|logLines|logged|logger|loggedLines|logOutput|capturedLogs|warnings)\b|\b\w*(?:LogSpy|WarnSpy|ErrorSpy|InfoSpy|Logger)\b|\b(?:log|warn|error|info|debug)Spy\b|\blogs?\.(?:some|find|filter|join|length)\b/;

// Keyboard/focus/clipboard/drag/IME input that never passes through the OS or browser input routing.
// SYNTHETIC_SPECIFIC always tags; SYNTHETIC_GENERIC (plain typing/changing a field) only when the
// test's title or file name is about focus/keyboard/IME/clipboard/drag.
const SYNTHETIC_SPECIFIC = [
  /\bnew\s+(?:KeyboardEvent|ClipboardEvent|DragEvent|CompositionEvent|FocusEvent)\b/,
  /\bfireEvent\.(?:keyDown|keyUp|keyPress|focus|blur|focusIn|focusOut|paste|copy|cut|drag\w*|drop|composition\w*)\s*\(/,
  /\bdispatchEvent\s*\([^)]*\b(?:key\w*|focus\w*|blur|paste|copy|cut|drag\w*|drop|composition\w*)\b/i,
  /\bkeyboard\.(?:type|press|down|up|insertText)\s*\(/,
  /\b(?:user|userEvent)\.(?:keyboard|paste|tab|copy|cut)\s*\(/,
  /\.(?:press|pressSequentially)\s*\(/,
  /\.focus\s*\(\s*\)/,
  /\bsendInputEvent\s*\(/,
];
const SYNTHETIC_GENERIC = [/\b(?:user|userEvent)\.(?:type|clear)\s*\(/, /\bfireEvent\.(?:change|input)\s*\(/, /\.(?:type|fill)\s*\(/];
const SYNTHETIC_TOPIC_RE =
  /focus|blur|keyboard|key ?(?:down|up|press|stroke)|keys?\b|shortcut|hotkey|\bIME\b|composition|clipboard|paste|copy|drag|drop|\bfind\b|find-in-page|caret|selection|accelerator/i;
const TIMING_RE =
  /waitForTimeout\s*\(|\b(?:sleep|delay|wait|pause)\s*\(\s*\d|setTimeout\s*\(\s*(?:r|res|resolve|done|next|ok)\s*,|setTimeout\s*\(\s*\(\s*\)\s*=>\s*(?:r|res|resolve)\s*\(\s*\)\s*,|["']node:timers\/promises["']|\bsetTimeoutPromise\s*\(/;
const SKIP_LINE_RES = [
  /(?<![\w$])(?:describe|it|test|suite)\s*\.\s*(?:skip|only|todo|fixme)\b/,
  /(?<![\w$.])(?:xit|xdescribe|xtest|fit|fdescribe)\s*\(/,
  /\btest\.describe\.(?:skip|only|fixme)\b/,
  /(?<![\w$.])t\.(?:skip|todo)\s*\(/,
  /[{,]\s*(?:skip|todo|only)\s*:/,
];

function stemOf(file) {
  return path.posix
    .basename(file)
    .replace(TEST_FILE, "")
    .replace(/\.(unit|integration|e2e|contract|smoke)$/, "");
}

function analyseTestFile(file, src, resolve) {
  const { code, skel } = lex(src);
  const lineOf = lineIndex(src);
  const tags = {};
  const add = (tag, line, test, detail) => {
    (tags[tag] ??= []).push(test === undefined ? { line, detail } : { line, test, detail });
  };

  // named imports from node:assert used bare (`strictEqual(...)`)
  const bareAsserts = new Set();
  for (const m of code.matchAll(/import\s*\{([^}]*)\}\s*from\s*["'](?:node:)?assert(?:\/strict)?["']/g)) {
    for (const part of m[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop()?.trim();
      if (name) bareAsserts.add(name);
    }
  }
  const bareAssertRe = bareAsserts.size ? new RegExp(`(?<![\\w$.])(?:${[...bareAsserts].join("|")})\\s*\\(`, "g") : null;

  // --- tests
  const tests = [];
  TEST_CALL.lastIndex = 0;
  for (const m of skel.matchAll(TEST_CALL)) {
    let i = m.index + m[0].length;
    const mods = [];
    let isTest = true;
    for (;;) {
      const mm = /^\s*\.\s*([A-Za-z_$][\w$]*)/.exec(skel.slice(i, i + 80));
      if (!mm) break;
      if (!TEST_MODIFIERS.has(mm[1])) {
        isTest = false;
        break;
      }
      mods.push(mm[1]);
      i += mm[0].length;
      if (mm[1] === "each") {
        const rest = skel.slice(i, i + 5);
        const ws = /^\s*/.exec(rest)[0].length;
        if (skel[i + ws] === "(") {
          const close = matchBracket(skel, i + ws);
          if (close === -1) break;
          i = close + 1;
        } else if (skel[i + ws] === "`") {
          const close = skel.indexOf("`", i + ws + 1);
          i = close + 1;
        }
      }
    }
    if (!isTest) continue;
    const ws = /^\s*/.exec(skel.slice(i, i + 20))[0].length;
    if (skel[i + ws] !== "(") continue;
    const open = i + ws;
    const firstArg = skel.slice(open + 1, open + 40).trimStart()[0];
    if (m[2] && !/["'`]/.test(firstArg ?? "")) continue; // t.test must take a title literal
    if (!firstArg || firstArg === ")") continue;
    const close = matchBracket(skel, open);
    if (close === -1) continue;
    const titleMatch = /^\s*(["'`])([^]*?)\1/.exec(code.slice(open + 1, Math.min(close, open + 400)));
    const title = titleMatch ? titleMatch[2].replace(/\s+/g, " ").slice(0, 160) : "(dynamic title)";
    const argsHead = code.slice(open + 1, Math.min(close, open + 600));
    const optionSkip = /[{,]\s*(?:skip|todo)\s*:\s*(?!false\b)/.test(argsHead.split(/=>|\bfunction\b|\basync\b/)[0]);
    const skipped = mods.some((x) => SKIP_MODIFIERS.has(x)) || m[1] === "xit" || optionSkip;
    tests.push({ start: m.index, open, close, title, line: lineOf(m.index), mods, skipped });
  }

  const testAt = (offset) => {
    // innermost enclosing test
    let best = null;
    for (const t of tests) if (t.open <= offset && offset <= t.close && (!best || t.open > best.open)) best = t;
    return best;
  };

  // --- assertions
  const assertions = [];
  const collectAsserts = (re) => {
    re.lastIndex = 0;
    for (const m of skel.matchAll(re)) {
      const open = m.index + m[0].length - 1;
      const end = chainEnd(skel, open);
      assertions.push({
        start: m.index,
        end,
        text: code.slice(m.index, end).replace(/\s+/g, " ").trim(),
        skelText: skel.slice(m.index, end).replace(/\s+/g, " ").trim(),
      });
    }
  };
  collectAsserts(ASSERT_CALL);
  if (bareAssertRe) collectAsserts(bareAssertRe);
  THROW_ASSERT.lastIndex = 0;
  for (const m of code.matchAll(THROW_ASSERT)) assertions.push({ start: m.index, end: m.index + m[0].length, text: m[0], manual: true });
  const implicit = [...skel.matchAll(IMPLICIT_ASSERT)].map((m) => m.index);
  // drop assertions nested inside another assertion's span (e.g. expect.poll(() => expect(x)...))
  assertions.sort((a, b) => a.start - b.start || b.end - a.end);
  const topAssertions = [];
  let lastEnd = -1;
  for (const a of assertions) {
    if (a.start < lastEnd) continue;
    topAssertions.push(a);
    lastEnd = a.end;
  }

  for (const t of tests) {
    t.asserts = topAssertions.filter((a) => a.start > t.open && a.start < t.close);
    t.implicitAsserts = implicit.filter((o) => o > t.open && o < t.close).length;
  }

  const leafTests = tests.filter((t) => !tests.some((o) => o !== t && o.open > t.open && o.close < t.close));
  for (const t of tests) {
    if (t.skipped) {
      add("skip/only/todo", t.line, t.title, `${t.mods.join(".") || "option"} skip/todo`);
      continue;
    }
    if (t.mods.includes("only")) add("skip/only/todo", t.line, t.title, "only");
    const isLeaf = leafTests.includes(t);
    if (!isLeaf) continue;
    const as = t.asserts;
    if (as.length === 0) {
      if (!t.implicitAsserts) add("no-assert", t.line, t.title, "no assertion call in the test body");
      continue;
    }
    const real = as.filter((a) => !a.manual && !/^t\.plan/.test(a.text));
    if (real.length && real.every((a) => MOCK_CALL_RE.test(a.skelText))) {
      add("mock-call-only", t.line, t.title, `${real.length} assertion(s), all on mock calls`);
    }
    if (real.length && real.every((a) => WEAK_SOLE_RE.test(a.text) || LOOSE_OUTPUT_RE.test(a.text))) {
      add("weak-matcher", t.line, t.title, real.map((a) => a.text.slice(0, 80)).join(" | ").slice(0, 200));
    }
    if (real.length && real.every((a) => LOG_RE.test(a.skelText))) {
      add("log-only", t.line, t.title, `${real.length} assertion(s), all on log/console output`);
    }
  }
  for (const a of topAssertions) {
    if (ALWAYS_WEAK_RE.test(a.text)) add("weak-matcher", lineOf(a.start), testAt(a.start)?.title ?? null, a.text.slice(0, 120));
  }

  // --- line-based tags
  const codeLines = code.split("\n");
  const titleTopic = (t) => SYNTHETIC_TOPIC_RE.test(t?.title ?? "") || SYNTHETIC_TOPIC_RE.test(path.posix.basename(file));
  let offset = 0;
  const lineOffsets = [];
  for (const l of codeLines) {
    lineOffsets.push(offset);
    offset += l.length + 1;
  }
  codeLines.forEach((l, idx) => {
    const ln = idx + 1;
    if (!l.trim()) return;
    const t = testAt(lineOffsets[idx]);
    const synthetic =
      SYNTHETIC_SPECIFIC.find((re) => re.test(l)) ?? (titleTopic(t) ? SYNTHETIC_GENERIC.find((re) => re.test(l)) : undefined);
    if (synthetic) add("synthetic-input", ln, t?.title ?? null, l.trim().slice(0, 120));
    if (TIMING_RE.test(l)) add("timing", ln, t?.title ?? null, l.trim().slice(0, 120));
    for (const re of SKIP_LINE_RES) {
      if (re.test(l)) {
        // test-level skips already recorded with the test; avoid a duplicate for the same line
        if (!(tags["skip/only/todo"] ?? []).some((e) => e.line === ln)) add("skip/only/todo", ln, t?.title ?? null, l.trim().slice(0, 120));
        break;
      }
    }
  });

  // --- self-mock
  const subjects = new Set();
  const imports = extractImports(code);
  for (const spec of imports) {
    const r = resolve(file, spec);
    if (r && stemOf(r).replace(/\.(ts|tsx|mts|mjs|cjs|js)$/, "") === stemOf(file) && !TEST_FILE.test(r)) subjects.add(r);
  }
  MOCK_PATTERN.lastIndex = 0;
  for (const m of code.matchAll(MOCK_PATTERN)) {
    const r = resolve(file, m[1]);
    const ln = lineOf(m.index);
    if (r && subjects.has(r)) add("self-mock", ln, null, `mocks its own subject ${r}`);
    else if (r === "apps/admin/src/lib/api.ts") add("self-mock", ln, null, "mocks apps/admin/src/lib/api.ts");
  }

  for (const k of Object.keys(tags)) tags[k].sort((a, b) => a.line - b.line);
  return {
    testCount: tests.filter((t) => leafTests.includes(t)).length,
    eachBlocks: tests.filter((t) => t.mods.includes("each")).length,
    assertionCount: topAssertions.length,
    tags,
    imports,
    stringMentions: [...new Set([...code.matchAll(/["'`][^"'`\n]*?([\w.-]+\.(?:ts|tsx|mts|mjs|cjs))["'`]/g)].map((m) => m[1]))],
  };
}

// ---------------------------------------------------------------------------------------------------
// Trees, runners, commands
// ---------------------------------------------------------------------------------------------------

function treeOf(file) {
  if (file.startsWith("apps/website/")) return "root/website";
  if (file.startsWith("apps/admin/")) return "apps/admin";
  if (file.startsWith("apps/desktop/")) return "apps/desktop";
  if (file.startsWith("packages/")) return "packages/*";
  if (file.startsWith("development/e2e/")) return "development/e2e";
  return "other";
}

const ROOT_NODE = "env -u TOVU_ADMIN_PASSWORD node --import tsx --test --experimental-test-module-mocks";

function runnerOf(file, playwrightConfigs) {
  if (file.startsWith("apps/admin/")) {
    return { runner: "vitest", command: `cd apps/admin && npx vitest run ${file.slice("apps/admin/".length)}` };
  }
  if (file.startsWith("apps/desktop/")) {
    const rel = file.slice("apps/desktop/".length);
    const needsTsx = /^src\/(renderer|contracts)\//.test(rel);
    return {
      runner: needsTsx ? "desktop-node-tsx" : "desktop-node",
      command: `cd apps/desktop && node ${needsTsx ? "--import tsx " : ""}--test ${rel}`,
    };
  }
  if (file.startsWith("development/e2e/") && /\.spec\.[a-z]+$/.test(file)) {
    const base = path.posix.basename(file);
    const configs = playwrightConfigs.filter((c) => c.re && c.re.test(base)).map((c) => c.path);
    return {
      runner: "playwright",
      configs,
      command: configs.length ? `npx playwright test --config=${configs[0]} ${file}` : `(no playwright config's testMatch covers ${base})`,
    };
  }
  if (file.startsWith("apps/site-chat/")) {
    return { runner: "root-node", command: `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json ${ROOT_NODE} ${file}` };
  }
  return { runner: "root-node", command: `${ROOT_NODE} ${file}` };
}

function loadPlaywrightConfigs(tracked, blobs) {
  return [...tracked]
    .filter((p) => /^development\/playwright[^/]*\.config\.ts$/.test(p))
    .sort()
    .map((p) => {
      const { code } = lex(blobs.get(p) ?? "");
      const m = /\btestMatch\s*:\s*\/((?:\\.|[^/\n])+)\/([a-z]*)/.exec(code);
      let re = null;
      try {
        re = m ? new RegExp(m[1], m[2]) : null;
      } catch {
        re = null;
      }
      return { path: p, re };
    });
}

// ---------------------------------------------------------------------------------------------------
// Shard packing — folder-disjoint, greedy in path order, never mixing trees
// ---------------------------------------------------------------------------------------------------

function packShards(items, capBytes, keyOf) {
  // items: [{ path, bytes }]
  const root = { name: "", dirs: new Map(), files: [], total: 0 };
  for (const it of items) {
    const parts = it.path.split("/");
    let node = root;
    node.total += it.bytes;
    for (const part of parts.slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { name: part, dirs: new Map(), files: [], total: 0 });
      node = node.dirs.get(part);
      node.total += it.bytes;
    }
    node.files.push(it);
  }
  const allFiles = (node) => [
    ...node.files,
    ...[...node.dirs.keys()].sort().flatMap((k) => allFiles(node.dirs.get(k))),
  ];
  const units = [];
  const walk = (node, prefix) => {
    if (node.total <= capBytes) {
      units.push({ folder: prefix || ".", files: allFiles(node).sort((a, b) => a.path.localeCompare(b.path)), bytes: node.total });
      return;
    }
    const direct = [...node.files].sort((a, b) => a.path.localeCompare(b.path));
    let chunk = [];
    let bytes = 0;
    for (const f of direct) {
      if (chunk.length && bytes + f.bytes > capBytes) {
        units.push({ folder: `${prefix}/*`, files: chunk, bytes });
        chunk = [];
        bytes = 0;
      }
      chunk.push(f);
      bytes += f.bytes;
    }
    if (chunk.length) units.push({ folder: `${prefix}/*`, files: chunk, bytes });
    for (const k of [...node.dirs.keys()].sort()) walk(node.dirs.get(k), prefix ? `${prefix}/${k}` : k);
  };
  walk(root, "");
  units.sort((a, b) => a.files[0].path.localeCompare(b.files[0].path));

  const shards = [];
  let cur = null;
  for (const u of units) {
    const key = keyOf(u.files[0].path);
    if (!cur || cur.key !== key || cur.bytes + u.bytes > capBytes) {
      cur = { key, folders: [], files: [], bytes: 0 };
      shards.push(cur);
    }
    cur.folders.push(u.folder);
    cur.files.push(...u.files);
    cur.bytes += u.bytes;
  }
  return shards.map((s, idx) => ({
    id: `shard-${String(idx + 1).padStart(2, "0")}`,
    tree: s.key,
    folders: s.folders,
    fileCount: s.files.length,
    kb: Math.round(s.bytes / 1024),
    oversize: s.bytes > capBytes,
    files: s.files.map((f) => f.path),
  }));
}

// ---------------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv);
  const head = git(["rev-parse", "HEAD"]).trim();
  const tracked = new Set(git(["ls-tree", "-r", "--name-only", "HEAD"]).split("\n").filter(Boolean));
  const codeFiles = [...tracked].filter((p) => CODE_EXT.test(p) && !IGNORED_PATH.test(p) && !p.endsWith(".d.ts")).sort();
  const testFiles = codeFiles.filter((p) => TEST_FILE.test(p));
  const playwrightPaths = [...tracked].filter((p) => /^development\/playwright[^/]*\.config\.ts$/.test(p));
  const blobs = readBlobs([...codeFiles, ...playwrightPaths.filter((p) => !codeFiles.includes(p))]);
  const resolve = makeResolver(tracked);
  const playwrightConfigs = loadPlaywrightConfigs(tracked, blobs);

  // --- test files
  const testRecords = [];
  const mentionIndex = new Map(); // basename → test files mentioning it as a string
  for (const file of testFiles) {
    const src = blobs.get(file) ?? "";
    const a = analyseTestFile(file, src, resolve);
    const run = runnerOf(file, playwrightConfigs);
    for (const b of a.stringMentions) {
      if (!mentionIndex.has(b)) mentionIndex.set(b, new Set());
      mentionIndex.get(b).add(file);
    }
    testRecords.push({
      path: file,
      tree: treeOf(file),
      bytes: Buffer.byteLength(src),
      lines: src.split("\n").length,
      runner: run.runner,
      command: run.command,
      ...(run.configs ? { playwrightConfigs: run.configs } : {}),
      testCountEstimate: a.testCount,
      eachBlocks: a.eachBlocks,
      assertionCount: a.assertionCount,
      tags: a.tags,
    });
  }

  // --- import graph over every code file
  const importers = new Map(); // dep → Set(importing files)
  for (const file of codeFiles) {
    const { code } = lex(blobs.get(file) ?? "");
    for (const spec of extractImports(code)) {
      const r = resolve(file, spec);
      if (!r || r === file) continue;
      if (!importers.has(r)) importers.set(r, new Set());
      importers.get(r).add(file);
    }
  }
  const testSet = new Set(testFiles);
  const TRANSITIVE_CAP = 25;
  const MAX_DEPTH = 8;
  function mapToTests(file) {
    const direct = [...(importers.get(file) ?? [])].filter((f) => testSet.has(f)).sort();
    const seen = new Set([file]);
    let frontier = [file];
    const found = [];
    let total = 0;
    for (let depth = 1; depth <= MAX_DEPTH && frontier.length; depth++) {
      const next = [];
      for (const f of frontier) {
        for (const imp of [...(importers.get(f) ?? [])].sort()) {
          if (seen.has(imp)) continue;
          seen.add(imp);
          if (testSet.has(imp)) {
            total++;
            if (depth > 1 && found.length < TRANSITIVE_CAP) found.push({ test: imp, depth });
          } else next.push(imp);
        }
      }
      frontier = next;
    }
    return { direct, transitive: found, reachableTestCount: total };
  }

  // --- changed sources
  const log = git(["log", `--since=${opts.since}`, "--no-renames", "--numstat", "--format=%H", "HEAD"]);
  const commits = new Set();
  const changed = new Map();
  for (const line of log.split("\n")) {
    if (/^[0-9a-f]{40}$/.test(line)) {
      commits.add(line);
      continue;
    }
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line);
    if (!m) continue;
    const p = m[3];
    if (!CODE_EXT.test(p) || TEST_FILE.test(p) || IGNORED_PATH.test(p) || !tracked.has(p) || p.endsWith(".d.ts")) continue;
    const rec = changed.get(p) ?? { added: 0, deleted: 0, commits: 0 };
    rec.added += m[1] === "-" ? 0 : Number(m[1]);
    rec.deleted += m[2] === "-" ? 0 : Number(m[2]);
    rec.commits++;
    changed.set(p, rec);
  }
  // A module that only declares types (e.g. the admin `*-port.hooks.ts` interfaces) has no runtime
  // code to test or mutate; importers use `import type`, so it can never map to a test.
  const isTypeOnly = (p) => {
    const { code } = lex(blobs.get(p) ?? "");
    const hasTypeExport = /\bexport\s+(?:type|interface|declare)\b/.test(code);
    const hasRuntime = /\bexport\s+(?:default|const|let|var|function|async|class|enum|abstract)\b|\bexport\s*\{(?!\s*type\b)|\bexport\s*\*|module\.exports/.test(code);
    return hasTypeExport && !hasRuntime;
  };
  const isTestSupport = (p) => /(^|\/)(__tests__|__fixtures__|fixtures|test-helpers|test-utils|testing)\//.test(p) || /(test-helpers?|test-utils?|\.fixture)\.[a-z]+$/.test(p);
  const changedRecords = [...changed.keys()].sort().map((p) => {
    const map = mapToTests(p);
    const rec = changed.get(p);
    const mapped = map.direct.length > 0 || map.transitive.length > 0;
    return {
      path: p,
      tree: treeOf(p),
      bytes: Buffer.byteLength(blobs.get(p) ?? ""),
      linesAdded: rec.added,
      linesDeleted: rec.deleted,
      commits: rec.commits,
      testSupport: isTestSupport(p),
      typeOnly: isTypeOnly(p),
      directTests: map.direct,
      transitiveTests: map.transitive,
      reachableTestCount: map.reachableTestCount,
      mapped,
      ...(mapped ? {} : { mentionedByTests: [...(mentionIndex.get(path.posix.basename(p)) ?? [])].sort().slice(0, 10) }),
    };
  });

  // --- shards
  const auditShards = packShards(
    testRecords.map((t) => ({ path: t.path, bytes: t.bytes })),
    opts.auditCapKb * 1024,
    treeOf,
  );
  const commandByTest = new Map(testRecords.map((t) => [t.path, t.command]));
  const mutationSources = changedRecords.filter((c) => !c.testSupport && !c.typeOnly);
  const changedByPath = new Map(changedRecords.map((c) => [c.path, c]));
  const mutationShards = packShards(
    mutationSources.map((c) => ({ path: c.path, bytes: c.bytes })),
    opts.mutationCapKb * 1024,
    treeOf,
  ).map((s) => {
    const tests = new Set();
    for (const f of s.files) {
      const c = changedByPath.get(f);
      c.directTests.forEach((t) => tests.add(t));
      c.transitiveTests.filter((t) => t.depth <= 2).forEach((t) => tests.add(t.test));
    }
    const sortedTests = [...tests].sort();
    return {
      ...s,
      sources: s.files.map((f) => {
        const c = changedByPath.get(f);
        return { path: f, linesChanged: c.linesAdded + c.linesDeleted, mapped: c.mapped };
      }),
      files: undefined,
      unmappedCount: s.files.filter((f) => !changedByPath.get(f).mapped).length,
      tests: sortedTests.map((t) => ({ path: t, command: commandByTest.get(t) })),
    };
  });

  // --- write
  mkdirSync(opts.out, { recursive: true });
  const write = (name, data) => writeFileSync(path.join(opts.out, name), typeof data === "string" ? data : JSON.stringify(data, null, 2) + "\n");
  write("test-files.json", { head, generatedBy: "development/scripts/test-rigor-inventory.mjs", fileCount: testRecords.length, files: testRecords });
  write("changed-sources.json", { head, since: opts.since, commitCount: commits.size, fileCount: changedRecords.length, files: changedRecords });
  write("shards-audit.json", { head, capKb: opts.auditCapKb, shardCount: auditShards.length, shards: auditShards });
  write("shards-mutation.json", { head, since: opts.since, capKb: opts.mutationCapKb, shardCount: mutationShards.length, shards: mutationShards });
  write("SUMMARY.md", renderSummary({ head, opts, testRecords, changedRecords, auditShards, mutationShards, commits }));
  process.stdout.write(`wrote ${opts.out}: ${testRecords.length} test files, ${changedRecords.length} changed sources, ${auditShards.length} audit shards, ${mutationShards.length} mutation shards\n`);
}

const TAG_ORDER = ["mock-call-only", "self-mock", "weak-matcher", "no-assert", "synthetic-input", "log-only", "skip/only/todo", "timing"];

function renderSummary({ head, opts, testRecords, changedRecords, auditShards, mutationShards, commits }) {
  const trees = [...new Set(testRecords.map((t) => t.tree))].sort();
  const L = [];
  L.push("# Test rigor inventory", "");
  L.push(`HEAD \`${head}\` · generated by \`node development/scripts/test-rigor-inventory.mjs\` (deterministic; reads HEAD, not the working tree).`, "");
  L.push("Tags are heuristics for triage, not verdicts. \"files\" = files with ≥1 hit; \"hits\" = tagged tests or lines.", "");

  L.push("## Test files per tree", "");
  L.push("| tree | files | KB | tests (est.) | assertions | runner(s) |", "|---|---:|---:|---:|---:|---|");
  for (const tr of trees) {
    const rs = testRecords.filter((t) => t.tree === tr);
    L.push(`| ${tr} | ${rs.length} | ${Math.round(rs.reduce((s, r) => s + r.bytes, 0) / 1024)} | ${rs.reduce((s, r) => s + r.testCountEstimate, 0)} | ${rs.reduce((s, r) => s + r.assertionCount, 0)} | ${[...new Set(rs.map((r) => r.runner))].sort().join(", ")} |`);
  }
  const all = testRecords;
  L.push(`| **total** | ${all.length} | ${Math.round(all.reduce((s, r) => s + r.bytes, 0) / 1024)} | ${all.reduce((s, r) => s + r.testCountEstimate, 0)} | ${all.reduce((s, r) => s + r.assertionCount, 0)} | |`, "");

  L.push("## Suspect tags (files / hits) per tree", "");
  L.push(`| tag | ${trees.join(" | ")} | total |`, `|---|${trees.map(() => "---:").join("|")}|---:|`);
  for (const tag of TAG_ORDER) {
    const cell = (rs) => {
      const files = rs.filter((r) => r.tags[tag]?.length).length;
      const hits = rs.reduce((s, r) => s + (r.tags[tag]?.length ?? 0), 0);
      return `${files} / ${hits}`;
    };
    L.push(`| ${tag} | ${trees.map((tr) => cell(testRecords.filter((t) => t.tree === tr))).join(" | ")} | ${cell(testRecords)} |`);
  }
  L.push("");

  const zero = testRecords.filter((t) => t.testCountEstimate === 0);
  L.push("## Anything surprising", "");
  const unmatchedE2e = testRecords.filter((t) => t.runner === "playwright" && !t.playwrightConfigs?.length);
  const multiE2e = testRecords.filter((t) => t.runner === "playwright" && t.playwrightConfigs?.length > 1);
  L.push(`- ${zero.length} test file(s) where no \`it\`/\`test\` call was recognised (dynamic registration, or not a test file): ${zero.slice(0, 15).map((t) => `\`${t.path}\``).join(", ")}${zero.length > 15 ? ", …" : ""}`);
  L.push(`- ${unmatchedE2e.length} Playwright spec(s) that no \`development/playwright*.config.ts\` testMatch covers (dead specs?): ${unmatchedE2e.map((t) => `\`${t.path}\``).join(", ") || "none"}`);
  L.push(`- ${multiE2e.length} Playwright spec(s) matched by more than one config: ${multiE2e.map((t) => `\`${t.path}\` (${t.playwrightConfigs.length})`).join(", ") || "none"}`);
  const worst = [...testRecords]
    .map((t) => ({ t, n: TAG_ORDER.filter((g) => g !== "timing" && g !== "skip/only/todo").reduce((s, g) => s + (t.tags[g]?.length ?? 0), 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || a.t.path.localeCompare(b.t.path))
    .slice(0, 15);
  L.push(`- Most suspect-tag hits (excluding timing/skip): ${worst.map((x) => `\`${x.t.path}\` (${x.n})`).join(", ")}`);
  const auditTotalKb = Math.round(testRecords.reduce((s, r) => s + r.bytes, 0) / 1024);
  L.push(`- Total test source is ${auditTotalKb} KB, so a ${opts.auditCapKb} KB per-shard cap needs ≥ ${Math.ceil(auditTotalKb / opts.auditCapKb)} shards (produced ${auditShards.length}).`);
  const oversize = auditShards.filter((s) => s.oversize);
  if (oversize.length) L.push(`- ${oversize.length} audit shard(s) exceed the cap (a single file larger than the cap): ${oversize.map((s) => s.id).join(", ")}`);
  L.push("");

  L.push("## Audit shards", "");
  L.push(`Cap ${opts.auditCapKb} KB of test source per shard; folder-disjoint; never mixes trees.`, "");
  L.push("| shard | tree | files | KB | folders |", "|---|---|---:|---:|---|");
  for (const s of auditShards) {
    const folders = s.folders.length > 4 ? `${s.folders.slice(0, 4).join(", ")}, … (+${s.folders.length - 4})` : s.folders.join(", ");
    L.push(`| ${s.id} | ${s.tree} | ${s.fileCount} | ${s.kb}${s.oversize ? " (!)" : ""} | ${folders} |`);
  }
  L.push("");

  const typeOnly = changedRecords.filter((c) => !c.testSupport && c.typeOnly);
  const nonSupport = changedRecords.filter((c) => !c.testSupport && !c.typeOnly);
  const unmapped = nonSupport.filter((c) => !c.mapped);
  L.push(`## Changed sources since ${opts.since}`, "");
  L.push(`${commits.size} commits on HEAD; ${changedRecords.length} changed non-test code files still tracked (${changedRecords.filter((c) => c.testSupport).length} test-support, ${typeOnly.length} type-only, ${nonSupport.length} source); ${nonSupport.filter((c) => c.directTests.length).length} with a direct test importer, ${nonSupport.filter((c) => !c.directTests.length && c.mapped).length} reached only transitively, **${unmapped.length} unmapped**.`, "");
  L.push("| tree | changed | direct | transitive-only | unmapped | lines changed |", "|---|---:|---:|---:|---:|---:|");
  for (const tr of [...new Set(nonSupport.map((c) => c.tree))].sort()) {
    const rs = nonSupport.filter((c) => c.tree === tr);
    L.push(`| ${tr} | ${rs.length} | ${rs.filter((c) => c.directTests.length).length} | ${rs.filter((c) => !c.directTests.length && c.mapped).length} | ${rs.filter((c) => !c.mapped).length} | ${rs.reduce((s, c) => s + c.linesAdded + c.linesDeleted, 0)} |`);
  }
  L.push("");

  L.push("## Mutation shards", "");
  L.push(`Cap ${opts.mutationCapKb} KB of changed source per shard; tests = direct importers + transitive importers at depth ≤ 2.`, "");
  L.push("| shard | tree | sources | KB | unmapped | tests | folders |", "|---|---|---:|---:|---:|---:|---|");
  for (const s of mutationShards) {
    const folders = s.folders.length > 3 ? `${s.folders.slice(0, 3).join(", ")}, … (+${s.folders.length - 3})` : s.folders.join(", ");
    L.push(`| ${s.id} | ${s.tree} | ${s.fileCount} | ${s.kb} | ${s.unmappedCount} | ${s.tests.length} | ${folders} |`);
  }
  L.push("");

  L.push(`## Unmapped changed sources (${unmapped.length})`, "");
  L.push("No test imports them, directly or transitively (static imports only; source-text \"wiring\" tests that read a file with readFileSync show up as *mentioned by*).", "");
  for (const c of unmapped) {
    const mention = c.mentionedByTests?.length ? ` — mentioned by ${c.mentionedByTests.slice(0, 3).map((t) => `\`${t}\``).join(", ")}${c.mentionedByTests.length > 3 ? ", …" : ""}` : "";
    L.push(`- \`${c.path}\` (${c.linesAdded + c.linesDeleted} lines)${mention}`);
  }
  L.push("");
  return L.join("\n");
}

main();
