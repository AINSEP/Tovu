import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { formBaselineStyle, formRangeReadoutJs, formRangeReadoutScript } from "@jini-ai/cms/public-http/http/site/form-presentation-assets";

import { FORM_PRESENTATION_NAMES } from "../form-wire-policy.js";

const names = FORM_PRESENTATION_NAMES;
const FORM_BASELINE_STYLE = formBaselineStyle({ names });
const FORM_RANGE_READOUT_JS = formRangeReadoutJs({ names });
const FORM_RANGE_READOUT_SCRIPT = formRangeReadoutScript({ names });

/**
 * Byte-exact guard for the generated baseline CSS and range-readout JS. Tovu themes select these
 * exact product names (`.tovu-form`, `[data-tovu-form]`, `--tovu-form-*-fallback`), so the engine
 * module that builds them from injected names must reproduce this output character for character.
 */
const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

test("FORM_BASELINE_STYLE is byte-identical to the shipped CSS", () => {
  assert.equal(FORM_BASELINE_STYLE.length, 6109);
  assert.equal(sha256(FORM_BASELINE_STYLE), "4fd2eb6c129a51fe307b75a5c7351c5056528063706b3183321d29960efcca61");
});

test("FORM_RANGE_READOUT_JS is byte-identical to the shipped script body", () => {
  assert.equal(FORM_RANGE_READOUT_JS.length, 481);
  assert.equal(sha256(FORM_RANGE_READOUT_JS), "8ef7ece66922ab36d528f9af93bba842536e67027215c5f694ae4bef01be78d8");
});

test("FORM_RANGE_READOUT_SCRIPT is byte-identical to the shipped inline script", () => {
  assert.equal(FORM_RANGE_READOUT_SCRIPT.length, 498);
  assert.equal(sha256(FORM_RANGE_READOUT_SCRIPT), "90c54bb129c7c4f88002d604917604bf8564ba7614217d4673ce4b4b6c6877b5");
});

/**
 * The tovu-theme stylesheet targets the Builder field classes (`.tovu-form .widget-form-field…`); the
 * host-bound field names must keep matching what the theme selects and what the baseline CSS styles.
 */
test("the field class names tovu-theme selects are the ones bound into the baseline CSS", () => {
  const themeCss = readFileSync(new URL("../../../../../../../../../content/themes/static/tovu-theme/css/theme.css", import.meta.url), "utf8");
  const themeClasses = new Set([...themeCss.matchAll(/\.(widget-form-field[a-z-]*)/g)].map((m) => m[1]));
  assert.deepEqual([...themeClasses].sort(), ["widget-form-field", "widget-form-field-checkbox", "widget-form-field-help"]);
  const bound = new Set<string>([names.fieldClass, names.fieldCheckboxClass, names.fieldHelpClass]);
  for (const cls of themeClasses) assert.ok(bound.has(cls), `${cls} is bound`);
  for (const cls of [names.fieldClass, names.fieldHelpClass, names.fieldCheckboxClass, names.fieldErrorClass]) {
    assert.ok(FORM_BASELINE_STYLE.includes(`.${cls}`), `${cls} appears in the baseline CSS`);
  }
});
