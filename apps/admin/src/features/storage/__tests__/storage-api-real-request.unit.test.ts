import { afterEach, expect, test, vi } from "vitest";

import { ApiError, request } from "@/lib/admin-http/request";
import { createStorageClient } from "../api/storage-api";

/**
 * Pins the Storage client to the REAL admin `request` (no mock request): the live page once sent
 * `GET /api/admin/v1/report` because the client passed `basePath` where `request` never reads it,
 * and the server answered 404 for a route that is mounted under `/api/admin/storage`.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(answer: () => Response): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => answer());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

test("the storage report is fetched from /api/admin/storage/report through the real admin request", async () => {
  const fetchMock = stubFetch(() => new Response(JSON.stringify({ categories: {}, lastPass: null }), { status: 200, headers: { "content-type": "application/json" } }));

  await createStorageClient({ request }, {}).report({}, {});

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/storage/report");
});

test("a storage cleanup is posted to /api/admin/storage/cleanup through the real admin request", async () => {
  const fetchMock = stubFetch(() => new Response(JSON.stringify({ dryRun: true }), { status: 200, headers: { "content-type": "application/json" } }));

  await createStorageClient({ request }, {}).cleanup({ dryRun: true }, {});

  expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/admin/storage/cleanup");
  expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
});

test("a failed read says nothing was changed and names the response's request ID, never 'check whether your change was saved'", async () => {
  stubFetch(() => new Response("<pre>Cannot GET /api/admin/storage/report</pre>", { status: 404, headers: { "content-type": "text/html", "x-request-id": "req-abc123" } }));

  const error = (await createStorageClient({ request }, {}).report({}, {}).catch((e: unknown) => e)) as ApiError;

  expect(error).toBeInstanceOf(ApiError);
  expect(error.message).toBe("The API could not load GET /report (HTTP 404). Nothing was changed. Try again; if it keeps failing, report error ID req-abc123.");
});

test("a failed write still asks to check the change and names the response's request ID", async () => {
  stubFetch(() => new Response("<pre>Cannot POST</pre>", { status: 404, headers: { "content-type": "text/html", "x-request-id": "req-w1" } }));

  const error = (await createStorageClient({ request }, {}).cleanup({ dryRun: true }, {}).catch((e: unknown) => e)) as ApiError;

  expect(error.message).toBe("The API could not finish POST /cleanup (HTTP 404). Check whether your change was saved before trying again. Copy details and report error ID req-w1.");
});
