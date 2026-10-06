import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { FORM_BASELINE_STYLE } from "../form-render.js";

/**
 * Regression (owner, 2026-10-05, /lets-talk-demo): "color scheme is awful". Every embedded form's
 * Send button was the theme's accent fill (a saturated gold pill) next to the site's own black/white
 * `.btn-solid` "Get started", and inputs sat on `--surface` — the same grey as the card around them,
 * so in light mode the whole form read as one muddy block. Forms now use the site's primary-button
 * colours (`--fg` fill, `--bg` text) and page-coloured (`--bg`) fields, in the zero-specificity
 * baseline every theme gets and in tovu-theme's own form rules.
 */

const REPO_ROOT = fileURLToPath(new URL("../../../../../../../../../", import.meta.url));
const TOVU_THEME_COPIES = [
  "content/themes/static/tovu-theme/css/theme.css",
  "content/themes/__original-themes__/static/tovu-theme/css/theme.css",
  "sites/tovu-dev/themes/static/tovu-theme/css/theme.css",
];

/** The declaration block of the first rule whose selector text starts with `selectorStart`. */
function ruleBody(css: string, selectorStart: string): string {
  const start = css.indexOf(selectorStart);
  assert.ok(start !== -1, `rule '${selectorStart}' must exist`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

test("baseline: both submit-button rules (Builder and HTML mode) use the primary-button colours, never the accent fill", () => {
  for (const selector of [":where(.tovu-form button[type=submit])", ":where([data-tovu-form] button:not([type=button],[type=reset]))"]) {
    const body = ruleBody(FORM_BASELINE_STYLE, selector);
    assert.ok(body.includes("background:var(--fg,#111827);color:var(--bg,#fff);"), `${selector}: ${body}`);
    assert.ok(!body.includes("--accent"), `${selector} must not use the accent fill: ${body}`);
  }
});

test("baseline: both field rules put inputs on the page background, not the card-coloured --surface", () => {
  for (const selector of [":where(.widget-form-field input)", ":where([data-tovu-form] :is(input:not("]) {
    const body = ruleBody(FORM_BASELINE_STYLE, selector);
    assert.ok(body.includes("background:var(--bg,#fff);"), `${selector}: ${body}`);
  }
});

test("tovu-theme: the form submit matches the theme's own .btn/.btn-solid, fields sit on --bg, and all three shipped copies agree", () => {
  const copies = TOVU_THEME_COPIES.map((file) => fs.readFileSync(REPO_ROOT + file, "utf8"));
  for (const [index, css] of copies.entries()) assert.equal(css, copies[0], `${TOVU_THEME_COPIES[index]} drifted from ${TOVU_THEME_COPIES[0]}`);
  const css = copies[0];
  const btn = ruleBody(css, ".btn {");
  const solid = ruleBody(css, ".btn-solid {");
  const submit = ruleBody(css, ':where(.tovu-form) button:where(:not([type="button"], [type="reset"], [hidden])) {');
  for (const declaration of ["height: 38px;", "padding: 0 18px;", "border-radius: 18px;"]) {
    assert.ok(btn.includes(declaration) && submit.includes(declaration), `submit must share .btn's '${declaration}': ${submit}`);
  }
  assert.ok(solid.includes("background: var(--fg); color: var(--bg);"), `.btn-solid changed: ${solid}`);
  assert.ok(submit.includes("background: var(--fg); color: var(--bg);"), `submit must use .btn-solid's colours: ${submit}`);
  assert.ok(!submit.includes("--accent"), `submit must not use the accent fill: ${submit}`);
  const field = ruleBody(css, ":where(.tovu-form) :is(input, textarea, select):where(:not(");
  assert.ok(field.includes("background: var(--bg);"), `fields must sit on --bg: ${field}`);
});
