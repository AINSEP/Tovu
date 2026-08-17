/**
 * Custom ESLint rule: `local/effect-resource-cleanup`.
 *
 * Flags a `useEffect` callback that opens `new EventSource(...)`, `new WebSocket(...)`,
 * `setInterval(...)`/`window.setInterval(...)`, or `.addEventListener(...)` directly in its body
 * with no matching close call (`.close()`, `clearInterval(...)`, `.removeEventListener(...)`)
 * reachable from the effect's own returned cleanup function.
 *
 * Deliberately scoped to LITERAL opens inside the effect body only — a helper that owns the actual
 * open/close pairing itself (e.g. `useEffect(() => subscribeToX(...), [])`, the pub/sub-bus and
 * `settings-events.ts` idiom used throughout this codebase) is a different, already-safe shape: the
 * helper's own cleanup is verified where the helper is defined, not at every call site. Extending
 * this rule to trace through arbitrary helper calls would need real call-graph analysis, which an
 * AST-only ESLint rule cannot do without a high false-positive/false-negative rate.
 *
 * Suppression: this repo's `eslint.config.mjs` sets `linterOptions.noInlineConfig: true` repo-wide
 * for `.ts`/`.tsx` (see that file's own comment — it exists so pre-existing disable comments
 * referencing unloaded plugins don't error out a complexity-only run), so a standard
 * `// eslint-disable-next-line` has no effect here (verified directly: ESLint prints
 * "'...' has no effect because you have 'noInlineConfig' setting in your config" and still reports
 * the underlying violation). This rule therefore implements its own suppression: a comment
 * containing `leak-lint-ignore` anywhere inside the effect callback's source range skips reporting
 * for that effect. Always require a reason after a colon, e.g.
 * `// leak-lint-ignore: reconnects forever by design, see module doc`.
 */

const OPEN_KIND = {
  EVENT_SOURCE: "EventSource",
  WEB_SOCKET: "WebSocket",
  INTERVAL: "setInterval",
  LISTENER: "addEventListener",
};

const CLOSE_TEXT_BY_KIND = {
  [OPEN_KIND.EVENT_SOURCE]: ".close(",
  [OPEN_KIND.WEB_SOCKET]: ".close(",
  [OPEN_KIND.INTERVAL]: "clearInterval(",
  [OPEN_KIND.LISTENER]: ".removeEventListener(",
};

function isUseEffectCall(node) {
  const callee = node.callee;
  if (callee.type === "Identifier") return callee.name === "useEffect";
  if (callee.type === "MemberExpression" && callee.property.type === "Identifier") {
    return callee.property.name === "useEffect";
  }
  return false;
}

function getEffectCallbackFunction(node) {
  const [callback] = node.arguments;
  if (!callback) return undefined;
  if (callback.type === "ArrowFunctionExpression" || callback.type === "FunctionExpression") {
    return callback;
  }
  return undefined;
}

function findOpensInFunctionBody(fn, sourceCode) {
  const opens = [];

  function visit(node) {
    if (!node || typeof node.type !== "string") return;

    // Do not descend into a nested function that returns its own disposer — that is the
    // delegated-helper shape (e.g. a locally-defined `subscribe()` closure), whose own cleanup
    // pairing is a separate, self-contained unit this rule does not need to trace into.
    if (
      node !== fn &&
      (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") &&
      node.body &&
      node.body.type === "BlockStatement" &&
      node.body.body.some((stmt) => stmt.type === "ReturnStatement")
    ) {
      return;
    }

    if (node.type === "NewExpression" && node.callee.type === "Identifier") {
      if (node.callee.name === "EventSource") opens.push({ kind: OPEN_KIND.EVENT_SOURCE, node });
      if (node.callee.name === "WebSocket") opens.push({ kind: OPEN_KIND.WEB_SOCKET, node });
    }

    if (node.type === "CallExpression") {
      const callee = node.callee;
      if (callee.type === "Identifier" && callee.name === "setInterval") {
        opens.push({ kind: OPEN_KIND.INTERVAL, node });
      }
      if (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "setInterval"
      ) {
        opens.push({ kind: OPEN_KIND.INTERVAL, node });
      }
      if (
        callee.type === "MemberExpression" &&
        callee.property.type === "Identifier" &&
        callee.property.name === "addEventListener"
      ) {
        opens.push({ kind: OPEN_KIND.LISTENER, node });
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const value = node[key];
      if (Array.isArray(value)) {
        value.forEach(visit);
      } else if (value && typeof value.type === "string") {
        visit(value);
      }
    }
  }

  visit(fn.body);
  return opens;
}

function getReturnedCleanupFunction(fn) {
  if (fn.body.type !== "BlockStatement") return undefined;
  const returnStmt = fn.body.body.find((stmt) => stmt.type === "ReturnStatement" && stmt.argument);
  if (!returnStmt) return undefined;
  const arg = returnStmt.argument;
  if (arg.type === "ArrowFunctionExpression" || arg.type === "FunctionExpression") return arg;
  return undefined;
}

function hasSuppressionComment(fn, sourceCode) {
  return sourceCode
    .getCommentsInside(fn)
    .some((comment) => comment.value.includes("leak-lint-ignore"));
}

/** @type {import("eslint").Rule.RuleModule} */
const effectResourceCleanupRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a matching cleanup call for EventSource/WebSocket/setInterval/addEventListener opened directly inside a useEffect body.",
    },
    schema: [],
    messages: {
      missingCleanup:
        "'{{kind}}' is opened directly in this useEffect but the effect has no cleanup function, so it is never {{closeVerb}}. Return a cleanup function that calls {{closeText}}, or add a comment containing 'leak-lint-ignore: <reason>' inside this effect if this is deliberate (e.g. a process- or tab-lifetime resource).",
      unmatchedCleanup:
        "'{{kind}}' is opened directly in this useEffect but its returned cleanup function does not appear to call {{closeText}}. Add the matching close call, or add a comment containing 'leak-lint-ignore: <reason>' inside this effect if this is deliberate.",
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isUseEffectCall(node)) return;
        const fn = getEffectCallbackFunction(node);
        if (!fn) return;

        const opens = findOpensInFunctionBody(fn, sourceCode);
        if (opens.length === 0) return;

        if (hasSuppressionComment(fn, sourceCode)) return;

        const cleanupFn = getReturnedCleanupFunction(fn);
        const cleanupText = cleanupFn ? sourceCode.getText(cleanupFn) : "";

        for (const open of opens) {
          const closeText = CLOSE_TEXT_BY_KIND[open.kind];
          if (!cleanupFn) {
            context.report({
              node: open.node,
              messageId: "missingCleanup",
              data: { kind: open.kind, closeText, closeVerb: closeText.includes("clear") ? "cleared" : "closed" },
            });
            continue;
          }
          if (!cleanupText.includes(closeText)) {
            context.report({
              node: open.node,
              messageId: "unmatchedCleanup",
              data: { kind: open.kind, closeText },
            });
          }
        }
      },
    };
  },
};

export default effectResourceCleanupRule;
