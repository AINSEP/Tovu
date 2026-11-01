import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findLiteralCopy, isCopySource, newLiteralCopy, scanCopySources, type LiteralCopy } from "./admin-literal-copy.test-helper";

/**
 * @file Guard the untranslated JSX class found by 2026-11-01-admin-untranslated-scope.md.
 * The existing untranslated-copy.unit.test.ts owns dictionary parity/English fallback. This
 * complements it at the JSX boundary: text, string expressions and human-facing attributes.
 *
 * The reviewed baseline records existing debt and exact code/brand/protocol values by site.
 * Never regenerate it to admit new prose: use the owning translator. Prune resolved entries.
 * Hooks, toasts, helper-returned strings, identifiers, spread props and source-key ownership
 * need their existing feature/user-path tests; this cheap syntax guard cannot infer data flow.
 */
const SRC = path.resolve(__dirname, "../..");
const FILE = "features/example/Example.tsx";

describe("admin literal copy detector", () => {
  it.each([
    ['<button>Save changes</button>', "text", "Save changes"],
    ['<>Hello\n world</>', "text", "Hello world"],
    ['<span>{"Saving"}</span>', "expression", "Saving"],
    ['<span>{`Saving`}</span>', "expression", "Saving"],
    ['<input aria-label="Search content" />', "aria-label", "Search content"],
    ['<input title={"Search content"} />', "title", "Search content"],
    ['<input placeholder="Search content" />', "placeholder", "Search content"],
    ['<img alt="Content preview" />', "alt", "Content preview"],
    ['<Control label="Search content" />', "label", "Search content"],
    ['<Control description="Search content" />', "description", "Search content"],
    ['<Control emptyDescription="No entries" />', "emptyDescription", "No entries"],
    ['<button aria-label={`Delete ${name}`} />', "aria-label", "Delete"],
    ['<button title={`${name} details`} />', "title", "details"],
    ['<p>{ready && "Ready"}</p>', "expression", "Ready"],
    ['<p>{value ?? "Empty"}</p>', "expression", "Empty"],
    ['<p>{value || "Empty"}</p>', "expression", "Empty"],
    ['<p>{"Hello " + name}</p>', "expression", "Hello"],
    ['<p>{["Hello", t("World")]}</p>', "expression", "Hello"],
    ['<p>{("Hello" as string)}</p>', "expression", "Hello"],
    ['<p>{("Hello" satisfies string)}</p>', "expression", "Hello"],
  ])("detects visible copy in %s", (source, kind, text) => {
    expect(findLiteralCopy({ file: FILE, source })).toEqual([{ file: FILE, line: 1, kind, text }]);
  });

  it("checks both conditional branches without mistaking their condition for copy", () => {
    const source = '<button title={status === "active" ? "Pause" : "Resume"}>{ok ? t("Ready") : "Retry"}</button>';
    expect(findLiteralCopy({ file: FILE, source }).map(({ kind, text }) => [kind, text])).toEqual([
      ["title", "Pause"], ["title", "Resume"], ["expression", "Retry"],
    ]);
  });

  it("checks nested template/conditional alternatives and keeps separate occurrences", () => {
    const source = '<p>{`${ok ? "Ready" : "Waiting"} ${name} items`}{"Ready"}</p>';
    expect(findLiteralCopy({ file: FILE, source }).map(({ text }) => text)).toEqual(["Ready", "Waiting", "items", "Ready"]);
  });

  it("ignores translated keys, comparison operands, comments, ontology and non-copy props", () => {
    const source = [
      '// <p>Comment only</p>',
      'const sample = "<p>Example only</p>";',
      '<div data-agent-label="Agent ontology" className="layout" id="root">',
      '{/* Comment only */}{t("Save")}{status === "ready"}{"ready" && t("Ready")}',
      '<input title={t("Help")} placeholder={translate({ key: "Search" })} value="internal" />',
      '<span> · + 123 → </span></div>',
    ].join("\n");
    expect(findLiteralCopy({ file: FILE, source })).toEqual([]);
  });

  it.each([
    "features/a/__tests__/Example.tsx", "features/a/fixtures/Example.tsx",
    "features/a/Example.test.tsx", "features/a/Example.spec.tsx", "features/a/Example.stories.tsx",
    "features/a/a-i18n.tsx", "features/a/fake-ports.tsx", "features/a/in-memory-port.tsx",
    "features/a/Example.d.ts", "features/a/style.css", "components/devtools/Example.tsx",
  ])("excludes non-production copy in %s", (file) => {
    expect(isCopySource({ file })).toBe(false);
    expect(findLiteralCopy({ file, source: "<p>Example only</p>" })).toEqual([]);
  });

  it("includes production feature and shared dock files", () => {
    expect(isCopySource({ file: FILE })).toBe(true);
    expect(isCopySource({ file: "components/AssistantDock/Example.tsx" })).toBe(true);
  });

  it("walks nested production sources while excluding fixtures and dictionaries", () => {
    const root = mkdtempSync(path.join(tmpdir(), "admin-copy-guard-"));
    try {
      for (const file of ["features/nested/Example.tsx", "features/__tests__/Example.tsx", "features/a-i18n.tsx", "features/readme.md"]) {
        const full = path.join(root, file);
        mkdirSync(path.dirname(full), { recursive: true });
        writeFileSync(full, "<p>Untranslated</p>");
      }
      expect(scanCopySources({ root, directory: root })).toEqual([
        { file: "features/nested/Example.tsx", line: 1, kind: "text", text: "Untranslated" },
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("baseline permits shifts/removals but rejects changes, new files/sinks and duplicate copy", () => {
    const original = { file: FILE, line: 1, kind: "text", text: "Save" };
    const shifted = { ...original, line: 20 };
    const changed = { ...original, text: "Save changes" };
    const newFile = { ...original, file: "features/other/Other.tsx" };
    const newSink = { ...original, kind: "aria-label" };
    expect(newLiteralCopy({ baseline: [original], actual: [shifted, changed, newFile, newSink, shifted] })).toEqual([
      changed, newFile, newSink, shifted,
    ]);
    expect(newLiteralCopy({ baseline: [original], actual: [] })).toEqual([]);
    expect(newLiteralCopy({ baseline: [original, original], actual: [shifted, shifted] })).toEqual([]);
  });
});

it("production admin features and shared components add no untranslated JSX copy", () => {
  const baseline = JSON.parse(readFileSync(path.join(__dirname, "fixtures/admin-literal-copy.baseline.json"), "utf8")) as { sites: LiteralCopy[] };
  expect(Array.isArray(baseline.sites)).toBe(true);
  const actual = ["features", "components"].flatMap((directory) => scanCopySources({ root: SRC, directory: path.join(SRC, directory) }));
  const additions = newLiteralCopy({ actual, baseline: baseline.sites });
  expect(additions, `Translate new copy through its owner:\n${additions.map(({ file, line, kind, text }) => `${file}:${line} ${kind} ${JSON.stringify(text)}`).join("\n")}`).toEqual([]);
  // The ratchet only shrinks: a resolved site left in the baseline would silently re-admit that literal.
  const stale = newLiteralCopy({ actual: baseline.sites, baseline: actual });
  expect(stale, `Prune resolved baseline entries:\n${stale.map(({ file, kind, text }) => `${file} ${kind} ${JSON.stringify(text)}`).join("\n")}`).toEqual([]);
}, 30_000);
