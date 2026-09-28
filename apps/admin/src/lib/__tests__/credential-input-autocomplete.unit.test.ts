import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * @file Guard: every credential-shaped `<input>` in the admin says what the browser may autofill.
 *
 * Owner report 2026-09-27: Chrome filled a saved password into Users -> Reset password's
 * "New password" (`RevealablePasswordField` had no `autoComplete`), leaving "Confirm" empty and
 * showing "Passwords do not match." Same bug class as `fc64f2d9` (access tokens) and `06375f84`
 * (Composio key, create-site key): each was fixed one field at a time, and nothing stopped the next.
 *
 * Rules, checked over every non-test `.tsx` under `src/`:
 * 1. An `<input>`/`<Input>` whose `type` can be `password`, or whose id/name/label/placeholder names
 *    a credential (password, secret, token, API key, connection string, private key), carries an
 *    explicit `autoComplete`.
 * 2. A field whose `type` can be `password` never uses the literal `"off"`: Chrome ignores `off` on
 *    credential fields by design. Set/change-password and secret fields use `new-password`.
 * 3. The login form is the one real sign-in: `username` + `current-password`.
 *
 * Not covered: HTML-string builders, e.g. Jini `mcp-ui/surfaces/text-input.ts`, which renders a
 * `secret` field as `type="password" autocomplete="off"` (the database-transfer destination form).
 *
 * Parsed with the TypeScript AST, not regex, so comment prose never counts and an arrow function's
 * `=>` inside an attribute cannot cut the element short.
 */

const SRC = path.resolve(__dirname, "../..");
const CREDENTIAL = /passw|secret|token|api[-_ ]?key|credential|connection[-_ ]?string|private[-_ ]?key/i;
const NAMING_ATTRS = new Set(["id", "name", "aria-label", "placeholder"]);

