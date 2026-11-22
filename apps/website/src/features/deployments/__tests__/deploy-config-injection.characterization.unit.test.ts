import assert from "node:assert/strict";
import test from "node:test";

import { ValidationError } from "#src/platform/site-dir/index";

import { createDeployConfigKit } from "../deploy-config.js";

/**
 * @file Characterizes the config-injection guard through the one door every generator plugin uses: the kit's
 * POSITIONAL `assertNoConfigInjection(fieldLabel, value)` (the bundled `deploy-configs/*.mjs` plugins call it that way,
 * so that signature is a plugin ABI and never changes) and the host's own `ValidationError` it throws. One case per
 * clause, so deleting any single character from a hazard list, or either edge clause, turns exactly one case red.
 */
const guard = createDeployConfigKit().assertNoConfigInjection;
const QUOTE = (value: string) => `field (${JSON.stringify(value)}) contains a quote or newline character, which would corrupt the generated config file`;
const YAML = (value: string) => `field (${JSON.stringify(value)}) contains a YAML-significant character (one of : # { [ & *), which would corrupt an unquoted YAML scalar in the generated config file`;
const EDGE = (value: string) => `field (${JSON.stringify(value)}) starts with "-" or has leading/trailing whitespace, which would corrupt an unquoted YAML scalar in the generated config file`;

function refusal(message: string): (error: unknown) => boolean {
  return (error) => error instanceof ValidationError && error.message === message;
}

// V3: delete one of '"', "\n", "\r" from the quote/newline list: exactly that case goes red.
for (const [name, character] of [["double quote", '"'], ["line feed", "\n"], ["carriage return", "\r"]] as const) {
  test(`a ${name} alone is refused as quoted-sink corruption`, () => {
    const value = `before${character}after`;
    assert.throws(() => guard("field", value), refusal(QUOTE(value)));
  });
}

// V3: delete one of ":", "#", "{", "[", "&", "*" from the YAML list: exactly that case goes red.
for (const character of [":", "#", "{", "[", "&", "*"]) {
  test(`the YAML-significant character ${character} alone is refused as plain-scalar corruption`, () => {
    const value = `before${character}after`;
    assert.throws(() => guard("field", value), refusal(YAML(value)));
  });
}

// V3: drop `startsWith("-")` (the leading hyphen case), or the `!== value.trim()` comparison (both whitespace cases) goes red.
for (const [name, value] of [["a leading hyphen", "-evil"], ["a leading space", " evil"], ["a trailing space", "evil "]] as const) {
  test(`${name} is refused as plain-scalar corruption`, () => {
    assert.throws(() => guard("field", value), refusal(EDGE(value)));
  });
}

for (const value of ["acme-app_1", "a.b/c", "letters123", "inner-hyphen", "UPPER_and.dots/ok"]) {
  test(`the safe value ${JSON.stringify(value)} is accepted`, () => {
    assert.doesNotThrow(() => guard("field", value));
  });
}
