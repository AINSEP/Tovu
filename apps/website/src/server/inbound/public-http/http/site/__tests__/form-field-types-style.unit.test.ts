import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FORM_BASELINE_STYLE, FORM_RANGE_READOUT_JS, FORM_RANGE_READOUT_SCRIPT } from "../form-render.js";
import { renderWidgetIr } from "../render.js";

/**
 * @file Public styling for the registry field types beyond text (2026-10-11): groups, toggle,
 * range, file, multi-select and help text, in the zero-specificity baseline and tovu-theme, plus the
 * range value readout script. Before this, every control inherited the text-input box, so a switch
 * or slider drew as an empty padded rectangle.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../../../../../../../", import.meta.url));
const THEME_COPIES = [
  "content/themes/static/tovu-theme/css/theme.css",
  "content/themes/__original-themes__/static/tovu-theme/css/theme.css",
];
/** Tokens every theme defines (FORM_BASELINE_STYLE hazard 2) plus the hazard-3 fallback chains. */
const SHARED_TOKENS = new Set(["--bg", "--surface", "--surface-2", "--fg", "--muted", "--border", "--border-strong", "--accent", "--accent-fg",
  "--font-display", "--font-body", "--container", "--danger", "--success", "--tovu-form-danger-fallback", "--tovu-form-success-fallback"]);

