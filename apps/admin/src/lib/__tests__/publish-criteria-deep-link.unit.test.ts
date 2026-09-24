import { expect, it, vi } from "vitest";

import { encodePublishCriteriaToQuery } from "@tovu/publish-content-ui";

import { takePublishCriteriaFromQuery } from "../publish-criteria-deep-link";

/**
 * @file `takePublishCriteriaFromQuery` — the pure read/strip step for the admin's own
 * `?publish=<encoded criteria>` deep link (`publish-criteria-tool-webmcp-plan-2026-09-24.md` §4 S2).
 * Same harness shape as `boot-token-fragment.unit.test.ts`: a fake `Location`/`History` pair passed
 * directly, no real DOM navigation involved.
 */

function fakeLocationAt(search: string, pathname = "/admin/", hash = "") {
  return { search, pathname, hash };
}

function fakeHistory() {
  return { replaceState: vi.fn() };
}

it("returns null and never touches the URL when there is no `publish` param", () => {
  const location = fakeLocationAt("");
  const history = fakeHistory();

  expect(takePublishCriteriaFromQuery(location, history)).toBeNull();
  expect(history.replaceState).not.toHaveBeenCalled();
});

it("round-trips a criteria encoded by encodePublishCriteriaToQuery", () => {
  const encoded = encodePublishCriteriaToQuery({ types: ["page", "menu"], overwrite: true });
  const location = fakeLocationAt(`?publish=${encoded}`);
  const history = fakeHistory();

  expect(takePublishCriteriaFromQuery(location, history)).toEqual({ types: ["page", "menu"], overwrite: true });
  expect(history.replaceState).toHaveBeenCalledWith(null, "", "/admin/");
});

it("strips the param but returns null for an invalid payload", () => {
  const location = fakeLocationAt("?publish=not-json-at-all");
  const history = fakeHistory();

  expect(takePublishCriteriaFromQuery(location, history)).toBeNull();
  expect(history.replaceState).toHaveBeenCalledWith(null, "", "/admin/");
});

it("keeps every other query param and the hash, in place, next to the one it removes", () => {
  const encoded = encodePublishCriteriaToQuery({ types: ["post"] });
  const location = fakeLocationAt(`?foo=bar&publish=${encoded}`, "/admin/", "#section");
  const history = fakeHistory();

  expect(takePublishCriteriaFromQuery(location, history)).toEqual({ types: ["post"] });
  expect(history.replaceState).toHaveBeenCalledWith(null, "", "/admin/?foo=bar#section");
});
