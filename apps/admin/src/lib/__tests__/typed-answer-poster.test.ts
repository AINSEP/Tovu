import { describe, expect, it } from "vitest";

import { createAdminTypedAnswerPoster } from "../typed-answer-poster";

/** A hand-written fetch fake: records each request and answers with `respond`. */
function fakeFetch(respond: () => Promise<Response>) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    return respond();
  }) as typeof globalThis.fetch;
  return { fetch, requests };
}

describe("createAdminTypedAnswerPoster", () => {
  it("posts the typed text as an assistant_ask_choice answer to the admin MCP-UI route", async () => {
    const fake = fakeFetch(async () => new Response(JSON.stringify({ delivered: true }), { status: 202 }));

    await expect(createAdminTypedAnswerPoster({ fetch: fake.fetch })({ text: "deploy it" })).resolves.toBe("delivered");

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]?.url).toBe("/api/admin/v1/mcp-ui/tool-calls");
    expect(fake.requests[0]?.init).toMatchObject({
      method: "POST",
      credentials: "same-origin",
      body: JSON.stringify({ toolName: "assistant_ask_choice", params: { __typedAnswer: "deploy it" } }),
    });
  });

  it("tags the poster with assistant_ask_choice, so the pane routes typed text to it only while that tool's card is open", () => {
    const fake = fakeFetch(async () => new Response(null, { status: 202 }));
    expect(createAdminTypedAnswerPoster({ fetch: fake.fetch }).toolName).toBe("assistant_ask_choice");
  });

  it("reports 409 SURFACE_NOT_PENDING (answer already consumed or expired) as not-pending", async () => {
    const fake = fakeFetch(async () => new Response(JSON.stringify({ code: "SURFACE_NOT_PENDING" }), { status: 409 }));
    await expect(createAdminTypedAnswerPoster({ fetch: fake.fetch })({ text: "deploy it" })).resolves.toBe("not-pending");
  });

  it("reports a network failure as failed", async () => {
    const fake = fakeFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(createAdminTypedAnswerPoster({ fetch: fake.fetch })({ text: "deploy it" })).resolves.toBe("failed");
  });
});