function ruleBody(css: string, selectorStart: string): string {
  const start = css.indexOf(selectorStart);
  assert.ok(start !== -1, `rule '${selectorStart}' must exist`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

test("baseline: the boxed text-input rule skips checkbox, radio, range and file, and covers select", () => {
  const selector = ":where(.widget-form-field input:not([type=checkbox],[type=radio],[type=range],[type=file])),:where(.widget-form-field textarea),:where(.widget-form-field select){";
  assert.ok(FORM_BASELINE_STYLE.includes(selector), "builder boxed rule");
  assert.ok(FORM_BASELINE_STYLE.includes("[type=reset],[type=range],[type=file]),textarea,select))"), "HTML-mode boxed rule");
});

test("baseline: switch, group, range, file and help rules exist and use only tokens every theme defines", () => {
  for (const selector of [":where(fieldset.widget-form-field:not([hidden]))", ":where(fieldset.widget-form-field legend)",
    ":where(.widget-form-field input[role=switch])", ":where(.widget-form-field input[role=switch]:checked)",
    ":where(.widget-form-field input[type=range])", ":where(.widget-form-field input[type=file])::file-selector-button",
    ":where(.widget-form-field-help)", ":where(.tovu-form-range-value)", ":where(.widget-form-field select[multiple])"]) {
    ruleBody(FORM_BASELINE_STYLE, selector);
  }
  assert.match(ruleBody(FORM_BASELINE_STYLE, ":where(.widget-form-field input[role=switch])"), /appearance:none/);
  assert.match(ruleBody(FORM_BASELINE_STYLE, ":where(.widget-form-field input[role=switch]:checked)"), /background-color:var\(--accent,/);
  const tokens = [...FORM_BASELINE_STYLE.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]);
  assert.deepEqual(tokens.filter((token) => !SHARED_TOKENS.has(token)), []);
});

test("baseline: the fieldset option-label rule that sets display keeps the [hidden] guard", () => {
  assert.ok(FORM_BASELINE_STYLE.includes(":where(fieldset.widget-form-field label:not([hidden])){display:flex;"));
});

test("baseline: a single-line select draws its own currentColor chevron with end padding, mirrored in RTL, native under forced colors", () => {
  const select = "select:where(.tovu-form select:not([multiple],[size])){";
  const body = ruleBody(FORM_BASELINE_STYLE, select);
  for (const declaration of ["appearance:none;", "padding-inline-end:40px;", "currentColor", "background-repeat:no-repeat;"]) {
    assert.ok(body.includes(declaration), `select rule must carry '${declaration}': ${body}`);
  }
  assert.match(ruleBody(FORM_BASELINE_STYLE, "select:where(.tovu-form select:not([multiple],[size]):dir(rtl)){"), /background-position:15px 50%,21px 50%/);
  assert.ok(FORM_BASELINE_STYLE.includes(`@media (forced-colors:active){${select}-webkit-appearance:auto;appearance:auto;background-image:none;}}`));
});

test("tovu-theme: both copies agree, skip range/file in the boxed rule, and style the switch after the checkbox size rule", () => {
  const copies = THEME_COPIES.map((file) => fs.readFileSync(REPO_ROOT + file, "utf8"));
  assert.equal(copies[1], copies[0]);
  const css = copies[0];
  assert.ok(css.includes('[type="reset"], [type="range"], [type="file"])) {'), "boxed rule excludes range and file");
  const checkbox = css.indexOf(':where(.tovu-form) input:where([type="checkbox"], [type="radio"]) {');
  const toggle = css.indexOf(':where(.tovu-form) input:where([role="switch"]) {');
  assert.ok(checkbox !== -1 && toggle > checkbox, "switch rule must follow the 16px checkbox rule so its size wins");
  assert.match(ruleBody(css, ':where(.tovu-form) input:where([role="switch"]:checked) {'), /var\(--accent\)/);
  for (const selector of ["fieldset:where(.tovu-form .widget-form-field:not([hidden])) {", ':where(.tovu-form) input:where([type="range"]) {',
    ':where(.tovu-form) input:where([type="file"])::file-selector-button {', "div:where(.tovu-form .widget-form-field-help) {",
    "output:where(.tovu-form-range-value) {"]) {
    ruleBody(css, selector);
  }
});

/** Just enough DOM for the readout script: range inputs, element creation, insertion, events. */
function fakeDocument(ranges: Array<{ id: string; value: string; wired?: boolean }>) {
  const inserted: Array<{ after: string; output: FakeOutput }> = [];
  type FakeOutput = { className: string; textContent: string; attrs: Record<string, string>; setAttribute(name: string, value: string): void };
  const inputs = ranges.map((range) => {
    const attrs: Record<string, string> = range.wired ? { "data-tovu-range": "" } : {};
    const listeners: Record<string, () => void> = {};
    return {
      id: range.id, value: range.value, attrs, listeners,
      setAttribute(name: string, value: string) { attrs[name] = value; },
      insertAdjacentElement(position: string, element: FakeOutput) { assert.equal(position, "afterend"); inserted.push({ after: range.id, output: element }); },
      addEventListener(type: string, listener: () => void) { listeners[type] = listener; },
    };
  });
  const selectors: string[] = [];
  const document = {
    querySelectorAll(selector: string) { selectors.push(selector); return inputs.filter((input) => !("data-tovu-range" in input.attrs)); },
    createElement(tag: string): FakeOutput {
      assert.equal(tag, "output");
      const attrs: Record<string, string> = {};
      return { className: "", textContent: "", attrs, setAttribute(name, value) { attrs[name] = value; } };
    },
  };
  return { document, inputs, inserted, selectors };
}

test("range readout: adds one hidden-from-AT output after each unwired form slider and follows input events", () => {
  const fake = fakeDocument([{ id: "f-budget", value: "40" }, { id: "f-old", value: "1", wired: true }]);
  new Function("document", FORM_RANGE_READOUT_JS)(fake.document);
  assert.match(fake.selectors[0]!, /\.tovu-form input\[type=range\]:not\(\[data-tovu-range\]\)/);
  assert.match(fake.selectors[0]!, /\[data-tovu-form\] input\[type=range\]/);
  assert.equal(fake.inserted.length, 1);
  const { after, output } = fake.inserted[0]!;
  assert.equal(after, "f-budget");
  assert.deepEqual({ className: output.className, text: output.textContent, attrs: output.attrs },
    { className: "tovu-form-range-value", text: "40", attrs: { "aria-hidden": "true", for: "f-budget" } });
  fake.inputs[0]!.value = "75";
  fake.inputs[0]!.listeners.input!();
  assert.equal(output.textContent, "75");
  // A second copy of the script (another form on the page) wires nothing twice.
  new Function("document", FORM_RANGE_READOUT_JS)(fake.document);
  assert.equal(fake.inserted.length, 1);
});

test("range readout: an id-less slider still gets a readout, without a dangling for attribute", () => {
  const fake = fakeDocument([{ id: "", value: "3" }]);
  new Function("document", FORM_RANGE_READOUT_JS)(fake.document);
  assert.deepEqual(fake.inserted[0]!.output.attrs, { "aria-hidden": "true" });
});

test("render: the readout script ships only with forms that have a range field, in Builder and HTML mode", () => {
  const range = { id: "budget", label: "Budget", type: "range", min: 0, max: 100 };
  const text = { id: "name", label: "Name", type: "text" };
  const builder = renderWidgetIr({ componentId: "contact-form", props: { slug: "b", fields: [text, range] } });
  const authored = renderWidgetIr({ componentId: "contact-form", props: { slug: "h", mode: "html", fields: [text, range] } });
  const plain = renderWidgetIr({ componentId: "contact-form", props: { slug: "p", fields: [text] } });
  assert.ok(builder.includes("</form>" + FORM_RANGE_READOUT_SCRIPT), "builder: right after the form");
  assert.ok(authored.endsWith(FORM_RANGE_READOUT_SCRIPT), "html mode: after the form");
  assert.ok(!plain.includes("tovu-range"));
});