interface InputFinding {
  file: string;
  line: number;
  passwordType: boolean;
  credentialNamed: boolean;
  autoComplete: string | null;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") sourceFiles(full, out);
    } else if (name.endsWith(".tsx") && !/\.test\.tsx$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

/** Only string literals inside an attribute's value: no identifiers, no comments. */
function literalText(init: ts.JsxAttributeValue | undefined): string {
  if (!init) return "";
  const parts: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) parts.push(node.text);
    else if (ts.isTemplateExpression(node)) {
      parts.push(node.head.text);
      for (const span of node.templateSpans) {
        visit(span.expression);
        parts.push(span.literal.text);
      }
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(init);
  return parts.join(" ");
}

/** Every `<input>`/`<Input>` in `source` that is credential-shaped. Pure, so testable on fixtures. */
function findCredentialInputs(file: string, source: string): InputFinding[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: InputFinding[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && /^(input|Input)$/.test(node.tagName.getText(sf))) {
      let passwordType = false;
      let credentialNamed = false;
      let autoComplete: string | null = null;
      for (const prop of node.attributes.properties) {
        if (!ts.isJsxAttribute(prop)) continue;
        const name = prop.name.getText(sf);
        if (name === "type") passwordType = /password/.test(literalText(prop.initializer));
        else if (NAMING_ATTRS.has(name)) credentialNamed ||= CREDENTIAL.test(literalText(prop.initializer));
        else if (name === "autoComplete" || name === "autocomplete") {
          const init = prop.initializer;
          autoComplete = init && ts.isStringLiteral(init) ? init.text : literalText(init) || "<expression>";
        }
      }
      if (passwordType || credentialNamed) {
        out.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, passwordType, credentialNamed, autoComplete });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function violations(findings: InputFinding[]): string[] {
  const hits: string[] = [];
  for (const f of findings) {
    const where = `${f.file}:${f.line}`;
    if (f.autoComplete === null) hits.push(`${where}: credential input has no autoComplete`);
    else if (f.passwordType && f.autoComplete === "off") hits.push(`${where}: password input uses "off" (Chrome ignores it)`);
  }
  return hits;
}

function scanAdmin(): InputFinding[] {
  return scanDir(SRC);
}

function scanDir(root: string): InputFinding[] {
  return sourceFiles(root).flatMap((full) => findCredentialInputs(path.relative(root, full), readFileSync(full, "utf8")));
}

/**
 * The admin also renders Jini's React credential fields (`ByokProviderForm`, `AgentCliEnvFields`,
 * `SourceConfigField`, `MediaProvidersTab`). Their `.tsx` exists only where `@jini-ai/ui` is linked to
 * a Jini checkout; the published package ships `dist/` only, so the scan skips there.
 */
const JINI_UI_SRC = path.resolve(SRC, "../node_modules/@jini-ai/ui/src");
const HAS_JINI_UI_SRC = existsSync(JINI_UI_SRC);

describe("findCredentialInputs: the detector", () => {
  it("flags a conditional password type with no autoComplete, even with an arrow function before it", () => {
    const src = `const x = <input onChange={(e) => f(e)} type={v ? "text" : "password"} />;`;
    expect(violations(findCredentialInputs("a.tsx", src))).toEqual(["a.tsx:1: credential input has no autoComplete"]);
  });

  it("flags a credential-named text field and a password field set to off", () => {
    const src = [
      `const a = <input id="api-key" type="text" />;`,
      `const b = <input type="password" autoComplete="off" />;`,
    ].join("\n");
    expect(violations(findCredentialInputs("a.tsx", src))).toEqual([
      "a.tsx:1: credential input has no autoComplete",
      'a.tsx:2: password input uses "off" (Chrome ignores it)',
    ]);
  });

  it("ignores comment prose and plain fields, and accepts new-password", () => {
    const src = [
      `// <input type="password" />`,
      `const a = <div>{/* <input type="password" /> */}<input type="search" placeholder="Search" /></div>;`,
      `const b = <input type="password" autoComplete="new-password" />;`,
    ].join("\n");
    expect(violations(findCredentialInputs("a.tsx", src))).toEqual([]);
  });
});

describe("admin credential inputs", () => {
  const findings = scanAdmin();

  it("scans a non-trivial set (a detector that finds nothing proves nothing)", () => {
    expect(findings.length).toBeGreaterThanOrEqual(8);
  });

  it("every credential-shaped input has an explicit, honored autoComplete", () => {
    expect(violations(findings)).toEqual([]);
  });

  it("the login form keeps username + current-password", () => {
    const login = findCredentialInputs("features/auth/Login.tsx", readFileSync(path.join(SRC, "features/auth/Login.tsx"), "utf8"));
    expect(login.filter((f) => f.passwordType).map((f) => f.autoComplete)).toEqual(["current-password"]);
    expect(readFileSync(path.join(SRC, "features/auth/Login.tsx"), "utf8")).toMatch(/autoComplete="username"/);
  });

  it("the reset-password field (Users.tsx RevealablePasswordField) uses new-password", () => {
    const users = findings.filter((f) => f.file === path.join("features", "users", "Users.tsx") && f.passwordType);
    expect(users.length).toBeGreaterThanOrEqual(2);
    expect(users.every((f) => f.autoComplete === "new-password")).toBe(true);
  });
});

describe.skipIf(!HAS_JINI_UI_SRC)("Jini UI credential inputs the admin renders (linked checkout only)", () => {
  const findings = HAS_JINI_UI_SRC ? scanDir(JINI_UI_SRC) : [];

  it("finds the four credential components", () => {
    const files = new Set(findings.filter((f) => f.passwordType).map((f) => path.basename(f.file)));
    expect([...files].sort()).toEqual(
      expect.arrayContaining(["AgentCliEnvFields.tsx", "ByokProviderForm.tsx", "MediaProvidersTab.tsx", "SourceConfigField.tsx"]),
    );
  });

  it("every credential-shaped input has an explicit, honored autoComplete", () => {
    expect(violations(findings)).toEqual([]);
  });
});
