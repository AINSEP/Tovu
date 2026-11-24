import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
