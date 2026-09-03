import assert from "node:assert/strict";
import test from "node:test";

import {
  SiteCorruptError,
  SiteDirInvalidError,
  SiteNewerThanRuntimeError,
  InitDirNotEmptyError,
  ValidationError,
  InternalError,
} from "../../errors.js";

test("site-dir typed domain errors: constructors set name, message, and inherit from Error", () => {
  const cases = [
    { Cls: SiteCorruptError, expectedName: "SiteCorruptError", message: "corrupt site" },
    { Cls: SiteDirInvalidError, expectedName: "SiteDirInvalidError", message: "invalid site dir" },
    { Cls: SiteNewerThanRuntimeError, expectedName: "SiteNewerThanRuntimeError", message: "newer schema" },
    { Cls: InitDirNotEmptyError, expectedName: "InitDirNotEmptyError", message: "target not empty" },
    { Cls: ValidationError, expectedName: "ValidationError", message: "validation failed" },
    { Cls: InternalError, expectedName: "InternalError", message: "internal unexpected error" },
  ];

  for (const { Cls, expectedName, message } of cases) {
    const err = new Cls(message);
    assert.ok(err instanceof Error, `${expectedName} must inherit from Error`);
    assert.equal(err.name, expectedName, `${expectedName} must have .name set to "${expectedName}"`);
    assert.equal(err.message, message, `${expectedName} must preserve the message passed to constructor`);
  }
});
